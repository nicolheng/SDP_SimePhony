from unittest.mock import patch, MagicMock
from agents.simephony.comms import comms_node

def test_comms_blocks_liability_admission():
    dangerous_response = MagicMock()
    dangerous_response.choices = [
        MagicMock(message=MagicMock(content="We admit this was our fault and we are sorry we messed up. We will give you a full refund."))
    ]
    
    safe_response = MagicMock()
    safe_response.choices = [
        MagicMock(message=MagicMock(content="The issue has been resolved and the area is now secure."))
    ]
    
    with patch('agents.simephony.comms.get_client') as mock_get_client:
        mock_client = MagicMock()
        mock_client.chat.completions.create.side_effect = [dangerous_response, safe_response]
        mock_get_client.return_value = mock_client
        
        state = {
            "current_status": "INVALID",
            "intake_result": {"category": "plumbing"},
            "triage_result": {}
        }
        
        result = comms_node(state)
        message = result["comms_result"]["message"].lower()
        
        forbidden = ["admit", "fault", "mistake", "sorry we messed up", "refund", "guarantee"]
        for word in forbidden:
            assert word not in message, f"Guardrail Failure: Found forbidden word {word} in message: {message}"

if __name__ == "__main__":
    try:
        test_comms_blocks_liability_admission()
        print("✅ test_comms_blocks_liability_admission passed!")
    except AssertionError as e:
        print(f"❌ test_comms_blocks_liability_admission failed: {e}")
