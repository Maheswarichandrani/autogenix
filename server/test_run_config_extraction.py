#!/usr/bin/env python3
"""Test the artificer run_config extraction"""

import json
import logging
from app.agents.workflow import _extract_run_config

logging.basicConfig(level=logging.DEBUG)

# Test data similar to what artificer should output
test_tool_log = [
    {
        "tool": "write_file",
        "input": {"path": "app.py", "content": "from flask import Flask\napp = Flask(__name__)"},
        "output": "✅ Written: app.py (2 lines, 45 bytes)"
    },
    {
        "tool": "exec_command", 
        "input": {"command": "pip install flask"},
        "output": "✅ EXIT 0\nSuccessfully installed Flask-2.3.3"
    },
    {
        "tool": "exec_command",
        "input": {"command": "echo '<<<RUN_CONFIG>>>{\"install_command\":\"pip install -r requirements.txt\",\"start_command\":\"python app.py\",\"health_check_path\":\"/health\",\"startup_wait_secs\":8}<<<END_RUN_CONFIG>>>'"},
        "output": "✅ EXIT 0\n<<<RUN_CONFIG>>>{\"install_command\":\"pip install -r requirements.txt\",\"start_command\":\"python app.py\",\"health_check_path\":\"/health\",\"startup_wait_secs\":8}<<<END_RUN_CONFIG>>>"
    }
]

print("Testing run_config extraction...")
result = _extract_run_config(test_tool_log)
print(f"Result: {result}")

if result:
    print("✅ Extraction works!")
    print(json.dumps(result, indent=2))
else:
    print("❌ Extraction failed")
