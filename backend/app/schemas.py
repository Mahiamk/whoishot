from datetime import datetime, timedelta, timezone
from typing import Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    RootModel,
    field_validator,
    model_validator,
)

import enum
from enum import Enum


from app.constants import CRITERIA
from app.models import (
    ContestantStatus,
    ContestStatus,
    DomainKind,
    EntryPaymentStatus,
    Gender,
    InfoRequestStatus,
    InquiryStatus,
    InquiryType,
    IntroductionStatus,
    PayoutRowStatus,
    PayoutStatus,
    ReportStatus,
    ReportType,
    SubscriptionStatus,
    UserRole,
    utcnow,
)

CONTEST_DURATIONS = {3, 7, 14, 30}
MIN_CONTEST_DAYS = 1
MAX_CONTEST_DAYS = 90
MAX_EXTEND_DAYS = 30


# --- users ---

class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    display_name: str = Field(min_length=1, max_length=100)
    gender: Gender


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    display_name: str
    gender: Gender
    role: UserRole
    is_banned: bool
    is_verified: bool
    email_opt_out: bool = False
    created_at: datetime
    country: str | None = None
    detected_country: str | None = None


class UserUpdate(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=100)
    gender: Gender | None = None
    country: str | None = Field(default=None, max_length=50)
    email_opt_out: bool | None = None



class PaymentProviderStatusItem(BaseModel):
    name: str
    provider_id: str
    currency: str
    is_configured: bool
    is_mock: bool
    details: str


class PasswordChange(BaseModel):
    old_password: str
    new_password: str = Field(min_length=8)


# --- auth ---

class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class VerifyEmailRequest(BaseModel):
    token: str


class ResendVerificationRequest(BaseModel):
    email: EmailStr


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class GoogleLoginRequest(BaseModel):
    # The ID-token credential minted by Google Identity Services.
    credential: str
    # Required only the first time (account creation) — Google doesn't
    # provide a bracket, so the user picks one before the account exists.
    gender: Gender | None = None


class GoogleLoginResponse(BaseModel):
    # needs_gender=True means the credential verified fine but no account
    # exists yet — the client should ask for a bracket and retry.
    access_token: str | None = None
    token_type: str = "bearer"
    needs_gender: bool = False


# --- contests ---

class ContestCriterionCreate(BaseModel):
    label: str = Field(min_length=1, max_length=30)
    emoji: str | None = Field(default=None, max_length=20)
    key: str | None = Field(default=None, max_length=50)
    sort_order: int | None = None


class ContestCriterionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    contest_id: int
    key: str
    label: str
    emoji: str | None = None
    sort_order: int


class ContestCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = None
    is_showcase_public: bool = False
    allowed_email_domain: str = Field(min_length=3, max_length=255)
    join_password: str = Field(min_length=4, max_length=100)
    duration_days: int | None = None
    ends_at: datetime | None = None
    # Monetization: contest entry fee
    entry_fee_cents: int = Field(default=0, ge=0)
    liability_accepted: bool = False
    criteria: list[ContestCriterionCreate] | None = None

    @field_validator("allowed_email_domain")
    @classmethod
    def normalize_domain(cls, v: str) -> str:
        domain = v.strip().lower().lstrip("@")
        if "." not in domain or " " in domain:
            raise ValueError(
                "Enter a valid email domain, e.g. student.sunway.edu.my"
            )
        return domain

    @model_validator(mode="after")
    def check_duration_and_monetization(self) -> "ContestCreate":
        if self.duration_days is None and self.ends_at is None:
            raise ValueError("Provide either duration_days or ends_at")
        if self.duration_days is not None and self.ends_at is not None:
            raise ValueError("Provide only one of duration_days or ends_at")
        if self.duration_days is not None and self.duration_days not in CONTEST_DURATIONS:
            raise ValueError(
                f"duration_days must be one of {sorted(CONTEST_DURATIONS)}"
            )
        if self.ends_at is not None:
            ends_at = self.ends_at
            if ends_at.tzinfo is None:
                ends_at = ends_at.replace(tzinfo=timezone.utc)
            now = utcnow()
            if not (
                now + timedelta(days=MIN_CONTEST_DAYS)
                <= ends_at
                <= now + timedelta(days=MAX_CONTEST_DAYS)
            ):
                raise ValueError(
                    f"Custom end date must be between {MIN_CONTEST_DAYS} and "
                    f"{MAX_CONTEST_DAYS} days from now"
                )
        if self.entry_fee_cents > 0 and not self.liability_accepted:
            raise ValueError(
                "You must accept the liability terms for paid entry contests"
            )
        if self.criteria is not None:
            if not (3 <= len(self.criteria) <= 15):
                raise ValueError("Contest criteria count must be between 3 and 15")
        return self


