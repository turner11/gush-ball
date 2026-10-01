import hashlib

import bcrypt


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
