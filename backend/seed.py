import os

from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.users import User
from app.utils.hash import hash_password


def seed():
    email = os.environ.get("SUPER_ADMIN_EMAIL")
    password = os.environ.get("SUPER_ADMIN_PASSWORD")

    if not email or not password:
        raise RuntimeError(
            "SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD "
            "must be configured"
        )

    with SessionLocal() as db:
        existing = db.query(User).filter(
            User.email == email
        ).first()

        if existing:
            print("Super admin email already exists")
            return

        # Prevent creating another superadmin.
        existing_admin = db.query(User).filter(
            User.is_superadmin.is_(True)
        ).first()

        if existing_admin:
            raise RuntimeError(
                "A super admin already exists. "
                "Use the authorized account recovery process."
            )

        try:
            admin = User(
                full_name="Super Administrator",
                email=email,
                hashed_password=hash_password(password),
                is_superadmin=True,
            )

            db.add(admin)
            db.commit()

            print("Super admin created successfully")

        except Exception:
            db.rollback()
            raise


if __name__ == "__main__":
    seed()