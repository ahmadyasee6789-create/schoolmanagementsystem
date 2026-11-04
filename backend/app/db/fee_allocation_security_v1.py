"""Frozen PostgreSQL protection for the new financial table, shared with tests.

Only executed when creating the allocation table (metadata tests or the reviewed
migration). The FastAPI backend uses an owner/BYPASSRLS connection and enforces
organization membership; no Supabase public API policy is created here.
"""
ALLOCATION_SECURITY_SQL = (
    "ALTER TABLE fee_allocations ENABLE ROW LEVEL SECURITY",
    "REVOKE ALL ON TABLE fee_allocations FROM PUBLIC",
    "REVOKE ALL ON SEQUENCE fee_allocations_id_seq FROM PUBLIC",
    """DO $allocation_access$
    BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
            REVOKE ALL ON TABLE fee_allocations FROM anon;
            REVOKE ALL ON SEQUENCE fee_allocations_id_seq FROM anon;
        END IF;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
            REVOKE ALL ON TABLE fee_allocations FROM authenticated;
            REVOKE ALL ON SEQUENCE fee_allocations_id_seq FROM authenticated;
        END IF;
    END $allocation_access$""",
)
