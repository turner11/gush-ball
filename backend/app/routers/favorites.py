from fastapi import APIRouter, Response, status
from sqlalchemy import delete

from app.deps import DbSession, RequireUser, get_team_or_404
from app.models import FavoriteTeam

router = APIRouter(prefix="/me/favorites", tags=["favorites"])


@router.put("/{team_id}", status_code=status.HTTP_204_NO_CONTENT)
def add_favorite(team_id: int, user: RequireUser, db: DbSession) -> Response:
    get_team_or_404(db, team_id)
    if db.get(FavoriteTeam, (user.id, team_id)) is None:
        # ponytail: two concurrent PUTs can hit the PK (500, harmless), same as memberships
        db.add(FavoriteTeam(user_id=user.id, team_id=team_id))
        db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/{team_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_favorite(team_id: int, user: RequireUser, db: DbSession) -> Response:
    get_team_or_404(db, team_id)
    db.execute(delete(FavoriteTeam).where(FavoriteTeam.user_id == user.id, FavoriteTeam.team_id == team_id))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
