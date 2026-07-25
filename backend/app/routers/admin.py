from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload

from app.audit import audit
from app.db import get_db
from app.deps import require_admin
from app.email import send_email
from app.info_requests import check_expire
from app.models import (
    AdminAuditLog,
    Contest,
    Contestant,
    ContestantStatus,
    ContestStatus,
    DomainKind,
    EmailDomain,
    EntryPayment,
    EntryPaymentStatus,
    InfoRequest,
    InfoRequestStatus,
    InquiryStatus,
    InquiryType,
    IntroductionStatus,
    PartnerInquiry,
    PartnerIntroduction,
    PaymentMethod,
    Rating,
    Report,
    ReportStatus,
    ReportType,
    Subscription,
    SubscriptionStatus,
    User,
    UserRole,
    utcnow,
)
from app.services.payment_service import activate_entry_payment, activate_subscription

from app.config import get_settings
from app.routers.contests import _leaderboard_cache, invalidate_leaderboard_cache
from app.routers.media import MEDIA_DIR
from app.schemas import (
    AdminAuditLogItem,
    AdminAuditLogPage,
    AdminContestantDetail,
    AdminContestItem,
    AdminDomainRequestItem,
    AdminInfoRequestItem,
    AdminMetrics,
    AdminReportContestant,
    AdminReportItem,
    AdminReportPage,
    AdminUserContestantEntry,
    AdminIncomeResponse,
    AdminUserDetail,
    AdminUserItem,
    AdminUserPage,
    AdminVoterEntry,
    ContestRead,
    CountryIncomeBreakdown,
    EmailDomainCreate,
    EmailDomainItem,
    IncomeItem,
    IncomeSummary,
    InfoRequestCreate,
    OptedInContestantItem,
    PartnerInquiryRead,
    PartnerInquiryStatusUpdate,
    PartnerIntroductionRead,
    PaymentApproveRequest,
    PaymentProviderStatusItem,
    PaymentRejectRequest,
    PaymentReviewItem,
    ProposeIntroductionCreate,
    ResolveAction,
    ResolveRequest,
)



router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/payment-providers", response_model=list[PaymentProviderStatusItem])
def get_payment_providers_status(
    admin: User = Depends(require_admin),
) -> list[dict[str, Any]]:
    """Return configured vs missing status of payment providers."""
    settings = get_settings()

    curlec_configured = bool(
        (settings.CURLEC_KEY_ID and settings.CURLEC_KEY_SECRET and settings.CURLEC_WEBHOOK_SECRET)
        or (settings.TNG_API_KEY and settings.TNG_MERCHANT_ID)
    )
    birr_configured = bool(
        settings.CHAPA_SECRET_KEY and settings.CHAPA_PUBLIC_KEY and settings.CHAPA_WEBHOOK_SECRET
    )

    return [
        {
            "name": "Curlec / Touch 'n Go (MYR)",
            "provider_id": "tng",
            "currency": "MYR",
            "is_configured": curlec_configured,
            "is_mock": False,
            "details": "Curlec API credentials configured" if curlec_configured else "Missing CURLEC_KEY_ID, CURLEC_KEY_SECRET, or CURLEC_WEBHOOK_SECRET",
        },
        {
            "name": "Chapa / BirrJS (ETB)",
            "provider_id": "birr",
            "currency": "ETB",
            "is_configured": birr_configured,
            "is_mock": False,
            "details": "Chapa API credentials configured" if birr_configured else "Missing CHAPA_SECRET_KEY, CHAPA_PUBLIC_KEY, or CHAPA_WEBHOOK_SECRET",
        },
        {
            "name": "Mock Provider (Dev)",
            "provider_id": "mock",
            "currency": settings.SUBSCRIPTION_CURRENCY,
            "is_configured": settings.MOCK_PAYMENT,
            "is_mock": True,
            "details": "Instant dev checkout enabled" if settings.MOCK_PAYMENT else "Mock payment disabled",
        },
    ]



