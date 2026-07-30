"""Seed the dev database: 1 contest, 8 contestants (4F/4M), 5 voters, ~200
ratings, plus 4 demo profiles (2F/2M) for the public showcase.

Run from backend/:  .venv/bin/python scripts/seed.py
After seeding, run backfill_blurred_thumbs.py to generate blurred showcase
thumbnails for the real contestants' photos.
"""

import random
import sys
from datetime import timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from passlib.context import CryptContext

from app.constants import CRITERIA, SEED_DEFAULT_CRITERIA
from app.db import SessionLocal
from app.models import Contest, ContestCriterion, Contestant, Gender, Rating, SocialLink, User, utcnow

JOIN_CODE = "SUNWAY-CS24"
PASSWORD = "password123"

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


CONTESTANTS = [
    # (name, gender, age, country, hobbies, fav_things, relationship_status, socials)
    ("Aisha Rahman", Gender.F, 21, "Malaysia",
     "badminton, baking sourdough", "matcha lattes, K-dramas", "single",
     [("instagram", "aisha.bakes"), ("tiktok", "aisharhmn")]),
    ("Mei Lin Chong", Gender.F, 22, "Malaysia",
     "photography, hiking", "film cameras, night markets", "in a relationship",
     [("instagram", "meilin.shoots")]),
    ("Priya Nair", Gender.F, 20, "India",
     "bharatanatyam, debate club", "filter coffee, thriller novels", None,
     [("instagram", "priya.n"), ("x", "priyanair_")]),
    ("Sofia Petrova", Gender.F, 23, "Bulgaria",
     "volleyball, oil painting", "sunsets, banitsa", "single",
     [("instagram", "sofpetrova")]),
    ("Daniel Tan", Gender.M, 22, "Singapore",
     "futsal, mechanical keyboards", "kopi peng, indie games", "single",
     [("instagram", "dan.tan"), ("twitch", "dantanplays")]),
    ("Arjun Mehta", Gender.M, 21, "India",
     "cricket, chess", "street food, lo-fi playlists", None,
     [("instagram", "arjunmehta21")]),
    ("Wei Jian Lim", Gender.M, 23, "Malaysia",
     "gym, cafe hopping", "protein shakes, sneakers", "it's complicated",
     [("instagram", "weijianlim"), ("tiktok", "wjlim")]),
    ("Tomasz Kowalski", Gender.M, 24, "Poland",
     "bouldering, home barista", "pierogi, synthwave", "single",
     [("instagram", "tomkowalski")]),
]

VOTERS = [
    ("Nurul Izzah", Gender.F),
    ("Chen Xiu Ying", Gender.F),
    ("Rahul Sharma", Gender.M),
    ("Jake Morrison", Gender.M),
    ("Fatimah Zahra", Gender.F),
]

# Fixed, deterministic — always visible on the landing showcase regardless
# of votes. Belong to no real user (user_id=None, is_demo=True).
DEMO_CONTESTANTS = [
    ("Elena Rodriguez", Gender.F, "https://i.pravatar.cc/300?img=47"),
    ("Priya Sharma", Gender.F, "https://i.pravatar.cc/300?img=48"),
    ("Jaden Lee", Gender.M, "https://i.pravatar.cc/300?img=50"),
    ("Marcus Webb", Gender.M, "https://i.pravatar.cc/300?img=51"),
]


def main() -> None:
    db = SessionLocal()
    try:
        if db.query(Contest).filter_by(join_code=JOIN_CODE).first():
            print(f"Contest {JOIN_CODE} already seeded — nothing to do.")
            return

        password_hash = pwd_context.hash(PASSWORD)

        creator = User(
            email="creator@example.com",
            password_hash=password_hash,
            display_name="Contest Admin",
            gender=Gender.M,
        )
        db.add(creator)
        db.flush()

        contest = Contest(
            join_code=JOIN_CODE,
            title="Sunway CS Batch '24",
            description="Rate your batchmates on vibes, talent and everything in between.",
            creator_id=creator.id,
            is_active=True,
            is_showcase_public=True,
            ends_at=utcnow() + timedelta(days=30),
        )
        db.add(contest)
        db.flush()

        criteria_objs: list[ContestCriterion] = []
        for item in SEED_DEFAULT_CRITERIA:
            crit = ContestCriterion(
                contest_id=contest.id,
                key=item["key"],
                label=item["label"],
                emoji=item["emoji"],
                sort_order=item["sort_order"],
            )
            db.add(crit)
            criteria_objs.append(crit)
        db.flush()

        contestants: list[Contestant] = []
        for i, (name, gender, age, country, hobbies, favs, rel, socials) in enumerate(
            CONTESTANTS
        ):
            user = User(
                email=f"contestant{i + 1}@example.com",
                password_hash=password_hash,
                display_name=name,
                gender=gender,
            )
            db.add(user)
            db.flush()
            contestant = Contestant(
                user_id=user.id,
                contest_id=contest.id,
                name=name,
                gender_category=gender,
                photo_url=f"https://i.pravatar.cc/300?img={i + 10}",
                age=age,
                country=country,
                hobbies=hobbies,
                fav_things=favs,
                relationship_status=rel,
            )
            db.add(contestant)
            db.flush()
            for platform, handle in socials:
                db.add(
                    SocialLink(
                        contestant_id=contestant.id, platform=platform, handle=handle
                    )
                )
            contestants.append(contestant)

        for name, gender, photo_url in DEMO_CONTESTANTS:
            db.add(
                Contestant(
                    user_id=None,
                    contest_id=contest.id,
                    name=name,
                    gender_category=gender,
                    photo_url=photo_url,
                    is_demo=True,
                )
            )

        voters: list[User] = []
        for i, (name, gender) in enumerate(VOTERS):
            voter = User(
                email=f"voter{i + 1}@example.com",
                password_hash=password_hash,
                display_name=name,
                gender=gender,
            )
            db.add(voter)
            voters.append(voter)
        db.flush()

        # ~200 ratings out of the 400 possible (voter, contestant, criterion) combos
        combos = [
            (v.id, c.id, crit.id)
            for v in voters
            for c in contestants
            for crit in criteria_objs
        ]
        for voter_id, contestant_id, criterion_id in random.sample(combos, 200):
            db.add(
                Rating(
                    voter_id=voter_id,
                    contestant_id=contestant_id,
                    criterion_id=criterion_id,
                    score=random.randint(1, 10),
                )
            )


        db.commit()
        print(
            f"Seeded contest {JOIN_CODE}: {len(contestants)} contestants, "
            f"{len(DEMO_CONTESTANTS)} demo profiles, {len(voters)} voters, "
            f"200 ratings. All accounts use password '{PASSWORD}'.\n"
            "Run backfill_blurred_thumbs.py to generate showcase thumbnails."
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
