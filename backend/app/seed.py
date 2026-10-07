"""Seed the 4 request categories and their subcategories.

Usage: python -m app.seed
"""
from sqlalchemy.orm import Session

from app.database import SessionLocal, create_tables
from app.models.category import TicketCategory, TicketSubcategory

SEED = {
    "Service Request": [
        "New user",
        "Password reset",
        "Software install",
        "Email setup",
        "Access request",
        "License assignment",
        "App/System creation",
    ],
    "Incident": [
        "Hardware failure",
        "App error",
        "Printer issue",
        "Internet problem",
        "System outage",
    ],
    "Maintenance": [
        "Preventive maintenance",
        "System update",
        "Hardware upgrade",
        "Equipment replacement",
    ],
    "HR-Initiated": ["Employee onboarding", "Offboarding", "Department transfer"],
}


def seed_categories(db: Session) -> None:
    """Idempotent: skips categories that already exist."""
    for order, (cat_name, subs) in enumerate(SEED.items(), start=1):
        cat = db.query(TicketCategory).filter_by(name=cat_name).first()
        if cat is None:
            cat = TicketCategory(name=cat_name, order=order)
            db.add(cat)
            db.flush()
        existing = {s.name for s in cat.subcategories}
        for i, sub in enumerate(subs, start=1):
            if sub not in existing:
                db.add(TicketSubcategory(category_id=cat.id, name=sub, order=i))
    db.commit()


if __name__ == "__main__":
    create_tables()
    with SessionLocal() as session:
        seed_categories(session)
    print("Seeded categories")
