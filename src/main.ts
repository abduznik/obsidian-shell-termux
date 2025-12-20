import { App, Editor, MarkdownView, Modal, Notice, Platform, Plugin, Setting, requestUrl, WorkspaceLeaf } from 'obsidian';
import { DEFAULT_SETTINGS, TermuxBridgeSettings, TermuxBridgeSettingTab } from "./settings";
import { TermuxTerminalView, TERMUX_TERMINAL_VIEW_TYPE } from "./TermuxTerminalView";
import { TermuxEditorExtensions } from "./editor_plugin";

export default class TermuxBridgePlugin extends Plugin {
	settings: TermuxBridgeSettings;

	async onload() {
		await this.loadSettings();
	
		this.addSettingTab(new TermuxBridgeSettingTab(this.app, this));

		const editorExtensions = new TermuxEditorExtensions(this);
    	editorExtensions.load();

		// Register View
		this.registerView(
			TERMUX_TERMINAL_VIEW_TYPE,
			(leaf) => new TermuxTerminalView(leaf, this)
		);

		// Ribbon Icon
		this.addRibbonIcon('terminal-square', 'Open Termux Terminal', () => {
			this.activateView();
		});

		// Commands
		this.addCommand({
			id: 'open-termux-terminal',
			name: 'Open Terminal',
			callback: () => {
				this.activateView();
			}
		});

		this.addCommand({
			id: 'run-termux-command',
			name: 'Run Termux Command (Modal)',
			callback: () => {
				new TermuxCommandModal(this.app, this, false).open();
			}
		});

		this.addCommand({
			id: 'run-termux-command-paste',
			name: 'Run Termux Command and Paste Output',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				new TermuxCommandModal(this.app, this, true, editor).open();
			}
		});
	}

	async activateView() {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(TERMUX_TERMINAL_VIEW_TYPE);

		if (leaves.length > 0) {
			// A leaf with our view already exists, use that
			leaf = leaves[0] as WorkspaceLeaf;
		} else {
			// Our view could not be found in the workspace, create a new leaf
			// in the right sidebar
			leaf = workspace.getRightLeaf(false);
			if (leaf) {
				await leaf.setViewState({ type: TERMUX_TERMINAL_VIEW_TYPE, active: true });
			}
		}

		// "Reveal" the leaf in case it is in a collapsed sidebar
		if (leaf) {
			workspace.revealLeaf(leaf);
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<TermuxBridgeSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async executeCommand(command: string, pasteBack: boolean) {
        const port = this.settings.serverPort;
        const url = `http://127.0.0.1:${port}/`;

		const cleanCommand = command.trim(); 
        if (!cleanCommand) return; // Don't send empty commands

        // 1. Find the Terminal View (if open) to display logs
        const leaves = this.app.workspace.getLeavesOfType(TERMUX_TERMINAL_VIEW_TYPE);
        const terminalView = leaves.length > 0 ? (leaves[0]!.view as TermuxTerminalView) : null;

        // 2. Visually show the command being typed
        if (terminalView) {
            terminalView.appendOutput(`$ ${cleanCommand}\n`, 'command');
        } else {
            new Notice(`Sending: ${command}`);
        }

        try {
            const response = await requestUrl({
                url: url,
                method: 'POST',
                body: JSON.stringify({ cmd: cleanCommand }), 
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': this.settings.serverToken
                }
            });

            let output = "";
            try {
                const data = response.json;
                output = data.output;
                
                // Optional: Update CWD if returned
                if (data.cwd && terminalView) {
                    terminalView.currentCwd = data.cwd;
                }
            } catch (e) {
                output = response.text;
            }
            
            // 3. Print the output to the Terminal View
            if (terminalView) {
                terminalView.appendOutput(output, 'output');
            }

            // 4. Handle Paste Back (if requested)
            if (pasteBack) {
                const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (view) {
                    view.editor.replaceSelection(output);
                    new Notice('Output pasted!');
                } else {
                    await navigator.clipboard.writeText(output);
                    new Notice('Output copied to clipboard');
                }
            } else if (!terminalView) {
                // Only show notice if terminal isn't open (avoids clutter)
                new Notice('Command executed');
            }

        } catch (err: any) {
            console.error(err);
            const errorMsg = `Error: ${err.message || 'Connection Failed'}`;
            
            if (terminalView) {
                terminalView.appendOutput(`${errorMsg}\n`, 'error');
            } else {
                new Notice(errorMsg);
            }
        }
    }

	async testConnection() {
		const port = this.settings.serverPort;
		const url = `http://127.0.0.1:${port}/`;
		const testCommand = 'echo "Connection Successful"';

		new Notice(`Testing connection...`);

		try {
			const response = await requestUrl({
				url: url,
				method: 'POST',
				body: JSON.stringify({ cmd: testCommand }),
				headers: {
					'Content-Type': 'application/json',
					'Authorization': this.settings.serverToken
				}
			});

			// Handle JSON response
			let output = "";
			try {
				output = response.json.output.trim();
			} catch {
				output = response.text.trim();
			}

			if (output.includes("Connection Successful")) {
				new Notice("Success! Termux is reachable.");
			} else {
				new Notice(`Connected, but unexpected output: ${output}`);
			}

		} catch (err: any) {
			console.error(err);
			new Notice(`Connection failed: ${err.message || 'Unknown error'}`);
		}
	}
}

class TermuxCommandModal extends Modal {
	plugin: TermuxBridgePlugin;
	command: string;
	pasteBack: boolean;

	constructor(app: App, plugin: TermuxBridgePlugin, pasteBack: boolean, editor?: Editor) {
		super(app);
		this.plugin = plugin;
		this.command = '';
		this.pasteBack = pasteBack;
	}

	onOpen() {
		const {contentEl} = this;
		contentEl.createEl('h2', {text: this.pasteBack ? 'Run & Paste Output' : 'Run Termux Command'});
		
		new Setting(contentEl)
			.setName('Command')
			.addText(text => text
				.setPlaceholder('ls -la')
				.onChange(value => {
					this.command = value;
				}));

		new Setting(contentEl)
			.addButton(btn => btn
				.setButtonText('Run')
				.setCta()
				.onClick(() => {
					this.plugin.executeCommand(this.command, this.pasteBack);
					this.close();
				}));
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}