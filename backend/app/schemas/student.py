# app/schemas/student.py
from datetime import date, datetime
from decimal import Decimal
from pydantic import BaseModel, BeforeValidator, ConfigDict, EmailStr, Field, field_validator
from typing import Annotated, Literal, Optional


def _reject_boolean_discount(value):
    if isinstance(value, bool):
        raise ValueError("A discount percentage must be a number")
    return value


DiscountPercent = Annotated[
    Decimal,
    BeforeValidator(_reject_boolean_discount),
    Field(ge=0, le=100, max_digits=5, decimal_places=2, allow_inf_nan=False),
]


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
class EnrollmentDiscountUpdate(BaseModel):
    enrollment_id: int = Field(gt=0)
    session_id: int = Field(gt=0)
    discount_percent: DiscountPercent
    expected_discount_percent: DiscountPercent
    confirmed: Literal[True]

    model_config = ConfigDict(extra="forbid")


class StudentUpdate(BaseModel):
    first_name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    last_name: Optional[str] = Field(default=None, max_length=100)
    # admission_no: Optional[str] = None
    gender: Optional[str] = Field(default=None, max_length=10)
    date_of_birth: Optional[date] = None
    phone: Optional[str] = Field(default=None, max_length=20)
    email: Optional[EmailStr] = Field(default=None, max_length=255)
    father_name: Optional[str] = Field(default=None, max_length=255)
    father_phone: Optional[str] = Field(default=None, max_length=20)
    mother_name: Optional[str] = Field(default=None, max_length=255)
    guardian_name: Optional[str] = Field(default=None, max_length=255)
    guardian_phone: Optional[str] = Field(default=None, max_length=20)
    is_active: Optional[bool] = None
    enrollment_discount: Optional[EnrollmentDiscountUpdate] = None

    model_config = ConfigDict(from_attributes=True)

    @field_validator("first_name", mode="before")
    @classmethod
    def valid_first_name(cls, value):
        if isinstance(value, str):
            value = value.strip()
        if value is None or value == "":
            raise ValueError("First name is required")
        return value

    @field_validator("is_active")
    @classmethod
    def valid_status(cls, value):
        if value is None:
            raise ValueError("Student status must be active or inactive")
        return value

    @field_validator("date_of_birth")
    @classmethod
    def valid_birth_date(cls, value):
        if value and value > date.today():
            raise ValueError("Date of birth cannot be in the future")
        return value


# --------------------------------------------------
# CREATE WITH ENROLLMENT
# --------------------------------------------------
class StudentWithEnrollmentCreate(StudentBase):
    classroom_id: int
    session_id: int
    enrollment_date: date
    # roll_number: Optional[str] = None
    discount_percent: DiscountPercent = Decimal("0")


# --------------------------------------------------
# RESPONSE WITH ENROLLMENT
# --------------------------------------------------
class StudentWithEnrollment(StudentBase):
    last_name: Optional[str] = None
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
    admission_no: str
    last_name: Optional[str] = None
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
    discount_percent: DiscountPercent = Decimal("0")


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
class StudentEnrollmentDetail(BaseModel):
    id: int
    session_id: int
    session_name: Optional[str] = None
    classroom_id: Optional[int] = None
    class_name: Optional[str] = None
    grade_name: Optional[str] = None
    section: Optional[str] = None
    roll_number: Optional[str] = None
    discount_percent: float = 0.0
    enrollment_date: date
    withdrawal_date: Optional[date] = None
    is_active: bool

    model_config = ConfigDict(from_attributes=True)


class StudentSessionDetail(BaseModel):
    id: int
    name: str

    model_config = ConfigDict(from_attributes=True)


class StudentDetailOut(StudentOut):
    active_session: Optional[StudentSessionDetail] = None
    current_enrollment: Optional[StudentEnrollmentDetail] = None
