import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

import { DEFAULT_SETTINGS, type ExtensionSettings } from "../shared/settings";
import { createTranslator } from "../shared/i18n";
import { sendMessage } from "../shared/browser";
import { getSettings } from "../shared/settingsStore";
import "./options.css";

function OptionsApp() {
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS);
  const tr = useMemo(() => createTranslator(settings), [settings]);

  useEffect(() => {
    void getSettings().then(setSettings);
  }, []);

  const update = async (patch: Partial<ExtensionSettings>) => {
    const next = { ...settings, ...patch };
    const result = await sendMessage<{ ok: boolean; response: ExtensionSettings }>({ type: "settings:set", payload: next });
    setSettings(result.response);
  };

  const reset = async () => {
    const result = await sendMessage<{ ok: boolean; response: ExtensionSettings }>({ type: "settings:set", payload: DEFAULT_SETTINGS });
    setSettings(result.response);
  };

  return (
    <main className="options-shell">
      <aside>
        <div className="brand"><span>N</span><strong>Nolia Reader</strong></div>
        <a href="#general">General</a>
        <a href="#appearance">{tr("appearance")}</a>
        <a href="#markdown">{tr("markdown")}</a>
        <a href="#domains">{tr("domains")}</a>
        <a href="#privacy">{tr("privacy")}</a>
      </aside>
      <section className="options-content">
        <h1>{tr("settings")}</h1>
        <SettingsSection id="general" title="General">
          <Toggle label={tr("autoRender")} checked={settings.autoRender} onChange={(autoRender) => update({ autoRender })} />
          <Select label="Language" value={settings.locale} onChange={(locale) => update({ locale: locale as ExtensionSettings["locale"] })} options={["system", "en-US", "zh-CN"]} />
        </SettingsSection>
        <SettingsSection id="appearance" title={tr("appearance")}>
          <Select label={tr("theme")} value={settings.theme} onChange={(theme) => update({ theme: theme as ExtensionSettings["theme"] })} options={["system", "light", "dark"]} />
          <Select label={tr("fontSize")} value={settings.fontSize} onChange={(fontSize) => update({ fontSize: fontSize as ExtensionSettings["fontSize"] })} options={["small", "medium", "large"]} />
          <Select label={tr("contentWidth")} value={settings.contentWidth} onChange={(contentWidth) => update({ contentWidth: contentWidth as ExtensionSettings["contentWidth"] })} options={["narrow", "medium", "wide", "full"]} />
          <Toggle label={tr("showToc")} checked={settings.showToc} onChange={(showToc) => update({ showToc })} />
          <Toggle label={tr("showCodeCopy")} checked={settings.showCodeCopy} onChange={(showCodeCopy) => update({ showCodeCopy })} />
        </SettingsSection>
        <SettingsSection id="markdown" title={tr("markdown")}>
          <Toggle label={tr("enableMermaid")} checked={settings.enableMermaid} onChange={(enableMermaid) => update({ enableMermaid })} />
          <Toggle label={tr("enableMath")} checked={settings.enableMath} onChange={(enableMath) => update({ enableMath })} />
          <Toggle label={tr("enableFrontmatter")} checked={settings.enableFrontmatter} onChange={(enableFrontmatter) => update({ enableFrontmatter })} />
          <Toggle label={tr("enableCallouts")} checked={settings.enableCallouts} onChange={(enableCallouts) => update({ enableCallouts })} />
          <Toggle label={tr("enableWikilinks")} checked={settings.enableWikilinks} onChange={(enableWikilinks) => update({ enableWikilinks })} />
          <Toggle label="Webpage to Markdown" checked={settings.enableWebpageToMarkdown} onChange={(enableWebpageToMarkdown) => update({ enableWebpageToMarkdown })} />
        </SettingsSection>
        <SettingsSection id="domains" title={tr("domains")}>
          <DomainList title="Allowed domains" domains={settings.allowDomains} onChange={(allowDomains) => update({ allowDomains })} />
          <DomainList title="Blocked domains" domains={settings.blockDomains} onChange={(blockDomains) => update({ blockDomains })} />
        </SettingsSection>
        <SettingsSection id="privacy" title={tr("privacy")}>
          <p>{tr("privacySummary")}</p>
          <Toggle label="Remember scroll position" checked={settings.privacy.rememberScrollPosition} onChange={(rememberScrollPosition) => update({ privacy: { ...settings.privacy, rememberScrollPosition } })} />
          <Toggle label="Remember recent documents" checked={settings.privacy.rememberRecentDocuments} onChange={(rememberRecentDocuments) => update({ privacy: { ...settings.privacy, rememberRecentDocuments } })} />
          <button className="danger" onClick={() => void reset()}>Reset settings</button>
        </SettingsSection>
      </section>
    </main>
  );
}

function SettingsSection({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return <section id={id} className="settings-section"><h2>{title}</h2>{children}</section>;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="setting-row setting-row-toggle"><span>{label}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /></label>;
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return <label className="setting-row setting-row-select"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>;
}

function DomainList({ title, domains, onChange }: { title: string; domains: string[]; onChange: (domains: string[]) => void }) {
  const [draft, setDraft] = useState("");
  return (
    <div className="domain-list">
      <h3>{title}</h3>
      <div className="domain-add">
        <input value={draft} placeholder="example.com" onChange={(event) => setDraft(event.target.value)} />
        <button onClick={() => {
          if (!draft.trim()) return;
          onChange(Array.from(new Set([...domains, draft.trim()])));
          setDraft("");
        }}>Add</button>
      </div>
      {domains.map((domain) => (
        <div className="domain-row" key={domain}>
          <span>{domain}</span>
          <button onClick={() => onChange(domains.filter((item) => item !== domain))}>Remove</button>
        </div>
      ))}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<OptionsApp />);
