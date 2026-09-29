from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select

from app.deps import DbSession, RequireAdmin
from app.models import AdminUser
from app.security import verify_password

router = APIRouter(prefix="/auth", tags=["auth"])

class LoginRequest(BaseModel):
    username: str
    password: str


@router.post("/login")
def login(payload: LoginRequest, request: Request, db: DbSession) -> dict[str, str]:
    admin = db.scalar(select(AdminUser).where(AdminUser.username == payload.username))
    if admin is None or not verify_password(payload.password, admin.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    request.session["admin_id"] = admin.id
    return {"username": admin.username}


@router.post("/logout")
def logout(request: Request) -> dict[str, bool]:
    request.session.clear()
    return {"ok": True}


@router.get("/me")
def me(admin_id: RequireAdmin, db: DbSession) -> dict[str, str]:
    admin = db.get(AdminUser, admin_id)
    return {"username": admin.username}
