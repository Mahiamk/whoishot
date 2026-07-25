import enum
from datetime import datetime, timedelta, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    false,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Gender(str, enum.Enum):
    F = "F"
    M = "M"


class ContestantStatus(str, enum.Enum):
    active = "active"
    reported = "reported"
    removed = "removed"


class ReportStatus(str, enum.Enum):
    open = "open"
    resolved = "resolved"


class UserRole(str, enum.Enum):
    user = "user"
    admin = "admin"


class InfoRequestStatus(str, enum.Enum):
    pending = "pending"
    responded = "responded"
    expired = "expired"
    closed = "closed"


class ContestStatus(str, enum.Enum):
    active = "active"
    ended = "ended"


class ReportType(str, enum.Enum):
    contestant = "contestant"
    domain_request = "domain_request"


class DomainKind(str, enum.Enum):
    allow = "allow"
    deny = "deny"


class PaymentMethod(str, enum.Enum):
    provider = "provider"
    manual = "manual"


class SubscriptionStatus(str, enum.Enum):
    pending = "pending"
    awaiting_review = "awaiting_review"
    paid = "paid"
    rejected = "rejected"
    failed = "failed"
    refunded = "refunded"


class PayoutStatus(str, enum.Enum):
    open = "open"
    pending = "pending"
    paid = "paid"
    disputed = "disputed"


class EntryPaymentStatus(str, enum.Enum):
    pending = "pending"
    awaiting_review = "awaiting_review"
    paid = "paid"
    rejected = "rejected"
    refund_pending = "refund_pending"
    refunded = "refunded"



class PayoutRowStatus(str, enum.Enum):
    pending = "pending"
    sent = "sent"
    failed = "failed"


class InquiryType(str, enum.Enum):
    modeling_school = "modeling_school"
    fashion_show = "fashion_show"
    stylist = "stylist"
    other = "other"


class InquiryStatus(str, enum.Enum):
    new = "new"
    reviewing = "reviewing"
    matched = "matched"
    closed = "closed"


class IntroductionStatus(str, enum.Enum):
    pending_consent = "pending_consent"
    accepted = "accepted"
    declined = "declined"
    expired = "expired"



def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def as_aware(dt: datetime) -> datetime:
    """SQLite doesn't reliably round-trip tzinfo on DateTime(timezone=True)
    columns — a value we wrote as UTC can come back naive. Treat naive as UTC."""
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


def default_deadline() -> datetime:
    return utcnow() + timedelta(days=7)


def default_contest_end() -> datetime:
    return utcnow() + timedelta(days=14)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[str] = mapped_column(String(100), nullable=False)
    gender: Mapped[Gender] = mapped_column(Enum(Gender), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole), nullable=False, default=UserRole.user, server_default="user"
    )
    is_banned: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=false()
    )
    # No verification flow exists yet (email verification is a future
    # feature) — this just backs the /me "verified" Badge honestly rather
    # than faking a status. Always False until that flow ships.
    is_verified: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=false()
    )
    # True for pre-existing accounts whose email failed the university-email
    # policy when it was introduced. Grandfathered in (kept access) rather
    # than retroactively locked out; full re-verification enforcement is a
    # future step once email verification (Step 14) ships.
    legacy_email: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=false()
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )
    # Social links subscription (monetization Step 22)
    has_socials_subscription: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=false()
    )
    subscription_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Country preference (editable by user in profile) & detected country (informational from IP)
    country: Mapped[str | None] = mapped_column(String(50), nullable=True)
    detected_country: Mapped[str | None] = mapped_column(String(50), nullable=True)
    email_opt_out: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=false()
    )

    contests_created: Mapped[list["Contest"]] = relationship(back_populates="creator")
    contestant_entries: Mapped[list["Contestant"]] = relationship(back_populates="user")
    ratings_given: Mapped[list["Rating"]] = relationship(back_populates="voter")
    subscriptions: Mapped[list["Subscription"]] = relationship(
        back_populates="user", foreign_keys="[Subscription.user_id]"
    )



