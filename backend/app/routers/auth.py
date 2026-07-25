import secrets

from fastapi import APIRouter, Depends, HTTPException, Request, status
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.deps import get_current_user
from app.email import send_email
from app.email_policy import REASON_MESSAGES, check_email_domain, domain_of

from app.models import Report, ReportStatus, ReportType, User
from app.ratelimit import DOMAIN_REQUEST_LIMIT, EMAIL_CHECK_LIMIT, limiter
from app.schemas import (
    DomainRequestCreate,
    DomainRequestRead,
    EmailCheckResponse,
    GoogleLoginRequest,
    GoogleLoginResponse,
    LoginRequest,
    TokenResponse,
    UserCreate,
    UserRead,
)
from app.security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])

GOOGLE_LOGIN_LIMIT = "10/minute"


def verify_google_credential(credential: str, client_id: str) -> dict:
    """Verify a Google Identity Services ID token and return its claims.
    Split out so tests can monkeypatch it without real Google calls."""
    return google_id_token.verify_oauth2_token(
        credential, google_requests.Request(), client_id
    )


@router.get("/check-email", response_model=EmailCheckResponse)
@limiter.limit(EMAIL_CHECK_LIMIT)
def check_email(request: Request, email: str, db: Session = Depends(get_db)) -> EmailCheckResponse:
    # Purely domain-based — never touches the users table, so this can't be
    # used to probe whether a specific address is already registered.
    allowed, reason = check_email_domain(db, email)
    return EmailCheckResponse(allowed=allowed, reason=reason)


@router.post(
    "/domain-requests",
    response_model=DomainRequestRead,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit(DOMAIN_REQUEST_LIMIT)
def request_domain(
    request: Request, payload: DomainRequestCreate, db: Session = Depends(get_db)
) -> Report:
    domain = domain_of(payload.email)
    existing = (
        db.query(Report)
        .filter(
            Report.type == ReportType.domain_request,
            Report.requested_domain == domain,
            Report.status == ReportStatus.open,
        )
        .first()
    )
    if existing is not None:
        return existing

    report = Report(
        type=ReportType.domain_request,
        requested_domain=domain,
        reporter_email=payload.email.lower(),
        reason=f"University domain request: {domain}",
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return report


@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def register(payload: UserCreate, db: Session = Depends(get_db)) -> User:
    email = payload.email.lower()

    allowed, reason = check_email_domain(db, email)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=REASON_MESSAGES.get(reason, "This email isn't allowed."),
        )

    if db.query(User).filter(User.email == email).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        )
    user = User(
        email=email,
        password_hash=hash_password(payload.password),
        display_name=payload.display_name,
        gender=payload.gender,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    send_email(
        db,
        to=user.email,
        template_key="welcome",
        context={"display_name": user.display_name},
        user_id=user.id,
        is_transactional_required=True,
    )

    return user


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    user = db.query(User).filter(User.email == payload.email.lower()).first()
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    if user.is_banned:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account has been banned. Contact the contest organizer.",
        )
    return TokenResponse(access_token=create_access_token(user.id))


@router.post("/google", response_model=GoogleLoginResponse)
@limiter.limit(GOOGLE_LOGIN_LIMIT)
def google_login(
    request: Request, payload: GoogleLoginRequest, db: Session = Depends(get_db)
) -> GoogleLoginResponse:
    client_id = get_settings().GOOGLE_CLIENT_ID
    if not client_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google sign-in is not configured",
        )

    try:
        claims = verify_google_credential(payload.credential, client_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Google credential",
        )
    if not claims.get("email") or not claims.get("email_verified"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google account has no verified email",
        )

    email = claims["email"].lower()
    user = db.query(User).filter(User.email == email).first()

    if user is not None:
        if user.is_banned:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This account has been banned. Contact the contest organizer.",
            )
        return GoogleLoginResponse(access_token=create_access_token(user.id))

    # First Google sign-in = account creation: the registration email
    # policy applies exactly as it does to normal registration.
    allowed, reason = check_email_domain(db, email)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=REASON_MESSAGES.get(reason, "This email isn't allowed."),
        )

    # Google doesn't know the user's bracket — ask the client to collect
    # it and retry with the same credential.
    if payload.gender is None:
        return GoogleLoginResponse(needs_gender=True)

    user = User(
        email=email,
        # Google-only accounts get a random unusable password; password
        # login stays possible in principle only via a future reset flow.
        password_hash=hash_password(secrets.token_urlsafe(32)),
        display_name=(claims.get("name") or email.split("@")[0])[:100],
        gender=payload.gender,
        # Google has verified this email address.
        is_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    send_email(
        db,
        to=user.email,
        template_key="welcome",
        context={"display_name": user.display_name},
        user_id=user.id,
        is_transactional_required=True,
    )

    return GoogleLoginResponse(access_token=create_access_token(user.id))



@router.get("/me", response_model=UserRead)
def me(current_user: User = Depends(get_current_user)) -> User:
    return current_user
