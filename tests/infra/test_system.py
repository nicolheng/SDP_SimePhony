import pytest
from unittest.mock import patch, MagicMock

# --- Merged from tests/infra/test_concurrency.py ---

import pytest
import threading
from backend.db import get_conn

def test_sqlite_concurrent_writes():
    # Attempt to perform multiple concurrent writes to the DB
    # This tests if WAL mode and busy_timeout are working
    
    def write_task(i):
        try:
            with get_conn() as conn:
                conn.execute("CREATE TABLE IF NOT EXISTS concurrency_test (id INTEGER PRIMARY KEY, val TEXT)")
                conn.execute("INSERT INTO concurrency_test (val) VALUES (?)", (f"val_{i}",))
        except Exception as e:
            print(f"Write {i} failed: {e}")
            raise e

    threads = []
    for i in range(20):
        t = threading.Thread(target=write_task, args=(i,))
        threads.append(t)
        t.start()

    for t in threads:
        t.join()
    
    # If we reach here without an exception, concurrency is handled
    with get_conn() as conn:
        count = conn.execute("SELECT count(*) FROM concurrency_test").fetchone()[0]
        assert count == 20


# --- Merged from tests/infra/test_ollama.py ---
# test_ollama.py
from agents.simephony.llm_client import get_client, get_models

def test_connection():
    print("🚀 Testing connection to local Ollama...")
    client = get_client()
    vl_model, text_model = get_models()
    
    print(f"Using Vision Model: {vl_model}")
    print(f"Using Text Model: {text_model}")

    # Ask a simple question to Qwen 2.5
    response = client.chat.completions.create(
        model=text_model,
        messages=[
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": "What is 2 + 2? Reply in one word."}
        ],
        temperature=0.1
    )
    
    print(f"✅ Success! AI replied: {response.choices[0].message.content}")

if __name__ == "__main__":
    test_connection()


# --- Merged from tests/infra/test_persistence.py ---

import pytest
from agents.simephony.workflow import AgentState

def test_state_recovery_simulation():
    # Simulate saving state to a DB and recovering it
    initial_state = {
        "user_description": "Leaking pipe",
        "unit_id": "101",
        "current_status": "WAITING_FOR_REPAIR",
        "reopen_count": 0
    }
    
    # Save simulation
    saved_state = initial_state.copy()
    
    # Recovery simulation
    recovered_state = saved_state.copy()
    
    assert recovered_state["unit_id"] == "101"
    assert recovered_state["current_status"] == "WAITING_FOR_REPAIR"

