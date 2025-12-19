#!/bin/bash
set -e

# 1. Install Python and OpenSSL in Termux
echo "Installing Python and OpenSSL..."
pkg update -y && pkg install python openssl-tool -y

# 2. Download the Server Script
echo "Downloading obsidian_server.py..."
mkdir -p ~/bin
curl -f -sL https://raw.githubusercontent.com/abduznik/obsidian-shell-termux/main/scripts/obsidian_server.py -o ~/bin/obsidian_server.py
if [ ! -s ~/bin/obsidian_server.py ]; then
    echo "Error: Download Failed Please Try Again"
    exit 1
fi


# 3. Generate Security Token
echo "Generating security token..."
TOKEN=$(openssl rand -hex 16)
echo "$TOKEN" > ~/.obsidian_termux_token
chmod 600 ~/.obsidian_termux_token

# 4. Enable Auto-Start
echo "Configuring auto-start in ~/.bashrc..."
if ! grep -q "obsidian_server.py" ~/.bashrc; then
    cat << 'EOF' >> ~/.bashrc

# Auto-start Obsidian Bridge if not running
if ! pgrep -f "obsidian_server.py" > /dev/null; then
    nohup python ~/bin/obsidian_server.py > ~/bin/obsidian_server.log 2>&1 &
fi
EOF
fi

echo "Installation complete!"
echo "---------------------------------------------------"
echo "IMPORTANT: Copy this token into Obsidian Settings:"
echo ""
echo "   $TOKEN"
echo ""
echo "---------------------------------------------------"
echo "Restart Termux or run: python ~/bin/obsidian_server.py"