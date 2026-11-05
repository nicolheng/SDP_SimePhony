# Request size limits through the HTTP app: free-text fields are capped at 500 characters, photos must be browser
# data URLs no bigger than tools.MAX_PHOTO_BYTES, and any body over MAX_BODY_BYTES is refused with 413 unread.
import pytest
from fastapi.testclient import TestClient

pytestmark = pytest.mark.usefixtures("seed_db")


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("USE_AI_AGENTS", "false")
    import db
    import main
    from demo_api.migrate import migrate
    with db.get_conn() as conn:
        migrate(conn)
    return TestClient(main.app)  # no `with`: the lifespan (AI warmup, sweep loop) does not start


JPEG = "data:image/jpeg;base64,/9j/4AAQSkZJRg=="


@pytest.mark.parametrize("path, body", [
    ("/api/cases/C-0001/verification", {"result": "FIXED", "note": "x" * 501}),
    ("/api/cases/C-0001/reopen", {"description": "x" * 501, "photo": JPEG}),
])
def test_long_text_is_rejected(client, path, body):
    r = client.post(path, json=body)
    assert r.status_code == 422
    assert "500" in r.text


def test_photo_must_be_an_uploaded_image(client):
    r = client.post("/api/cases/C-0001/reopen", json={"photo": "C:/Windows/win.ini"})
    assert r.status_code == 422


def test_oversized_photo_is_rejected_by_the_model(client):
    from demo_api.routes import MAX_PHOTO_CHARS
    photo = JPEG[:23] + "A" * MAX_PHOTO_CHARS
    r = client.post("/api/cases/C-0001/verification", json={"result": "NOT_FIXED", "photo": photo})
    assert r.status_code == 422


def test_body_over_the_limit_is_refused_before_parsing(client):
    from demo_api.routes import MAX_BODY_BYTES
    r = client.post("/api/cases/C-0001/verification", content=b"x" * (MAX_BODY_BYTES + 1),
                    headers={"content-type": "application/json"})
    assert r.status_code == 413
    assert "too large" in r.json()["detail"]


def test_chunked_body_over_the_limit_is_refused(client):
    from demo_api.routes import MAX_BODY_BYTES

    def chunks():
        chunk = b"x" * (1024 * 1024)
        for _ in range(MAX_BODY_BYTES // len(chunk) + 2):
            yield chunk

    r = client.post("/api/cases/C-0001/verification", content=chunks(),
                    headers={"content-type": "application/json"})
    assert r.status_code == 413
