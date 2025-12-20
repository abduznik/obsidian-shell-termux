import { Notice, setIcon } from 'obsidian';
import TermuxBridgePlugin from './main';

const SUPPORTED_LANGUAGES: { [key: string]: (code: string) => string } = {
    'python': (code) => `{ python - <<'TERMUX_BRIDGE_EOF'\n${code}\nTERMUX_BRIDGE_EOF\n}`,
    'py': (code) => `{ python - <<'TERMUX_BRIDGE_EOF'\n${code}\nTERMUX_BRIDGE_EOF\n}`,
    'bash': (code) => code,
    'sh': (code) => code,
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
        // FIX: Removed unused eslint-disable comment
        this.plugin.registerMarkdownPostProcessor((element, context) => { 
            const codeblocks = element.querySelectorAll("pre > code");

            codeblocks.forEach((codeBlock) => {
                const blockEl = codeBlock as HTMLElement;
                const cls = blockEl.className || "";
                
                let foundLang = "";
                
                for (const lang of Object.keys(SUPPORTED_LANGUAGES)) {
                    if (cls.split(' ').some(c => c === `language-${lang}`)) {
                        foundLang = lang;
                        break;
                    }
                }

                if (!foundLang) return;

                const pre = blockEl.parentElement;
                if (pre) {
                    if (pre.querySelector(".termux-run-button")) return;

                    pre.classList.add("termux-code-block-wrap");

                    const button = pre.createEl("button", {
                        cls: "termux-run-button",
                        text: "Run code",
                        // FIX: "Run in terminal" (lowercase t) satisfies Sentence Case rule.
                        attr: { "aria-label": "Run in terminal" }
                    });
                    
                    const iconSpan = button.createSpan({ cls: "termux-run-icon" });
                    setIcon(iconSpan, "play");
                    button.prepend(iconSpan);

                    this.plugin.registerDomEvent(button, "click", (evt) => {
                        evt.preventDefault();
                        evt.stopPropagation();
                        
                        void (async () => {
                            const rawCode = blockEl.innerText;
                            
                            const wrapperFn = SUPPORTED_LANGUAGES[foundLang];
                            if (!wrapperFn) return; 

                            const finalCmd = wrapperFn(rawCode);
                            
                            new Notice(`Sending code...`);
                            
                            await this.plugin.activateView();
                            await this.plugin.executeCommand(finalCmd, false);
                        })();
                    });
                }
            });
        });
    }
}