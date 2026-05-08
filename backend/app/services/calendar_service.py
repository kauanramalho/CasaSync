from sqlalchemy.orm import Session

from app.models.integration import GoogleCalendarConnection


def get_google_calendar_status(db: Session, family_id: str) -> GoogleCalendarConnection | None:
    return db.query(GoogleCalendarConnection).filter(GoogleCalendarConnection.family_id == family_id).first()


def build_google_connect_url() -> tuple[str | None, str]:
    return (
        None,
        "Integração preparada. Configure GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e implemente o OAuth para ativar.",
    )

