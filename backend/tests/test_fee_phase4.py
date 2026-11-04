"""Run the focused application and concurrency checks in one disposable cluster."""
import os
import unittest

from test_fee_postgres import validated_test_url


def load_tests(loader, standard_tests, pattern):
    if pattern != "test_fee_phase4.py":
        return standard_tests
    validated_test_url(os.environ["TEST_POSTGRES_URL"])
    return unittest.TestSuite(loader.loadTestsFromName(name) for name in (
        "test_fee_integrity", "test_fee_multi", "test_fee_postgres",
        "test_fee_postgres_phase2", "test_fee_voucher",
        "test_financial_permissions.FinancialValidationTests",
    ))
