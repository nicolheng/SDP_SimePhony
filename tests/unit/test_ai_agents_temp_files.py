import logging

import pytest

pytestmark = pytest.mark.usefixtures("seed_db")


def test_temporary_photo_cleanup_failure_is_logged_and_does_not_raise(tmp_path, monkeypatch, caplog):
    from demo_api import ai_agents

    photo_path = tmp_path / "buyer-photo.png"
    photo_path.write_bytes(b"buyer photo")

    def fail_remove(_path):
        raise PermissionError("file is in use")

    monkeypatch.setattr(ai_agents.os, "remove", fail_remove)
    with caplog.at_level(logging.WARNING, logger="simephony.ai_agents"):
        ai_agents._cleanup_temp_photos([str(photo_path)])

    assert "Could not delete temporary AI photo" in caplog.text
    assert photo_path.exists()
