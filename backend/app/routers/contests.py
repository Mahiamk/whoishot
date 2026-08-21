import re
import secrets
import string
import time
from datetime import timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.audit import audit
from app.constants import CRITERIA, SEED_DEFAULT_CRITERIA
from app.contest_expiry import check_contest_expiry
from app.db import get_db
from app.deps import get_current_user
from app.models import (
    Contest,
    ContestCriterion,
    Contestant,
    ContestantStatus,
    ContestStatus,
    EntryPayment,
    EntryPaymentStatus,
    Gender,
    Rating,
    User,
    UserRole,
    as_aware,
    utcnow,
)
from app.routers.media import blurred_thumb_url
from app.security import hash_password
from app.schemas import (
    ContestCreate,
    ContestCriterionCreate,
    ContestCriterionRead,
    ContestRead,
    ContestWithCounts,
    ExtendRequest,
    LeaderboardEntry,
    LeaderboardOther,
    LeaderboardRead,
    MyRank,
    PopularContestItem,
    ShowcaseEntry,
    ShowcaseRead,
)

router = APIRouter(prefix="/contests", tags=["contests"])

MIN_VOTES_TO_APPEAR = 3
SHOWCASE_TOP_N = 4
PODIUM_SIZE = 3
LEADERBOARD_CACHE_TTL = 60.0

# (contest_id, gender) -> (monotonic timestamp, per-contestant stats)
_leaderboard_cache: dict[tuple[int, str], tuple[float, list[dict[str, Any]]]] = {}


ALL_GENDERS_KEY = "ALL"


def slugify_key(text: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "_", text.strip()).strip("_").lower()
    return s if s else "criterion"


def _bracket_stats(
    db: Session, contest_id: int, gender: Gender | None
) -> list[dict[str, Any]]:
    """Per-contestant stats for one bracket, computed with a single SQL query
    and cached in-process for LEADERBOARD_CACHE_TTL seconds. gender=None
    computes the combined "General" ranking across both brackets."""
    key = (contest_id, gender.value if gender else ALL_GENDERS_KEY)
    cached = _leaderboard_cache.get(key)
    now = time.monotonic()
    if cached and now - cached[0] < LEADERBOARD_CACHE_TTL:
        return cached[1]

    per_criterion = (
        db.query(
            Rating.contestant_id.label("cid"),
            ContestCriterion.key.label("criterion"),
            func.avg(Rating.score).label("crit_avg"),
        )
        .join(ContestCriterion, Rating.criterion_id == ContestCriterion.id)
        .join(User, Rating.voter_id == User.id)
        .filter(User.is_banned == False)  # noqa: E712
        .group_by(Rating.contestant_id, ContestCriterion.key)
        .subquery()
    )

    voter_counts = (
        db.query(
            Rating.contestant_id.label("cid"),
            func.count(func.distinct(Rating.voter_id)).label("voters"),
        )
        .join(User, Rating.voter_id == User.id)
        .filter(User.is_banned == False)  # noqa: E712
        .group_by(Rating.contestant_id)
        .subquery()
    )
    query = (
        db.query(
            Contestant.id,
            Contestant.name,
            Contestant.photo_url,
            Contestant.user_id,
            per_criterion.c.criterion,
            per_criterion.c.crit_avg,
            voter_counts.c.voters,
        )
        .join(User, Contestant.user_id == User.id)
        .outerjoin(per_criterion, per_criterion.c.cid == Contestant.id)
        .outerjoin(voter_counts, voter_counts.c.cid == Contestant.id)
        .filter(
            Contestant.contest_id == contest_id,
            Contestant.status == ContestantStatus.active,
            User.is_banned == False,  # noqa: E712
        )
    )
    if gender is not None:
        query = query.filter(Contestant.gender_category == gender)
    rows = query.all()

    by_id: dict[int, dict[str, Any]] = {}
    for cid, name, photo_url, user_id, criterion, crit_avg, voters in rows:
        entry = by_id.setdefault(
            cid,
            {
                "contestant_id": cid,
                "name": name,
                "photo_url": photo_url,
                "user_id": user_id,
                "vote_count": voters or 0,
                "criterion_averages": {},
            },
        )
        if criterion is not None:
            entry["criterion_averages"][criterion] = round(float(crit_avg), 2)

    stats = list(by_id.values())
    _leaderboard_cache[key] = (now, stats)
    return stats


