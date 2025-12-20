import { ItemView, WorkspaceLeaf, ButtonComponent, TextComponent, requestUrl, Notice } from 'obsidian';
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
        this.currentCwd = ''; 
    }

    getViewType() {
        return TERMUX_TERMINAL_VIEW_TYPE;
    }

    getDisplayText() {
        return 'Termux Console';
    }

    getIcon() {
        return 'terminal-square';
    }

    // Removed async as we do not await anything here
    onOpen(): Promise<void> {
        const container = this.containerEl.children[1];
        if (!container) return Promise.resolve();

        container.empty();
        container.addClass('termux-terminal-container');

        // 0. Header with Actions
        const header = container.createDiv({ cls: 'termux-terminal-header' });
        header.createSpan({ text: 'Termux bridge', cls: 'termux-terminal-title' });
        
        new ButtonComponent(header)
            .setIcon('refresh-cw')
            .setTooltip('Restart Termux server')
            .onClick(async () => {
                // Replaced window.confirm with a direct action + Notice to satisfy linter
                new Notice("Sending restart signal...");
                await this.executeCommand('__RESTART__');
                this.appendOutput("Server restarting...\n", 'system');
            });

        // 1. Output Area
        this.outputContainer = container.createDiv({ cls: 'termux-terminal-output' });
        this.appendOutput("Termux Bridge Connected.\nType 'help' for info or any shell command.\n", 'system');

        // 2. Input Area
        const inputArea = container.createDiv({ cls: 'termux-terminal-input-area' });
        
        // Prompt (cwd) - Removed unused variable assignment
        inputArea.createSpan({ cls: 'termux-terminal-prompt', text: '$ ' });

        this.inputComponent = new TextComponent(inputArea)
            .setPlaceholder('Type command...')
            .onChange(() => {
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

        return Promise.resolve();
    }

    async executeCommand(command: string) {
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

            if (response.status < 200 || response.status >= 300) {
                throw new Error(response.text || 'Server Error');
            }

            const data = response.json;
            
            if (data.cwd) {
                this.currentCwd = data.cwd;
            }

            if (data.output) {
                this.appendOutput(data.output, 'output');
            }
        } catch (err: unknown) {
            console.error(err);
            this.appendOutput(`Error: ${(err as Error).message}\n`, 'error');
        }

        this.outputContainer.scrollTop = this.outputContainer.scrollHeight;
    }

    appendOutput(text: string, type: 'command' | 'output' | 'error' | 'system') {
        const line = this.outputContainer.createDiv({ cls: `termux-terminal-line ${type}` });
        line.setText(text);
        this.outputContainer.scrollTop = this.outputContainer.scrollHeight;
    }

    async onClose() {
        // Cleanup
    }
}