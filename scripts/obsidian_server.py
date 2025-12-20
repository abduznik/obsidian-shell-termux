import http.server
import subprocess
import os
import secrets
import json
import threading
import sys

PORT = 8085
TOKEN_FILE = os.path.expanduser("~/.obsidian_termux_token")

def get_token():
    if os.path.exists(TOKEN_FILE):
        with open(TOKEN_FILE, "r") as f:
            return f.read().strip()
    return None

class RequestHandler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        # 0. Check Authentication
        server_token = get_token()
        client_token = self.headers.get('Authorization')

        if not server_token:
            self.send_response(500)
            self.end_headers()
            self.wfile.write(b"Server Error: Token missing")
            return
        
        if not client_token:
            self.send_response(401)
            self.end_headers()
            self.wfile.write(b"Unauthorized: Token required")
            return

        if client_token.startswith("Bearer "):
            client_token = client_token.split(" ")[1]

        if not secrets.compare_digest(client_token, server_token):
            self.send_response(401)
            self.end_headers()
            self.wfile.write(b"Unauthorized: Invalid Token")
            return
        
        # 1. Read the command from the request body
        try:
            content_length = int(self.headers['Content-Length'])
            body = self.rfile.read(content_length).decode('utf-8')
            print(f"DEBUG: Body received: '{body}'")
        except (ValueError, TypeError):
            self.send_response(400)
            self.end_headers()
            self.wfile.write(b"Bad Request")
            return

        # 2. Parse Payload (JSON vs Raw String)
        cmd = ""
        cwd = os.environ['HOME']
        
        try:
            data = json.loads(body)
            # If it's a JSON object, look for cmd and cwd
            if isinstance(data, dict):
                cmd = data.get('cmd', '')
                cwd = data.get('cwd') or os.environ['HOME']
            else:
                # Should not happen with valid client, but fallback
                cmd = str(body)
        except json.JSONDecodeError:
            # If body looks like JSON but failed to parse, it's an error, not a command.
            if body.strip().startswith("{"):
                 self.send_response(400)
                 self.end_headers()
                 self.wfile.write(json.dumps({"output": "Error: Invalid JSON format received."}).encode('utf-8'))
                 return
            # Fallback for backward compatibility (raw text command)
            cmd = body

        # Safety check: If cmd still looks like JSON (e.g. from else block), block it.
        if cmd.strip().startswith("{") and "cmd" in cmd:
             self.send_response(400)
             self.end_headers()
             self.wfile.write(json.dumps({"output": "Error: Received JSON string as command. Check client serialization."}).encode('utf-8'))
             return

        # 2.5 Block Dangerous/Interactive Commands
        blocked_commands = ["nano", "vim", "vi", "emacs", "top", "htop", "man", "less", "more", "ssh"]
        cmd_parts = cmd.split()
        base_cmd = cmd_parts[0] if cmd_parts else ""
        
        if base_cmd in blocked_commands:
            self.send_response(400)
            self.end_headers()
            error_msg = f"Error: Command '{base_cmd}' is interactive and not supported."
            self.wfile.write(json.dumps({"output": error_msg, "cwd": cwd}).encode('utf-8'))
            return

        # Check for pkg/apt install without -y
        if base_cmd in ["pkg", "apt", "apt-get"] and "install" in cmd_parts:
            if "-y" not in cmd_parts:
                self.send_response(400)
                self.end_headers()
                error_msg = "Error: Please use '-y' flag for installations (e.g., 'pkg install git -y') to avoid hanging."
                self.wfile.write(json.dumps({"output": error_msg, "cwd": cwd}).encode('utf-8'))
                return

        print(f"Executing: '{cmd}' in '{cwd}'")
        
        try:
            # 3. Handle Special Commands
            if cmd.strip() == "__RESTART__":
                self.send_response(200)
                self.end_headers()
                self.wfile.write(json.dumps({"output": "Server is restarting...", "cwd": cwd}).encode('utf-8'))
                
                def restart_server():
                    python = sys.executable
                    os.execl(python, python, *sys.argv)
                
                threading.Timer(0.5, restart_server).start()
                return

            if cmd.strip() == "__SHUTDOWN__":
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b"Server shutting down...")
                
                # Schedule shutdown
                def kill_server():
                    os._exit(0)
                
                # We need to return response first, then kill.
                # Since we are in a handler, we can't easily kill the main loop cleanly without threading.
                # But os._exit(0) works.
                import threading
                threading.Timer(0.5, kill_server).start()
                return

            # 4. Execute the command
            # We append logic to capture the resulting CWD.
            # We use a unique marker to separate command output from the pwd output.
            marker = "___OBSIDIAN_TERMUX_CWD___"
            full_cmd = f"{cmd}; echo ''; echo '{marker}'; pwd"
            
            result = subprocess.run(
                full_cmd, 
                shell=True, 
                capture_output=True, 
                text=True,
                cwd=cwd,
                timeout=15
            )
            
            # 4. Process Output
            stdout = result.stdout
            new_cwd = cwd
            
            # Extract new CWD if marker exists
            if marker in stdout:
                parts = stdout.rsplit(marker, 1)
                main_output = parts[0]
                # The part after marker should be the path + newline
                path_part = parts[1].strip()
                if path_part:
                    new_cwd = path_part
            else:
                main_output = stdout

            final_output = main_output + result.stderr
            
            # 5. Send JSON Response
            response_data = {
                "output": final_output,
                "cwd": new_cwd
            }
            
            response_json = json.dumps(response_data)
            
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(response_json.encode('utf-8'))

        except subprocess.TimeoutExpired:
            self.send_response(408) # Request Timeout
            self.end_headers()
            error_msg = "Command timed out. Note: Interactive commands (like nano, vim) are NOT supported."
            self.wfile.write(json.dumps({"output": error_msg, "cwd": cwd}).encode('utf-8'))
            
        except Exception as e:
            error_msg = str(e)
            # Return error as JSON too if possible, or plain text 500
            self.send_response(500)
            self.end_headers()
            self.wfile.write(json.dumps({"error": error_msg}).encode('utf-8'))

    def log_message(self, format, *args):
        return

print(f"Obsidian Bridge running on port {PORT}...")
if not get_token():
    print("CRITICAL: No token found. Requests will fail.")
else:
    print("Authentication enabled.")

http.server.HTTPServer(('127.0.0.1', PORT), RequestHandler).serve_forever()