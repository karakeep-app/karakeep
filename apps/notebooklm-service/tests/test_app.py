import asyncio
from uuid import uuid4

from fastapi.testclient import TestClient

from app import ProviderFailure, Store, create_app

AUTH = {"Authorization": "Bearer test-private-token"}


def operation():
    return {"operation_id": str(uuid4()), "user_id": "owner", "source_version": "version", "source_type": "article", "url": "https://example.com/article", "text": "Article body", "prompt": "Summarize in Russian"}


class Engine:
    def __init__(self, mode="success"):
        self.calls = 0
        self.mode = mode

    async def run(self, op, update):
        self.calls += 1
        if self.mode == "timeout":
            await asyncio.sleep(10)
        update(full_text=op.text)
        if self.mode == "failure":
            raise ProviderFailure("quota")
        if self.mode == "secret":
            raise RuntimeError("private-cookie-and-source")
        update(markdown="# Result")

    async def recover(self, operations, update):
        pass


def wait(client, op):
    for _ in range(100):
        row = client.get("/operations/" + op["operation_id"], headers=AUTH).json()
        if row["status"] != "pending":
            return row
    raise AssertionError("Operation did not finish")


def test_private_health_and_operations(tmp_path):
    with TestClient(create_app(Engine(), tmp_path, "test-private-token")) as client:
        assert client.get("/health").status_code == 401
        assert client.get("/health", headers=AUTH).json() == {"status": "ok"}
        assert client.post("/operations", json=operation()).status_code == 401


def test_success_and_idempotency(tmp_path):
    engine = Engine()
    op = operation()
    with TestClient(create_app(engine, tmp_path, "test-private-token")) as client:
        assert client.post("/operations", json=op, headers=AUTH).status_code == 202
        assert wait(client, op)["markdown"] == "# Result"
        assert client.post("/operations", json=op, headers=AUTH).status_code == 202
        assert engine.calls == 1
        op["text"] = "Different source"
        assert client.post("/operations", json=op, headers=AUTH).status_code == 409
        assert client.get("/operations/" + str(uuid4()), headers=AUTH).status_code == 404


def test_failure_retains_fulltext(tmp_path):
    op = operation()
    with TestClient(create_app(Engine("failure"), tmp_path, "test-private-token")) as client:
        client.post("/operations", json=op, headers=AUTH)
        result = wait(client, op)
        assert result["status"] == "failure"
        assert result["error_code"] == "quota"
        assert result["full_text"] == op["text"]


def test_timeout_and_sanitized_error(tmp_path):
    for mode, code in [("timeout", "timeout"), ("secret", "provider")]:
        op = operation()
        with TestClient(create_app(Engine(mode), tmp_path / mode, "test-private-token", timeout=0.01)) as client:
            client.post("/operations", json=op, headers=AUTH)
            result = wait(client, op)
            assert result["status"] == "failure"
            assert result["error_code"] == code
            assert "private-cookie" not in str(result)


def test_restart_marks_pending_failed(tmp_path):
    op = operation()
    from app import Operation
    store = Store(tmp_path)
    store.create(Operation(**op))
    store.update(op["operation_id"], full_text="Already extracted")
    store.db.close()
    with TestClient(create_app(Engine(), tmp_path, "test-private-token")) as client:
        row = client.get("/operations/" + op["operation_id"], headers=AUTH).json()
        assert row["status"] == "failure"
        assert row["error_code"] == "cancelled"
        assert row["full_text"] == "Already extracted"


def test_result_survives_restart(tmp_path):
    op = operation()
    with TestClient(create_app(Engine(), tmp_path, "test-private-token")) as client:
        client.post("/operations", json=op, headers=AUTH)
        assert wait(client, op)["status"] == "success"
    engine = Engine()
    with TestClient(create_app(engine, tmp_path, "test-private-token")) as client:
        assert client.post("/operations", json=op, headers=AUTH).json()["status"] == "success"
        assert engine.calls == 0


def test_concurrency_limit(tmp_path):
    class CountingEngine(Engine):
        active = 0
        maximum = 0

        async def run(self, op, update):
            self.active += 1
            self.maximum = max(self.maximum, self.active)
            try:
                await asyncio.sleep(0.02)
                await super().run(op, update)
            finally:
                self.active -= 1

    engine = CountingEngine()
    first, second = operation(), operation()
    with TestClient(create_app(engine, tmp_path, "test-private-token", concurrency=1)) as client:
        client.post("/operations", json=first, headers=AUTH)
        client.post("/operations", json=second, headers=AUTH)
        assert wait(client, first)["status"] == "success"
        assert wait(client, second)["status"] == "success"
        assert engine.maximum == 1



def test_invalid_body_does_not_echo_source_or_credentials(tmp_path):
    with TestClient(create_app(Engine(), tmp_path, "test-private-token")) as client:
        result = client.post("/operations", json={"text": "private material"}, headers=AUTH)
        assert result.status_code == 422
        assert "private material" not in result.text
        assert client.post("/operations", content=b"x" * 3_000_001, headers=AUTH).status_code == 413