def invalidate_leaderboard_cache(contest_id: int) -> None:
    for gender in Gender:
        _leaderboard_cache.pop((contest_id, gender.value), None)
    _leaderboard_cache.pop((contest_id, ALL_GENDERS_KEY), None)


def overall_score(entry: dict[str, Any]) -> float | None:
    averages: dict[str, float] = entry["criterion_averages"]
    return round(sum(averages.values()) / len(averages), 2) if averages else None


def rank_in_bracket(
    db: Session, contest_id: int, gender: Gender, contestant_id: int
) -> tuple[int | None, float | None, dict[str, float], int]:
    """Same overall ranking as the leaderboard, resolved for one contestant.
    Returns (rank, avg_score, criterion_averages, vote_count)."""
    stats = _bracket_stats(db, contest_id, gender)
    mine = next((e for e in stats if e["contestant_id"] == contestant_id), None)
    if mine is None:
        return None, None, {}, 0

    ranked = sorted(
        (
            (entry, score)
            for entry in stats
            if entry["vote_count"] >= MIN_VOTES_TO_APPEAR
            and (score := overall_score(entry)) is not None
        ),
        key=lambda pair: pair[1],
        reverse=True,
    )
    for i, (entry, score) in enumerate(ranked):
        if entry["contestant_id"] == contestant_id:
            return i + 1, score, mine["criterion_averages"], mine["vote_count"]
    return None, None, mine["criterion_averages"], mine["vote_count"]


def generate_join_code(db: Session, title: str) -> str:
    base = re.sub(r"[^A-Za-z0-9]+", "-", title).strip("-").upper()[:20].strip("-")
    if not base:
        base = "CONTEST"
    code = base
    while db.query(Contest).filter(Contest.join_code == code).first():
        suffix = "".join(
            secrets.choice(string.ascii_uppercase + string.digits) for _ in range(4)
        )
        code = f"{base}-{suffix}"
    return code


def get_contest_or_404(db: Session, join_code: str) -> Contest:
    contest = db.query(Contest).filter(Contest.join_code == join_code).first()
    if contest is None and join_code.isdigit():
        contest = db.query(Contest).filter(Contest.id == int(join_code)).first()
    if contest is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Contest not found"
        )
    return check_contest_expiry(db, contest)


def contestant_averages(db: Session, contest_id: int) -> dict[int, float]:
    """Average of per-criterion means for each active contestant with
    at least MIN_VOTES_TO_APPEAR distinct voters. Ratings cast by banned
    users are kept in the DB but excluded here."""
    per_criterion = (
        db.query(
            Rating.contestant_id,
            func.avg(Rating.score).label("crit_avg"),
        )
        .join(Contestant, Rating.contestant_id == Contestant.id)
        .join(User, Rating.voter_id == User.id)
        .filter(
            Contestant.contest_id == contest_id,
            Contestant.status == ContestantStatus.active,
            User.is_banned == False,  # noqa: E712
        )
        .group_by(Rating.contestant_id, Rating.criterion_id)
        .all()
    )
    voter_counts = dict(
        db.query(
            Rating.contestant_id,
            func.count(func.distinct(Rating.voter_id)),
        )
        .join(Contestant, Rating.contestant_id == Contestant.id)
        .join(User, Rating.voter_id == User.id)
        .filter(
            Contestant.contest_id == contest_id,
            User.is_banned == False,  # noqa: E712
        )
        .group_by(Rating.contestant_id)
        .all()
    )

    crit_avgs: dict[int, list[float]] = {}
    for contestant_id, crit_avg in per_criterion:
        crit_avgs.setdefault(contestant_id, []).append(float(crit_avg))

    return {
        cid: round(sum(avgs) / len(avgs), 2)
        for cid, avgs in crit_avgs.items()
        if voter_counts.get(cid, 0) >= MIN_VOTES_TO_APPEAR
    }


def compute_prize_pool_cents(db: Session, contest_id: int) -> int:
    return (
        db.query(func.sum(EntryPayment.amount_cents))
        .filter(
            EntryPayment.contest_id == contest_id,
            EntryPayment.status == EntryPaymentStatus.paid,
        )
        .scalar()
        or 0
    )


