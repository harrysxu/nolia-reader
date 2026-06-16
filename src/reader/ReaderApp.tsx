import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Copy, Download, Eye, FileArchive, FileDown, List, LogOut, Moon, Printer, RefreshCw, Settings, Sun, Code2 } from "lucide-react";

import type { MarkdownPageDocument, ReaderMode, RenderedMarkdownDocument } from "../shared/documentModel";
import { createTranslator } from "../shared/i18n";
import type { ExtensionSettings } from "../shared/settings";
import { createExportHtml } from "../renderer/exportHtml";
import { browserApi, sendMessage } from "../shared/browser";
import { filenameFromDocument } from "../shared/filename";
import { renderMermaidBlocks } from "./mermaidRuntime";
import { attachCodeCopyButtons } from "./codeCopy";
import { DocumentHeader } from "./DocumentHeader";

interface ReaderAppProps {
  documentModel: MarkdownPageDocument;
  settings: ExtensionSettings;
  onSettingsChange: (settings: ExtensionSettings) => void;
  onClose?: () => void;
}

export function ReaderApp({ documentModel, settings, onSettingsChange, onClose }: ReaderAppProps) {
  const [readerSettings, setReaderSettings] = useState(settings);
  const tr = useMemo(() => createTranslator(readerSettings), [readerSettings]);
  const [mode, setMode] = useState<ReaderMode>("preview");
  const [rendered, setRendered] = useState<RenderedMarkdownDocument | undefined>();
  const [error, setError] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [tocOpen, setTocOpen] = useState(settings.showToc);
  const progressRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const exportCssRef = useRef("");

  useEffect(() => {
    setReaderSettings(settings);
  }, [settings]);

  useEffect(() => {
    void render();
  }, [documentModel.markdown, readerSettings.enableMermaid, readerSettings.enableMath, readerSettings.enableCallouts, readerSettings.enableWikilinks]);

  useEffect(() => {
    if (mode !== "preview") {
      return;
    }
    if (rendered && readerSettings.enableMermaid) {
      void renderMermaidBlocks(rootRef.current ?? document);
    }
    if (rendered && readerSettings.showCodeCopy) {
      attachCodeCopyButtons(rootRef.current ?? document, showToast);
    }
  });

  useEffect(() => {
    void collectExportCss().then((css) => {
      exportCssRef.current = css;
    });
  }, []);

  useEffect(() => {
    const updateProgress = () => {
      const scrollTop = window.scrollY;
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const progress = Math.min(1, Math.max(0, scrollTop / max));
      if (progressRef.current) {
        progressRef.current.style.transform = `scaleX(${progress})`;
      }
    };
    updateProgress();
    window.addEventListener("scroll", updateProgress, { passive: true });
    window.addEventListener("resize", updateProgress);
    return () => {
      window.removeEventListener("scroll", updateProgress);
      window.removeEventListener("resize", updateProgress);
    };
  }, []);

  useEffect(() => {
    const media = matchMedia("(max-width: 900px)");
    const syncTocForViewport = () => {
      if (media.matches) {
        setTocOpen(false);
      }
    };
    syncTocForViewport();
    media.addEventListener("change", syncTocForViewport);
    return () => media.removeEventListener("change", syncTocForViewport);
  }, []);

  const render = async () => {
    setBusy(true);
    setError("");
    try {
      const { renderMarkdown } = await import("../renderer/markdownPipeline");
      setRendered(await renderMarkdown(documentModel.markdown, { baseUrl: documentModel.baseUrl, settings: readerSettings }));
    } catch (renderError) {
      setError(renderError instanceof Error ? renderError.message : String(renderError));
    } finally {
      setBusy(false);
    }
  };

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(""), 1600);
  };

  const copyMarkdown = async () => {
    await navigator.clipboard.writeText(documentModel.markdown);
    showToast(tr("copied"));
  };

  const copyHtml = async () => {
    if (!rendered) return;
    await navigator.clipboard.writeText(rendered.html);
    showToast(tr("copied"));
  };

  const downloadMarkdown = async () => {
    await sendMessage({ type: "markdown:download", payload: { document: documentModel } });
  };

  const exportHtml = async () => {
    if (!rendered) return;
    await sendMessage({ type: "export:html", payload: { document: documentModel, html: rendered.html, css: exportCssRef.current || await collectExportCss() } });
  };

  const exportOffline = async () => {
    if (!rendered) return;
    const css = exportCssRef.current || await collectExportCss();
    await sendMessage({
      type: "export:offlineZip",
      payload: {
        document: documentModel,
        html: rendered.html,
        css,
        assets: rendered.assets.filter((asset) => asset.kind === "image" && asset.downloadable).map((asset) => asset.resolvedUrl)
      }
    });
  };

  const printPdf = () => {
    window.print();
  };

  const toggleTheme = () => {
    const next = readerSettings.theme === "dark" ? "light" : "dark";
    const nextSettings = { ...readerSettings, theme: next as ExtensionSettings["theme"] };
    setReaderSettings(nextSettings);
    document.documentElement.dataset.noliaTheme = next;
    onSettingsChange(nextSettings);
  };

  const openSettings = () => {
    void sendMessage({ type: "settings:openOptions" }).catch(() => {
      if (typeof browserApi?.runtime?.openOptionsPage === "function") {
        browserApi.runtime.openOptionsPage();
        return;
      }
      const url = browserApi?.runtime?.getURL?.("index.html");
      if (url) {
        window.open(url, "_blank", "noopener");
      }
    });
  };

  const htmlForExport = rendered ? createExportHtml(documentModel, rendered.html, exportCssRef.current) : "";

  return (
    <div ref={rootRef} className={`nolia-reader theme-${readerSettings.theme} width-${readerSettings.contentWidth} font-${readerSettings.fontSize}`}>
      <div className="reader-progress" ref={progressRef} />
      <header className="reader-toolbar">
        <div className="reader-brand">
          <span className="brand-mark">N</span>
          <div>
            <strong>{documentModel.title}</strong>
            <span>{documentModel.sourceOrigin}</span>
          </div>
        </div>
        <div className="segmented" role="tablist">
          <button className={mode === "preview" ? "active" : ""} onClick={() => setMode("preview")} aria-label={tr("preview")}>
            <Eye size={16} /> {tr("preview")}
          </button>
          <button className={mode === "source" ? "active" : ""} onClick={() => setMode("source")} aria-label={tr("source")}>
            <Code2 size={16} /> {tr("source")}
          </button>
        </div>
        <nav className="toolbar-actions" aria-label="Reader actions">
          <IconButton title={tr("tableOfContents")} onClick={() => setTocOpen(!tocOpen)}><List size={18} /></IconButton>
          <IconButton title={tr("copyMarkdown")} onClick={copyMarkdown}><Copy size={18} /></IconButton>
          <IconButton title={tr("copyHtml")} onClick={copyHtml}><Code2 size={18} /></IconButton>
          <IconButton title={tr("downloadMarkdown")} onClick={downloadMarkdown}><Download size={18} /></IconButton>
          <IconButton title={tr("exportHtml")} onClick={exportHtml}><FileDown size={18} /></IconButton>
          <IconButton title={tr("offlinePackage")} onClick={exportOffline}><FileArchive size={18} /></IconButton>
          <IconButton title={tr("printPdf")} onClick={printPdf}><Printer size={18} /></IconButton>
          <IconButton title={readerSettings.theme === "dark" ? "Light" : "Dark"} onClick={toggleTheme}>{readerSettings.theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}</IconButton>
          <IconButton title={tr("retry")} onClick={render}><RefreshCw size={18} /></IconButton>
          {onClose ? <IconButton title={tr("exitReader")} onClick={onClose}><LogOut size={18} /></IconButton> : null}
          <IconButton title={tr("settings")} onClick={openSettings}><Settings size={18} /></IconButton>
        </nav>
      </header>
      {toast ? <div className="reader-toast" role="status">{toast}</div> : null}
      <div className="reader-layout">
        {tocOpen ? (
          <aside className="reader-toc">
            <h2>{tr("tableOfContents")}</h2>
            {rendered?.toc.length ? rendered.toc.map((item) => (
              <a key={item.id} className={`depth-${item.depth}`} href={`#${item.id}`}>{item.text}</a>
            )) : <p>{tr("noToc")}</p>}
          </aside>
        ) : null}
        <main className="reader-main">
          <DocumentHeader documentModel={documentModel} tr={tr} />
          {busy ? <div className="reader-state">{tr("loading")}</div> : null}
          {error ? (
            <div className="reader-error">
              <strong>{tr("renderFailed")}</strong>
              <p>{error}</p>
              <button onClick={() => setMode("source")}>{tr("viewSource")}</button>
              <button onClick={downloadMarkdown}>{tr("downloadOriginal")}</button>
            </div>
          ) : null}
          {readerSettings.enableFrontmatter && rendered && Object.keys(rendered.frontmatter).length ? (
            <details className="frontmatter-panel">
              <summary>{tr("frontmatter")}</summary>
              <pre>{JSON.stringify(rendered.frontmatter, null, 2)}</pre>
            </details>
          ) : null}
          {mode === "preview" && rendered ? (
            <article className="markdown-body" dangerouslySetInnerHTML={{ __html: rendered.html }} />
          ) : null}
          {mode === "source" ? (
            <SourceView markdown={documentModel.markdown} filename={filenameFromDocument(documentModel.title, documentModel.sourceUrl)} />
          ) : null}
          <textarea className="export-buffer" readOnly value={htmlForExport} aria-hidden="true" tabIndex={-1} />
        </main>
      </div>
    </div>
  );
}

function SourceView({ markdown, filename }: { markdown: string; filename: string }) {
  return (
    <div className="source-view">
      <div className="source-meta">{filename}</div>
      <pre>{markdown}</pre>
    </div>
  );
}

function IconButton({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) {
  return <button className="icon-button" type="button" title={title} aria-label={title} onClick={onClick}>{children}</button>;
}

async function collectExportCss(): Promise<string> {
  const inlineCss = Array.from(document.querySelectorAll<HTMLStyleElement>("style[data-nolia-reader='true']"))
    .map((style) => style.textContent ?? "");
  const linkedCss = await Promise.all(
    Array.from(document.querySelectorAll<HTMLLinkElement>("link[data-nolia-reader-css]")).map(async (link) => {
      try {
        const response = await fetch(link.href);
        return response.ok ? await response.text() : "";
      } catch {
        return "";
      }
    })
  );
  return [...inlineCss, ...linkedCss].filter(Boolean).join("\n");
}
