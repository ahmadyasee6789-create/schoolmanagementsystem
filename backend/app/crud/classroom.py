from sqlalchemy.orm import Session
from app.models.classroom import Classroom
from app.models.classroom import Grade

DEFAULT_GRADES = [
    "Play Group",
    "Nursery",
    "Prep",
    "Grade 1",
    "Grade 2",
    "Grade 3",
    "Grade 4",
    "Grade 5",
    "Grade 6",
    "Grade 7",
    "Grade 8",
    "Grade 9",
    "Grade 10",
    "Grade 11",
    "Grade 12",
]

DEFAULT_SECTIONS = ["A"]  # can add B, C later


def seed_grades(db: Session, org_id: int):

    exists = db.query(Grade).filter(
        Grade.organization_id == org_id
    ).first()

    if exists:
        return

    for order, name in enumerate(DEFAULT_GRADES, start=1):
        db.add(
            Grade(
                name=name,
                organization_id=org_id,
                display_order=order
            )
        )

    db.commit()