@router.post("", response_model=ContestRead, status_code=status.HTTP_201_CREATED)
def create_contest(
    payload: ContestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ContestRead:
    if payload.ends_at is not None:
        ends_at = as_aware(payload.ends_at)
    else:
        ends_at = utcnow() + timedelta(days=payload.duration_days)

    contest = Contest(
        join_code=generate_join_code(db, payload.title),
        title=payload.title,
        description=payload.description,
        creator_id=current_user.id,
        is_active=True,
        is_showcase_public=payload.is_showcase_public,
        allowed_email_domain=payload.allowed_email_domain,
        join_password_hash=hash_password(payload.join_password),
        ends_at=ends_at,
        status=ContestStatus.active,
        entry_fee_cents=payload.entry_fee_cents,
    )
    db.add(contest)
    db.flush()

    if payload.criteria:
        seen_keys: set[str] = set()
        for idx, item in enumerate(payload.criteria):
            key = item.key or slugify_key(item.label)
            base_key = key
            counter = 1
            while key in seen_keys:
                key = f"{base_key}_{counter}"
                counter += 1
            seen_keys.add(key)
            db.add(
                ContestCriterion(
                    contest_id=contest.id,
                    key=key,
                    label=item.label.strip(),
                    emoji=item.emoji.strip() if item.emoji else None,
                    sort_order=item.sort_order if item.sort_order is not None else idx,
                )
            )
    else:
        for item in SEED_DEFAULT_CRITERIA:
            db.add(
                ContestCriterion(
                    contest_id=contest.id,
                    key=item["key"],
                    label=item["label"],
                    emoji=item["emoji"],
                    sort_order=item["sort_order"],
                )
            )

    db.commit()
    contest = db.query(Contest).filter(Contest.id == contest.id).first()
    contest_dict = ContestRead.model_validate(contest).model_dump()
    contest_dict["prize_pool_cents"] = 0
    return ContestRead(**contest_dict)


@router.patch("/{id_or_code}/criteria", response_model=list[ContestCriterionRead])
def update_contest_criteria(
    id_or_code: str,
    payload: list[ContestCriterionCreate],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ContestCriterionRead]:
    if id_or_code.isdigit():
        contest = db.get(Contest, int(id_or_code))
    else:
        contest = db.query(Contest).filter(Contest.join_code == id_or_code).first()

    if contest is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Contest not found"
        )

    if contest.creator_id != current_user.id and current_user.role != UserRole.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Only the contest creator can edit criteria"
        )

    # Locking rule: once a contest has at least one rating submitted, criteria are frozen.
    has_ratings = (
        db.query(Rating.id)
        .join(Contestant, Rating.contestant_id == Contestant.id)
        .filter(Contestant.contest_id == contest.id)
        .first()
        is not None
    )
    if has_ratings:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Criteria are locked once voting starts",
        )

    if not (3 <= len(payload) <= 15):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Contest criteria count must be between 3 and 15",
        )

    for item in payload:
        if len(item.label.strip()) == 0 or len(item.label) > 30:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Criteria label must be between 1 and 30 characters",
            )

    db.query(ContestCriterion).filter(ContestCriterion.contest_id == contest.id).delete(synchronize_session=False)

    seen_keys: set[str] = set()
    new_criteria: list[ContestCriterion] = []
    for idx, item in enumerate(payload):
        key = item.key or slugify_key(item.label)
        base_key = key
        counter = 1
        while key in seen_keys:
            key = f"{base_key}_{counter}"
            counter += 1
        seen_keys.add(key)

        crit = ContestCriterion(
            contest_id=contest.id,
            key=key,
            label=item.label.strip(),
            emoji=item.emoji.strip() if item.emoji else None,
            sort_order=item.sort_order if item.sort_order is not None else idx,
        )
        new_criteria.append(crit)
        db.add(crit)

    db.commit()
    invalidate_leaderboard_cache(contest.id)
    return new_criteria


