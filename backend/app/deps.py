from fastapi import HTTPException, Request, status


def require_admin(request: Request) -> int:
    """Dependency for admin-only routes. Raises 401 if no admin session exists."""
    admin_id = request.session.get("admin_id")
    if admin_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return admin_id
