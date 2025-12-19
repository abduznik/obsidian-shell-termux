import { App, PluginSettingTab, Setting, Notice } from "obsidian";
import TermuxBridgePlugin from "./main";

export interface TermuxBridgeSettings {
	serverPort: string;
}

export const DEFAULT_SETTINGS: TermuxBridgeSettings = {
	serverPort: '8085'
}

// The Python Server Script
const SERVER_SCRIPT = `import http.server
import subprocess
import os
import sys

# Configuration
PORT = 8085

# Check if port is provided as argument
if len(sys.argv) > 1:
    PORT = int(sys.argv[1])

class RequestHandler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            content_length = int(self.headers['Content-Length'])
            command = self.rfile.read(content_length).decode('utf-8')
            
            # Execute command in shell
            result = subprocess.run(
                command, 
                shell=True, 
                capture_output=True, 
                text=True,
                cwd=os.environ['HOME']
            )
            
            output = result.stdout + result.stderr
            
            self.send_response(200)
            self.send_header('Content-type', 'text/plain')
            self.end_headers()
            self.wfile.write(output.encode('utf-8'))
            
        except Exception as e:
            self.send_response(500)
            self.end_headers()
            self.wfile.write(str(e).encode('utf-8'))

    def log_message(self, format, *args):
        return # Silence logging

if __name__ == "__main__":
    print(f"Obsidian Bridge running on port {PORT}...")
    try:
        http.server.HTTPServer(('127.0.0.1', PORT), RequestHandler).serve_forever()
    except KeyboardInterrupt:
        pass
`;

// The Auto-Start Command (for .bashrc)
const AUTOSTART_CMD = `
# Auto-start Obsidian Bridge if not running
if ! pgrep -f "obsidian_server.py" > /dev/null;
then
    nohup python ~/obsidian_server.py > ~/obsidian_server.log 2>&1 &
fi
`;

export class TermuxBridgeSettingTab extends PluginSettingTab {
	plugin: TermuxBridgePlugin;

	constructor(app: App, plugin: TermuxBridgePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;
		containerEl.empty();

		containerEl.createEl('h1', {text: 'Termux Bridge Configuration'});

		// --- Connection Settings ---
		new Setting(containerEl)
			.setName('Server Port')
			.setDesc('The local port Termux is listening on.')
			.addText(text => text
				.setPlaceholder('8085')
				.setValue(this.plugin.settings.serverPort)
				.onChange(async (value) => {
					this.plugin.settings.serverPort = value;
					await this.plugin.saveSettings();
				}));

		containerEl.createEl('hr');

		// --- Setup Guide ---
		containerEl.createEl('h2', {text: 'Setup Guide'});
		containerEl.createEl('p', {text: 'Follow these steps to configure Termux to receive commands.'});

		// Step 1: Install Python
		new Setting(containerEl)
			.setName('Step 1: Install Python')
			.setDesc('Run "pkg install python -y" in Termux.')
			.addButton(btn => btn
				.setButtonText('Copy Command')
				.onClick(() => {
					navigator.clipboard.writeText('pkg install python -y');
					new Notice('Copied to clipboard');
				}));

		// Step 2: Create Server Script
		new Setting(containerEl)
			.setName('Step 2: Create Server Script')
			.setDesc('Creates "~/obsidian_server.py" in Termux.')
			.addButton(btn => btn
				.setButtonText('Copy Script Generator')
				.setCta()
				.onClick(() => {
					// We wrap the python script in a bash heredoc for easy pasting
					const bashCommand = `cat > ~/obsidian_server.py << 'EOF'\n${SERVER_SCRIPT}\nEOF\n`;
					navigator.clipboard.writeText(bashCommand);
					new Notice('Copied script generator to clipboard! Paste into Termux.');
				}));

		// Step 3: Auto-Start
		new Setting(containerEl)
			.setName('Step 3: Enable Auto-Start')
			.setDesc('Adds a check to your .bashrc to start the server automatically when Termux opens.')
			.addButton(btn => btn
				.setButtonText('Copy Auto-Start Code')
				.onClick(() => {
					// Append to .bashrc command
					const cmd = `echo '${AUTOSTART_CMD}' >> ~/.bashrc && source ~/.bashrc`;
					navigator.clipboard.writeText(cmd);
					new Notice('Copied auto-start command to clipboard');
				}));

        // Instructions
		const info = containerEl.createEl('div', {cls: 'setting-item-description'});
		info.createEl('p', {text: 'After completing Step 3, the server will start automatically whenever you open Termux. You can close the Termux app (swipe away) and it might stop, but reopening Termux will restart it instantly.'});
		info.createEl('p', {text: 'For true "boot-time" persistence, consider using the "Termux:Boot" app.'});
	}
}