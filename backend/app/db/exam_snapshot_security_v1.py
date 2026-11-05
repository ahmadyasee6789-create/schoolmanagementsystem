"""Frozen DDL shared by the reviewed migration and disposable metadata tests."""
EXAM_SNAPSHOT_SECURITY_SQL = (
    """CREATE OR REPLACE FUNCTION deny_exam_snapshot_mutation() RETURNS trigger
    LANGUAGE plpgsql AS $$ BEGIN
        RAISE EXCEPTION 'Examination snapshots are immutable' USING ERRCODE = '23514';
    END $$""",
    """CREATE TRIGGER exam_snapshot_no_changes BEFORE UPDATE OR DELETE
       ON exam_reopen_snapshots FOR EACH ROW EXECUTE FUNCTION deny_exam_snapshot_mutation()""",
    """CREATE TRIGGER exam_snapshot_no_truncate BEFORE TRUNCATE
       ON exam_reopen_snapshots FOR EACH STATEMENT EXECUTE FUNCTION deny_exam_snapshot_mutation()""",
    "ALTER TABLE exam_reopen_snapshots ENABLE ROW LEVEL SECURITY",
    "REVOKE ALL ON TABLE exam_reopen_snapshots FROM PUBLIC",
    "REVOKE ALL ON SEQUENCE exam_reopen_snapshots_id_seq FROM PUBLIC",
    """DO $exam_snapshot_access$ BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
            REVOKE ALL ON TABLE exam_reopen_snapshots FROM anon;
            REVOKE ALL ON SEQUENCE exam_reopen_snapshots_id_seq FROM anon;
        END IF;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
            REVOKE ALL ON TABLE exam_reopen_snapshots FROM authenticated;
            REVOKE ALL ON SEQUENCE exam_reopen_snapshots_id_seq FROM authenticated;
        END IF;
    END $exam_snapshot_access$""",
)
