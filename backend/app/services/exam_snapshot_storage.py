from fastapi import HTTPException
from sqlalchemy import inspect, text


def snapshot_storage_available(db):
    connection = db.connection()
    if not inspect(connection).has_table("exam_reopen_snapshots"):
        return False
    if connection.dialect.name == "postgresql":
        count = connection.scalar(text("""SELECT count(*) FROM pg_trigger
            WHERE tgrelid = to_regclass('exam_reopen_snapshots') AND NOT tgisinternal
            AND tgenabled <> 'D' AND tgname IN ('exam_snapshot_no_changes','exam_snapshot_no_truncate')"""))
        return count == 2
    return True


def require_snapshot_storage(db):
    if not snapshot_storage_available(db):
        raise HTTPException(503, "Reopening is unavailable until the reviewed examination snapshot migration has been applied")


def has_reopen_history(db, org_id, exam_id):
    if not snapshot_storage_available(db):
        return False
    from app.models.exam_reopen_snapshot import ExamReopenSnapshot
    return db.query(ExamReopenSnapshot.id).filter_by(organization_id=org_id, exam_id=exam_id).first() is not None
