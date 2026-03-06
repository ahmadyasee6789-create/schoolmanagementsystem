from datetime import date, datetime
from typing import List

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from app.routers.auth import get_current_user
from app.db.session import get_db
from sqlalchemy.orm import Session
from app.models.expenses import Expense
from app.schemas.expenses import ExpenseCategoryCreate, ExpenseCategoryOut, ExpenseCreate, ExpenseOut
from app.models.expensecategory import ExpenseCategory

router=APIRouter(prefix="/expenses",tags=["expenses"])
@router.post("/")
def add_expenses(
        expense: ExpenseCreate,
        db:Session=Depends(get_db),
        current_user=Depends(get_current_user),
):
    new_expense=Expense(
        organization_id=current_user.org_id,
        category_id=expense.category_id,
        description=expense.description,
        amount=expense.amount,
        expense_date=date.today(),
        created_by=current_user.id
    )
    db.add(new_expense)
    db.commit()
    db.refresh(new_expense)
    return new_expense
@router.get("/")
def list_expenses(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    search: str | None = None,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    query = db.query(Expense).filter(
        Expense.organization_id == current_user.org_id
    )

    if search:
        query = query.filter(
            Expense.description.ilike(f"%{search}%")
        )
    
    total = query.count()
   
        


    expenses = (
        query
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )

    total_pages = (total + limit - 1) // limit
    result = [
        {
            "id": e.id,
            "category_id": e.category_id,
            "category_name": e.category.name if e.category else None,
            "description": e.description,
            "amount": e.amount,
            "created_at": datetime.utcnow(),
        }
        for e in expenses
    ]

    return {
        "data": expenses,
        "totalPages": total_pages
    }
@router.get("/categories",response_model=List[ExpenseCategoryOut])
def list_expenses(
        db:Session=Depends(get_db),
        current_user=Depends(get_current_user),

):
    category=db.query(ExpenseCategory).filter(
        ExpenseCategory.organization_id==current_user.org_id
    ).all()
    return category
@router.post("/categories")
def add_category(
        category: ExpenseCategoryCreate,
        db: Session = Depends(get_db),
        current_user=Depends(get_current_user),
):
    existing_category = db.query(ExpenseCategory).filter(
        ExpenseCategory.organization_id == current_user.org_id,
        ExpenseCategory.name == category.name
    ).first()
    if existing_category:
        raise HTTPException(status_code=400, detail="Category already exists")
    new_category = ExpenseCategory(
        organization_id=current_user.org_id,
        name=category.name,
        # created_by=current_user.id
    )
    db.add(new_category)
    db.commit()
    db.refresh(new_category)
    return new_category

    
    