class ExtendRequest(BaseModel):
    additional_days: int = Field(ge=1, le=MAX_EXTEND_DAYS)


class ContestRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    join_code: str
    title: str
    description: str | None
    creator_id: int
    is_active: bool
    is_showcase_public: bool
    ends_at: datetime
    status: ContestStatus
    allowed_email_domain: str | None
    requires_password: bool
    entry_fee_cents: int = 0
    currency: str = "MYR"
    payout_status: PayoutStatus = PayoutStatus.open
    prize_pool_cents: int = 0
    criteria: list[ContestCriterionRead] = []


class ContestWithCounts(ContestRead):
    contestant_count: int
    female_count: int

    male_count: int
    rating_count: int


class PopularContestItem(BaseModel):
    # Public-safe aggregates only — same rationale as ShowcaseRead: names
    # a contest and a university, never a person.
    join_code: str
    title: str
    description: str | None
    contestant_count: int
    female_count: int
    male_count: int
    rating_count: int
    allowed_email_domain: str | None
    ends_at: datetime
    status: ContestStatus


class ShowcaseEntry(BaseModel):
    is_demo: bool
    gender_category: Gender
    # Demo profiles only — full info, they're seeded and belong to no one.
    name: str | None = None
    photo_url: str | None = None
    # Real contestants only — never their name, real photo, or socials.
    blurred_thumb_url: str | None = None
    score: float | None = None


class ShowcaseRead(BaseModel):
    join_code: str
    title: str
    # Aggregate contest details are public-safe: they reveal nothing about
    # any individual real contestant (SPEC: no names/photos/socials here).
    description: str | None
    contestant_count: int
    female_count: int
    male_count: int
    allowed_email_domain: str | None
    ends_at: datetime
    status: ContestStatus
    F: list[ShowcaseEntry]
    M: list[ShowcaseEntry]


class LeaderboardEntry(BaseModel):
    contestant_id: int
    name: str
    photo_url: str | None
    rank: int
    avg_score: float
    criterion_averages: dict[str, float]


class LeaderboardOther(BaseModel):
    contestant_id: int
    name: str
    photo_url: str | None


class MyRank(BaseModel):
    contestant_id: int
    rank: int | None
    avg_score: float | None
    vote_count: int


class LeaderboardRead(BaseModel):
    join_code: str
    gender: Gender | None  # None = "General", combined across both brackets
    criterion: str
    ends_at: datetime
    status: ContestStatus
    podium: list[LeaderboardEntry]
    others: list[LeaderboardOther]
    me: MyRank | None


# --- social links ---

class SocialLinkCreate(BaseModel):
    platform: str = Field(min_length=1, max_length=50)
    handle: str = Field(min_length=1, max_length=100)


class SocialLinkRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    contestant_id: int
    platform: str
    handle: str


# --- contestants ---

class ContestantCreate(BaseModel):
    socials: list[SocialLinkCreate] = []
    # Contest participation password; checked against the contest's hash
    # when the contest has one. Not a contestant attribute.
    password: str | None = None
    name: str = Field(min_length=1, max_length=100)
    gender_category: Gender
    photo_url: str | None = None
    age: int | None = Field(default=None, ge=16, le=120)
    country: str | None = None
    hobbies: str | None = None
    fav_things: str | None = None
    relationship_status: str | None = None
    socials_visible: bool = True
    open_to_opportunities: bool = False


class ContestantUpdate(BaseModel):
    socials: list[SocialLinkCreate] | None = None
    name: str = Field(min_length=1, max_length=100)
    gender_category: Gender
    photo_url: str | None = None
    age: int | None = Field(default=None, ge=16, le=120)
    country: str | None = None
    hobbies: str | None = None
    fav_things: str | None = None
    relationship_status: str | None = None
    socials_visible: bool = True
    open_to_opportunities: bool | None = None


class ContestantRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    contest_id: int
    name: str
    gender_category: Gender
    photo_url: str | None
    age: int | None
    country: str | None
    hobbies: str | None
    fav_things: str | None
    relationship_status: str | None
    socials_visible: bool
    open_to_opportunities: bool = False
    status: ContestantStatus


class ContestantWithScore(ContestantRead):
    avg_score: float | None = None


class ContestantProfile(ContestantRead):
    socials: list[SocialLinkRead] = []
    # True when caller has no active subscription AND it's not their own profile.
    # Frontend shows a locked/blurred state when True.
    socials_locked: bool = False
    # Count of social links (always returned regardless of lock state).
    social_link_count: int = 0
    criterion_averages: dict[str, float]
    vote_count: int
    avg_score: float | None
    my_ratings: dict[str, int]
    contest_status: ContestStatus


