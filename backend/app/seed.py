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

T = "text"
LONG = "textarea"
DATE = "date"
NUM = "number"


def _f(name, label, type_=T, options=None):
    field = {"name": name, "label": label, "type": type_}
    if options:
        field["options"] = options
    return field


EXTRA_FIELDS = {
    "Service Request": [
        _f("affected_user", "Affected user / system"),
        _f("department", "Department"),
        _f("start_date", "Start date (new accounts)", DATE),
        _f("software_name", "Software / app name"),
        _f("justification", "Business justification", LONG),
    ],
    "Incident": [
        _f("affected_system", "Affected system / app"),
        _f("error_message", "Error code / message"),
        _f("users_impacted", "Number of users impacted", NUM),
        _f("severity", "Severity", "select", ["critical", "high", "medium", "low"]),
        _f("department", "Department"),
    ],
    "Maintenance": [
        _f("equipment_name", "System / equipment name"),
        _f("scheduled_date", "Scheduled date", DATE),
        _f("estimated_downtime", "Estimated downtime"),
        _f("affected_departments", "Affected departments"),
        _f("maintenance_window", "Maintenance window preference"),
    ],
    "HR-Initiated": [
        _f("employee_name", "Employee name"),
        _f("effective_date", "Start / end date", DATE),
        _f("department", "Department (current / new)"),
        _f("equipment_needed", "Equipment needed (laptop, phone, keys...)", LONG),
        _f("manager_name", "Manager name"),
        _f("role", "Role"),
    ],
}


def seed_categories(db: Session) -> None:
    """Idempotent: skips categories that already exist."""
    for order, (cat_name, subs) in enumerate(SEED.items(), start=1):
        cat = db.query(TicketCategory).filter_by(name=cat_name).first()
        if cat is None:
            cat = TicketCategory(name=cat_name, order=order)
            db.add(cat)
            db.flush()
        existing = {s.name: s for s in cat.subcategories}
        for i, sub in enumerate(subs, start=1):
            if sub not in existing:
                db.add(
                    TicketSubcategory(
                        category_id=cat.id,
                        name=sub,
                        order=i,
                        extra_fields_template={"fields": EXTRA_FIELDS[cat_name]},
                    )
                )
            elif not existing[sub].extra_fields_template:
                existing[sub].extra_fields_template = {"fields": EXTRA_FIELDS[cat_name]}
    db.commit()


if __name__ == "__main__":
    create_tables()
    with SessionLocal() as session:
        seed_categories(session)
    print("Seeded categories")
