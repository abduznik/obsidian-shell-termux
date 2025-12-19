#!/bin/bash

# 1. Install Python in Termux
echo "Installing Python..."
pkg install python -y

# 2. Download the Server Script
echo "Downloading obsidian_server.py..."
mkdir -p ~/bin
curl -sL https://raw.githubusercontent.com/abduznik/obsidian-shell-termux/main/scripts/obsidian_server.py -o ~/bin/obsidian_server.py

# 3. Enable Auto-Start
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
echo "Restart Termux or run: python ~/bin/obsidian_server.py"