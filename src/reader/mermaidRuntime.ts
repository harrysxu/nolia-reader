import { copyText } from "./clipboard";

export interface MermaidRenderOptions {
  onCopyStatus?: (message: string) => void;
  labels?: {
    copy: string;
    copied: string;
    failed: string;
  };
}

const defaultLabels = {
  copy: "Copy SVG",
  copied: "Copied",
  failed: "Copy failed"
};

export async function renderMermaidBlocks(
  root: Document | HTMLElement = document,
  options: MermaidRenderOptions = {}
): Promise<void> {
  const blocks = Array.from(root.querySelectorAll<HTMLElement>(".mermaid-block:not([data-rendered='true'])"));
  if (!blocks.length) return;
  const { default: mermaid } = await import("mermaid");
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: document.documentElement.dataset.noliaTheme === "dark" ? "dark" : "default"
  });
  await Promise.all(blocks.map(async (block, index) => {
    const source = block.dataset.markdown || block.textContent || "";
    try {
      const { svg } = await mermaid.render(`nolia-mermaid-${Date.now()}-${index}`, source);
      const labels = { ...defaultLabels, ...options.labels };
      block.innerHTML = `<div class="diagram-toolbar"><button type="button" data-copy-svg>${labels.copy}</button></div>${svg}`;
      block.dataset.rendered = "true";
      block.querySelector<HTMLButtonElement>("[data-copy-svg]")?.addEventListener("click", (event) => {
        const button = event.currentTarget as HTMLButtonElement;
        button.disabled = true;
        void copyText(svg, block.ownerDocument).then(() => {
          button.textContent = labels.copied;
          options.onCopyStatus?.(labels.copied);
        }).catch(() => {
          button.textContent = labels.failed;
          options.onCopyStatus?.(labels.failed);
        }).finally(() => {
          window.setTimeout(() => {
            button.textContent = labels.copy;
            button.disabled = false;
          }, 1500);
        });
      });
    } catch (error) {
      block.classList.add("is-error");
      block.textContent = error instanceof Error ? error.message : "Mermaid render failed";
    }
  }));
}