@router.patch("/{id_or_code}/pause", response_model=ContestWithCounts)
def toggle_pause_contest(
    id_or_code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ContestWithCounts:
    contest = get_contest_or_404(db, id_or_code)
    if contest.creator_id != current_user.id and current_user.role != UserRole.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the contest creator can pause or resume this contest",
        )
    if contest.is_deleted:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot pause a deleted contest",
        )
    contest.is_paused = not contest.is_paused
    db.commit()
    db.refresh(contest)
    return get_contest(contest.join_code, db, current_user)


@router.patch("/{id_or_code}/hide", response_model=ContestWithCounts)
def toggle_hide_contest(
    id_or_code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ContestWithCounts:
    contest = get_contest_or_404(db, id_or_code)
    if contest.creator_id != current_user.id and current_user.role != UserRole.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the contest creator can hide or unhide this contest",
        )
    contest.is_hidden = not contest.is_hidden
    db.commit()
    db.refresh(contest)
    return get_contest(contest.join_code, db, current_user)


@router.delete("/{id_or_code}")
def delete_contest(
    id_or_code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    contest = get_contest_or_404(db, id_or_code)
    if contest.creator_id != current_user.id and current_user.role != UserRole.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the contest creator can delete this contest",
        )
    contest.is_deleted = True
    contest.deleted_at = utcnow()
    contest.is_active = False
    db.commit()
    return {"ok": True, "message": "Contest deleted and preserved in history"}


@router.post("/{id_or_code}/restore", response_model=ContestWithCounts)
def restore_contest(
    id_or_code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ContestWithCounts:
    contest = get_contest_or_404(db, id_or_code)
    if contest.creator_id != current_user.id and current_user.role != UserRole.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the contest creator can restore this contest",
        )
    contest.is_deleted = False
    contest.deleted_at = None
    contest.is_active = (as_aware(contest.ends_at) > utcnow())
    db.commit()
    db.refresh(contest)
    return get_contest(contest.join_code, db, current_user)


# NOTE: must be registered before GET /{join_code}, or "popular" would be
# captured as a join code.
@router.get("/popular", response_model=list[PopularContestItem])
def popular_contests(db: Session = Depends(get_db)) -> list[PopularContestItem]:
    """Unauthenticated: the most active public contests, for the landing
    page. Only is_showcase_public contests appear, and only aggregate
    numbers are exposed (no contestant data)."""
    candidates = (
        db.query(Contest)
        .filter(
            Contest.is_showcase_public == True,  # noqa: E712
            Contest.status == ContestStatus.active,
            Contest.is_deleted == False,  # noqa: E712
            Contest.is_hidden == False,  # noqa: E712
        )
        .all()
    )
    # Check-on-read expiry, same as every other contest read path.
    active = [
        c
        for c in candidates
        if check_contest_expiry(db, c).status == ContestStatus.active
    ]
    if not active:
        return []
    ids = [c.id for c in active]

    gender_rows = (
        db.query(
            Contestant.contest_id,
            Contestant.gender_category,
            func.count(Contestant.id),
        )
        .join(User, Contestant.user_id == User.id)
        .filter(
            Contestant.contest_id.in_(ids),
            Contestant.status == ContestantStatus.active,
            User.is_banned == False,  # noqa: E712
        )
        .group_by(Contestant.contest_id, Contestant.gender_category)
        .all()
    )
    gender_counts: dict[int, dict[Gender, int]] = {}
    for contest_id, gender, n in gender_rows:
        gender_counts.setdefault(contest_id, {})[gender] = n

    rating_rows = (
        db.query(Contestant.contest_id, func.count(Rating.id))
        .join(Rating, Rating.contestant_id == Contestant.id)
        .join(User, Rating.voter_id == User.id)
        .filter(
            Contestant.contest_id.in_(ids),
            User.is_banned == False,  # noqa: E712
        )
        .group_by(Contestant.contest_id)
        .all()
    )
    rating_counts = dict(rating_rows)

    items = []
    for contest in active:
        by_gender = gender_counts.get(contest.id, {})
        female = by_gender.get(Gender.F, 0)
        male = by_gender.get(Gender.M, 0)
        items.append(
            PopularContestItem(
                join_code=contest.join_code,
                title=contest.title,
                description=contest.description,
                contestant_count=female + male,
                female_count=female,
                male_count=male,
                rating_count=rating_counts.get(contest.id, 0),
                allowed_email_domain=contest.allowed_email_domain,
                ends_at=contest.ends_at,
                status=contest.status,
            )
        )
    # Popularity = rating activity, then roster size, then recency.
    items.sort(
        key=lambda i: (i.rating_count, i.contestant_count, i.join_code),
        reverse=True,
    )
    return items[:6]


