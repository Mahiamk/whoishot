from datetime import timedelta
from fastapi.testclient import TestClient

from app.db import SessionLocal
from app.models import (
    Contest,
    Contestant,
    ContestStatus,
    EntryPayment,
    EntryPaymentStatus,
    Payout,
    PayoutRowStatus,
    PayoutStatus,
    utcnow,
)
from app.contest_expiry import compute_contest_payouts, check_contest_expiry

API = "/api/v1"


def test_split_math_exact_to_cent_with_rounding_remainder_to_platform(client: TestClient, auth, contest):
    h_creator = auth(client, "creator@t.dev")
    c = contest(client, h_creator, entry_fee_cents=1003, liability_accepted=True)
    contest_id = c["id"]

    db = SessionLocal()
    try:
        # Create 5 paid entry payments with total pool = 5 * 1003 = 5015 cents
        # 1st (35%): 5015 * 35 // 100 = 1755 cents
        # 2nd (25%): 5015 * 25 // 100 = 1253 cents
        # 3rd (20%): 5015 * 20 // 100 = 1003 cents
        # platform (20% + remainder): 5015 - (1755 + 1253 + 1003) = 1004 cents
        # Total sum = 1755 + 1253 + 1003 + 1004 = 5015 cents!
        for i in range(5):
            ep = EntryPayment(
                user_id=1,
                contest_id=contest_id,
                amount_cents=1003,
                provider="mock",
                provider_ref=f"ref-split-{i}",
                status=EntryPaymentStatus.paid,
            )
            db.add(ep)
        
        # Create 3 active contestants
        for i in range(3):
            ct = Contestant(
                user_id=None,
                contest_id=contest_id,
                name=f"Contestant {i+1}",
                gender_category="F",
            )
            db.add(ct)
        db.commit()

        contest_obj = db.get(Contest, contest_id)
        compute_contest_payouts(db, contest_obj)
        db.commit()

        payouts = db.query(Payout).filter(Payout.contest_id == contest_id).all()
        by_rank = {p.rank: p.amount_cents for p in payouts}

        assert by_rank["1"] == 1755
        assert by_rank["2"] == 1253
        assert by_rank["3"] == 1003
        assert by_rank["platform"] == 1004
        assert sum(by_rank.values()) == 5015
        assert contest_obj.payout_status == PayoutStatus.pending
    finally:
        db.close()


def test_low_entrant_contest_triggers_refund_not_payout(client: TestClient, auth, contest):
    h_creator = auth(client, "creator2@t.dev")
    c = contest(client, h_creator, entry_fee_cents=1000, liability_accepted=True)
    contest_id = c["id"]

    db = SessionLocal()
    try:
        # Create 3 paid entry payments (< MIN_PAID_ENTRANTS = 5)
        for i in range(3):
            ep = EntryPayment(
                user_id=i + 1,
                contest_id=contest_id,
                amount_cents=1000,
                provider="mock",
                provider_ref=f"ref-low-{i}",
                status=EntryPaymentStatus.paid,
            )
            db.add(ep)
        db.commit()

        contest_obj = db.get(Contest, contest_id)
        compute_contest_payouts(db, contest_obj)
        db.commit()

        # Should NOT have any payouts
        payouts_count = db.query(Payout).filter(Payout.contest_id == contest_id).count()
        assert payouts_count == 0

        # All 3 entry payments should flip to refund_pending
        entries = db.query(EntryPayment).filter(EntryPayment.contest_id == contest_id).all()
        assert len(entries) == 3
        for ep in entries:
            assert ep.status == EntryPaymentStatus.refund_pending

        assert contest_obj.payout_status == PayoutStatus.disputed
    finally:
        db.close()


def test_self_delete_before_end_triggers_refund(client: TestClient, auth, contest, join):
    h_creator = auth(client, "creator3@t.dev")
    c = contest(client, h_creator, entry_fee_cents=500, liability_accepted=True)

    h_user = auth(client, "entrant@t.dev")

    # 1. Checkout entry fee
    r_check = client.post(
        f"{API}/entries/checkout",
        json={"contest_id": c["id"], "payment_handle": "@entrant_tng", "provider": "mock"},
        headers=h_user,
    )
    assert r_check.status_code == 201
    ref = r_check.json()["session_id"]

    # 2. Trigger webhook -> paid
    r_web = client.post(f"{API}/webhooks/mock", json={"provider_ref": ref})
    assert r_web.status_code == 200

    # 3. Join contest
    r_join = client.post(
        f"{API}/contests/{c['join_code']}/contestants",
        json={"name": "Entrant User", "gender_category": "F", "password": "letmein"},
        headers=h_user,
    )
    assert r_join.status_code == 201
    ct_id = r_join.json()["id"]

    # 4. Self-delete profile before contest ends
    r_del = client.delete(f"{API}/contestants/{ct_id}", headers=h_user)
    assert r_del.status_code == 204

    # 5. Verify EntryPayment status is refund_pending
    db = SessionLocal()
    try:
        ep = db.query(EntryPayment).filter(EntryPayment.provider_ref == ref).first()
        assert ep is not None
        assert ep.status == EntryPaymentStatus.refund_pending
    finally:
        db.close()
