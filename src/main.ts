import { App, Editor, MarkdownView, Modal, Notice, Plugin, Setting, requestUrl, WorkspaceLeaf } from 'obsidian';
import { DEFAULT_SETTINGS, TermuxBridgeSettings, TermuxBridgeSettingTab } from "./settings";
import { TermuxTerminalView, TERMUX_TERMINAL_VIEW_TYPE } from "./TermuxTerminalView";
import { TermuxEditorExtensions } from "./editor_plugin";

interface TermuxResponse {
    output: string;
    cwd?: string;
}

export default class TermuxBridgePlugin extends Plugin {
    settings: TermuxBridgeSettings;

    async onload() {
        await this.loadSettings();
    
        this.addSettingTab(new TermuxBridgeSettingTab(this.app, this));

        const editorExtensions = new TermuxEditorExtensions(this);
        editorExtensions.load();

        this.registerView(
            TERMUX_TERMINAL_VIEW_TYPE,
            (leaf) => new TermuxTerminalView(leaf, this)
        );

        this.addRibbonIcon('terminal-square', 'Open terminal', () => {
            void this.activateView();
        });

        this.addCommand({
            id: 'open-termux-terminal',
            name: 'Open terminal',
            callback: () => {
                void this.activateView();
            }
        });

        this.addCommand({
            id: 'run-termux',
            name: 'Execute code',
            callback: () => {
                new TermuxCommandModal(this.app, this, false).open();
            }
        });

        this.addCommand({
            id: 'run-termux-paste',
            name: 'Execute code and paste output',
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
            leaf = leaves[0]!;
        } else {
            leaf = workspace.getRightLeaf(false);
            if (leaf) {
                await leaf.setViewState({ type: TERMUX_TERMINAL_VIEW_TYPE, active: true });
            }
        }

        if (leaf) {
            void workspace.revealLeaf(leaf);
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
        if (!cleanCommand) return; 

        const leaves = this.app.workspace.getLeavesOfType(TERMUX_TERMINAL_VIEW_TYPE);
        const terminalView = leaves.length > 0 ? (leaves[0]!.view as unknown as TermuxTerminalView) : null;

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
                const data = response.json as TermuxResponse;
                output = data.output;
                
                if (data.cwd && terminalView) {
                    terminalView.currentCwd = data.cwd;
                }
            } catch { 
                output = response.text;
            }
            
            if (terminalView) {
                terminalView.appendOutput(output, 'output');
            }

            if (pasteBack) {
                const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (view) {
                    view.editor.replaceSelection(output);
                    new Notice('Output pasted!');
                } else {
                    void navigator.clipboard.writeText(output);
                    new Notice('Output copied to clipboard');
                }
            } else if (!terminalView) {
                new Notice('Executed successfully');
            }

        } catch (err: unknown) {
            console.error(err);
            const errorMsg = `Error: ${(err as Error).message || 'Connection Failed'}`;
            
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

            const data = response.json as TermuxResponse; 
            const output = data && data.output ? data.output.trim() : response.text.trim();

            if (output.includes("Connection Successful")) {
                new Notice("Success! Termux is reachable.");
            } else {
                new Notice(`Connected, but unexpected output: ${output}`);
            }

        } catch (err: unknown) {
            console.error(err);
            new Notice(`Connection failed: ${(err as Error).message || 'Unknown error'}`);
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
        contentEl.createEl('h2', {text: this.pasteBack ? 'Execute and paste' : 'Execute code'});
        
        new Setting(contentEl)
            .setName('Command')
            .addText(text => text
                .setPlaceholder('Ls -la')
                .onChange(value => {
                    this.command = value;
                }));

        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText('Run')
                .setCta()
                .onClick(() => {
                    void this.plugin.executeCommand(this.command, this.pasteBack);
                    this.close();
                }));
    }

    onClose() {
        const {contentEl} = this;
        contentEl.empty();
    }
}