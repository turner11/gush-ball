from app.security import hash_password, verify_password

# Generated once with bcrypt.hashpw; proves compat with hashes already stored.
EXISTING_HASH = "$2b$12$4TqWRCwxNw/DvwwYZtszbuG2Qk2ZlQpdkD9Pff7y9qQ//lqFjAvY."


def test_hash_roundtrip():
    h = hash_password("pw")
    assert verify_password("pw", h)
    assert not verify_password("wrong", h)


def test_verifies_existing_2b_hash():
    assert verify_password("correct horse", EXISTING_HASH)


def test_hash_is_2b_bcrypt():
    assert hash_password("pw").startswith("$2b$")


def test_long_password_does_not_raise():
    pw = "a" * 72 + "b" * 28
    h = hash_password(pw)
    assert verify_password(pw, h)
    # bcrypt ignores bytes past 72; behavior pinned to match passlib
    assert verify_password("a" * 72 + "zzz", h)