@router.get("/{join_code}", response_model=ContestWithCounts)
def get_contest(
    join_code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ContestWithCounts:
    contest = get_contest_or_404(db, join_code)

    gender_counts = dict(
        db.query(Contestant.gender_category, func.count(Contestant.id))
        .join(User, Contestant.user_id == User.id)
        .filter(
            Contestant.contest_id == contest.id,
            Contestant.status == ContestantStatus.active,
            User.is_banned == False,  # noqa: E712
        )
        .group_by(Contestant.gender_category)
        .all()
    )
    female_count = gender_counts.get(Gender.F, 0)
    male_count = gender_counts.get(Gender.M, 0)
    rating_count = (
        db.query(func.count(Rating.id))
        .join(Contestant, Rating.contestant_id == Contestant.id)
        .join(User, Rating.voter_id == User.id)
        .filter(
            Contestant.contest_id == contest.id,
            User.is_banned == False,  # noqa: E712
        )
        .scalar()
    )

    contest_dict = ContestRead.model_validate(contest).model_dump()
    contest_dict["prize_pool_cents"] = compute_prize_pool_cents(db, contest.id)

    return ContestWithCounts(
        **contest_dict,
        contestant_count=female_count + male_count,
        female_count=female_count,
        male_count=male_count,
        rating_count=rating_count or 0,
    )


@router.get("/{join_code}/leaderboard", response_model=LeaderboardRead)
def get_leaderboard(
    join_code: str,
    gender: Gender | None = None,
    criterion: str = "overall",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> LeaderboardRead:
    contest = get_contest_or_404(db, join_code)
    valid_keys = [c.key for c in contest.criteria]
    if criterion != "overall" and criterion not in valid_keys:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="criterion must be 'overall' or one of the contest criteria",
        )
    stats = _bracket_stats(db, contest.id, gender)

    def score_of(entry: dict) -> float | None:
        averages: dict[str, float] = entry["criterion_averages"]
        if not averages:
            return None
        if criterion == "overall":
            return round(sum(averages.values()) / len(averages), 2)
        return averages.get(criterion)

    ranked = sorted(
        (
            (entry, score)
            for entry in stats
            if entry["vote_count"] >= MIN_VOTES_TO_APPEAR
            and (score := score_of(entry)) is not None
        ),
        key=lambda pair: pair[1],
        reverse=True,
    )

    podium = [
        LeaderboardEntry(
            contestant_id=entry["contestant_id"],
            name=entry["name"],
            photo_url=entry["photo_url"],
            rank=i + 1,
            avg_score=score,
            criterion_averages=entry["criterion_averages"],
        )
        for i, (entry, score) in enumerate(ranked[:PODIUM_SIZE])
    ]
    podium_ids = {e.contestant_id for e in podium}

    # Ranks below the podium stay private: everyone else gets an
    # alphabetical list with no scores.
    others = sorted(
        (
            LeaderboardOther(
                contestant_id=entry["contestant_id"],
                name=entry["name"],
                photo_url=entry["photo_url"],
            )
            for entry in stats
            if entry["contestant_id"] not in podium_ids
        ),
        key=lambda o: o.name.lower(),
    )

    me: MyRank | None = None
    for i, (entry, score) in enumerate(ranked):
        if entry["user_id"] == current_user.id:
            me = MyRank(
                contestant_id=entry["contestant_id"],
                rank=i + 1,
                avg_score=score,
                vote_count=entry["vote_count"],
            )
            break
    if me is None:
        mine = next((e for e in stats if e["user_id"] == current_user.id), None)
        if mine is not None:
            me = MyRank(
                contestant_id=mine["contestant_id"],
                rank=None,
                avg_score=None,
                vote_count=mine["vote_count"],
            )

    return LeaderboardRead(
        join_code=contest.join_code,
        gender=gender,
        criterion=criterion,
        ends_at=contest.ends_at,
        status=contest.status,
        is_paused=contest.is_paused,
        is_deleted=contest.is_deleted,
        podium=podium,
        others=others,
        me=me,
    )


@router.get("/{join_code}/showcase", response_model=ShowcaseRead)
def get_showcase(
    join_code: str, request: Request, db: Session = Depends(get_db)
) -> ShowcaseRead:
    """Unauthenticated preview. Demo profiles (seeded, no real user) show in
    full and always appear. Real contestants NEVER expose name, real photo,
    or socials here — only a pre-generated blurred thumbnail, bracket, and
    score, for the same top-N ranked as the leaderboard."""
    contest = get_contest_or_404(db, join_code)
    if not contest.is_showcase_public:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This contest's showcase is not public",
        )

    by_gender: dict[str, list[ShowcaseEntry]] = {"F": [], "M": []}

    demo_contestants = (
        db.query(Contestant)
        .filter(
            Contestant.contest_id == contest.id,
            Contestant.is_demo == True,  # noqa: E712
            Contestant.status == ContestantStatus.active,
        )
        .all()
    )
    for contestant in demo_contestants:
        by_gender[contestant.gender_category.value].append(
            ShowcaseEntry(
                is_demo=True,
                gender_category=contestant.gender_category,
                name=contestant.name,
                photo_url=contestant.photo_url,
                score=5.0,
            )
        )

    ratings_count = (
        db.query(func.count(Rating.id))
        .join(Contestant, Rating.contestant_id == Contestant.id)
        .filter(Contestant.contest_id == contest.id)
        .scalar()
    )
    if ratings_count and ratings_count > 0:
        for g in (Gender.F, Gender.M):
            ranked = rank_contestants(db, contest.id, g, "overall")
            for c_dict, score in ranked[:4]:
                contestant_id = c_dict["contestant_id"]
                thumb = blurred_thumb_url(request, contestant_id)
                by_gender[g.value].append(
                    ShowcaseEntry(
                        is_demo=False,
                        gender_category=g,
                        blurred_thumb_url=thumb,
                        score=score,
                    )
                )

    # Same counting rules as the authenticated contest detail: active,
    # non-banned, real contestants only (the User join excludes demo rows,
    # whose user_id is NULL).
    gender_counts = dict(
        db.query(Contestant.gender_category, func.count(Contestant.id))
        .join(User, Contestant.user_id == User.id)
        .filter(
            Contestant.contest_id == contest.id,
            Contestant.status == ContestantStatus.active,
            User.is_banned == False,  # noqa: E712
        )
        .group_by(Contestant.gender_category)
        .all()
    )
    female_count = gender_counts.get(Gender.F, 0)
    male_count = gender_counts.get(Gender.M, 0)

    return ShowcaseRead(
        join_code=contest.join_code,
        title=contest.title,
        description=contest.description,
        contestant_count=female_count + male_count,
        female_count=female_count,
        male_count=male_count,
        allowed_email_domain=contest.allowed_email_domain,
        ends_at=contest.ends_at,
        status=contest.status,
        is_paused=contest.is_paused,
        is_deleted=contest.is_deleted,
        is_hidden=contest.is_hidden,
        F=by_gender["F"],
        M=by_gender["M"],
    )


@router.post("/{contest_id}/extend", response_model=ContestRead)
def extend_contest(
    contest_id: int,
    payload: ExtendRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Contest:
    contest = db.get(Contest, contest_id)
    if contest is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Contest not found"
        )
    if contest.creator_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the contest creator can extend it",
        )
    contest = check_contest_expiry(db, contest)
    if contest.status == ContestStatus.ended:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This contest has already ended",
        )
    if contest.extended_at is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This contest has already been extended once",
        )

    new_ends_at = as_aware(contest.ends_at) + timedelta(days=payload.additional_days)
    contest.ends_at = new_ends_at
    contest.extended_at = utcnow()
    audit(
        db,
        current_user,
        "contest.extend",
        "contest",
        contest.id,
        {"additional_days": payload.additional_days, "new_ends_at": new_ends_at.isoformat()},
    )
    db.commit()
    db.refresh(contest)
    return contest
