import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Copy, Download, Eye, LogOut, Maximize2, Settings, Code2 } from "lucide-react";

import type { MarkdownPageDocument, ReaderMode, RenderedMarkdownDocument } from "../shared/documentModel";
import { createTranslator } from "../shared/i18n";
import type { ExtensionSettings } from "../shared/settings";
import { sendMessage, browserApi } from "../shared/browser";
import { filenameFromDocument } from "../shared/filename";
import { attachCodeCopyButtons } from "./codeCopy";
import { renderMermaidBlocks } from "./mermaidRuntime";
import { DocumentHeader } from "./DocumentHeader";

interface InlineMarkdownAppProps {
  documentModel: MarkdownPageDocument;
  settings: ExtensionSettings;
  onOpenReader: () => void;
  onClose?: () => void;
}

export function InlineMarkdownApp({ documentModel, settings, onOpenReader, onClose }: InlineMarkdownAppProps) {
  const [readerSettings, setReaderSettings] = useState(settings);
  const tr = useMemo(() => createTranslator(readerSettings), [readerSettings]);
  const [mode, setMode] = useState<ReaderMode>("preview");
  const [rendered, setRendered] = useState<RenderedMarkdownDocument | undefined>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setReaderSettings(settings);
  }, [settings]);

  useEffect(() => {
    void render();
  }, [documentModel.markdown, readerSettings.enableMermaid, readerSettings.enableMath, readerSettings.enableCallouts, readerSettings.enableWikilinks]);

  useEffect(() => {
    if (mode !== "preview" || !rendered || !rootRef.current) {
      return;
    }
    if (readerSettings.enableMermaid) {
      void renderMermaidBlocks(rootRef.current);
    }
    if (readerSettings.showCodeCopy) {
      attachCodeCopyButtons(rootRef.current, showToast, { copy: "Copy", copied: tr("copied") });
    }
  });

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

  const downloadMarkdown = async () => {
    await sendMessage({ type: "markdown:download", payload: { document: documentModel } });
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

  return (
    <div ref={rootRef} className={`nolia-inline-reader theme-${readerSettings.theme} font-${readerSettings.fontSize}`}>
      <header className="nolia-inline-toolbar">
        <div className="nolia-inline-brand">
          <span className="brand-mark">N</span>
          <div>
            <strong>{documentModel.title}</strong>
            <span>{documentModel.sourceOrigin}</span>
          </div>
        </div>
        <div className="segmented nolia-inline-segmented" role="tablist">
          <button className={mode === "preview" ? "active" : ""} onClick={() => setMode("preview")} aria-label={tr("preview")}>
            <Eye size={16} /> {tr("preview")}
          </button>
          <button className={mode === "source" ? "active" : ""} onClick={() => setMode("source")} aria-label={tr("source")}>
            <Code2 size={16} /> {tr("source")}
          </button>
        </div>
        <nav className="toolbar-actions nolia-inline-actions" aria-label="Nolia Reader actions">
          <IconButton title={tr("copyMarkdown")} onClick={copyMarkdown}><Copy size={18} /></IconButton>
          <IconButton title={tr("downloadMarkdown")} onClick={downloadMarkdown}><Download size={18} /></IconButton>
          <IconButton title={tr("openReader")} onClick={onOpenReader}><Maximize2 size={18} /></IconButton>
          {onClose ? <IconButton title={tr("exitReader")} onClick={onClose}><LogOut size={18} /></IconButton> : null}
          <IconButton title={tr("settings")} onClick={openSettings}><Settings size={18} /></IconButton>
        </nav>
      </header>
      {toast ? <div className="reader-toast nolia-inline-toast" role="status">{toast}</div> : null}
      <div className="nolia-inline-content">
        <DocumentHeader documentModel={documentModel} tr={tr} showStats={false} />
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
