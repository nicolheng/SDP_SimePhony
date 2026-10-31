# agents/simephony/llm_client.py
import os
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()  # this module can be imported before anything else has loaded .env

# 1. Time limits per attempt, in seconds. Vision is longer: the model is bigger and takes longer to load
LLM_TIMEOUT_TEXT = float(os.getenv("LLM_TIMEOUT_TEXT", "45"))
LLM_TIMEOUT_VISION = float(os.getenv("LLM_TIMEOUT_VISION", "90"))
# Stops a model that runs away producing junk instead of finishing its JSON
LLM_MAX_TOKENS = int(os.getenv("LLM_MAX_TOKENS", "1000"))

# 2. Setup the client. Defaults talk to local Ollama's OpenAI-compatible server
client = OpenAI(
    base_url=os.getenv("LLM_BASE_URL", "http://localhost:11434/v1"),
    api_key=os.getenv("LLM_API_KEY", "ollama"), # Ollama doesn't care about the key, but OpenAI library requires it
    timeout=LLM_TIMEOUT_TEXT,
    max_retries=1,
)

# 3. Define which models to use
MODEL_VL = os.getenv("MODEL_VL", "llava-llama3")   # For looking at photos
MODEL_TEXT = os.getenv("MODEL_TEXT", "qwen2.5:7b")  # For reading text and reasoning

def get_client():
    return client

def get_models():
    return MODEL_VL, MODEL_TEXT