from pydantic import BaseModel


class TicketIn(BaseModel):
    ticket: str
    user_id: str = "api-user"
    session_id: str = "api-session"