class MyContestantEntry(BaseModel):
    contestant_id: int
    contest_id: int
    contest_title: str
    contest_join_code: str
    contest_status: ContestStatus
    name: str
    photo_url: str | None
    gender_category: Gender
    age: int | None
    country: str | None
    hobbies: str | None
    fav_things: str | None
    relationship_status: str | None
    socials_visible: bool
    open_to_opportunities: bool = False
    status: ContestantStatus
    criterion_averages: dict[str, float]
    vote_count: int
    avg_score: float | None
    rank: int | None



# --- subscriptions ---

class CheckoutRequest(BaseModel):
    provider: str = "mock"  # 'mock' | 'tng' | 'birr' | 'curlec' | 'manual'
    method: str = "provider"  # 'provider' | 'manual'
    receipt_url: str | None = None
    receipt_hash: str | None = None
    receipt_input_type: str | None = None  # 'url' | 'image'
    receipt_url_submitted: str | None = None
    receipt_image_path: str | None = None
    note: str | None = None


class CheckoutResponse(BaseModel):
    checkout_url: str
    session_id: str   # == provider_ref for the pending Subscription row
    status: str | None = None
    review_note: str | None = None


class SubscriptionRead(BaseModel):
    id: int
    provider: str
    provider_ref: str
    amount: int
    currency: str
    status: SubscriptionStatus
    created_at: datetime


# --- entry payments & payouts ---

class EntryCheckoutRequest(BaseModel):
    contest_id: int
    payment_handle: str = Field(min_length=1, max_length=255)
    provider: str = "mock"
    method: str = "provider"
    receipt_url: str | None = None
    receipt_hash: str | None = None
    receipt_input_type: str | None = None  # 'url' | 'image'
    receipt_url_submitted: str | None = None
    receipt_image_path: str | None = None
    note: str | None = None



class EntryCheckoutResponse(BaseModel):
    checkout_url: str
    session_id: str


class EntryPaymentStatusRead(BaseModel):
    has_paid: bool
    status: EntryPaymentStatus | None = None
    provider_ref: str | None = None
    payment_handle: str | None = None


class ManualPaymentInfoRead(BaseModel):
    bank_name: str
    account_no: str
    account_name: str
    tng_number: str


class PaymentRejectReason(str, Enum):
    duplicate_receipt = "duplicate_receipt"
    amount_mismatch = "amount_mismatch"
    not_completed = "not_completed"
    unreadable_receipt = "unreadable_receipt"
    wrong_reference = "wrong_reference"
    other = "other"


class PaymentReviewItem(BaseModel):
    id: int
    type: str  # 'subscription' | 'entry_fee'
    user_id: int
    user_name: str
    user_email: str
    user_country: str | None = None
    provider_ref: str

    amount: int
    currency: str
    method: str
    receipt_url: str | None = None
    receipt_hash: str | None = None
    receipt_input_type: str | None = None
    verify_provider_key: str | None = None
    verify_source: str | None = None
    verify_reference: str | None = None
    verify_amount: int | None = None
    verify_currency: str | None = None
    verify_payer_name: str | None = None
    verify_status: str | None = None
    verify_raw_response: dict | None = None
    is_duplicate_hash: bool = False
    status: str
    review_note: str | None = None
    created_at: datetime
    reviewed_at: datetime | None = None
    reviewed_by_email: str | None = None


class PaymentRejectRequest(BaseModel):
    reason: str = Field(default="other")
    review_note: str | None = Field(default=None, max_length=1000)


class PaymentApproveRequest(BaseModel):
    amount_received: int | None = Field(default=None, ge=1)



class UserPaymentItem(BaseModel):
    id: int
    type: str  # 'subscription' | 'entry_fee'
    provider_ref: str
    amount: int
    currency: str
    status: str
    review_note: str | None = None
    receipt_url: str | None = None
    created_at: datetime
    reviewed_at: datetime | None = None


class CountryIncomeBreakdown(BaseModel):
    country_code: str
    currency: str
    amount_cents: int
    amount_formatted: str
    converted_myr_cents: int
    converted_myr_formatted: str


class IncomeSummary(BaseModel):
    total_income_cents: int
    subscriptions_income_cents: int
    entries_income_cents: int
    manual_income_cents: int
    online_income_cents: int
    income_by_country: list[CountryIncomeBreakdown] = Field(default_factory=list)
    converted_total_myr_cents: int = 0
    converted_total_myr_formatted: str = "RM 0.00"
    converted_total_usd_cents: int = 0
    converted_total_usd_formatted: str = "$0.00"


