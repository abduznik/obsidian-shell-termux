import { App, Editor, MarkdownView, Modal, Notice, Platform, Plugin, Setting, requestUrl } from 'obsidian';
import { DEFAULT_SETTINGS, TermuxBridgeSettings, TermuxBridgeSettingTab } from "./settings";

export default class TermuxBridgePlugin extends Plugin {
	settings: TermuxBridgeSettings;

	async onload() {
		await this.loadSettings();

		this.addSettingTab(new TermuxBridgeSettingTab(this.app, this));

		this.addCommand({
			id: 'run-termux-command',
			name: 'Run Termux Command',
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

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<TermuxBridgeSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async executeCommand(command: string, pasteBack: boolean) {
		const port = this.settings.serverPort;
		const url = `http://127.0.0.1:${port}/`;

		new Notice(`Sending to Termux (Port ${port})...`);

		try {
			// using requestUrl from Obsidian API to avoid CORS issues if any (though localhost is usually fine)
			// Sending a POST request with the command as the body
			const response = await requestUrl({
				url: url,
				method: 'POST',
				body: command,
				headers: {
					'Content-Type': 'text/plain'
				}
			});

			const output = response.text;
			console.log("Termux Output:", output);

			if (pasteBack) {
				const view = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (view) {
					view.editor.replaceSelection(output);
					new Notice('Output pasted!');
				} else {
					// Fallback if no editor focused
					await navigator.clipboard.writeText(output);
					new Notice('Output copied to clipboard');
				}
			} else {
				new Notice('Command executed successfully');
			}

		} catch (err) {
			console.error(err);
			new Notice(`Failed to connect to Termux on port ${port}. Is the server running?`);
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
		contentEl.createEl('p', {text: 'Make sure your Python server is running in Termux.'});

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