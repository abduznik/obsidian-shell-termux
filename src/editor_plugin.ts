import { Notice, setIcon } from 'obsidian';
import TermuxBridgePlugin from './main';

// --- UNIVERSAL LANGUAGE CONFIGURATION ---
// To add a new language, just add it here!
const SUPPORTED_LANGUAGES: { [key: string]: (code: string) => string } = {
    // 1. Python: Runs via Here-Doc wrapped in brackets
    'python': (code) => `{ python - <<'TERMUX_BRIDGE_EOF'\n${code}\nTERMUX_BRIDGE_EOF\n}`,
    'py': (code) => `{ python - <<'TERMUX_BRIDGE_EOF'\n${code}\nTERMUX_BRIDGE_EOF\n}`,

    // 2. Bash/Shell: Runs directly
    'bash': (code) => code,
    'sh': (code) => code,

    // 3. C Language: Write to temp file -> Compile -> Run -> Delete
    'c': (code) => {
        const tempFile = ".termux_bridge_temp.c";
        const exeFile = ".termux_bridge_temp_exe";
        return `{ cat <<'TERMUX_EOF' > ${tempFile}\n${code}\nTERMUX_EOF\nclang ${tempFile} -o ${exeFile} && ./${exeFile} && rm ${tempFile} ${exeFile}; }`;
    }
};

export class TermuxEditorExtensions {
    plugin: TermuxBridgePlugin;

    constructor(plugin: TermuxBridgePlugin) {
        this.plugin = plugin;
    }

    load() {
        // --- READING MODE BUTTONS ONLY ---
        this.plugin.registerMarkdownPostProcessor((element, context) => {
            const codeblocks = element.querySelectorAll("pre > code");

            codeblocks.forEach((codeBlock: HTMLElement) => {
                const cls = codeBlock.className || "";
                
                // 1. Identify Language
                let foundLang = "";
                
                for (const lang of Object.keys(SUPPORTED_LANGUAGES)) {
                    // Check for strict match (e.g. "language-c" or "language-python")
                    if (cls.split(' ').some(c => c === `language-${lang}`)) {
                        foundLang = lang;
                        break;
                    }
                }

                if (!foundLang) return;

                const pre = codeBlock.parentElement;
                if (pre) {
                    if (pre.querySelector(".termux-run-button")) return;

                    pre.classList.add("termux-code-block-wrap");

                    // 2. Create Button
                    const button = pre.createEl("button", {
                        cls: "termux-run-button",
                        text: `Run ${foundLang.toUpperCase()}`,
                        attr: { "aria-label": "Run in Termux" }
                    });
                    
                    const iconSpan = button.createSpan({ cls: "termux-run-icon" });
                    setIcon(iconSpan, "play");
                    button.prepend(iconSpan);

                    // 3. Click Handler
                    this.plugin.registerDomEvent(button, "click", async (evt) => {
                        evt.preventDefault();
                        evt.stopPropagation();
                        
                        const rawCode = codeBlock.innerText;
                        
                        // FIX: Explicitly handle undefined to satisfy TypeScript
                        const wrapperFn = SUPPORTED_LANGUAGES[foundLang];
                        if (!wrapperFn) return; 

                        const finalCmd = wrapperFn(rawCode);
                        
                        new Notice(`Sending ${foundLang.toUpperCase()}...`);
                        
                        await this.plugin.activateView();
                        this.plugin.executeCommand(finalCmd, false);
                    });
                }
            });
        });
    }
}