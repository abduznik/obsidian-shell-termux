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
#Added Touch to make sure that bashrc will be created if it doesnt exist
touch ~/.bashrc
# Remove old entries to prevent duplicates or wrong paths
sed -i '/# Auto-start Obsidian Bridge/,/fi/d' ~/.bashrc

cat << 'EOF' >> ~/.bashrc

# Auto-start Obsidian Bridge if not running
if ! pgrep -f "obsidian_server.py" > /dev/null; then
    mkdir -p ~/bin
    nohup python ~/bin/obsidian_server.py > ~/bin/obsidian_server.log 2>&1 &
fi
EOF

echo "Installation complete!"
echo "---------------------------------------------------"
echo "IMPORTANT: Copy this token into Obsidian Settings:"
echo ""
echo "   $TOKEN"
echo ""
echo "---------------------------------------------------"
echo "Restart Termux or run: python ~/bin/obsidian_server.py"
