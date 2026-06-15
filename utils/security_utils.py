"""
security_utils.py
-----------------
Cryptographically secure token generation and session age validation.
"""
import secrets
import datetime

# Factory shift: absolute session maximum (8 hours), regardless of activity
SESSION_MAX_AGE_SECONDS = 8 * 3600  # 28 800 seconds

# Token byte length (32 bytes = 256 bits of entropy, URL-safe hex)
TOKEN_BYTES = 32


def generate_secure_token() -> str:
    """
    Generate a cryptographically secure URL-safe random token.
    Uses secrets.token_hex which is backed by os.urandom — safe for session tokens.
    Returns a 64-character hex string (256-bit entropy).
    """
    return secrets.token_hex(TOKEN_BYTES)


def is_session_expired(session: dict) -> bool:
    """
    Returns True if either:
    - The session has exceeded the inactivity timeout (15 min), OR
    - The session has exceeded the absolute max age (8 hours / factory shift).

    Expected session structure:
        {
            'user': {...},
            'last_activity': datetime,
            'created_at': datetime
        }
    """
    now = datetime.datetime.now()

    # Check inactivity timeout (900 seconds = 15 minutes)
    inactivity_seconds = (now - session.get('last_activity', now)).total_seconds()
    if inactivity_seconds > 900:
        return True

    # Check absolute max age (8-hour factory shift)
    session_age_seconds = (now - session.get('created_at', now)).total_seconds()
    if session_age_seconds > SESSION_MAX_AGE_SECONDS:
        return True

    return False


def make_session(user_data: dict) -> dict:
    """
    Create a new session dict with the current timestamp for both
    last_activity and created_at.
    """
    now = datetime.datetime.now()
    return {
        'user': user_data,
        'last_activity': now,
        'created_at': now,
    }
