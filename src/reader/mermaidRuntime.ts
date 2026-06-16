export async function renderMermaidBlocks(root: Document | HTMLElement = document): Promise<void> {
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
      block.innerHTML = `<div class="diagram-toolbar"><button type="button" data-copy-svg>Copy SVG</button></div>${svg}`;
      block.dataset.rendered = "true";
      block.querySelector("[data-copy-svg]")?.addEventListener("click", () => {
        void navigator.clipboard.writeText(svg);
      });
    } catch (error) {
      block.classList.add("is-error");
      block.textContent = error instanceof Error ? error.message : "Mermaid render failed";
    }
  }));
}