@router.get("/metrics", response_model=AdminMetrics)
def get_metrics(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> AdminMetrics:
    users_total = db.query(func.count(User.id)).scalar() or 0
    users_by_gender = {
        g.value: n
        for g, n in db.query(User.gender, func.count(User.id))
        .group_by(User.gender)
        .all()
    }
    active_contests = (
        db.query(func.count(Contest.id))
        .filter(Contest.is_active == True)  # noqa: E712
        .scalar()
        or 0
    )
    contestants_by_gender = {
        g.value: n
        for g, n in db.query(Contestant.gender_category, func.count(Contestant.id))
        .filter(Contestant.status == ContestantStatus.active)
        .group_by(Contestant.gender_category)
        .all()
    }
    ratings_total = db.query(func.count(Rating.id)).scalar() or 0
    open_reports = (
        db.query(func.count(Report.id))
        .filter(Report.status == ReportStatus.open)
        .scalar()
        or 0
    )
    return AdminMetrics(
        users_total=users_total,
        users_by_gender=users_by_gender,
        active_contests=active_contests,
        contestants_by_gender=contestants_by_gender,
        ratings_total=ratings_total,
        open_reports=open_reports,
    )


def _latest_info_request(db: Session, report_id: int) -> InfoRequest | None:
    """Most recent info request for a report, with check-on-read expiry
    applied so an admin viewing a stale pending request sees it flip."""
    info_request = (
        db.query(InfoRequest)
        .options(joinedload(InfoRequest.report).joinedload(Report.contestant))
        .filter(InfoRequest.report_id == report_id)
        .order_by(InfoRequest.id.desc())
        .first()
    )
    if info_request is None:
        return None
    return check_expire(db, info_request)


@router.get("/reports", response_model=AdminReportPage)
def list_reports(
    status_filter: ReportStatus = Query(ReportStatus.open, alias="status"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> AdminReportPage:
    query = (
        db.query(Report)
        .options(joinedload(Report.contestant))
        .filter(Report.type == ReportType.contestant, Report.status == status_filter)
        .order_by(Report.id.desc())
    )
    total = query.count()
    reports = query.offset((page - 1) * per_page).limit(per_page).all()
    items = [
        AdminReportItem(
            id=r.id,
            reason=r.reason,
            reporter_email=r.reporter_email,
            status=r.status,
            contestant=AdminReportContestant(
                id=r.contestant.id,
                name=r.contestant.name,
                photo_url=r.contestant.photo_url,
                status=r.contestant.status,
                contest_id=r.contestant.contest_id,
                user_id=r.contestant.user_id,
            ),
            info_request=(
                AdminInfoRequestItem.model_validate(ir)
                if (ir := _latest_info_request(db, r.id))
                else None
            ),
        )
        for r in reports
    ]
    return AdminReportPage(items=items, total=total, page=page, per_page=per_page)


@router.post(
    "/reports/{report_id}/request-info",
    response_model=AdminInfoRequestItem,
    status_code=status.HTTP_201_CREATED,
)
def request_info(
    report_id: int,
    payload: InfoRequestCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> InfoRequest:
    report = db.get(Report, report_id)
    if report is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Report not found"
        )
    contestant = report.contestant
    if contestant.user_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This profile has no owner to request info from",
        )

    existing = _latest_info_request(db, report_id)
    if existing is not None and existing.status == InfoRequestStatus.pending:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An info request is already pending for this report",
        )

    info_request = InfoRequest(
        report_id=report.id,
        target_user_id=contestant.user_id,
        admin_id=admin.id,
        message=payload.message,
        **({"deadline_at": payload.deadline_at} if payload.deadline_at else {}),
    )
    db.add(info_request)
    db.flush()
    audit(
        db,
        admin,
        "info_request.create",
        "info_request",
        info_request.id,
        {"report_id": report.id, "target_user_id": contestant.user_id},
    )
    db.commit()
    db.refresh(info_request)

    send_email(
        db=db,
        to=contestant.user.email,
        template_key="info_request",
        context={
            "contestant_name": contestant.name,
            "message": payload.message,
        },
        user_id=contestant.user_id,
        is_transactional_required=True,
    )


    return info_request


@router.post("/reports/{report_id}/resolve", response_model=AdminReportItem)
def resolve_report(
    report_id: int,
    payload: ResolveRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> AdminReportItem:
    report = db.get(Report, report_id)
    if report is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Report not found"
        )
    if report.status == ReportStatus.resolved:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Report already resolved"
        )

    contestant = report.contestant
    detail: dict = {"action": payload.action.value, "contestant_id": contestant.id}

    if payload.action == ResolveAction.hide_contestant:
        contestant.status = ContestantStatus.reported
    elif payload.action == ResolveAction.remove_contestant:
        contestant.status = ContestantStatus.removed
    elif payload.action == ResolveAction.delete_photo:
        if contestant.photo_url:
            filename = contestant.photo_url.rsplit("/", 1)[-1]
            local = MEDIA_DIR / filename
            if local.is_file():
                local.unlink()
            detail["deleted_photo"] = contestant.photo_url
            contestant.photo_url = None
    elif payload.action == ResolveAction.ban_user:
        target_user = contestant.user
        if target_user.role == UserRole.admin:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot ban an admin",
            )
        target_user.is_banned = True
        detail["banned_user_id"] = target_user.id
    # dismiss: no side effect beyond resolving

    report.status = ReportStatus.resolved
    audit(db, admin, f"report.{payload.action.value}", "report", report.id, detail)
    db.commit()

    if payload.action == ResolveAction.ban_user:
        _leaderboard_cache.clear()
    else:
        invalidate_leaderboard_cache(contestant.contest_id)

    return AdminReportItem(
        id=report.id,
        reason=report.reason,
        reporter_email=report.reporter_email,
        status=report.status,
        contestant=AdminReportContestant(
            id=contestant.id,
            name=contestant.name,
            photo_url=contestant.photo_url,
            status=contestant.status,
            contest_id=contestant.contest_id,
            user_id=contestant.user_id,
        ),
        info_request=(
            AdminInfoRequestItem.model_validate(ir)
            if (ir := _latest_info_request(db, report.id))
            else None
        ),
    )


@router.get("/users", response_model=AdminUserPage)
def list_users(
    search: str = "",
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> AdminUserPage:
    query = db.query(User).order_by(User.id)
    if search:
        pattern = f"%{search}%"
        query = query.filter(
            or_(User.email.ilike(pattern), User.display_name.ilike(pattern))
        )
    total = query.count()
    users = query.offset((page - 1) * per_page).limit(per_page).all()
    return AdminUserPage(
        items=[AdminUserItem.model_validate(u) for u in users],
        total=total,
        page=page,
        per_page=per_page,
    )


def _set_ban(db: Session, admin: User, user_id: int, banned: bool) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )
    if user.role == UserRole.admin:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot ban an admin"
        )
    user.is_banned = banned
    audit(
        db,
        admin,
        "user.ban" if banned else "user.unban",
        "user",
        user.id,
        {"email": user.email},
    )
    db.commit()
    db.refresh(user)
    # Bans change every board this user touched as voter or contestant.
    _leaderboard_cache.clear()
    return user


@router.post("/users/{user_id}/ban", response_model=AdminUserItem)
def ban_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> User:
    return _set_ban(db, admin, user_id, True)


@router.post("/users/{user_id}/unban", response_model=AdminUserItem)
def unban_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> User:
    return _set_ban(db, admin, user_id, False)


