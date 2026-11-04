"""Generate synthetic receipt samples; never load the configured database URL."""
import os
from pathlib import Path
import sys

backend = Path(__file__).resolve().parents[1]
os.environ["DATABASE_URL"] = "sqlite://"
sys.path[:0] = [str(backend), str(backend / "tests")]
from test_fee_multi import MultiFeeTests
from app.services.fee_reads import receipt_info
from app.routers.receptTemp import render_multi_fee_receipt

output = backend / "output" / "pdf"
output.mkdir(parents=True, exist_ok=True)
samples = (
    ("phase2-partial-receipt", ["2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03"],
     dict(amount="2000.00", period_type="half_yearly", payment_method="cash")),
    ("phase2-yearly-receipt", [f"2026-{m:02d}" for m in range(4, 13)] + ["2027-01", "2027-02", "2027-03"],
     dict(amount="9000.00", retain_excess_as_credit=True, period_type="yearly", payment_method="bank_transfer")),
    ("phase2-advance-receipt", [], dict(amount="5000.00", period_type="advance_only", retain_excess_as_credit=True, payment_method="cash")),
)
for name, months, options in samples:
    fixture = MultiFeeTests()
    fixture.setUp()
    try:
        result = fixture.collect(months, **options)
        info = receipt_info(fixture.db, fixture.actor, result["transaction_id"])
        path = output / (name + ".pdf")
        path.write_bytes(render_multi_fee_receipt(info))
        print(path)
    finally:
        fixture.doCleanups()
