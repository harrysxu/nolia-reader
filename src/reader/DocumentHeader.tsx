import { Calendar, FileText, Link2 } from "lucide-react";

import type { MarkdownPageDocument } from "../shared/documentModel";
import type { Translator } from "../shared/i18n";
import { filenameFromDocument } from "../shared/filename";

interface DocumentHeaderProps {
  documentModel: MarkdownPageDocument;
  tr: Translator;
  showStats?: boolean;
}

export function DocumentHeader({ documentModel, tr, showStats = true }: DocumentHeaderProps) {
  const source = formatSource(documentModel);
  return (
    <section className="document-header">
      <h1>{documentModel.title}</h1>
      <div className="document-meta">
        <span className="document-meta-item" title={source.title}>
          <FileText size={14} /> {source.label}
        </span>
        {source.href ? (
          <a className="document-meta-item document-source-link" href={source.href} target="_blank" rel="noreferrer" title={source.title}>
            <Link2 size={14} /> {source.shortSource}
          </a>
        ) : null}
        {showStats ? (
          <>
            <span className="document-meta-item">{documentModel.stats.words} {tr("words")}</span>
            <span className="document-meta-item">{documentModel.stats.estimatedReadMinutes} {tr("readTime")}</span>
            <span className="document-meta-item"><Calendar size={14} /> {new Date(documentModel.fetchedAt).toLocaleString()}</span>
          </>
        ) : null}
      </div>
    </section>
  );
}

function formatSource(documentModel: MarkdownPageDocument): {
  label: string;
  shortSource: string;
  title: string;
  href?: string;
} {
  const filename = filenameFromDocument(documentModel.title, documentModel.sourceUrl);
  try {
    const url = new URL(documentModel.sourceUrl);
    if (url.protocol === "file:") {
      return {
        label: filename,
        shortSource: "",
        title: decodeURIComponent(url.pathname)
      };
    }
    const path = decodeURIComponent(url.pathname).replace(/\/+/g, "/");
    return {
      label: documentModel.sourceOrigin || url.hostname,
      shortSource: `${url.hostname}${shortenMiddle(path, 48)}`,
      title: documentModel.sourceUrl,
      href: documentModel.sourceUrl
    };
  } catch {
    return {
      label: filename,
      shortSource: "",
      title: documentModel.sourceUrl
    };
  }
}

function shortenMiddle(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  const keep = Math.max(8, Math.floor((maxLength - 1) / 2));
  return `${value.slice(0, keep)}...${value.slice(-keep)}`;
}
