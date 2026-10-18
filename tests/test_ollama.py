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