class IncomeItem(BaseModel):
    id: int
    type: str  # 'subscription' | 'entry_fee'
    user_id: int
    user_name: str
    user_email: str
    user_country: str
    provider_ref: str
    amount_cents: int
    currency: str
    converted_myr_cents: int
    converted_myr_formatted: str
    method: str
    payment_status: str
    received_at: datetime
    approved_by_email: str | None = None


class AdminIncomeResponse(BaseModel):
    summary: IncomeSummary
    items: list[IncomeItem]





class PayoutRead(BaseModel):
    id: int
    contest_id: int
    contest_title: str
    contestant_id: int | None
    contestant_name: str | None
    user_email: str | None
    payment_handle: str | None
    rank: str
    amount_cents: int
    status: PayoutRowStatus
    created_at: datetime
    sent_at: datetime | None
    provider_ref: str | None


class RefundRead(BaseModel):
    id: int
    contest_id: int
    contest_title: str
    user_email: str
    payment_handle: str | None
    amount_cents: int
    status: EntryPaymentStatus
    created_at: datetime
    provider_ref: str | None


class PayoutMarkSentRequest(BaseModel):
    provider_ref: str = Field(min_length=1, max_length=255)


class RefundMarkDoneRequest(BaseModel):
    provider_ref: str = Field(min_length=1, max_length=255)


# --- ratings ---

class RatingCreate(BaseModel):
    contestant_id: int
    criterion: str
    score: int = Field(ge=1, le=10)

    @field_validator("criterion")
    @classmethod
    def criterion_must_be_known(cls, v: str) -> str:
        if v not in CRITERIA:
            raise ValueError(f"criterion must be one of: {', '.join(CRITERIA)}")
        return v


class RatingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    voter_id: int
    contestant_id: int
    criterion: str
    score: int


class RatingsUpsert(RootModel[dict[str, int]]):
    @field_validator("root")
    @classmethod
    def validate_ratings(cls, v: dict[str, int]) -> dict[str, int]:
        if not v:
            raise ValueError("At least one rating is required")
        for criterion, score in v.items():
            if not 1 <= score <= 10:
                raise ValueError(f"Score for '{criterion}' must be between 1 and 10")
        return v



# --- registration email policy ---

class EmailCheckResponse(BaseModel):
    allowed: bool
    reason: str


class DomainRequestCreate(BaseModel):
    email: EmailStr


class DomainRequestRead(BaseModel):
    id: int
    requested_domain: str
    status: ReportStatus


class EmailDomainCreate(BaseModel):
    domain: str = Field(min_length=1, max_length=255)
    kind: DomainKind
    note: str | None = Field(default=None, max_length=500)

    @field_validator("domain")
    @classmethod
    def normalize_domain(cls, v: str) -> str:
        return v.strip().lower().lstrip("@")


class EmailDomainItem(BaseModel):
    id: int
    domain: str
    kind: DomainKind
    note: str | None
    added_by: int | None
    added_by_email: str | None
    created_at: datetime


class AdminDomainRequestItem(BaseModel):
    id: int
    requested_domain: str
    reporter_email: str | None
    reason: str
    status: ReportStatus


# --- reports ---

class ReportCreate(BaseModel):
    contestant_id: int
    reporter_email: EmailStr | None = None
    reason: str = Field(min_length=1)


class ReportSubmit(BaseModel):
    reporter_email: EmailStr | None = None
    reason: str = Field(min_length=1, max_length=2000)


# --- info requests ---

