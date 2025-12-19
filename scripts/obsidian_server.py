import http.server
import subprocess
import os

PORT = 8085

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
