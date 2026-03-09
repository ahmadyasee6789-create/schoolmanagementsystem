from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import date

from app.db.session import get_db
from app.models.teacher_salaries import TeacherSalary
from app.models.salary_payments import SalaryPayment
from app.models.users import OrganizationMember
from app.routers.auth import get_current_user
from app.models.users import User
from app.schemas.payroll import (
    TeacherSalaryCreate,
    TeacherSalaryUpdate,
    TeacherSalaryResponse,
    SalaryGenerate,
    SalaryPay,
    SalaryPaymentResponse
)

router = APIRouter(prefix="/payroll", tags=["Payroll"])
@router.get(
    "/salaries",
    response_model=list[SalaryPaymentResponse]
)
def get_all_salaries(
    month: int,
    year: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    payments = db.query(SalaryPayment).filter(
        SalaryPayment.organization_id == current_user.org_id,
        SalaryPayment.month == month,
        SalaryPayment.year == year
    ).all()
    return payments

@router.get(
    "/teacher-salaries",
    response_model=list[TeacherSalaryResponse]
)
def get_teacher_salaries(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    salaries = db.query(TeacherSalary).filter(
        TeacherSalary.organization_id == current_user.org_id
    ).all()
    return salaries
@router.post(
    "/teacher-salary",
    response_model=TeacherSalaryResponse,
    status_code=status.HTTP_201_CREATED
)
def create_teacher_salary(
    payload: TeacherSalaryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):

    teacher = db.query(OrganizationMember).filter(
        OrganizationMember.id == payload.teacher_member_id,
        OrganizationMember.organization_id == current_user.org_id
    ).first()

    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found")

    salary = TeacherSalary(
        organization_id=current_user.org_id,
        teacher_member_id=payload.teacher_member_id,
        base_salary=payload.base_salary,
        pay_frequency=payload.pay_frequency,
        effective_from=payload.effective_from,
        effective_to=payload.effective_to
    )

    db.add(salary)
    db.commit()
    db.refresh(salary)

    return salary

@router.get(
    "/teacher-salaries",
    response_model=list[TeacherSalaryResponse]
)
def get_all_teacher_salaries(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    salaries = db.query(TeacherSalary).filter(
        TeacherSalary.organization_id == current_user.org_id
    ).all()
    return salaries
@router.put(
    "/teacher-salary/{salary_id}",
    response_model=TeacherSalaryResponse
)
def update_teacher_salary(
    salary_id: int,
    payload: TeacherSalaryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):

    salary = db.query(TeacherSalary).filter(
        TeacherSalary.id == salary_id,
        TeacherSalary.organization_id == current_user.org_id
    ).first()

    if not salary:
        raise HTTPException(status_code=404, detail="Salary record not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(salary, field, value)

    db.commit()
    db.refresh(salary)

    return salary

@router.post(
    "/generate",
    response_model=SalaryPaymentResponse
)
def generate_salary(
    payload: SalaryGenerate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):

    salary = db.query(TeacherSalary).filter(
        TeacherSalary.teacher_member_id == payload.teacher_member_id,
        TeacherSalary.organization_id == current_user.org_id
    ).first()

    if not salary:
        raise HTTPException(status_code=404, detail="Salary structure not found")

    exists = db.query(SalaryPayment).filter(
        SalaryPayment.teacher_member_id == payload.teacher_member_id,
        SalaryPayment.month == payload.month,
        SalaryPayment.year == payload.year
    ).first()

    if exists:
        raise HTTPException(status_code=400, detail="Salary already generated")

    gross = salary.base_salary
    deductions = 0
    bonus = 0
    net = gross - deductions + bonus

    payment = SalaryPayment(
        organization_id=current_user.org_id,
        teacher_member_id=payload.teacher_member_id,
        salary_id=salary.id,
        month=payload.month,
        year=payload.year,
        gross_amount=gross,
        deductions=deductions,
        bonus=bonus,
        net_amount=net,
        status="pending"
    )

    db.add(payment)
    db.commit()
    db.refresh(payment)

    return payment
@router.post("/generate-all")
def generate_all_salaries(
    month: int,
    year: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):

    salaries = db.query(TeacherSalary).filter(
        TeacherSalary.organization_id == current_user.org_id
    ).all()

    created = []

    for salary in salaries:

        exists = db.query(SalaryPayment).filter(
            SalaryPayment.teacher_member_id == salary.teacher_member_id,
            SalaryPayment.month == month,
            SalaryPayment.year == year
        ).first()

        if exists:
            continue

        gross = salary.base_salary
        deductions = 0
        bonus = 0
        net = gross

        payment = SalaryPayment(
            organization_id=current_user.org_id,
            teacher_member_id=salary.teacher_member_id,
            salary_id=salary.id,
            month=month,
            year=year,
            gross_amount=gross,
            deductions=deductions,
            bonus=bonus,
            net_amount=net,
            status="pending"
        )

        db.add(payment)
        created.append(payment)

    db.commit()

    return {
        "message": "Payroll generated",
        "count": len(created)
    }
@router.post(
    "/pay/{payment_id}",
    response_model=SalaryPaymentResponse
)
def pay_salary(
    payment_id: int,
    payload: SalaryPay,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):

    payment = db.query(SalaryPayment).filter(
        SalaryPayment.id == payment_id,
        SalaryPayment.organization_id == current_user.org_id
    ).first()

    if not payment:
        raise HTTPException(status_code=404, detail="Salary record not found")

    if payment.status == "paid":
        raise HTTPException(status_code=400, detail="Salary already paid")

    
    from decimal import Decimal

    gross = Decimal(payment.gross_amount)
    deductions = Decimal(payload.deductions or 0)
    bonus = Decimal(payload.bonus or 0)

    payment.deductions = deductions
    payment.bonus = bonus
    payment.net_amount = gross - deductions + bonus
    payment.payment_method = payload.payment_method
    payment.paid_date = date.today()
    payment.status = "paid"

    db.commit()
    db.refresh(payment)

    return payment
@router.get(
    "/teacher/{teacher_member_id}",
    response_model=list[SalaryPaymentResponse]
)
def teacher_salary_history(
    teacher_member_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):

    payments = db.query(SalaryPayment).filter(
        SalaryPayment.teacher_member_id == teacher_member_id,
        SalaryPayment.organization_id == current_user.org_id
    ).order_by(
        SalaryPayment.year.desc(),
        SalaryPayment.month.desc()
    ).all()

    return payments
@router.get(
    "/pending",
    response_model=list[SalaryPaymentResponse]
)
def pending_salaries(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):

    payments = db.query(SalaryPayment).filter(
        SalaryPayment.organization_id == current_user.org_id,
        SalaryPayment.status == "pending"
    ).all()

    return payments
