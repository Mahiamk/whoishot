from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address

RATING_LIMIT = "30/minute"
EMAIL_CHECK_LIMIT = "20/minute"
DOMAIN_REQUEST_LIMIT = "10/minute"


def user_or_ip(request: Request) -> str:
    """Rate-limit per user (bearer token) when authenticated, else per IP."""
    auth = request.headers.get("authorization")
    if auth:
        return auth
    return get_remote_address(request)


limiter = Limiter(key_func=user_or_ip)