class Contest(Base):
    __tablename__ = "contests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    join_code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    creator_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), nullable=False
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_showcase_public: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    ends_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=default_contest_end
    )
    status: Mapped[ContestStatus] = mapped_column(
        Enum(ContestStatus),
        nullable=False,
        default=ContestStatus.active,
        server_default="active",
    )
    # Set once the creator uses their single allowed extension; a second
    # attempt is rejected by checking this is still None.
    extended_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    reminder_24h_sent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    reminder_1h_sent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Both nullable only for contests created before participation
    # protection existed (grandfathered = unrestricted). New contests must
    # set both at creation (enforced by ContestCreate).
    allowed_email_domain: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )
    join_password_hash: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )
    # Monetization: Contest entry fee & prizes
    entry_fee_cents: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    currency: Mapped[str] = mapped_column(
        String(10), nullable=False, default="MYR", server_default="MYR"
    )
    payout_status: Mapped[PayoutStatus] = mapped_column(
        Enum(PayoutStatus),
        nullable=False,
        default=PayoutStatus.open,
        server_default="open",
    )

    creator: Mapped["User"] = relationship(back_populates="contests_created")
    contestants: Mapped[list["Contestant"]] = relationship(back_populates="contest")
    entry_payments: Mapped[list["EntryPayment"]] = relationship(back_populates="contest")
    payouts: Mapped[list["Payout"]] = relationship(back_populates="contest")

    @property
    def requires_password(self) -> bool:
        return self.join_password_hash is not None


class Contestant(Base):
    __tablename__ = "contestants"
    __table_args__ = (UniqueConstraint("user_id", "contest_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # Nullable: demo profiles (is_demo=True) belong to no real user.
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    contest_id: Mapped[int] = mapped_column(ForeignKey("contests.id"), nullable=False)
    photo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    age: Mapped[int | None] = mapped_column(Integer, nullable=True)
    country: Mapped[str | None] = mapped_column(String(100), nullable=True)
    gender_category: Mapped[Gender] = mapped_column(Enum(Gender), nullable=False)
    hobbies: Mapped[str | None] = mapped_column(Text, nullable=True)
    fav_things: Mapped[str | None] = mapped_column(Text, nullable=True)
    relationship_status: Mapped[str | None] = mapped_column(String(50), nullable=True)
    socials_visible: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    status: Mapped[ContestantStatus] = mapped_column(
        Enum(ContestantStatus), nullable=False, default=ContestantStatus.active
    )
    is_demo: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=false()
    )
    open_to_opportunities: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=false()
    )

    user: Mapped["User | None"] = relationship(back_populates="contestant_entries")
    contest: Mapped["Contest"] = relationship(back_populates="contestants")
    social_links: Mapped[list["SocialLink"]] = relationship(
        back_populates="contestant"
    )
    ratings: Mapped[list["Rating"]] = relationship(back_populates="contestant")
    reports: Mapped[list["Report"]] = relationship(back_populates="contestant")



class SocialLink(Base):
    __tablename__ = "social_links"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    contestant_id: Mapped[int] = mapped_column(
        ForeignKey("contestants.id"), nullable=False
    )
    platform: Mapped[str] = mapped_column(String(50), nullable=False)
    handle: Mapped[str] = mapped_column(String(100), nullable=False)

    contestant: Mapped["Contestant"] = relationship(back_populates="social_links")


class Rating(Base):
    __tablename__ = "ratings"
    __table_args__ = (
        UniqueConstraint("voter_id", "contestant_id", "criterion"),
        CheckConstraint("score >= 1 AND score <= 10", name="score_range"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    voter_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    contestant_id: Mapped[int] = mapped_column(
        ForeignKey("contestants.id"), nullable=False
    )
    criterion: Mapped[str] = mapped_column(String(50), nullable=False)
    score: Mapped[int] = mapped_column(Integer, nullable=False)

    voter: Mapped["User"] = relationship(back_populates="ratings_given")
    contestant: Mapped["Contestant"] = relationship(back_populates="ratings")


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # Nullable: domain_request rows (type=domain_request) report no
    # contestant — they carry a requested_domain instead.
    contestant_id: Mapped[int | None] = mapped_column(
        ForeignKey("contestants.id"), nullable=True
    )
    reporter_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[ReportStatus] = mapped_column(
        Enum(ReportStatus), nullable=False, default=ReportStatus.open
    )
    type: Mapped[ReportType] = mapped_column(
        Enum(ReportType),
        nullable=False,
        default=ReportType.contestant,
        server_default="contestant",
    )
    requested_domain: Mapped[str | None] = mapped_column(String(255), nullable=True)

    contestant: Mapped["Contestant | None"] = relationship(back_populates="reports")


class AdminAuditLog(Base):
    __tablename__ = "admin_audit_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # Nullable: system-triggered rows (e.g. contest expiry via check-on-read)
    # have no acting admin.
    admin_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id"), nullable=True
    )
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    target_type: Mapped[str] = mapped_column(String(50), nullable=False)
    target_id: Mapped[int] = mapped_column(Integer, nullable=False)
    detail: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )

    admin: Mapped["User | None"] = relationship()


