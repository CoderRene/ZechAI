import os

from fastapi import WebSocket
from google.adk.agents import LlmAgent, RunConfig
from google.adk.agents.run_config import StreamingMode
from google.adk.models.lite_llm import LiteLlm
from google.genai import types

_lmstudio_api_base = os.getenv(
    "LM_STUDIO_API_BASE",
    "http://192.168.254.117:3002/v1",
)
_lmstudio_api_key = os.getenv("LM_STUDIO_API_KEY")

_qwen_model_llm_kwargs = {
    "model": os.getenv("QWEN_MODEL", "openai/local-model"),
    "api_base": _lmstudio_api_base,
}

_deepseek_model_llm_kwargs = {
    "model": os.getenv("DEEPSEEK_MODEL", "openai/local-model"),
    "api_base": _lmstudio_api_base,
}

# Only pass `api_key` when provided.
# LiteLLM validates provider tokens; using placeholder values breaks auth.
if _lmstudio_api_key:
    _qwen_model_llm_kwargs["api_key"] = _lmstudio_api_key
    _deepseek_model_llm_kwargs["api_key"] = _lmstudio_api_key

qwen_model = LiteLlm(**_qwen_model_llm_kwargs)
deepseek_model = LiteLlm(**_deepseek_model_llm_kwargs)

intent_understanding_agent = LlmAgent(
    name="IntentUnderstandingAgent",
    model=qwen_model,
    instruction="""
    You are part of an agentic workflow that transforms vague product tickets into structured, development-ready plans.
    This is your role:
    You are given a ticket and you need to understand the intent of the request.
    You analyzes the ticket to determine the actual objective of the request.
    Determine core feature intent, functional expectations, business motivations, and implicit assumptions.
    Return the intent in a structured format with the following fields:
    - intent: The core feature intent of the request.
    - functional_expectations: The functional expectations of the request.
    - business_motivations: The business motivations of the request.
    - implicit_assumptions: The implicit assumptions of the request.
    """
)

gap_detection_agent = LlmAgent(
    name="GapDetectionAgent",
    model=qwen_model,
    instruction="""
    You are part of an agentic workflow that transforms vague product tickets into structured, development-ready plans.
    This is your role:
    Evaluate the intent of the request against common software specification requirements,
    detect missing information such as, validation rules, error handling behavior, performance constraints, security considerations.
    Return the gaps in a structured format:
    Gap Resolutions:
    - Description of the gap 1.
    - Description of the gap 2.
    - Description of the gap 3.
    - ...

    Example Output Format:
    Gap Resolutions:
    - Define max file size (e.g., 5MB?)
    - Define supported formats (JPG, PNG?)
    - ...

    IMPORTANT: each bullet point should be a single sentence and one liner only.
    Note: Use the previous agent's output (the intent JSON) as your input; do not re-interpret the original ticket.
    """
)

specification_generation_agent = LlmAgent(
    name="SpecificationGenerationAgent",
    model=qwen_model,
    instruction="""
    You are part of an agentic workflow that transforms vague product tickets into structured, development-ready plans.
    This is your role:
    Based on the analysis from the previous agents, generate a structured technical design document that includes:
    Edge cases, gap resolutions, failure scenarios, proposed implementation logic, Data structure or API changes.

    Example Output Format:
        Description:
        Implement a feature that allows ...

        User Story:
        - As a user, I want to be able to ...

        Acceptance Criteria:
        - User can open a camera ...
        - ...

        Gap Resolutions (IMPORTANT!! Insert the output of the 'GapDetectionAgent' here):
        - Define max file size (e.g., 5MB?)
        - ...

        Edge Cases:
        - Camera permission denied
        - ...

        Technical Notes
        - Use device camera API for capture
        - ...
        
    IMPORTANT: each bullet point should be a single sentence and one liner only.
    IMPORTANT: Strictly follow the output format.
    """
)