@router.get("/contests", response_model=list[AdminContestItem])
def list_contests(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> list[AdminContestItem]:
    contestant_counts = (
        db.query(
            Contestant.contest_id.label("cid"),
            func.count(Contestant.id).label("n"),
        )
        .group_by(Contestant.contest_id)
        .subquery()
    )
    rating_counts = (
        db.query(
            Contestant.contest_id.label("cid"),
            func.count(Rating.id).label("n"),
        )
        .join(Rating, Rating.contestant_id == Contestant.id)
        .group_by(Contestant.contest_id)
        .subquery()
    )
    report_counts = (
        db.query(
            Contestant.contest_id.label("cid"),
            func.count(Report.id).label("n"),
        )
        .join(Report, Report.contestant_id == Contestant.id)
        .filter(Report.status == ReportStatus.open)
        .group_by(Contestant.contest_id)
        .subquery()
    )
    rows = (
        db.query(
            Contest,
            contestant_counts.c.n,
            rating_counts.c.n,
            report_counts.c.n,
        )
        .outerjoin(contestant_counts, contestant_counts.c.cid == Contest.id)
        .outerjoin(rating_counts, rating_counts.c.cid == Contest.id)
        .outerjoin(report_counts, report_counts.c.cid == Contest.id)
        .order_by(Contest.id)
        .all()
    )
    return [
        AdminContestItem(
            **ContestRead.model_validate(contest).model_dump(),
            contestant_count=contestants or 0,
            rating_count=ratings or 0,
            open_report_count=reports or 0,
        )
        for contest, contestants, ratings, reports in rows
    ]


@router.post("/contests/{contest_id}/deactivate", response_model=ContestRead)
def deactivate_contest(
    contest_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> Contest:
    contest = db.get(Contest, contest_id)
    if contest is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Contest not found"
        )
    contest.is_active = False
    contest.status = ContestStatus.ended
    audit(
        db,
        admin,
        "contest.deactivate",
        "contest",
        contest.id,
        {"join_code": contest.join_code},
    )
    db.commit()
    db.refresh(contest)
    invalidate_leaderboard_cache(contest.id)
    return contest


@router.get("/audit-log", response_model=AdminAuditLogPage)
def list_audit_log(
    action: str | None = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> AdminAuditLogPage:
    query = (
        db.query(AdminAuditLog)
        .options(joinedload(AdminAuditLog.admin))
        .order_by(AdminAuditLog.id.desc())
    )
    if action:
        query = query.filter(AdminAuditLog.action == action)
    total = query.count()
    rows = query.offset((page - 1) * per_page).limit(per_page).all()
    items = [
        AdminAuditLogItem(
            id=r.id,
            admin_id=r.admin_id,
            admin_email=r.admin.email if r.admin else None,
            action=r.action,
            target_type=r.target_type,
            target_id=r.target_id,
            detail=r.detail,
            created_at=r.created_at,
        )
        for r in rows
    ]
    return AdminAuditLogPage(items=items, total=total, page=page, per_page=per_page)


# --- email domains (Registration email policy) ---

def _email_domain_item(entry: EmailDomain) -> EmailDomainItem:
    return EmailDomainItem(
        id=entry.id,
        domain=entry.domain,
        kind=entry.kind,
        note=entry.note,
        added_by=entry.added_by,
        added_by_email=entry.added_by_user.email if entry.added_by_user else None,
        created_at=entry.created_at,
    )


@router.get("/email-domains", response_model=list[EmailDomainItem])
def list_email_domains(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> list[EmailDomainItem]:
    entries = (
        db.query(EmailDomain)
        .options(joinedload(EmailDomain.added_by_user))
        .order_by(EmailDomain.domain)
        .all()
    )
    return [_email_domain_item(e) for e in entries]


@router.post(
    "/email-domains",
    response_model=EmailDomainItem,
    status_code=status.HTTP_201_CREATED,
)
def create_email_domain(
    payload: EmailDomainCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> EmailDomainItem:
    if db.query(EmailDomain).filter(EmailDomain.domain == payload.domain).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This domain already has a rule",
        )
    entry = EmailDomain(
        domain=payload.domain,
        kind=payload.kind,
        note=payload.note,
        added_by=admin.id,
    )
    db.add(entry)
    db.flush()
    audit(
        db,
        admin,
        "email_domain.create",
        "email_domain",
        entry.id,
        {"domain": entry.domain, "kind": entry.kind.value},
    )
    db.commit()
    db.refresh(entry)
    return _email_domain_item(entry)


@router.delete("/email-domains/{domain_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_email_domain(
    domain_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> None:
    entry = db.get(EmailDomain, domain_id)
    if entry is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Domain rule not found"
        )
    audit(
        db,
        admin,
        "email_domain.delete",
        "email_domain",
        entry.id,
        {"domain": entry.domain, "kind": entry.kind.value},
    )
    db.delete(entry)
    db.commit()


@router.get("/domain-requests", response_model=list[AdminDomainRequestItem])
def list_domain_requests(
    status_filter: ReportStatus = Query(ReportStatus.open, alias="status"),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> list[AdminDomainRequestItem]:
    reports = (
        db.query(Report)
        .filter(Report.type == ReportType.domain_request, Report.status == status_filter)
        .order_by(Report.id.desc())
        .all()
    )
    return [
        AdminDomainRequestItem(
            id=r.id,
            requested_domain=r.requested_domain,
            reporter_email=r.reporter_email,
            reason=r.reason,
            status=r.status,
        )
        for r in reports
    ]


def _get_open_domain_request(db: Session, report_id: int) -> Report:
    report = db.get(Report, report_id)
    if report is None or report.type != ReportType.domain_request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Domain request not found"
        )
    if report.status != ReportStatus.open:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This request has already been resolved",
        )
    return report


@router.post(
    "/domain-requests/{report_id}/approve", response_model=AdminDomainRequestItem
)
def approve_domain_request(
    report_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> AdminDomainRequestItem:
    report = _get_open_domain_request(db, report_id)
    domain = report.requested_domain

    existing = db.query(EmailDomain).filter(EmailDomain.domain == domain).first()
    if existing is None:
        db.add(
            EmailDomain(
                domain=domain,
                kind=DomainKind.allow,
                note=f"Approved from domain request #{report.id}",
                added_by=admin.id,
            )
        )
    elif existing.kind == DomainKind.deny:
        existing.kind = DomainKind.allow
        existing.note = f"Approved from domain request #{report.id}"
        existing.added_by = admin.id

    report.status = ReportStatus.resolved
    audit(
        db,
        admin,
        "domain_request.approve",
        "email_domain",
        report.id,
        {"domain": domain},
    )
    db.commit()
    return AdminDomainRequestItem(
        id=report.id,
        requested_domain=report.requested_domain,
        reporter_email=report.reporter_email,
        reason=report.reason,
        status=report.status,
    )


@router.post(
    "/domain-requests/{report_id}/reject", response_model=AdminDomainRequestItem
)
def reject_domain_request(
    report_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> AdminDomainRequestItem:
    report = _get_open_domain_request(db, report_id)
    report.status = ReportStatus.resolved
    audit(
        db,
        admin,
        "domain_request.reject",
        "email_domain",
        report.id,
        {"domain": report.requested_domain},
    )
    db.commit()
    return AdminDomainRequestItem(
        id=report.id,
        requested_domain=report.requested_domain,
        reporter_email=report.reporter_email,
        reason=report.reason,
        status=report.status,
    )


# ---------------------------------------------------------------------------
# Admin detail views — user detail, contest contestants, contestant voters
# ---------------------------------------------------------------------------

def _contestant_avg_and_count(
    db: Session, contestant_id: int
) -> tuple[dict[str, float], int, float | None]:
    """Return (criterion_averages, vote_count, avg_score) for a contestant.
    Banned voters are excluded from the calculation."""
    criterion_rows = (
        db.query(Rating.criterion, func.avg(Rating.score))
        .join(User, Rating.voter_id == User.id)
        .filter(
            Rating.contestant_id == contestant_id,
            User.is_banned == False,  # noqa: E712
        )
        .group_by(Rating.criterion)
        .all()
    )
    criterion_averages = {c: round(float(a), 2) for c, a in criterion_rows}
    vote_count = (
        db.query(func.count(func.distinct(Rating.voter_id)))
        .join(User, Rating.voter_id == User.id)
        .filter(
            Rating.contestant_id == contestant_id,
            User.is_banned == False,  # noqa: E712
        )
        .scalar()
        or 0
    )
    avg_score = (
        round(sum(criterion_averages.values()) / len(criterion_averages), 2)
        if criterion_averages
        else None
    )
    return criterion_averages, vote_count, avg_score


@router.get("/users/{user_id}", response_model=AdminUserDetail)
def get_user_detail(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> AdminUserDetail:
    """Full user profile with all contestant entries and their scores."""
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )


    entries = []
    for c in user.contestant_entries:
        _, vote_count, avg_score = _contestant_avg_and_count(db, c.id)
        entries.append(
            AdminUserContestantEntry(
                contestant_id=c.id,
                contest_id=c.contest_id,
                contest_title=c.contest.title,
                contest_join_code=c.contest.join_code,
                contest_status=c.contest.status,
                name=c.name,
                photo_url=c.photo_url,
                gender_category=c.gender_category,
                status=c.status,
                avg_score=avg_score,
                vote_count=vote_count,
            )
        )

    return AdminUserDetail(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        gender=user.gender,
        role=user.role,
        is_banned=user.is_banned,
        is_verified=user.is_verified,
        legacy_email=user.legacy_email,
        created_at=user.created_at,
        contestant_entries=entries,
    )


@router.get(
    "/contests/{contest_id}/contestants",
    response_model=list[AdminContestantDetail],
)
def list_contest_contestants(
    contest_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> list[AdminContestantDetail]:
    """All contestants in a contest (including reported/removed) with vote stats."""
    contest = db.get(Contest, contest_id)
    if contest is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Contest not found"
        )

    contestants = (
        db.query(Contestant)
        .filter(Contestant.contest_id == contest_id)
        .order_by(Contestant.id)
        .all()
    )

    result = []
    for c in contestants:
        criterion_averages, vote_count, avg_score = _contestant_avg_and_count(db, c.id)
        result.append(
            AdminContestantDetail(
                id=c.id,
                user_id=c.user_id,
                contest_id=c.contest_id,
                contest_title=contest.title,
                contest_join_code=contest.join_code,
                name=c.name,
                gender_category=c.gender_category,
                photo_url=c.photo_url,
                age=c.age,
                country=c.country,
                hobbies=c.hobbies,
                fav_things=c.fav_things,
                relationship_status=c.relationship_status,
                status=c.status,
                is_demo=c.is_demo,
                criterion_averages=criterion_averages,
                vote_count=vote_count,
                avg_score=avg_score,
                voters=[],  # voters field not needed in this list view
            )
        )
    return result


@router.get(
    "/contestants/{contestant_id}/voters",
    response_model=AdminContestantDetail,
)
def get_contestant_voters(
    contestant_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> AdminContestantDetail:
    """Full contestant info with the complete voter list and per-criterion scores."""
    contestant = db.get(Contestant, contestant_id)
    if contestant is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Contestant not found"
        )
    contest = contestant.contest
    criterion_averages, vote_count, avg_score = _contestant_avg_and_count(
        db, contestant_id
    )

    # Collect all ratings grouped by voter (include banned voters so admin
    # can see the full picture, but flag them in the email display if needed).
    all_ratings = (
        db.query(Rating)
        .options(joinedload(Rating.voter))
        .filter(Rating.contestant_id == contestant_id)
        .all()
    )

    voter_map: dict[int, dict] = {}
    for r in all_ratings:
        if r.voter_id not in voter_map:
            voter_map[r.voter_id] = {
                "voter_id": r.voter_id,
                "voter_email": r.voter.email,
                "voter_display_name": r.voter.display_name,
                "scores": {},
            }
        voter_map[r.voter_id]["scores"][r.criterion] = r.score

    voters = []
    for v in voter_map.values():
        scores = v["scores"]
        avg = round(sum(scores.values()) / len(scores), 2) if scores else None
        voters.append(
            AdminVoterEntry(
                voter_id=v["voter_id"],
                voter_email=v["voter_email"],
                voter_display_name=v["voter_display_name"],
                scores=scores,
                avg=avg,
            )
        )
    # Sort by avg score descending so highest raters appear first
    voters.sort(key=lambda v: v.avg or 0, reverse=True)

    return AdminContestantDetail(
        id=contestant.id,
        user_id=contestant.user_id,
        contest_id=contest.id,
        contest_title=contest.title,
        contest_join_code=contest.join_code,
        name=contestant.name,
        gender_category=contestant.gender_category,
        photo_url=contestant.photo_url,
        age=contestant.age,
        country=contestant.country,
        hobbies=contestant.hobbies,
        fav_things=contestant.fav_things,
        relationship_status=contestant.relationship_status,
        status=contestant.status,
        is_demo=contestant.is_demo,
        criterion_averages=criterion_averages,
        vote_count=vote_count,
        avg_score=avg_score,
        voters=voters,
    )


@router.get("/payment-reviews", response_model=list[PaymentReviewItem])
def list_payment_reviews(
    status_filter: str | None = Query(None, alias="status"),
    country_filter: str | None = Query(None, alias="country"),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> list[PaymentReviewItem]:
    """List manual payment submissions for admin review with optional status and country filtering."""
    subs = (
        db.query(Subscription)
        .options(joinedload(Subscription.user), joinedload(Subscription.reviewer))
        .order_by(Subscription.id.desc())
        .all()
    )
    eps = (
        db.query(EntryPayment)
        .options(joinedload(EntryPayment.user), joinedload(EntryPayment.reviewer))
        .order_by(EntryPayment.id.desc())
        .all()
    )

    # Collect all approved hashes across database
    approved_sub_hashes = {
        s.receipt_hash for s in subs if s.status == SubscriptionStatus.paid and s.receipt_hash
    }
    approved_ep_hashes = {
        e.receipt_hash for e in eps if e.status == EntryPaymentStatus.paid and e.receipt_hash
    }
    all_approved_hashes = approved_sub_hashes | approved_ep_hashes

    items: list[PaymentReviewItem] = []

    for s in subs:
        if s.method != PaymentMethod.manual and s.status != SubscriptionStatus.awaiting_review:
            continue
        is_dup = bool(s.receipt_hash and s.receipt_hash in all_approved_hashes and s.status != SubscriptionStatus.paid)
        user_name = s.user.display_name if s.user else "Unknown"
        user_email = s.user.email if s.user else "Unknown"
        user_country = (s.user.country if s.user and s.user.country else None) or ("ET" if s.currency == "ETB" else "MY")
        reviewer_email = s.reviewer.email if s.reviewer else None

        items.append(
            PaymentReviewItem(
                id=s.id,
                type="subscription",
                user_id=s.user_id,
                user_name=user_name,
                user_email=user_email,
                user_country=user_country,
                provider_ref=s.provider_ref,
                amount=s.amount,
                currency=s.currency,
                method=s.method.value if isinstance(s.method, PaymentMethod) else str(s.method),
                receipt_url=s.receipt_url,
                receipt_hash=s.receipt_hash,
                receipt_input_type=s.receipt_input_type,
                verify_provider_key=s.verify_provider_key,
                verify_source=s.verify_source,
                verify_reference=s.verify_reference,
                verify_amount=s.verify_amount,
                verify_currency=s.verify_currency,
                verify_payer_name=s.verify_payer_name,
                verify_status=s.verify_status,
                verify_raw_response=s.verify_raw_response,
                is_duplicate_hash=is_dup,
                status=s.status.value if hasattr(s.status, "value") else str(s.status),
                review_note=s.review_note,
                created_at=s.created_at,
                reviewed_at=s.reviewed_at,
                reviewed_by_email=reviewer_email,
            )
        )

    for e in eps:
        if e.method != PaymentMethod.manual and e.status != EntryPaymentStatus.awaiting_review:
            continue
        is_dup = bool(e.receipt_hash and e.receipt_hash in all_approved_hashes and e.status != EntryPaymentStatus.paid)
        user_name = e.user.display_name if e.user else "Unknown"
        user_email = e.user.email if e.user else "Unknown"
        user_country = (e.user.country if e.user and e.user.country else None) or "MY"
        reviewer_email = e.reviewer.email if e.reviewer else None

        items.append(
            PaymentReviewItem(
                id=e.id,
                type="entry_fee",
                user_id=e.user_id,
                user_name=user_name,
                user_email=user_email,
                user_country=user_country,
                provider_ref=e.provider_ref,
                amount=e.amount_cents,
                currency="MYR",
                method=e.method.value if isinstance(e.method, PaymentMethod) else str(e.method),
                receipt_url=e.receipt_url,
                receipt_hash=e.receipt_hash,
                receipt_input_type=e.receipt_input_type,
                verify_provider_key=e.verify_provider_key,
                verify_source=e.verify_source,
                verify_reference=e.verify_reference,
                verify_amount=e.verify_amount,
                verify_currency=e.verify_currency,
                verify_payer_name=e.verify_payer_name,
                verify_status=e.verify_status,
                verify_raw_response=e.verify_raw_response,
                is_duplicate_hash=is_dup,
                status=e.status.value if hasattr(e.status, "value") else str(e.status),
                review_note=e.review_note,
                created_at=e.created_at,
                reviewed_at=e.reviewed_at,
                reviewed_by_email=reviewer_email,
            )
        )

    items.sort(key=lambda x: x.created_at, reverse=True)

    if status_filter and status_filter != "all":
        items = [i for i in items if i.status == status_filter]

    if country_filter and country_filter != "all":
        items = [i for i in items if i.user_country and i.user_country.upper() == country_filter.upper()]

    return items



@router.post("/payment-reviews/{type}/{payment_id}/retry", status_code=status.HTTP_200_OK)
def retry_payment_verification(
    type: str,
    payment_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict:
    """Re-trigger v.odit.et receipt verification for a failed/error manual payment row."""
    from app.services.payment_service import verify_manual_payment

    if type == "subscription":
        sub = db.get(Subscription, payment_id)
        if sub is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subscription not found")
        verify_manual_payment(
            db,
            sub,
            expected_cents=sub.amount,
            currency=sub.currency,
            country=sub.user.country if sub.user else None,
            input_type=sub.receipt_input_type or "url",
            url_or_ref=sub.receipt_url_submitted or sub.receipt_url,
        )
        return {"status": sub.verify_status or "retried", "id": payment_id}
    elif type == "entry_fee":
        ep = db.get(EntryPayment, payment_id)
        if ep is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entry payment not found")
        verify_manual_payment(
            db,
            ep,
            expected_cents=ep.amount_cents,
            currency="ETB",
            country=ep.user.country if ep.user else None,
            input_type=ep.receipt_input_type or "url",
            url_or_ref=ep.receipt_url_submitted or ep.receipt_url,
        )
        return {"status": ep.verify_status or "retried", "id": payment_id}
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid payment type")


@router.post("/payment-reviews/{type}/{payment_id}/approve", status_code=status.HTTP_200_OK)
def approve_payment_review(
    type: str,
    payment_id: int,
    payload: PaymentApproveRequest | None = None,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict:
    """Approve a pending manual payment submission, with optional specified amount received."""
    if type == "subscription":
        sub = db.get(Subscription, payment_id)
        if sub is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subscription not found")
        if sub.status == SubscriptionStatus.paid:
            return {"status": "already_activated", "id": payment_id}
        if payload and payload.amount_received is not None:
            sub.amount = payload.amount_received
        activate_subscription(db, sub)
        sub.reviewed_by = admin.id
        sub.reviewed_at = utcnow()
        audit(
            db,
            admin,
            "payment.approve",
            "subscription",
            sub.id,
            {"provider_ref": sub.provider_ref, "amount": sub.amount},
        )
        db.commit()
        return {"status": "approved", "id": payment_id, "amount": sub.amount}
    elif type == "entry_fee":
        ep = db.get(EntryPayment, payment_id)
        if ep is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entry payment not found")
        if ep.status == EntryPaymentStatus.paid:
            return {"status": "already_activated", "id": payment_id}
        if payload and payload.amount_received is not None:
            ep.amount_cents = payload.amount_received
        activate_entry_payment(db, ep)
        ep.reviewed_by = admin.id
        ep.reviewed_at = utcnow()
        audit(
            db,
            admin,
            "payment.approve",
            "entry_payment",
            ep.id,
            {"provider_ref": ep.provider_ref, "amount_cents": ep.amount_cents},
        )
        db.commit()
        return {"status": "approved", "id": payment_id, "amount": ep.amount_cents}
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid payment type")


@router.post("/payment-reviews/{type}/{payment_id}/reject", status_code=status.HTTP_200_OK)
def reject_payment_review(
    type: str,
    payment_id: int,
    payload: PaymentRejectRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict:
    """Reject a pending manual payment submission with a fixed reason dropdown."""
    reason_code = payload.reason or "other"
    note_extra = payload.review_note.strip() if payload.review_note else ""
    if reason_code == "other" and not note_extra:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Review note is required when reason is 'other'")

    if reason_code == "other":
        full_note = note_extra
    else:
        full_note = f"{reason_code}" + (f": {note_extra}" if note_extra else "")



    if type == "subscription":
        sub = db.get(Subscription, payment_id)
        if sub is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subscription not found")
        sub.status = SubscriptionStatus.rejected
        sub.reviewed_by = admin.id
        sub.reviewed_at = utcnow()
        sub.review_note = full_note
        audit(db, admin, "payment.reject", "subscription", sub.id, {"provider_ref": sub.provider_ref, "note": full_note})
        db.commit()
        return {"status": "rejected", "id": payment_id}
    elif type == "entry_fee":
        ep = db.get(EntryPayment, payment_id)
        if ep is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entry payment not found")
        ep.status = EntryPaymentStatus.rejected
        ep.reviewed_by = admin.id
        ep.reviewed_at = utcnow()
        ep.review_note = full_note
        audit(db, admin, "payment.reject", "entry_payment", ep.id, {"provider_ref": ep.provider_ref, "note": full_note})
        db.commit()
        return {"status": "rejected", "id": payment_id}
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid payment type")



def convert_to_myr_cents(amount_cents: int, currency: str) -> int:
    curr = (currency or "MYR").upper()
    if curr == "ETB":
        return int(round(amount_cents * 0.0351))
    elif curr == "USD":
        return int(round(amount_cents * 4.40))
    return amount_cents


@router.get("/income", response_model=AdminIncomeResponse)
def get_admin_income_dashboard(
    country_filter: str | None = Query(None, alias="country"),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> AdminIncomeResponse:
    """Return total income summary and ledger of all paid subscriptions and contest entry fees with country breakdown & currency conversion."""
    subs = (
        db.query(Subscription)
        .options(joinedload(Subscription.user), joinedload(Subscription.reviewer))
        .filter(Subscription.status == SubscriptionStatus.paid)
        .all()
    )
    eps = (
        db.query(EntryPayment)
        .options(joinedload(EntryPayment.user), joinedload(EntryPayment.reviewer))
        .filter(EntryPayment.status == EntryPaymentStatus.paid)
        .all()
    )

    items: list[IncomeItem] = []
    sub_cents = 0
    entry_cents = 0
    manual_cents = 0
    online_cents = 0

    country_map: dict[str, dict[str, Any]] = {}

    for s in subs:
        amt = s.amount
        m_str = s.method.value if isinstance(s.method, PaymentMethod) else str(s.method)
        dt = s.reviewed_at or s.created_at
        user_name = s.user.display_name if s.user else "Unknown"
        user_email = s.user.email if s.user else "Unknown"
        user_country = (s.user.country if s.user and s.user.country else None) or ("ET" if s.currency == "ETB" else "MY")
        reviewer_email = s.reviewer.email if s.reviewer else None

        conv_myr = convert_to_myr_cents(amt, s.currency)
        conv_myr_fmt = f"RM {conv_myr / 100:.2f}"

        item = IncomeItem(
            id=s.id,
            type="subscription",
            user_id=s.user_id,
            user_name=user_name,
            user_email=user_email,
            user_country=user_country,
            provider_ref=s.provider_ref,
            amount_cents=amt,
            currency=s.currency,
            converted_myr_cents=conv_myr,
            converted_myr_formatted=conv_myr_fmt,
            method=m_str,
            payment_status=s.status.value if hasattr(s.status, "value") else str(s.status),
            received_at=dt,
            approved_by_email=reviewer_email,
        )

        c_key = user_country.upper()
        if c_key not in country_map:
            country_map[c_key] = {"currency": s.currency, "amount_cents": 0, "converted_myr_cents": 0}
        country_map[c_key]["amount_cents"] += amt
        country_map[c_key]["converted_myr_cents"] += conv_myr

        if country_filter and country_filter != "all" and user_country.upper() != country_filter.upper():
            continue

        sub_cents += amt
        if m_str == "manual":
            manual_cents += amt
        else:
            online_cents += amt
        items.append(item)

    for e in eps:
        amt = e.amount_cents
        m_str = e.method.value if isinstance(e.method, PaymentMethod) else str(e.method)
        dt = e.reviewed_at or e.created_at
        user_name = e.user.display_name if e.user else "Unknown"
        user_email = e.user.email if e.user else "Unknown"
        user_country = (e.user.country if e.user and e.user.country else None) or "MY"
        reviewer_email = e.reviewer.email if e.reviewer else None

        currency = "ETB" if user_country == "ET" else "MYR"
        conv_myr = convert_to_myr_cents(amt, currency)
        conv_myr_fmt = f"RM {conv_myr / 100:.2f}"

        item = IncomeItem(
            id=e.id,
            type="entry_fee",
            user_id=e.user_id,
            user_name=user_name,
            user_email=user_email,
            user_country=user_country,
            provider_ref=e.provider_ref,
            amount_cents=amt,
            currency=currency,
            converted_myr_cents=conv_myr,
            converted_myr_formatted=conv_myr_fmt,
            method=m_str,
            payment_status=e.status.value if hasattr(e.status, "value") else str(e.status),
            received_at=dt,
            approved_by_email=reviewer_email,
        )

        c_key = user_country.upper()
        if c_key not in country_map:
            country_map[c_key] = {"currency": currency, "amount_cents": 0, "converted_myr_cents": 0}
        country_map[c_key]["amount_cents"] += amt
        country_map[c_key]["converted_myr_cents"] += conv_myr

        if country_filter and country_filter != "all" and user_country.upper() != country_filter.upper():
            continue

        entry_cents += amt
        if m_str == "manual":
            manual_cents += amt
        else:
            online_cents += amt
        items.append(item)

    items.sort(key=lambda x: x.received_at, reverse=True)
    total_cents = sub_cents + entry_cents

    income_by_country: list[CountryIncomeBreakdown] = []
    total_converted_myr_cents = 0

    for c_code, data in country_map.items():
        curr = data["currency"]
        amt_cnt = data["amount_cents"]
        conv_cnt = data["converted_myr_cents"]
        if not country_filter or country_filter == "all" or c_code == country_filter.upper():
            total_converted_myr_cents += conv_cnt

        if curr == "ETB":
            amt_fmt = f"{amt_cnt / 100:.2f} ETB"
        elif curr == "USD":
            amt_fmt = f"${amt_cnt / 100:.2f}"
        else:
            amt_fmt = f"RM {amt_cnt / 100:.2f}"

        income_by_country.append(
            CountryIncomeBreakdown(
                country_code=c_code,
                currency=curr,
                amount_cents=amt_cnt,
                amount_formatted=amt_fmt,
                converted_myr_cents=conv_cnt,
                converted_myr_formatted=f"RM {conv_cnt / 100:.2f}",
            )
        )

    total_converted_usd_cents = int(round(total_converted_myr_cents / 4.40))

    summary = IncomeSummary(
        total_income_cents=total_cents,
        subscriptions_income_cents=sub_cents,
        entries_income_cents=entry_cents,
        manual_income_cents=manual_cents,
        online_income_cents=online_cents,
        income_by_country=income_by_country,
        converted_total_myr_cents=total_converted_myr_cents,
        converted_total_myr_formatted=f"RM {total_converted_myr_cents / 100:.2f}",
        converted_total_usd_cents=total_converted_usd_cents,
        converted_total_usd_formatted=f"${total_converted_usd_cents / 100:.2f}",
    )

    return AdminIncomeResponse(summary=summary, items=items)


# --- Partner Inquiries & Introductions Admin Endpoints ---

def _format_partner_introduction(intro: PartnerIntroduction) -> PartnerIntroductionRead:
    res = PartnerIntroductionRead.model_validate(intro)
    if intro.contestant:
        res.contestant_name = intro.contestant.name
        res.contestant_photo_url = intro.contestant.photo_url
        if intro.contestant.contest:
            res.contest_title = intro.contestant.contest.title
    if intro.inquiry:
        res.company_name = intro.inquiry.company_name
        res.contact_name = intro.inquiry.contact_name
        res.contact_email = intro.inquiry.email
        res.contact_phone = intro.inquiry.phone
        res.inquiry_type = intro.inquiry.inquiry_type.value
        res.inquiry_message = intro.inquiry.message
        res.inquiry_interested_in = intro.inquiry.interested_in
    return res


@router.get("/partner-inquiries", response_model=list[PartnerInquiryRead])
def list_partner_inquiries(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> list[PartnerInquiryRead]:
    inquiries = (
        db.query(PartnerInquiry)
        .options(
            joinedload(PartnerInquiry.introductions)
            .joinedload(PartnerIntroduction.contestant)
            .joinedload(Contestant.contest)
        )
        .order_by(PartnerInquiry.id.desc())
        .all()
    )

    results: list[PartnerInquiryRead] = []
    for inquiry in inquiries:
        read = PartnerInquiryRead.model_validate(inquiry)
        read.introductions = [_format_partner_introduction(intro) for intro in inquiry.introductions]
        results.append(read)
    return results


@router.patch("/partner-inquiries/{inquiry_id}/status", response_model=PartnerInquiryRead)
def update_partner_inquiry_status(
    inquiry_id: int,
    payload: PartnerInquiryStatusUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> PartnerInquiryRead:
    inquiry = db.get(PartnerInquiry, inquiry_id)
    if inquiry is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Partner inquiry not found"
        )

    old_status = inquiry.status.value
    inquiry.status = payload.status
    audit(
        db,
        admin,
        "partner_inquiry.update_status",
        "partner_inquiry",
        inquiry.id,
        {"old_status": old_status, "new_status": payload.status.value},
    )
    db.commit()
    db.refresh(inquiry)

    read = PartnerInquiryRead.model_validate(inquiry)
    read.introductions = [_format_partner_introduction(intro) for intro in inquiry.introductions]
    return read


@router.get("/opted-in-contestants", response_model=list[OptedInContestantItem])
def list_opted_in_contestants(
    q: str | None = Query(None),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> list[OptedInContestantItem]:
    query = (
        db.query(Contestant)
        .options(joinedload(Contestant.contest))
        .filter(
            Contestant.open_to_opportunities == True,
            Contestant.status == ContestantStatus.active,
        )
    )

    if q and q.strip():
        term = f"%{q.strip().lower()}%"
        query = query.filter(
            or_(
                func.lower(Contestant.name).like(term),
                func.lower(Contestant.country).like(term),
            )
        )

    contestants = query.order_by(Contestant.id.desc()).all()
    results: list[OptedInContestantItem] = []
    for c in contestants:
        results.append(
            OptedInContestantItem(
                id=c.id,
                name=c.name,
                photo_url=c.photo_url,
                gender_category=c.gender_category,
                country=c.country,
                contest_id=c.contest_id,
                contest_title=c.contest.title if c.contest else "Contest",
                open_to_opportunities=c.open_to_opportunities,
            )
        )
    return results


@router.post(
    "/partner-inquiries/{inquiry_id}/propose-introduction",
    response_model=PartnerIntroductionRead,
    status_code=status.HTTP_201_CREATED,
)
def propose_partner_introduction(
    inquiry_id: int,
    payload: ProposeIntroductionCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> PartnerIntroductionRead:
    inquiry = db.get(PartnerInquiry, inquiry_id)
    if inquiry is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Partner inquiry not found"
        )

    contestant = db.get(Contestant, payload.contestant_id)
    if contestant is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Contestant not found"
        )

    # CRITICAL SPEC REQUIREMENT: Non-opted-in contestants CANNOT be proposed (403 Forbidden)
    if not contestant.open_to_opportunities:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Contestant has not opted in to opportunities",
        )

    from datetime import timedelta
    intro = PartnerIntroduction(
        inquiry_id=inquiry.id,
        contestant_id=contestant.id,
        admin_id=admin.id,
        status=IntroductionStatus.pending_consent,
        admin_note=payload.admin_note.strip() if payload.admin_note else None,
        deadline_at=utcnow() + timedelta(days=14),
    )
    db.add(intro)
    if inquiry.status == InquiryStatus.new:
        inquiry.status = InquiryStatus.reviewing

    db.flush()

    audit(
        db,
        admin,
        "partner_introduction.propose",
        "partner_introduction",
        intro.id,
        {
            "inquiry_id": inquiry.id,
            "company_name": inquiry.company_name,
            "contestant_id": contestant.id,
            "contestant_name": contestant.name,
        },
    )

    # Send email notification to contestant's user if present
    if contestant.user and contestant.user.email:
        send_email(
            db=db,
            to=contestant.user.email,
            template_key="partner_introduction",
            context={
                "company_name": inquiry.company_name,
                "inquiry_type": inquiry.inquiry_type.value,
            },
            user_id=contestant.user_id,
            is_transactional_required=True,
        )


    db.commit()
    db.refresh(intro)

    return _format_partner_introduction(intro)


@router.post(
    "/partner-introductions/{intro_id}/mark-shared",
    response_model=PartnerIntroductionRead,
)
def mark_partner_introduction_shared(
    intro_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> PartnerIntroductionRead:
    intro = (
        db.query(PartnerIntroduction)
        .options(
            joinedload(PartnerIntroduction.contestant),
            joinedload(PartnerIntroduction.inquiry),
        )
        .filter(PartnerIntroduction.id == intro_id)
        .first()
    )
    if intro is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Partner introduction not found"
        )

    if intro.status != IntroductionStatus.accepted:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Introduction must be accepted by contestant before sharing contact info",
        )

    intro.contact_info_shared = True
    intro.shared_at = utcnow()

    if intro.inquiry and intro.inquiry.status != InquiryStatus.closed:
        intro.inquiry.status = InquiryStatus.matched

    audit(
        db,
        admin,
        "partner_introduction.mark_shared",
        "partner_introduction",
        intro.id,
        {
            "inquiry_id": intro.inquiry_id,
            "contestant_id": intro.contestant_id,
            "shared_at": intro.shared_at.isoformat() if intro.shared_at else None,
        },
    )

    db.commit()
    db.refresh(intro)

    return _format_partner_introduction(intro)





