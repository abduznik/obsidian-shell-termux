#!/bin/bash

echo "Uninstalling obsidian_server.py..."
rm -f ~/bin/obsidian_server.py
pkill -f "obsidian_server.py"

echo "Uninstallation complete."
