#!/bin/bash

echo "Uninstalling obsidian_server.py..."
rm -f ~/bin/obsidian_server.py
pkill -f "obsidian_server.py"

# Remove auto-start from .bashrc
sed -i '/# Auto-start Obsidian Bridge/,/fi/d' ~/.bashrc

echo "Uninstallation complete."
