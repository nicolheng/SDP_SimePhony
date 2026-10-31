import pytest

pytestmark = pytest.mark.usefixtures("seed_db")


def _expected_indexes():
    from demo_api.migrate import INDEXES

    return {
        statement.split("IF NOT EXISTS ", 1)[1].split(" ", 1)[0]
        for statement in INDEXES
    }


def _database_indexes(conn):
    return {
        row["name"]
        for row in conn.execute(
            "SELECT name FROM sqlite_master WHERE type = 'index'"
        )
    }


def test_schema_creates_performance_indexes(tmp_path):
    import db

    path = tmp_path / "schema-indexes.db"
    db.init_schema(path)
    conn = db.connect(path)
    try:
        missing = _expected_indexes() - _database_indexes(conn)
        assert not missing, f"schema.sql did not create indexes: {sorted(missing)}"
    finally:
        conn.close()


def test_migration_recreates_performance_indexes_idempotently(tmp_path):
    import db
    from demo_api.migrate import migrate

    path = tmp_path / "migration-indexes.db"
    db.init_schema(path)
    conn = db.connect(path)
    try:
        expected = _expected_indexes()
        for name in expected:
            conn.execute(f"DROP INDEX {name}")

        migrate(conn)
        migrate(conn)

        missing = expected - _database_indexes(conn)
        assert not missing, f"migration did not recreate indexes: {sorted(missing)}"
    finally:
        conn.close()
