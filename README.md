# Obsidian Termux Bridge

A plugin that connects Obsidian to Termux via a local HTTP bridge, bypassing Android Intent restrictions.

## Features
- **Reliable**: Uses standard TCP/IP networking (localhost).
- **Silent**: Runs in the background without opening Termux windows.
- **Bi-directional**: Sends commands and gets output back immediately.

## Setup Guide

### 1. Install Python in Termux
Open Termux and run:
```bash
pkg install python -y
```

### 2. Create the Server Script
Run this command to create the server file:
```bash
mkdir -p ~/bin
nano ~/bin/obsidian_server.py
```

Paste the following code:

```python
import http.server
import subprocess
import os

PORT = 8080

class RequestHandler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        # 1. Read the command from the request body
        content_length = int(self.headers['Content-Length'])
        command = self.rfile.read(content_length).decode('utf-8')
        
        print(f"Executing: {command}")
        
        try:
            # 2. Execute the command in the shell
            # capture_output=True requires Python 3.7+
            result = subprocess.run(
                command, 
                shell=True, 
                capture_output=True, 
                text=True,
                cwd=os.environ['HOME'] # Execute in Home directory
            )
            
            # 3. Prepare response (Stdout + Stderr)
            output = result.stdout + result.stderr
            
            # 4. Send response back to Obsidian
            self.send_response(200)
            self.send_header('Content-type', 'text/plain')
            self.end_headers()
            self.wfile.write(output.encode('utf-8'))
            
        except Exception as e:
            error_msg = str(e)
            self.send_response(500)
            self.end_headers()
            self.wfile.write(error_msg.encode('utf-8'))

    def log_message(self, format, *args):
        # Silence default logging to keep terminal clean
        return

print(f"Obsidian Bridge running on port {PORT}...")
http.server.HTTPServer(('127.0.0.1', PORT), RequestHandler).serve_forever()
```

### 3. Run the Server
Whenever you want to use the plugin, start the server in Termux:

```bash
python ~/bin/obsidian_server.py
```

*Tip: You can use `Termux:Boot` or aliases to auto-start this.*

## Usage in Obsidian
1.  **Command Palette**: "Run Termux Command".
2.  **Enter Command**: `ls -la`, `git pull`, etc.
3.  **Result**: The output is returned instantly (and pasted if you chose that option).
