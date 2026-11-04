"""Frozen protection for backend-only collection commands, including Supabase."""
COMMAND_SECURITY_SQL = (
    "ALTER TABLE fee_collection_commands ENABLE ROW LEVEL SECURITY",
    "REVOKE ALL ON TABLE fee_collection_commands FROM PUBLIC",
    "REVOKE ALL ON SEQUENCE fee_collection_commands_id_seq FROM PUBLIC",
    """DO $command_access$
    BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
            REVOKE ALL ON TABLE fee_collection_commands FROM anon;
            REVOKE ALL ON SEQUENCE fee_collection_commands_id_seq FROM anon;
        END IF;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
            REVOKE ALL ON TABLE fee_collection_commands FROM authenticated;
            REVOKE ALL ON SEQUENCE fee_collection_commands_id_seq FROM authenticated;
        END IF;
    END $command_access$""",
)
