# app/schemas/student.py
from datetime import date, datetime
from pydantic import BaseModel, ConfigDict, Field
from typing import Optional


# --------------------------------------------------
# BASE
# --------------------------------------------------
class StudentBase(BaseModel):
    first_name: str
    last_name: str
    
    gender: Optional[str] = None
    date_of_birth: Optional[date] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    father_name: Optional[str] = None
    father_phone: Optional[str] = None
    mother_name: Optional[str] = None
    guardian_name: Optional[str] = None
    guardian_phone: Optional[str] = None
    is_active: bool = True

    model_config = ConfigDict(from_attributes=True)


# --------------------------------------------------
# CREATE
# --------------------------------------------------
class StudentCreate(StudentBase):
    pass


# --------------------------------------------------
# UPDATE (PARTIAL)
# --------------------------------------------------
class StudentUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    # admission_no: Optional[str] = None
    gender: Optional[str] = None
    date_of_birth: Optional[date] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    father_name: Optional[str] = None
    father_phone: Optional[str] = None
    mother_name: Optional[str] = None
    guardian_name: Optional[str] = None
    guardian_phone: Optional[str] = None
    is_active: Optional[bool] = None

    model_config = ConfigDict(from_attributes=True)


# --------------------------------------------------
# CREATE WITH ENROLLMENT
# --------------------------------------------------
class StudentWithEnrollmentCreate(StudentBase):
    classroom_id: int
    session_id: int
    enrollment_date: date
    # roll_number: Optional[str] = None
    discount_percent: float = 0.0


# --------------------------------------------------
# RESPONSE WITH ENROLLMENT
# --------------------------------------------------
class StudentWithEnrollment(StudentBase):
    id: int
    organization_id: int
    admission_no: str
    enrollment_id: Optional[int]=None
    grade_name: Optional[str] = None
    section: Optional[str] = None
    roll_number: Optional[str] = None
    discount_percent: Optional[float] = 0.0


# --------------------------------------------------
# STUDENT OUT (SINGLE)
# --------------------------------------------------
class StudentOut(StudentBase):
    id: int
    organization_id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


# --------------------------------------------------
# ENROLLMENT SCHEMAS
# --------------------------------------------------
class StudentEnrollmentBase(BaseModel):
    student_id: int
    classroom_id: int
    session_id: int
    enrollment_date: date
    is_active: bool = True
    # roll_number: Optional[str] = None
    discount_percent: float = 0.0


class StudentEnrollmentCreate(StudentEnrollmentBase):
    pass


class StudentEnrollmentOut(BaseModel):
    id: int
    student_id: int
    
    classroom_id: int
    session_id: int
    enrollment_date: date
    roll_number: int
    discount_percent: float = 0.0
    is_active: bool = True
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None