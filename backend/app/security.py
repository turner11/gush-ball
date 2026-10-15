import hashlib
from typing import Annotated

import bcrypt
from pydantic import StringConstraints


# ponytail: bcrypt only uses the first 72 bytes; truncate explicitly (matches passlib, and bcrypt>=5 raises otherwise).
def _b(s: str) -> bytes:
    return s.encode()[:72]


def hash_password(password: str) -> str:
    return bcrypt.hashpw(_b(password), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(_b(password), password_hash.encode())


def password_fingerprint(password_hash: str) -> str:
    """Changes whenever the password does: ties reset tokens and sessions to the current password."""
    return hashlib.sha256(password_hash.encode()).hexdigest()[:16]


# no "@": login routes any identifier containing "@" to the email lookup
Username = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=64, pattern=r"^[^@]+$")]
# lowercase: login, forgot-password and the Google callback all look emails up lowercase
Email = Annotated[
    str, StringConstraints(strip_whitespace=True, to_lower=True, max_length=254, pattern=r"^[^@\s]+@[^@\s]+$")
]
