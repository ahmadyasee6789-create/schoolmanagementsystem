from dotenv import load_dotenv
import os

load_dotenv()
print("EMAIL_USER =", os.getenv("EMAIL_USER"))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import students
from app.routers import dashboard
from app.routers import auth
from app.routers import classes
from app.routers import organizationInvite
from app.routers import organization_team
from app.routers import student_fee
from app.routers import fee_structure
from app.routers import acadmic_session
from app.routers import expenses
from app.routers import attendance
from app.routers import grades
from app.routers import subjects
from app.routers import terms
from app.routers import exams
from app.routers import exam_papers
from app.routers import exams_results
from app.routers import dmc
from app.routers import payroll
from app.routers import promotion
from app.routers import reports
from app.routers import employees
from app.routers  import superadmin

app = FastAPI()
FRONTEND_URL = os.getenv("FRONTEND_URL", "https://schoolmanagementsystem-beta.vercel.app")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        FRONTEND_URL
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(students.router)
app.include_router(dashboard.router)
app.include_router(auth.router)
app.include_router(classes.router)
app.include_router(organizationInvite.router)
app.include_router(organization_team.router)
app.include_router(student_fee.router)
app.include_router(fee_structure.router)    
app.include_router(acadmic_session.router)
app.include_router(expenses.router)
app.include_router(attendance.router)
app.include_router(grades.router)
app.include_router(subjects.router)
app.include_router(terms.router)
app.include_router(exams.router)    
app.include_router(exam_papers.router)
app.include_router(exams_results.router)
app.include_router(dmc.router)
app.include_router(payroll.router)
app.include_router(promotion.router)
app.include_router(reports.router)
app.include_router(employees.router)
app.include_router(superadmin.router)
