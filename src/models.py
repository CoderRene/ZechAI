from pydantic import BaseModel


class TicketIn(BaseModel):
    type: str
    ticket: str
    user_id: str = "api-user"
    session_id: str = "api-session"