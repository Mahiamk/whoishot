from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.config import get_settings
from app.ratelimit import limiter
from app.routers import admin, auth, contestants, contests, entries, geo, media, partners, payouts, payments, subscriptions, users, webhooks
from app.routers.media import MEDIA_DIR


@api_router.get("/")
async def root():
    return {
        "status": "ok",
        "service": "WhoIsHot API"
    }


@asynccontextmanager
async def lifespan(app: FastAPI):
    import logging
    logger = logging.getLogger(__name__)
    settings = get_settings()

    # Startup check for payment provider environment variables
    missing_vars = []
    if not settings.MOCK_PAYMENT:
        if not (settings.CURLEC_KEY_ID and settings.CURLEC_KEY_SECRET and settings.CURLEC_WEBHOOK_SECRET) and not (settings.TNG_API_KEY and settings.TNG_MERCHANT_ID):
            missing_vars.append("Curlec (CURLEC_KEY_ID, CURLEC_KEY_SECRET, CURLEC_WEBHOOK_SECRET)")
        if not (settings.CHAPA_SECRET_KEY and settings.CHAPA_PUBLIC_KEY and settings.CHAPA_WEBHOOK_SECRET):
            missing_vars.append("Chapa (CHAPA_SECRET_KEY, CHAPA_PUBLIC_KEY, CHAPA_WEBHOOK_SECRET)")
        if missing_vars:
            logger.warning(
                "Payment environment variables missing [%s]. Paid features remain disabled while free features continue working.",
                ", ".join(missing_vars)
            )

    # Promote ADMIN_EMAIL on startup if set. This and scripts/make_admin.py
    # are the only ways to grant admin — no API can.
    admin_email = settings.ADMIN_EMAIL
    if admin_email:
        from app.db import SessionLocal
        from app.models import User, UserRole

        db = SessionLocal()
        try:
            user = db.query(User).filter(User.email == admin_email.lower()).first()
            if user is not None and user.role != UserRole.admin:
                user.role = UserRole.admin
                db.commit()
        finally:
            db.close()

    # Start in-process APScheduler for ending contest reminders
    from app.scheduler import start_scheduler, stop_scheduler
    start_scheduler()

    yield

    stop_scheduler()



api_router = APIRouter(prefix="/api/v1")


@api_router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


api_router.include_router(auth.router)
api_router.include_router(contests.router)
api_router.include_router(contestants.router)
api_router.include_router(media.router)
api_router.include_router(admin.router)
api_router.include_router(users.router)
api_router.include_router(subscriptions.router)
api_router.include_router(entries.router)
api_router.include_router(payments.router)
api_router.include_router(payouts.router)
api_router.include_router(partners.router)

api_router.include_router(webhooks.router)
api_router.include_router(geo.router)



def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="WhoIsHot API", version="0.1.0", lifespan=lifespan)


    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(api_router)

    MEDIA_DIR.mkdir(exist_ok=True)
    app.mount("/media", StaticFiles(directory=MEDIA_DIR), name="media")

    return app


app = create_app()
