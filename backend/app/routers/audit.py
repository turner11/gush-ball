from datetime import datetime

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select

from app.deps import DbSession, RequireAdmin
from app.models import AuditLog

router = APIRouter(prefix="/audit-log", tags=["audit"])

_MAX_LIMIT = 500


class AuditLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    user_id: int | None
    username: str | None
    action: str
    entity_type: str
    entity_id: int
    team_id: int | None
    changes: dict


@router.get("", response_model=list[AuditLogOut])
def list_audit_log(
    _admin_id: RequireAdmin,
    db: DbSession,
    team_id: int | None = None,
    entity_type: str | None = None,
    entity_id: int | None = None,
    before_id: int | None = None,
    limit: int = 200,
) -> list[AuditLog]:
    query = select(AuditLog).order_by(AuditLog.id.desc()).limit(max(1, min(limit, _MAX_LIMIT)))
    if before_id is not None:
        query = query.where(AuditLog.id < before_id)
    for column, value in ((AuditLog.team_id, team_id), (AuditLog.entity_type, entity_type), (AuditLog.entity_id, entity_id)):
        if value is not None:
            query = query.where(column == value)
    return list(db.scalars(query))
