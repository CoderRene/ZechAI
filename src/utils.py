import os
import json
import re

def env(name: str, default: str | None = None) -> str | None:
    value = os.getenv(name)
    if value is None:
        return default
    value = value.strip()
    return value or default

def extract_provider_error(exc: Exception) -> tuple[dict, int]:
    """Extract provider error details from nested exception strings."""

    raw = str(exc) or "Unexpected upstream error"
    message = raw
    code: int | None = None
    status: str | None = None

    # Provider libraries often embed JSON payloads inside exception text.
    for candidate in re.findall(r"\{[\s\S]*\}", raw):
        try:
            parsed = json.loads(candidate)
        except json.JSONDecodeError:
            continue

        if not isinstance(parsed, dict):
            continue

        error_obj = parsed.get("error", parsed)
        if not isinstance(error_obj, dict):
            continue

        if isinstance(error_obj.get("message"), str):
            message = error_obj["message"]

        raw_code = error_obj.get("code")
        if isinstance(raw_code, int):
            code = raw_code
        elif isinstance(raw_code, str) and raw_code.isdigit():
            code = int(raw_code)

        if isinstance(error_obj.get("status"), str):
            status = error_obj["status"]
        break

    # Fallback if JSON extraction fails but key/value fragments exist.
    if code is None:
        code_match = re.search(r'"code"\s*:\s*(\d+)', raw)
        if code_match:
            code = int(code_match.group(1))

    if status is None:
        status_match = re.search(r'"status"\s*:\s*"([^"]+)"', raw)
        if status_match:
            status = status_match.group(1)

    if message == raw:
        message_match = re.search(r'"message"\s*:\s*"([^"]+)"', raw)
        if message_match:
            message = message_match.group(1)

    response = {
        "error": message,
        "complete": True,
    }
    if code is not None:
        response["provider_error_code"] = code
    if status is not None:
        response["provider_error_status"] = status

    http_status = code if isinstance(code, int) and 400 <= code <= 599 else 500
    return response, http_status