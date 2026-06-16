import { browserApi } from "../shared/browser";
import type { ExtensionSettings } from "../shared/settings";

const ALLOW_DOMAIN_SCRIPT_ID = "nolia-reader-allowed-domains";
const LOADER_FILE = "assets/content-loader.js";

export async function syncAllowedDomainContentScripts(settings: ExtensionSettings): Promise<void> {
  if (!browserApi.scripting?.registerContentScripts) {
    return;
  }

  await removeAllowedDomainContentScript();
  const matches = await filterPermittedMatches(settings.allowDomains.flatMap(domainToMatchPatterns));
  if (!settings.autoRender || matches.length === 0) {
    return;
  }

  await browserApi.scripting.registerContentScripts([
    {
      id: ALLOW_DOMAIN_SCRIPT_ID,
      matches,
      js: [LOADER_FILE],
      runAt: "document_idle",
      allFrames: false,
      persistAcrossSessions: true
    }
  ]);
}

export async function removeAllowedDomainContentScript(): Promise<void> {
  if (!browserApi.scripting?.unregisterContentScripts) {
    return;
  }
  try {
    await browserApi.scripting.unregisterContentScripts({ ids: [ALLOW_DOMAIN_SCRIPT_ID] });
  } catch {
    // The script may not exist yet, or the browser may not support the MV3 dynamic API fully.
  }
}

function domainToMatchPatterns(domain: string): string[] {
  const hostname = normalizeHostname(domain);
  if (!hostname || hostname.includes("*")) {
    return [];
  }
  if (hostname === "localhost") {
    return [`http://${hostname}/*`, `https://${hostname}/*`];
  }
  return [`https://${hostname}/*`, `http://${hostname}/*`];
}

export function normalizeAllowedDomainForTest(domain: string): string {
  return normalizeHostname(domain);
}

export function allowedDomainMatchPatternsForTest(domain: string): string[] {
  return domainToMatchPatterns(domain);
}

export async function filterPermittedMatchesForTest(matches: string[]): Promise<string[]> {
  return filterPermittedMatches(matches);
}

function normalizeHostname(domain: string): string {
  const value = domain.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  if (!value || value === "localhost") {
    return value;
  }
  return value.replace(/:\d+$/, "");
}

async function filterPermittedMatches(matches: string[]): Promise<string[]> {
  const uniqueMatches = Array.from(new Set(matches));
  const permitted: string[] = [];
  for (const match of uniqueMatches) {
    try {
      if (await globalThis.chrome.permissions.contains({ origins: [match] })) {
        permitted.push(match);
      }
    } catch {
      // Invalid or unsupported patterns should not block other domain registrations.
    }
  }
  return permitted;
}
