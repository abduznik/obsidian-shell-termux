import http.server
import subprocess
import os
import secrets

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
        
        if server_token and client_token != server_token:
            self.send_response(401)
            self.end_headers()
            self.wfile.write(b"Unauthorized: Invalid Token")
            return
        
        if client_token.startswith("Bearer "):
            client_token = client_token.split(" ")[1]
        else:
            client_token = client_token

        if not secrets.compare_digest(client_token, server_token):
            self.send_response(401)
            self.end_headers()
            self.wfile.write(b"Unauthorized: Invalid Token")
            return
        
        # 1. Read the command from the request body
        try:
            content_length = int(self.headers['Content-Length'])
        except (ValueError, TypeError):
            self.send_response(400)
            self.end_headers()
            self.wfile.write(b"Bad Request")
            return
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
if not get_token():
    print("CRITICAL: No token found. Requests will fail (500 Error).")
    print("Run the install script to generate a token.")
else:
    print("Authentication enabled.")

http.server.HTTPServer(('127.0.0.1', PORT), RequestHandler).serve_forever()
