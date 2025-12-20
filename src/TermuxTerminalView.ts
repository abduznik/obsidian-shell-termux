import { ItemView, WorkspaceLeaf, Notice, ButtonComponent, TextComponent, requestUrl } from 'obsidian';
import TermuxBridgePlugin from './main';

export const TERMUX_TERMINAL_VIEW_TYPE = 'termux-terminal-view';

export class TermuxTerminalView extends ItemView {
    plugin: TermuxBridgePlugin;
    currentCwd: string;
    outputContainer: HTMLElement;
    inputComponent: TextComponent;

    constructor(leaf: WorkspaceLeaf, plugin: TermuxBridgePlugin) {
        super(leaf);
        this.plugin = plugin;
        this.currentCwd = ''; // Will start empty, server defaults to HOME
    }

    getViewType() {
        return TERMUX_TERMINAL_VIEW_TYPE;
    }

    getDisplayText() {
        return 'Termux Terminal';
    }

    getIcon() {
        return 'terminal-square';
    }

    async onOpen() {
        const container = this.containerEl.children[1];
        if (!container) return;

        container.empty();
        container.addClass('termux-terminal-container');

        // 0. Header with Actions
        const header = container.createDiv({ cls: 'termux-terminal-header' });
        header.createSpan({ text: 'Termux Bridge', cls: 'termux-terminal-title' });
        
        new ButtonComponent(header)
            .setIcon('refresh-cw')
            .setTooltip('Restart Termux Server')
            .onClick(async () => {
                const confirm = window.confirm("Restart the Termux server? This can fix stuck processes.");
                if (confirm) {
                    await this.executeCommand('__RESTART__');
                    this.appendOutput("Server restarting...\n", 'system');
                }
            });

        // 1. Output Area
        this.outputContainer = container.createDiv({ cls: 'termux-terminal-output' });
        this.appendOutput("Termux Bridge Connected.\nType 'help' for info or any shell command.\n", 'system');

        // 2. Input Area
        const inputArea = container.createDiv({ cls: 'termux-terminal-input-area' });
        
        // Prompt (cwd)
        const promptLabel = inputArea.createSpan({ cls: 'termux-terminal-prompt', text: '$ ' });

        this.inputComponent = new TextComponent(inputArea)
            .setPlaceholder('Type command...')
            .onChange((val) => {
                // optional: handle change
            });
        
        // Handle Enter key
        this.inputComponent.inputEl.addEventListener('keypress', async (e) => {
            if (e.key === 'Enter') {
                const cmd = this.inputComponent.getValue();
                if (cmd.trim()) {
                    this.inputComponent.setValue('');
                    await this.executeCommand(cmd);
                }
            }
        });

        // Focus input on click anywhere in container
        container.addEventListener('click', () => {
            this.inputComponent.inputEl.focus();
        });
    }

    async executeCommand(command: string) {
        // Display Command immediately
        this.appendOutput(`$ ${command}\n`, 'command');

        if (command === 'clear') {
            this.outputContainer.empty();
            return;
        }

        const port = this.plugin.settings.serverPort;
        const url = `http://127.0.0.1:${port}/`;

        try {
            const response = await requestUrl({
                url: url,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': this.plugin.settings.serverToken
                },
                body: JSON.stringify({
                    cmd: command,
                    cwd: this.currentCwd
                })
            });

            // Handle errors with JSON responses (400 Bad Request, 408 Timeout, 500 Server Error)
            if (response.status >= 400) {
                 const data = response.json;
                 if (data && data.output) {
                     this.appendOutput(data.output + "\n", 'error');
                     return;
                 }
                 throw new Error(response.text || `Server Error ${response.status}`);
            }

            if (response.status < 200 || response.status >= 300) {
                throw new Error(response.text || 'Server Error');
            }

            const data = response.json;
            
            // Update CWD
            if (data.cwd) {
                this.currentCwd = data.cwd;
            }

            // Display Output
            if (data.output) {
                this.appendOutput(data.output, 'output');
            }
        } catch (err: any) {
            console.error(err);
            this.appendOutput(`Error: ${err.message}\n`, 'error');
        }

        // Scroll to bottom
        this.outputContainer.scrollTop = this.outputContainer.scrollHeight;
    }

    appendOutput(text: string, type: 'command' | 'output' | 'error' | 'system') {
        const line = this.outputContainer.createDiv({ cls: `termux-terminal-line ${type}` });
        line.setText(text);
        
        // Auto-scroll
        this.outputContainer.scrollTop = this.outputContainer.scrollHeight;
    }

    async onClose() {
        // Cleanup
    }
}
