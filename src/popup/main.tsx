import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Copy, Download, Eye, FileText, LogOut, Settings as SettingsIcon, ShieldCheck } from "lucide-react";

import { browserApi, queryActiveTab } from "../shared/browser";
import { sendContentMessage } from "../shared/contentBridge";
import { getSettings } from "../shared/settingsStore";
import type { DetectionResult } from "../shared/documentModel";
import type { ExtensionSettings } from "../shared/settings";
import { createTranslator } from "../shared/i18n";
import { getHostname, hostPermissionPatternForUrl } from "../shared/url";
import "./popup.css";

interface PageStatus {
  detection?: DetectionResult;
  rendered?: boolean;
  renderedSurface?: "inline" | "reader";
  lastRenderedSurface?: "inline" | "reader";
  mermaidRendered?: boolean;
  mermaidCandidates?: boolean;
  embeddedCandidates?: boolean;
  error?: string;
  tab?: chrome.tabs.Tab;
}

function PopupApp() {
  const [settings, setSettings] = useState<ExtensionSettings | undefined>();
  const [status, setStatus] = useState<PageStatus>({});
  const tr = useMemo(() => settings ? createTranslator(settings) : undefined, [settings]);

  useEffect(() => {
    void load();
  }, []);

  const load = async () => {
    const nextSettings = await getSettings();
    setSettings(nextSettings);
    const tab = await queryActiveTab();
    if (!tab?.id) {
      setStatus({ tab });
      return;
    }
    try {
      const response = await sendContentMessage<{ detection?: DetectionResult; rendered?: boolean; renderedSurface?: "inline" | "reader"; lastRenderedSurface?: "inline" | "reader"; mermaidRendered?: boolean; mermaidCandidates?: boolean; embeddedCandidates?: boolean }>(tab.id, { type: "content:status" });
      setStatus({
        tab,
        detection: response?.detection,
        rendered: response?.rendered,
        renderedSurface: response?.renderedSurface,
        lastRenderedSurface: response?.lastRenderedSurface,
        mermaidRendered: response?.mermaidRendered,
        mermaidCandidates: response?.mermaidCandidates ?? response?.embeddedCandidates,
        embeddedCandidates: response?.embeddedCandidates
      });
    } catch (error) {
      setStatus({ tab, error: error instanceof Error ? error.message : String(error) });
    }
  };

  if (!settings || !tr) {
    return <div className="popup-shell">Loading</div>;
  }

  const hostname = status.tab?.url ? getHostname(status.tab.url) : "";
  const isMarkdown = Boolean(status.detection?.isMarkdown);
  const hasMermaidCandidates = Boolean(status.mermaidCandidates);
  const rendered = Boolean(status.rendered);
  const mermaidRendered = Boolean(status.mermaidRendered);
  const primaryAction = rendered ? "content:exit" : isMarkdown ? "content:render" : hasMermaidCandidates ? "content:enhanceMermaid" : "content:convert";
  const primaryPayload = rendered
    ? undefined
    : isMarkdown
      ? { forced: true, surface: status.lastRenderedSurface ?? "reader" as const }
      : { forced: true };
  const primaryLabel = rendered ? tr("exitReader") : isMarkdown ? tr("renderAsMarkdown") : hasMermaidCandidates ? tr("renderMermaid") : tr("convertPage");

  const sendToTab = async (type: string, payload?: unknown) => {
    if (!status.tab?.id) return;
    await sendContentMessage(status.tab.id, { type, ...(typeof payload === "object" ? payload : {}) } as Parameters<typeof sendContentMessage>[1]);
    window.close();
  };

  const toggleAllow = async () => {
    if (!hostname) return;
    const tabUrl = status.tab?.url ?? "";
    const permissionPattern = hostPermissionPatternForUrl(tabUrl);
    if (!settings.allowDomains.includes(hostname) && permissionPattern && !permissionPattern.startsWith("file:")) {
      const granted = await browserApi.permissions.request({ origins: [permissionPattern] });
      if (!granted) return;
    }
    const next = settings.allowDomains.includes(hostname)
      ? settings.allowDomains.filter((host) => host !== hostname)
      : [...settings.allowDomains, hostname];
    const result = await browserApi.runtime.sendMessage({
      type: "settings:set",
      payload: { allowDomains: next, blockDomains: settings.blockDomains.filter((host) => host !== hostname) }
    });
    setSettings(readSettingsResponse(result));
  };

  const updateSettings = async (patch: Partial<ExtensionSettings>) => {
    const result = await browserApi.runtime.sendMessage({ type: "settings:set", payload: { ...settings, ...patch } });
    setSettings(readSettingsResponse(result));
  };

  return (
    <main className="popup-shell">
      <header>
        <div className="popup-brand"><span>N</span><strong>Nolia Reader</strong></div>
        <p>{hostname || "Current page"}</p>
      </header>
      <section className="status-box">
        <strong>{rendered ? (status.renderedSurface === "inline" ? tr("renderedInline") : tr("rendered")) : mermaidRendered ? tr("mermaidRendered") : isMarkdown ? tr("markdownDetected") : hasMermaidCandidates ? tr("mermaidDetected") : tr("notMarkdown")}</strong>
        <p>{status.error || status.detection?.reason.join(", ") || ""}</p>
      </section>
      <button className="primary-button" onClick={() => sendToTab(primaryAction, primaryPayload)}>
        {rendered ? <LogOut size={18} /> : isMarkdown || hasMermaidCandidates ? <Eye size={18} /> : <FileText size={18} />} {primaryLabel}
      </button>
      <div className="quick-grid">
        <button onClick={() => sendToTab(hasMermaidCandidates && !isMarkdown ? "content:enhanceMermaid" : "content:render", { forced: true })}><Eye size={16} />{hasMermaidCandidates && !isMarkdown ? tr("renderMermaid") : tr("preview")}</button>
        <button onClick={() => sendToTab("content:render", { forced: true, surface: "reader" })}><Eye size={16} />{tr("openReader")}</button>
        <button onClick={() => sendToTab("content:convert")}><FileText size={16} />{tr("convertPage")}</button>
        <button onClick={() => sendToTab("content:copyMarkdown")}><Copy size={16} />{tr("copyMarkdown")}</button>
        <button onClick={() => sendToTab("content:downloadMarkdown")}><Download size={16} />{tr("downloadMarkdown")}</button>
      </div>
      <section className="popup-section">
        <label>
          <input type="checkbox" checked={settings.autoRender} onChange={(event) => void updateSettings({ autoRender: event.target.checked })} />
          {tr("autoRender")}
        </label>
        <label>
          <input type="checkbox" checked={Boolean(hostname && settings.allowDomains.includes(hostname))} onChange={() => void toggleAllow()} />
          <ShieldCheck size={14} /> {tr("allowThisSite")}
        </label>
      </section>
      <footer>
        <button onClick={() => browserApi.runtime.openOptionsPage()}><SettingsIcon size={16} />{tr("settings")}</button>
      </footer>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<PopupApp />);

function readSettingsResponse(result: unknown): ExtensionSettings {
  if (result && typeof result === "object" && "response" in result) {
    return (result as { response: ExtensionSettings }).response;
  }
  throw new Error("Settings update failed");
}
