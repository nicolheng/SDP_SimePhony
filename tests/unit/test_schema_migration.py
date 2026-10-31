import pytest

pytestmark = pytest.mark.usefixtures("seed_db")


def test_schema_is_complete_and_migration_backfills_older_databases(tmp_path):
    import sqlite3
    import db
    from demo_api.migrate import CASE_COLUMNS, TECHNICIAN_COLUMNS, ASSIGNMENT_COLUMNS, _add_columns, migrate

    path = tmp_path / "schema.db"
    db.init_schema(path)
    conn = db.connect(path)
    try:
        def columns(table):
            return {row["name"] for row in conn.execute(f"PRAGMA table_info({table})")}

        assert set(CASE_COLUMNS) <= columns("cases")
        assert set(TECHNICIAN_COLUMNS) <= columns("technicians")
        assert set(ASSIGNMENT_COLUMNS) <= columns("assignment_history")
        assert "app_meta" in {
            row["name"] for row in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
        }

        migrate(conn)
        migrate(conn)

        assert set(CASE_COLUMNS) <= columns("cases")
        assert set(TECHNICIAN_COLUMNS) <= columns("technicians")
        assert set(ASSIGNMENT_COLUMNS) <= columns("assignment_history")
    finally:
        conn.close()

    legacy = sqlite3.connect(":memory:")
    legacy.row_factory = sqlite3.Row
    try:
        legacy.executescript(
            "CREATE TABLE cases (case_id TEXT);"
            "CREATE TABLE technicians (technician_id TEXT);"
            "CREATE TABLE assignment_history (assignment_id TEXT);"
        )
        _add_columns(legacy, "cases", CASE_COLUMNS)
        _add_columns(legacy, "technicians", TECHNICIAN_COLUMNS)
        _add_columns(legacy, "assignment_history", ASSIGNMENT_COLUMNS)
        _add_columns(legacy, "cases", CASE_COLUMNS)
        _add_columns(legacy, "technicians", TECHNICIAN_COLUMNS)
        _add_columns(legacy, "assignment_history", ASSIGNMENT_COLUMNS)

        assert set(CASE_COLUMNS) <= {row["name"] for row in legacy.execute("PRAGMA table_info(cases)")}
        assert set(TECHNICIAN_COLUMNS) <= {row["name"] for row in legacy.execute("PRAGMA table_info(technicians)")}
        assert set(ASSIGNMENT_COLUMNS) <= {
            row["name"] for row in legacy.execute("PRAGMA table_info(assignment_history)")
        }
    finally:
        legacy.close()


def test_migration_retires_assigned_case_status_idempotently(seed_db):
    import db
    from demo_api.migrate import migrate

    with db.get_conn() as conn:
        conn.execute(
            "UPDATE cases SET status = 'ASSIGNED', booking_status = 'CONFIRMED' WHERE case_id = 'C-0010'"
        )
        migrate(conn)
        case = conn.execute(
            "SELECT status, booking_status FROM cases WHERE case_id = 'C-0010'"
        ).fetchone()
        assert tuple(case) == ("VISIT_SCHEDULED", "PENDING")

        migrate(conn)
        case = conn.execute(
            "SELECT status, booking_status FROM cases WHERE case_id = 'C-0010'"
        ).fetchone()
        assert tuple(case) == ("VISIT_SCHEDULED", "PENDING")
