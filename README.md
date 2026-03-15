# School Management System

A full-stack School Management System project with **backend** (FastAPI) and **frontend** (Next.js).  
This system allows managing students, classrooms, sessions, enrollments, and more.

---

## 📁 Project Structure
├── backend/ # FastAPI backend
│ ├── app/ # Source code
│ ├── venv/ # Python virtual environment
│ └── requirements.txt
├── sms-frontend/ # Next.js frontend
│ ├── app/ # Next.js app folder
│ ├── public/ # Static assets
│ ├── package.json
│ └── .gitignore
└── README.md

---

## ⚙️ Tech Stack

- **Backend:** FastAPI, SQLAlchemy, PostgreSQL 
- **Frontend:** Next.js, React, Material ui
- **Authentication & Authorization:** JWT tokens, role-based access
- **Other Tools:** Git, GitHub, VS Code

---

## 🚀 Getting Started

### 1. Backend Setup

```bash
# Navigate to backend
cd backend

# Create virtual environment (if not already)
python -m venv venv
source venv/Scripts/activate  # Windows
# OR
source venv/bin/activate      # Mac/Linux

# Install dependencies
pip install -r requirements.txt

# Run the server
uvicorn app.main:app --reload
# Navigate to frontend
cd sms-frontend

# Install dependencies
npm install

# Run development server
npm run dev
