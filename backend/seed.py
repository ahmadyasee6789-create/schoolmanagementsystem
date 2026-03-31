from app.db.session import SessionLocal
from sqlalchemy.orm import Session
from app.models.users import User
from app.utils.hash import hash_password
def seed():
    db:Session=SessionLocal()
    existing=db.query(User).filter(
        User.email=="Schoolify@gmail.com"
    ).first()
    if not existing:
        admin=User(
            full_name="Ahmad",
            email="Schoolify@gmail.com",
            hashed_password=hash_password("dwrrg48cb9w"),
            is_superadmin=True
        )
        db.add(admin)
        db.commit()
        print("super admin created")
    else:
        print("super admin already exists")
    db.close()
if __name__ == "__main__":
    seed()