class InfoRequestCreate(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    deadline_at: datetime | None = None


class InfoRequestRespond(BaseModel):
    response: str = Field(min_length=1, max_length=2000)


class AdminInfoRequestItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    report_id: int
    target_user_id: int
    admin_id: int
    message: str
    status: InfoRequestStatus
    user_response: str | None
    deadline_at: datetime
    created_at: datetime
    responded_at: datetime | None


class MyInfoRequestItem(BaseModel):
    id: int
    message: str
    status: InfoRequestStatus
    user_response: str | None
    deadline_at: datetime
    created_at: datetime
    responded_at: datetime | None
    contest_title: str
    contest_join_code: str
    contestant_name: str


# --- admin ---

class AdminMetrics(BaseModel):
    users_total: int
    users_by_gender: dict[str, int]
    active_contests: int
    contestants_by_gender: dict[str, int]
    ratings_total: int
    open_reports: int


class AdminReportContestant(BaseModel):
    id: int
    name: str
    photo_url: str | None
    status: ContestantStatus
    contest_id: int
    user_id: int


class AdminReportItem(BaseModel):
    id: int
    reason: str
    reporter_email: str | None
    status: ReportStatus
    contestant: AdminReportContestant
    info_request: AdminInfoRequestItem | None = None


class AdminReportPage(BaseModel):
    items: list[AdminReportItem]
    total: int
    page: int
    per_page: int


class ResolveAction(str, enum.Enum):
    dismiss = "dismiss"
    hide_contestant = "hide_contestant"
    delete_photo = "delete_photo"
    remove_contestant = "remove_contestant"
    ban_user = "ban_user"


class ResolveRequest(BaseModel):
    action: ResolveAction


class AdminUserItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    display_name: str
    gender: Gender
    role: UserRole
    is_banned: bool
    created_at: datetime


class AdminUserPage(BaseModel):
    items: list[AdminUserItem]
    total: int
    page: int
    per_page: int


class AdminContestItem(ContestRead):
    contestant_count: int
    rating_count: int
    open_report_count: int


class AdminAuditLogItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    admin_id: int | None
    admin_email: str | None
    action: str
    target_type: str
    target_id: int
    detail: dict | None
    created_at: datetime


class AdminAuditLogPage(BaseModel):
    items: list[AdminAuditLogItem]
    total: int
    page: int
    per_page: int


class ReportRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    contestant_id: int
    reporter_email: str | None
    reason: str
    status: ReportStatus


# --- admin detail views ---

class AdminUserContestantEntry(BaseModel):
    """Summary of one contestant entry for a user, shown in admin user detail."""
    contestant_id: int
    contest_id: int
    contest_title: str
    contest_join_code: str
    contest_status: ContestStatus
    name: str
    photo_url: str | None
    gender_category: Gender
    status: ContestantStatus
    avg_score: float | None
    vote_count: int


class AdminUserDetail(AdminUserItem):
    """Full user detail for admins: base fields + contestant history."""
    is_verified: bool
    legacy_email: bool
    contestant_entries: list[AdminUserContestantEntry]


class AdminVoterEntry(BaseModel):
    """One voter's contribution to a contestant's ratings."""
    voter_id: int
    voter_email: str
    voter_display_name: str
    scores: dict[str, int]   # criterion -> score
    avg: float | None        # average of the scores they gave


class AdminContestantDetail(BaseModel):
    """Full contestant info + all voters, for admin drill-down."""
    id: int
    user_id: int | None
    contest_id: int
    contest_title: str
    contest_join_code: str
    name: str
    gender_category: Gender
    photo_url: str | None
    age: int | None
    country: str | None
    hobbies: str | None
    fav_things: str | None
    relationship_status: str | None
    status: ContestantStatus
    is_demo: bool
    criterion_averages: dict[str, float]
    vote_count: int
    avg_score: float | None
    voters: list[AdminVoterEntry]


# --- partner inquiries & introductions ---

class PartnerInquiryCreate(BaseModel):
    company_name: str = Field(min_length=1, max_length=200)
    contact_name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    phone: str | None = Field(default=None, max_length=50)
    inquiry_type: InquiryType
    message: str = Field(min_length=1)
    interested_in: str | None = None
    website_hp: str | None = None  # honeypot field — anti-spam


class PartnerInquiryStatusUpdate(BaseModel):
    status: InquiryStatus


class ProposeIntroductionCreate(BaseModel):
    contestant_id: int
    admin_note: str | None = None


class PartnerIntroductionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    inquiry_id: int
    contestant_id: int
    admin_id: int
    status: IntroductionStatus
    admin_note: str | None
    contact_info_shared: bool
    shared_at: datetime | None
    created_at: datetime
    responded_at: datetime | None
    deadline_at: datetime
    # Display extensions
    contestant_name: str | None = None
    contestant_photo_url: str | None = None
    contest_title: str | None = None
    company_name: str | None = None
    contact_name: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    inquiry_type: str | None = None
    inquiry_message: str | None = None
    inquiry_interested_in: str | None = None


class PartnerInquiryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_name: str
    contact_name: str
    email: str
    phone: str | None
    inquiry_type: InquiryType
    message: str
    interested_in: str | None
    status: InquiryStatus
    created_at: datetime
    introductions: list[PartnerIntroductionRead] = []


class IntroductionRespond(BaseModel):
    action: Literal["accept", "decline"]


class OptedInContestantItem(BaseModel):
    id: int
    name: str
    photo_url: str | None
    gender_category: Gender
    country: str | None
    contest_id: int
    contest_title: str
    open_to_opportunities: bool