class InfoRequest(Base):
    __tablename__ = "info_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    report_id: Mapped[int] = mapped_column(ForeignKey("reports.id"), nullable=False)
    target_user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), nullable=False
    )
    admin_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[InfoRequestStatus] = mapped_column(
        Enum(InfoRequestStatus),
        nullable=False,
        default=InfoRequestStatus.pending,
        server_default="pending",
    )
    user_response: Mapped[str | None] = mapped_column(Text, nullable=True)
    deadline_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=default_deadline
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )
    responded_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    report: Mapped["Report"] = relationship()
    target_user: Mapped["User"] = relationship(foreign_keys=[target_user_id])
    admin: Mapped["User"] = relationship(foreign_keys=[admin_id])


class EmailDomain(Base):
    __tablename__ = "email_domains"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    domain: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    kind: Mapped[DomainKind] = mapped_column(Enum(DomainKind), nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    added_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )

    added_by_user: Mapped["User | None"] = relationship()


class Subscription(Base):
    """Tracks a single payment session for the social-links subscription."""
    __tablename__ = "subscriptions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    # e.g. 'mock', 'tng', 'birr', 'manual'
    provider: Mapped[str] = mapped_column(String(50), nullable=False)
    # Unique reference from the payment provider (or our own UUID/reference code)
    provider_ref: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    # Amount in smallest currency unit (cents / santim)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(10), nullable=False, default="MYR")
    method: Mapped[PaymentMethod] = mapped_column(
        Enum(PaymentMethod),
        nullable=False,
        default=PaymentMethod.provider,
        server_default="provider",
    )
    receipt_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    receipt_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    receipt_input_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    receipt_url_submitted: Mapped[str | None] = mapped_column(String(500), nullable=True)
    receipt_image_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    verify_provider_key: Mapped[str | None] = mapped_column(String(50), nullable=True)
    verify_source: Mapped[str | None] = mapped_column(String(50), nullable=True)
    verify_raw_response: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    verify_reference: Mapped[str | None] = mapped_column(String(255), nullable=True)
    verify_amount: Mapped[int | None] = mapped_column(Integer, nullable=True)
    verify_currency: Mapped[str | None] = mapped_column(String(10), nullable=True)
    verify_payer_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    verify_status: Mapped[str | None] = mapped_column(String(50), nullable=True)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    voditet_request_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    reviewed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    review_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    status: Mapped[SubscriptionStatus] = mapped_column(
        Enum(SubscriptionStatus),
        nullable=False,
        default=SubscriptionStatus.pending,
        server_default="pending",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )

    user: Mapped["User"] = relationship(back_populates="subscriptions", foreign_keys=[user_id])
    reviewer: Mapped["User | None"] = relationship(foreign_keys=[reviewed_by])


