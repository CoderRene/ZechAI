from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState
from google.adk.agents import SequentialAgent
from google.adk.runners import Runner
from google.adk.sessions.in_memory_session_service import InMemorySessionService

from models import TicketIn
from utils import extract_provider_error

load_dotenv()

from agents import (  # noqa: E402
    call_agent_async,
    call_agent_text,
    gap_detection_agent,
    intent_understanding_agent,
    specification_generation_agent,
    test_cases_generation_agent,
)
from rate_limiter import (  # noqa: E402
    RateLimitExceeded,
    build_rate_limit_key,
    enforce_rate_limit,
)

app = FastAPI()

# Master agent orchestration (ADK): sub-agents run in sequence.
master_agent = SequentialAgent(
	name="RtmToSpecMasterAgent",
	description="Runs intent understanding then gap detection.",
	sub_agents=[intent_understanding_agent, gap_detection_agent, specification_generation_agent],
)

test_case_master_agent = SequentialAgent(
    name="TestCasesMasterAgent",
    description="Runs test_cases_generation_agent",
    sub_agents=[test_cases_generation_agent],
)

master_runner = Runner(
	app_name="rtm_to_spec_agent",
	agent=master_agent,
	session_service=InMemorySessionService(),
	auto_create_session=True,
)

test_cases_runner = Runner(
    app_name="test_cases_agent",
    agent=test_case_master_agent,
    session_service=InMemorySessionService(),
    auto_create_session=True,
)

@app.websocket("/ws/generate-spec")
async def ws_generate_spec(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            payload = TicketIn.model_validate(await websocket.receive_json())
            _type = payload.type
            _ticket = payload.ticket
            _user_id = payload.user_id
            _session_id = payload.session_id

            response_text = None
            try:
                client_host = websocket.client.host if websocket.client else None
                enforce_rate_limit(
                    build_rate_limit_key(
                        user_id=_user_id,
                        session_id=_session_id,
                        remote_addr=client_host,
                    )
                )

                if _type == 'techspec':
                    response_text = await call_agent_async(
                        _ticket,
                        runner=master_runner,
                        user_id=_user_id,
                        session_id=_session_id,
                        websocket=websocket,
                    )
                else:
                    response_text = await call_agent_async(
                        _ticket,
                        runner=test_cases_runner,
                        user_id=_user_id,
                        session_id=_session_id,
                        websocket=websocket,
                    )

            except RateLimitExceeded as e:
                await websocket.send_json(
                    {
                        "error": e.message(),
                        "agent_limit_reached": True,
                        "error_code": "AGENT_LIMIT_REACHED",
                        "retry_after": e.retry_after_seconds,
                        "complete": True,
                    }
                )
                continue
            except Exception as e:
                error_payload, _ = extract_provider_error(e)
                await websocket.send_json(error_payload)
                continue

            await websocket.send_json({"response": response_text, "complete": True})

    except WebSocketDisconnect:
        pass
    finally:
        if websocket.application_state == WebSocketState.CONNECTED:
            await websocket.close()


@app.post("/generate-spec")
async def http_generate_spec(request: Request, payload: TicketIn):
    ticket = (payload.ticket or "").strip()
    if not ticket:
        raise HTTPException(status_code=400, detail="ticket is required")

    try:
        client_host = request.client.host if request.client else None
        enforce_rate_limit(
            build_rate_limit_key(
                user_id=payload.user_id,
                session_id=payload.session_id,
                remote_addr=client_host,
            )
        )
        response_text = await call_agent_text(
            query=ticket,
            runner=master_runner,
            user_id=payload.user_id,
            session_id=payload.session_id,
        )
    except RateLimitExceeded as e:
        raise HTTPException(
            status_code=429,
            detail={
                "error": e.message(),
                "agent_limit_reached": True,
                "error_code": "AGENT_LIMIT_REACHED",
                "retry_after": e.retry_after_seconds,
            },
        )
    except Exception as e:
        error_payload, status_code = extract_provider_error(e)
        raise HTTPException(status_code=status_code, detail=error_payload)
    return {"response": response_text}