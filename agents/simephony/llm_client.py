# agents/simephony/llm_client.py
import os
from openai import OpenAI

# 1. Setup the client to talk to your local Ollama
# Ollama creates an OpenAI-compatible server at this local address
client = OpenAI(
    base_url="http://localhost:11434/v1",
    api_key="ollama" # Ollama doesn't care about the key, but OpenAI library requires it
)

# 2. Define which models to use
MODEL_VL = "llava-llama3"   # For looking at photos
MODEL_TEXT = "qwen2.5:32b"  # For reading text and reasoning

def get_client():
    return client

def get_models():
    return MODEL_VL, MODEL_TEXT