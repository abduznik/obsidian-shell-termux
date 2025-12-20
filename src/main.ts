import { App, Editor, MarkdownView, Modal, Notice, Platform, Plugin, Setting, requestUrl, WorkspaceLeaf } from 'obsidian';
import { DEFAULT_SETTINGS, TermuxBridgeSettings, TermuxBridgeSettingTab } from "./settings";
import { TermuxTerminalView, TERMUX_TERMINAL_VIEW_TYPE } from "./TermuxTerminalView";

export default class TermuxBridgePlugin extends Plugin {
	settings: TermuxBridgeSettings;

	async onload() {
		await this.loadSettings();

		this.addSettingTab(new TermuxBridgeSettingTab(this.app, this));

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

		new Notice(`Sending to Termux...`);

		try {
			// Updated to use JSON protocol
			const response = await requestUrl({
				url: url,
				method: 'POST',
				body: JSON.stringify({ cmd: command }), // default cwd
				headers: {
					'Content-Type': 'application/json',
					'Authorization': this.settings.serverToken
				}
			});

			// Response is JSON now: { output: "...", cwd: "..." }
			let output = "";
			try {
				const data = response.json;
				output = data.output;
			} catch (e) {
				// Fallback if server returns plain text (old version)
				output = response.text;
			}
			
			console.log("Termux Output:", output);

			if (pasteBack) {
				const view = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (view) {
					view.editor.replaceSelection(output);
					new Notice('Output pasted!');
				} else {
					await navigator.clipboard.writeText(output);
					new Notice('Output copied to clipboard');
				}
			} else {
				new Notice('Command executed successfully');
			}

		} catch (err) {
			console.error(err);
			new Notice(`Failed to connect. Is server running?`);
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