class EntryPayment(Base):
    """Tracks payment of entry fee for a paid contest."""
    __tablename__ = "entries_payments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    contest_id: Mapped[int] = mapped_column(ForeignKey("contests.id"), nullable=False)
    contestant_id: Mapped[int | None] = mapped_column(ForeignKey("contestants.id"), nullable=True)
    amount_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    payment_handle: Mapped[str | None] = mapped_column(String(255), nullable=True)
    provider: Mapped[str] = mapped_column(String(50), nullable=False)
    provider_ref: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    method: Mapped[PaymentMethod] = mapped_column(
        Enum(PaymentMethod),
        nullable=False,
        default=PaymentMethod.provider,
        server_default="provider",
    )
    receipt_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    receipt_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    receipt_input_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    receipt_url_submitted: Mapped[str | None] = mapped_column(String(500), nullable=True)
    receipt_image_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    verify_provider_key: Mapped[str | None] = mapped_column(String(50), nullable=True)
    verify_source: Mapped[str | None] = mapped_column(String(50), nullable=True)
    verify_raw_response: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    verify_reference: Mapped[str | None] = mapped_column(String(255), nullable=True)
    verify_amount: Mapped[int | None] = mapped_column(Integer, nullable=True)
    verify_currency: Mapped[str | None] = mapped_column(String(10), nullable=True)
    verify_payer_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    verify_status: Mapped[str | None] = mapped_column(String(50), nullable=True)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    voditet_request_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    reviewed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    review_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    status: Mapped[EntryPaymentStatus] = mapped_column(
        Enum(EntryPaymentStatus),
        nullable=False,
        default=EntryPaymentStatus.pending,
        server_default="pending",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )

    user: Mapped["User"] = relationship(foreign_keys=[user_id])
    contest: Mapped["Contest"] = relationship(back_populates="entry_payments")
    contestant: Mapped["Contestant | None"] = relationship()
    reviewer: Mapped["User | None"] = relationship(foreign_keys=[reviewed_by])



class Payout(Base):
    """Tracks payout to winners or platform for a paid contest."""
    __tablename__ = "payouts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    contest_id: Mapped[int] = mapped_column(ForeignKey("contests.id"), nullable=False)
    contestant_id: Mapped[int | None] = mapped_column(ForeignKey("contestants.id"), nullable=True)
    rank: Mapped[str] = mapped_column(String(20), nullable=False)  # '1', '2', '3', 'platform'
    amount_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[PayoutRowStatus] = mapped_column(
        Enum(PayoutRowStatus),
        nullable=False,
        default=PayoutRowStatus.pending,
        server_default="pending",
    )
    provider_ref: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )
    sent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    contest: Mapped["Contest"] = relationship(back_populates="payouts")
    contestant: Mapped["Contestant | None"] = relationship()


class PartnerInquiry(Base):
    __tablename__ = "partner_inquiries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_name: Mapped[str] = mapped_column(String(200), nullable=False)
    contact_name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    inquiry_type: Mapped[InquiryType] = mapped_column(
        Enum(InquiryType), nullable=False, default=InquiryType.other, server_default="other"
    )
    message: Mapped[str] = mapped_column(Text, nullable=False)
    interested_in: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[InquiryStatus] = mapped_column(
        Enum(InquiryStatus),
        nullable=False,
        default=InquiryStatus.new,
        server_default="new",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )

    introductions: Mapped[list["PartnerIntroduction"]] = relationship(
        back_populates="inquiry", cascade="all, delete-orphan"
    )


class PartnerIntroduction(Base):
    __tablename__ = "partner_introductions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    inquiry_id: Mapped[int] = mapped_column(
        ForeignKey("partner_inquiries.id"), nullable=False
    )
    contestant_id: Mapped[int] = mapped_column(
        ForeignKey("contestants.id"), nullable=False
    )
    admin_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), nullable=False
    )
    status: Mapped[IntroductionStatus] = mapped_column(
        Enum(IntroductionStatus),
        nullable=False,
        default=IntroductionStatus.pending_consent,
        server_default="pending_consent",
    )
    admin_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    contact_info_shared: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=false()
    )
    shared_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )
    responded_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    deadline_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: utcnow() + timedelta(days=14),
    )

    inquiry: Mapped["PartnerInquiry"] = relationship(back_populates="introductions")
    contestant: Mapped["Contestant"] = relationship()
    admin: Mapped["User"] = relationship()


class EmailLog(Base):
    __tablename__ = "email_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    to_email: Mapped[str] = mapped_column(String(255), nullable=False)
    template_key: Mapped[str] = mapped_column(String(100), nullable=False)
    context: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    resend_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="sent")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )

    user: Mapped["User | None"] = relationship()


