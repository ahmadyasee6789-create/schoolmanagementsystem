from fastapi import APIRouter,Depends,HTTPException,status
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.schemas.employee import EmployeeCreate,EmployeeUpdate,EmployeeResponse
from app.routers.auth import get_current_user
from app.models import OrganizationMember,User
from app.models import Employee
router=APIRouter(prefix="/employees",tags=["Employees"],redirect_slashes=False,)
@router.get("",response_model=list[EmployeeResponse])
def get_employees(
    db:Session=Depends(get_db),
    current_user=Depends(get_current_user)
):
    employees=db.query(Employee).filter(
        Employee.organization_id==current_user.org_id
    )
    return employees


    return result
@router.get("/{employee_id}",response_model=EmployeeResponse)
def get_employee(
    employee_id:int,
    db:Session=Depends(get_db),
    current_user=Depends(get_current_user)
):
    employee=db.query(Employee).filter(
        Employee.id==employee_id,
        Employee.organization_id==current_user.org_id
    )
    if not employee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,detail="Employee not found")
    return employee
@router.post("",response_model=EmployeeResponse,
             status_code=status.HTTP_201_CREATED)
def create_employee(
    payload:EmployeeCreate,
    db:Session=Depends(get_db),
    current_user=Depends(get_current_user),
):
    print("✅ create_employee called")
    print("org_id:", current_user.org_id)
   
    if payload.email:
        existing=db.query(Employee).filter(
            Employee.email==payload.email,
            Employee.organization_id==current_user.org_id
        ).first()
        if  existing:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,detail="Email already exists")
    employee=Employee(
        organization_id=current_user.org_id,
        full_name=payload.full_name,
        email=payload.email,
        phone=payload.phone,
        role=payload.role,
        joining_date=payload.joining_date,
        status=payload.status
        )
    print("employee object:", employee)
    db.add(employee)
    db.commit()
    db.refresh(employee)
    print("after refresh:", employee.id)
    return employee
@router.put(
    "/{employee_id}",
    response_model=EmployeeResponse
)
def update_employee(
    employee_id:  int,
    payload:      EmployeeUpdate,
    db:           Session = Depends(get_db),
    current_user   = Depends(get_current_user),
):
    # Find the employee
    employee = db.query(Employee).filter(
        Employee.id              == employee_id,
        Employee.organization_id == current_user.org_id
    ).first()

    if not employee:
        raise HTTPException(
            status_code=404,
            detail="Employee not found"
        )

    # Check email conflict if email is being changed
    if payload.email and payload.email != employee.email:
        existing = db.query(Employee).filter(
            Employee.email           == payload.email,
            Employee.organization_id == current_user.org_id,
            Employee.id              != employee_id  # exclude self
        ).first()
        if existing:
            raise HTTPException(
                status_code=400,
                detail="An employee with this email already exists"
            )

    # Update only the fields that were sent
    # exclude_unset=True means "skip fields not in the request"
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(employee, field, value)

    db.commit()
    db.refresh(employee)

    return employee


# ──────────────────────────────────────────────
# DELETE /employees/{employee_id}
# Deletes an employee permanently
# ──────────────────────────────────────────────
@router.delete(
    "/{employee_id}",
    status_code=status.HTTP_204_NO_CONTENT  # 204 = deleted, no content back
)
def delete_employee(
    employee_id:  int,
    db:           Session = Depends(get_db),
    current_user    = Depends(get_current_user),
):
    # Find the employee
    employee = db.query(Employee).filter(
        Employee.id              == employee_id,
        Employee.organization_id == current_user.org_id
    ).first()

    if not employee:
        raise HTTPException(
            status_code=404,
            detail="Employee not found"
        )

    # Delete from database
    db.delete(employee)
    db.commit()

    # 204 returns nothing — no return statement needed
