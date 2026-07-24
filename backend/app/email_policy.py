import json
import re
from functools import lru_cache
from pathlib import Path

from sqlalchemy.orm import Session

from app.models import DomainKind, EmailDomain

DATA_DIR = Path(__file__).parent / "data"
UNIVERSITY_DOMAINS_PATH = DATA_DIR / "university_domains.json"
DISPOSABLE_DOMAINS_PATH = DATA_DIR / "disposable_domains.txt"

# Matches the reason values documented in SPEC.md's "Registration email
# policy": university_ok | allow_listed | not_university | disposable | denied
UNIVERSITY_OK = "university_ok"
ALLOW_LISTED = "allow_listed"
NOT_UNIVERSITY = "not_university"
DISPOSABLE = "disposable"
DENIED = "denied"

_TLD_HEURISTIC_RE = re.compile(r"\.edu$|\.edu\.[a-z]{2,3}$|\.ac\.[a-z]{2,3}$")


@lru_cache
def _university_domains() -> frozenset[str]:
    """Vendored subset of the Hipo university-domains-list dataset
    (github.com/Hipo/university-domains-list), loaded once and cached."""
    universities = json.loads(UNIVERSITY_DOMAINS_PATH.read_text())
    domains: set[str] = set()
    for u in universities:
        domains.update(d.lower() for d in u.get("domains", []))
    return frozenset(domains)


@lru_cache
def _disposable_domains() -> frozenset[str]:
    """Vendored disposable-email-domains blocklist, loaded once and cached."""
    lines = DISPOSABLE_DOMAINS_PATH.read_text().splitlines()
    return frozenset(
        line.strip().lower() for line in lines if line.strip() and not line.startswith("#")
    )


def domain_of(email: str) -> str:
    return email.strip().lower().rsplit("@", 1)[-1]


def _matches(domain: str, candidates: frozenset[str]) -> bool:
    """True if domain equals a candidate, or is a subdomain of one — e.g.
    student.sunway.edu.my matches when sunway.edu.my is a candidate."""
    labels = domain.split(".")
    for i in range(len(labels)):
        if ".".join(labels[i:]) in candidates:
            return True
    return False


def _tld_heuristic(domain: str) -> bool:
    return _TLD_HEURISTIC_RE.search(domain) is not None


def check_email_domain(db: Session, email: str) -> tuple[bool, str]:
    """Returns (allowed, reason). Pure domain-based decision — never looks
    at the users table, so callers can safely expose this to unauthenticated
    clients without leaking whether an address is already registered."""
    domain = domain_of(email)

    if _matches(domain, _disposable_domains()):
        return False, DISPOSABLE

    admin_entries = db.query(EmailDomain).all()
    deny_domains = frozenset(
        e.domain.lower() for e in admin_entries if e.kind == DomainKind.deny
    )
    allow_domains = frozenset(
        e.domain.lower() for e in admin_entries if e.kind == DomainKind.allow
    )
    # Deny always wins, even if a broader allow entry also matches.
    if _matches(domain, deny_domains):
        return False, DENIED
    if _matches(domain, allow_domains):
        return True, ALLOW_LISTED

    if _matches(domain, _university_domains()):
        return True, UNIVERSITY_OK

    if _tld_heuristic(domain):
        return True, UNIVERSITY_OK

    return False, NOT_UNIVERSITY


REASON_MESSAGES = {
    NOT_UNIVERSITY: "Please use your university email (e.g. you@student.youruni.edu.my)",
    DISPOSABLE: "Disposable email addresses aren't allowed. Please use your university email.",
    DENIED: "This email domain isn't allowed. Please use your university email.",
}
