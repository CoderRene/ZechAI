from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from google.adk.agents import SequentialAgent
from google.adk.runners import Runner
from google.adk.sessions.in_memory_session_service import InMemorySessionService

from models import TicketIn

load_dotenv()

from agents import (  # noqa: E402
    call_agent_async,
    call_agent_text,
    gap_detection_agent,
    intent_understanding_agent,
    specification_generation_agent,
)

app = FastAPI()

# Master agent orchestration (ADK): sub-agents run in sequence.
master_agent = SequentialAgent(
	name="RtmToSpecMasterAgent",
	description="Runs intent understanding then gap detection.",
	sub_agents=[intent_understanding_agent, gap_detection_agent, specification_generation_agent],
)

master_runner = Runner(
	app_name="rtm_to_spec_agent",
	agent=master_agent,
	session_service=InMemorySessionService(),
	auto_create_session=True,
)

@app.websocket("/ws/generate-spec")
async def ws_generate_spec(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            payload = TicketIn.model_validate(await websocket.receive_json())
            _ticket = payload.ticket
            _user_id = payload.user_id
            _session_id = payload.session_id

            response_text = await call_agent_async(
                _ticket,
                runner=master_runner,
                user_id=_user_id,
                session_id=_session_id,
                websocket=websocket,
            )
            await websocket.send_json({"response": response_text, "complete": True})
    except WebSocketDisconnect:
        pass
    finally:
        await websocket.close()


@app.post("/generate-spec")
async def http_generate_spec(payload: TicketIn):
    ticket = (payload.ticket or "").strip()
    if not ticket:
        raise HTTPException(status_code=400, detail="ticket is required")

    response_text = await call_agent_text(
        query=ticket,
        runner=master_runner,
        user_id=payload.user_id,
        session_id=payload.session_id,
    )
    return {"response": response_text}