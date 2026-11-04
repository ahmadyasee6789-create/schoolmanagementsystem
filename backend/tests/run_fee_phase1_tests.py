"""Run Phase 1 regressions without importing or executing Alembic migrations.

Run from backend: venv/Scripts/python.exe -B tests/run_fee_phase1_tests.py
PostgreSQL tests are run separately with run_postgres_tests.ps1's exact pattern.
"""
import os
from pathlib import Path
import sys
import unittest


def main():
    backend = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(backend))
    os.environ["DATABASE_URL"] = "sqlite://"
    os.environ["PYTHONDONTWRITEBYTECODE"] = "1"
    patterns = (
        "test_auth_security.py", "test_fee_integrity.py", "test_fee_architecture.py",
        "test_fee_backfill_preparation.py", "test_fee_voucher.py",
        "test_financial_permissions.py", "test_student_details.py", "test_student_import.py",
    )
    loader = unittest.TestLoader()
    suite = unittest.TestSuite(loader.discover(str(backend / "tests"), pattern=pattern) for pattern in patterns)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    return not result.wasSuccessful()


if __name__ == "__main__":
    raise SystemExit(main())