async def call_agent_async(query: str, runner, user_id, session_id, websocket: WebSocket):
  """Sends a query to the agent and returns the final response text."""

  # Prepare the user's message in ADK format
  content = types.Content(role='user', parts=[types.Part(text=query)])

  final_response_text = "Agent did not produce a final response." # Default
  last_author = None
  last_printed_text_by_author: dict[str, str] = {}
  streaming_started_for_author: set[str] = set()

  run_config = RunConfig(streaming_mode=StreamingMode.SSE)
  # Only stream partial text for this specific sub-agent.
  stream_only_agent_name = "SpecificationGenerationAgent"
  collected_chunks = ""
  async for event in runner.run_async(
      user_id=user_id,
      session_id=session_id,
      new_message=content,
      run_config=run_config,
  ):
      # Print agent headers only when author changes.
      event_author = getattr(event, "author", None)
      if event_author and event_author != last_author:
          last_author = event_author
          if last_author != "user":
              print(f"\n--- Running agent: {last_author} ---")
              if last_author == "IntentUnderstandingAgent":
                  await websocket.send_json({"text": "Putting on my detective hat! Analyzing what this ticket really wants...\n\n"})
              elif last_author == "GapDetectionAgent":
                  await websocket.send_json({"text": "Hunting for blind spots — anything the ticket forgot to spell out...\n\n"})

      # Stream partial text as it arrives.
      # ADK marks streaming chunks as `event.partial == True`.
      if (
          getattr(event, "partial", False)
          and event_author
          and event.content
          and event.content.parts
          and event_author == stream_only_agent_name
      ):
          part0 = event.content.parts[0]
          chunk_text = getattr(part0, "text", None)
          if isinstance(chunk_text, str) and chunk_text:
              prev = last_printed_text_by_author.get(event_author, "")
              # Some models emit the full-so-far text on each partial event.
              # Print only the delta when possible to avoid duplicating output.
              delta = chunk_text[len(prev):] if chunk_text.startswith(prev) else chunk_text
              if delta:
                  if (
                      event_author not in streaming_started_for_author
                      and event_author != "user"
                  ):
                      # Ensure streaming starts on a fresh line under the header.
                      if not delta.startswith("\n"):
                          print("", flush=True)
                      streaming_started_for_author.add(event_author)
                  # print(delta, end="", flush=True)
                  collected_chunks += delta
                  await websocket.send_json({"chunk": collected_chunks})
                  last_printed_text_by_author[event_author] = chunk_text

      # In a SequentialAgent, each sub-agent may emit a final response event.
      # Keep consuming events and return the *last* final response we see.
      if event.is_final_response():
          if event.content and event.content.parts:
              # Assuming text response in the first part
              final_response_text = event.content.parts[0].text
              # If we streamed, finish with a newline for clean output.
              final_author = getattr(event, "author", None) or last_author
              if (
                  final_author
                  and final_author != "user"
                  and final_author in streaming_started_for_author
              ):
                  print("", flush=True)
          elif event.actions and event.actions.escalate:  # Handle potential errors/escalations
              final_response_text = f"Agent escalated: {event.error_message or 'No specific message.'}"

  return final_response_text


async def call_agent_text(query: str, runner, user_id: str, session_id: str) -> str:
  """Runs the agent and returns the final response text (no websocket/streaming)."""

  content = types.Content(role="user", parts=[types.Part(text=query)])
  final_response_text = "Agent did not produce a final response."  # Default

  run_config = RunConfig(streaming_mode=StreamingMode.NONE)
  async for event in runner.run_async(
      user_id=user_id,
      session_id=session_id,
      new_message=content,
      run_config=run_config,
  ):
      if event.is_final_response():
          if event.content and event.content.parts:
              # Assuming text response in the first part.
              final_response_text = event.content.parts[0].text
          elif event.actions and event.actions.escalate:
              final_response_text = f"Agent escalated: {event.error_message or 'No specific message.'}"

  return final_response_text
