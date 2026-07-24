"""IP Geolocation Detection Router.

Provides GET /api/v1/geo/detect for client-side country suggestion.
Caches IP lookups for 24 hours in-memory.
"""

import time
from typing import Any

from fastapi import APIRouter, Depends, Request
import requests
from sqlalchemy.orm import Session

from app.adapters.payment import resolve_provider_for_country
from app.db import get_db
from app.deps import get_current_user
from app.models import User

router = APIRouter(prefix="/geo", tags=["geo"])

GEO_CACHE_TTL = 86400.0  # 24 hours in seconds
_geo_cache: dict[str, tuple[float, dict[str, Any]]] = {}


def _get_client_ip(request: Request) -> str:
    """Extract real client IP address from headers or connection info."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()
    if request.client:
        return request.client.host
    return "127.0.0.1"


def _is_private_ip(ip: str) -> bool:
    """Return True if IP is loopback or local network address."""
    return (
        ip in ("127.0.0.1", "::1", "localhost")
        or ip.startswith("192.168.")
        or ip.startswith("10.")
        or ip.startswith("172.16.")
    )


def _perform_geo_lookup(ip: str) -> dict[str, Any]:
    """Perform IP geolocation lookup with 24-hour in-memory cache."""
    now = time.monotonic()
    if ip in _geo_cache:
        timestamp, cached_res = _geo_cache[ip]
        if now - timestamp < GEO_CACHE_TTL:
            return cached_res

    # Local / Private IP fallback -> default to Malaysia (MY) for dev
    if _is_private_ip(ip):
        res = {
            "country_code": "MY",
            "country_name": "Malaysia",
        }
        _geo_cache[ip] = (now, res)
        return res

    # Public IP lookup via ip-api.com
    try:
        r = requests.get(
            f"http://ip-api.com/json/{ip}?fields=status,countryCode,country",
            timeout=3,
        )
        if r.status_code == 200:
            data = r.json()
            if data.get("status") == "success":
                res = {
                    "country_code": data.get("countryCode", "MY"),
                    "country_name": data.get("country", "Malaysia"),
                }
                _geo_cache[ip] = (now, res)
                return res
    except Exception:
        pass

    # Default fallback
    res = {
        "country_code": "MY",
        "country_name": "Malaysia",
    }
    _geo_cache[ip] = (now, res)
    return res


@router.get("/detect")
def detect_country(
    request: Request,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Detect client country from IP address.

    Returns suggested provider and currency. Updates detected_country on
    authenticated user if logged in (informational, never overrides explicit
    country setting).
    """
    ip = _get_client_ip(request)
    geo = _perform_geo_lookup(ip)
    country_code = geo["country_code"]
    country_name = geo["country_name"]

    adapter, provider_name, currency = resolve_provider_for_country(country_code)

    # Optional user update if auth header present
    user: User | None = None
    auth_header = request.headers.get("authorization")
    if auth_header and auth_header.startswith("Bearer "):
        try:
            # Non-blocking soft check for current user
            from app.security import decode_access_token
            token = auth_header.split(" ")[1]
            payload = decode_access_token(token)
            user_id = int(payload.get("sub", 0))
            if user_id:
                user = db.get(User, user_id)
                if user and user.detected_country != country_code:
                    user.detected_country = country_code
                    db.commit()
        except Exception:
            pass

    supported = country_code in ("MY", "ET") or provider_name != "none"

    return {
        "ip": ip,
        "country_code": country_code,
        "country_name": country_name,
        "suggested_provider": provider_name,
        "suggested_currency": currency,
        "supported": supported,
        "user_country": user.country if user else None,
    }
