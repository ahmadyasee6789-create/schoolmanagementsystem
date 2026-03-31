from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import date
from app.db.session import get_db
from app.models.staff_salary import StaffSalary
from app.models.salary_payments import SalaryPayment
from app.models.employee import Employee
from app.routers.auth import get_current_user
from app.models.users import User,OrganizationMember
from app.schemas.payroll import (
    StaffSalaryCreate,
    StaffSalaryUpdate,
    StaffSalaryResponse,
    SalaryGenerate,
    SalaryPay,
    SalaryPaymentResponse
)
from app.dependencies import get_active_session

router = APIRouter(prefix="/payroll", tags=["Payroll"])
@router.get(
    "/salaries",
    response_model=list[SalaryPaymentResponse]
)
def get_all_salaries(
    month: int,
    year: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    active_session=Depends(get_active_session)
):
    payments = db.query(SalaryPayment).filter(
        SalaryPayment.organization_id == current_user.org_id,
        SalaryPayment.month == month,
        SalaryPayment.year == year,
        SalaryPayment.session_id==active_session.id
    ).all()
    return payments


@router.post(
    "/staff-salary",
    response_model=StaffSalaryResponse,
    status_code=status.HTTP_201_CREATED
)
def create_staff_salary(
    payload: StaffSalaryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):

    employee = db.query(Employee).filter(
        Employee.id == payload.employee_id,
        Employee.organization_id == current_user.org_id
    ).first()

    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    salary = StaffSalary(
        organization_id=current_user.org_id,
        employee_id=payload.employee_id,
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
    "/staff-salaries",
    response_model=list[StaffSalaryResponse]
)
def get_all_staff_salaries(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    salaries = db.query(StaffSalary).filter(
        StaffSalary.organization_id == current_user.org_id
    ).all()
    return salaries
@router.put(
    "/staff-salary/{salary_id}",
    response_model=StaffSalaryResponse
)
def update_staff_salary(
    salary_id: int,
    payload: StaffSalaryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):

    salary = db.query(StaffSalary).filter(
        StaffSalary.id == salary_id,
        StaffSalary.organization_id == current_user.org_id
    ).first()

    if not salary:
        raise HTTPException(status_code=404, detail="Salary record not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(salary, field, value)

    db.commit()
    db.refresh(salary)

    return salary

@router.post("/generate", response_model=SalaryPaymentResponse)
def generate_salary(
    payload: SalaryGenerate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    active_session=Depends(get_active_session)
):

    # 1. Fetch employee
    employee = db.query(Employee).filter(
        Employee.id == payload.employee_id,
        Employee.organization_id == current_user.org_id
    ).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    # 2. Get salary structure
    salary = db.query(StaffSalary).filter(
        StaffSalary.employee_id == employee.id,
        StaffSalary.organization_id == current_user.org_id
    ).first()
    if not salary:
        raise HTTPException(status_code=404, detail="Salary structure not found")

    # 3. Check if already generated
    exists = db.query(SalaryPayment).filter(
        SalaryPayment.employee_id == employee.id,
        SalaryPayment.organization_id == current_user.org_id,
        SalaryPayment.month == payload.month,
        SalaryPayment.year == payload.year,
        SalaryPayment.session_id == active_session.id
    ).first()
    if exists:
        raise HTTPException(status_code=400, detail="Salary already generated")

    # 4. Calculate salary
    gross = salary.base_salary
    deductions = 0
    bonus = 0
    net = gross - deductions + bonus

    payment = SalaryPayment(
        organization_id=current_user.org_id,
        employee_id=employee.id,
        salary_id=salary.id,
        month=payload.month,
        year=payload.year,
        session_id=active_session.id,
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
    current_user: User = Depends(get_current_user),
    active_session=Depends(get_active_session)
):

    # Get all employees in the organization
    employees = db.query(Employee).filter(
        Employee.organization_id == current_user.org_id,
        Employee.status == "active"
    ).all()

    created = []

    for employee in employees:
        # Get salary structure
        salary = db.query(StaffSalary).filter(
            StaffSalary.employee_id == employee.id,
            StaffSalary.organization_id == current_user.org_id
        ).order_by(StaffSalary.effective_from.desc()).first()

        if not salary:
            continue  # skip employees without salary setup

        # Skip if already generated
        exists = db.query(SalaryPayment).filter(
            SalaryPayment.employee_id == employee.id,
            SalaryPayment.organization_id==current_user.org_id,
            SalaryPayment.month == month,
            SalaryPayment.year == year,
            SalaryPayment.session_id == active_session.id
        ).first()
        if exists:
            continue

        gross = salary.base_salary
        deductions = 0
        bonus = 0
        net = gross - deductions + bonus
        if month < 1 or month > 12:
          raise HTTPException(status_code=400, detail="Invalid month")

        if year < 2000:
          raise HTTPException(status_code=400, detail="Invalid year")

        payment = SalaryPayment(
            organization_id=current_user.org_id,
            employee_id=employee.id,
            salary_id=salary.id,
            month=month,
            year=year,
            session_id=active_session.id,
            gross_amount=gross,
            deductions=deductions,
            bonus=bonus,
            net_amount=net,
            status="pending"
        )
        db.add(payment)
        created.append(payment)

    db.commit()
    return {"message": "Payroll generated", "count": len(created)}
@router.post(
    "/pay/{payment_id}",
    response_model=SalaryPaymentResponse
)
def pay_salary(
    payment_id: int,
    payload: SalaryPay,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    active_session=Depends(get_active_session)
):

    payment = db.query(SalaryPayment).filter(
        SalaryPayment.id == payment_id,
        SalaryPayment.organization_id == current_user.org_id,
        SalaryPayment.session_id==active_session.id
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
    "/staff/{employee_id}",
    response_model=list[SalaryPaymentResponse]
)
def Staff_salary_history(
    employee_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    active_session=Depends(get_active_session)
):

    payments = db.query(SalaryPayment).filter(
        SalaryPayment.employee_id == employee_id,
        SalaryPayment.organization_id == current_user.org_id,
        SalaryPayment.session_id==active_session.id
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
