import unittest
import subprocess
import time
import requests
import os
import shutil
import tempfile
import sys

# Path to the server script
SERVER_SCRIPT = os.path.join(os.path.dirname(__file__), '../scripts/obsidian_server.py')
PORT = 8085
BASE_URL = f"http://127.0.0.1:{PORT}"

class TestSecurity(unittest.TestCase):
    def setUp(self):
        # Create a temporary home directory
        self.test_dir = tempfile.mkdtemp()
        self.original_home = os.environ.get('HOME')
        self.original_userprofile = os.environ.get('USERPROFILE')
        os.environ['HOME'] = self.test_dir
        os.environ['USERPROFILE'] = self.test_dir
        
        # Create a dummy token file
        self.token = "SECRET_TOKEN_123"
        self.token_file = os.path.join(self.test_dir, '.obsidian_termux_token')
        with open(self.token_file, 'w') as f:
            f.write(self.token)

        # Start the server
        self.server_process = subprocess.Popen(
            [sys.executable, SERVER_SCRIPT],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=os.environ
        )
        
        # Wait for server to start
        time.sleep(2)

    def tearDown(self):
        # Kill server
        self.server_process.terminate()
        self.server_process.wait()
        
        # Cleanup
        if self.original_home:
            os.environ['HOME'] = self.original_home
        if self.original_userprofile:
            os.environ['USERPROFILE'] = self.original_userprofile
        shutil.rmtree(self.test_dir)

    def test_no_token(self):
        """Request without Authorization header should fail (401)."""
        response = requests.post(BASE_URL, data="echo test")
        self.assertEqual(response.status_code, 401)
        self.assertIn("Unauthorized", response.text)

    def test_wrong_token(self):
        """Request with wrong token should fail (401)."""
        headers = {'Authorization': 'WRONG_TOKEN'}
        response = requests.post(BASE_URL, data="echo test", headers=headers)
        self.assertEqual(response.status_code, 401)

    def test_correct_token(self):
        """Request with correct token should succeed (200)."""
        headers = {'Authorization': self.token}
        response = requests.post(BASE_URL, data="echo success", headers=headers)
        self.assertEqual(response.status_code, 200)
        self.assertIn("success", response.text)

if __name__ == '__main__':
    unittest.main()
