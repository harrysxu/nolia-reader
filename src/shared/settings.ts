export type ThemePreference = "system" | "light" | "dark";
export type FontSizePreference = "small" | "medium" | "large";
export type ContentWidthPreference = "narrow" | "medium" | "wide" | "full";
export type LocalePreference = "system" | "en-US" | "zh-CN";

export interface ExtensionSettings {
  autoRender: boolean;
  locale: LocalePreference;
  theme: ThemePreference;
  fontSize: FontSizePreference;
  contentWidth: ContentWidthPreference;
  showToc: boolean;
  showCodeCopy: boolean;
  enableMermaid: boolean;
  enableMath: boolean;
  enableFrontmatter: boolean;
  enableCallouts: boolean;
  enableWikilinks: boolean;
  enableWebpageToMarkdown: boolean;
  allowDomains: string[];
  blockDomains: string[];
  exportDefaults: {
    htmlTheme: "current" | "light" | "dark";
    includeSourceMarkdown: boolean;
    offlineAssets: "remote" | "best-effort-download";
  };
  privacy: {
    telemetry: false;
    rememberScrollPosition: boolean;
    rememberRecentDocuments: boolean;
  };
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  autoRender: true,
  locale: "system",
  theme: "system",
  fontSize: "medium",
  contentWidth: "medium",
  showToc: true,
  showCodeCopy: true,
  enableMermaid: true,
  enableMath: true,
  enableFrontmatter: true,
  enableCallouts: true,
  enableWikilinks: true,
  enableWebpageToMarkdown: true,
  allowDomains: [
    "raw.githubusercontent.com",
    "gist.githubusercontent.com",
    "gitlab.com",
    "gitee.com"
  ],
  blockDomains: [],
  exportDefaults: {
    htmlTheme: "current",
    includeSourceMarkdown: false,
    offlineAssets: "best-effort-download"
  },
  privacy: {
    telemetry: false,
    rememberScrollPosition: true,
    rememberRecentDocuments: false
  }
};

export function mergeSettings(value: Partial<ExtensionSettings> | undefined): ExtensionSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...(value ?? {}),
    exportDefaults: {
      ...DEFAULT_SETTINGS.exportDefaults,
      ...(value?.exportDefaults ?? {})
    },
    privacy: {
      ...DEFAULT_SETTINGS.privacy,
      ...(value?.privacy ?? {}),
      telemetry: false
    },
    allowDomains: Array.isArray(value?.allowDomains) ? value.allowDomains : DEFAULT_SETTINGS.allowDomains,
    blockDomains: Array.isArray(value?.blockDomains) ? value.blockDomains : DEFAULT_SETTINGS.blockDomains
  };
}

export function resolveLocale(preference: LocalePreference): "en-US" | "zh-CN" {
  if (preference === "zh-CN" || preference === "en-US") {
    return preference;
  }
  return navigator.language.toLowerCase().startsWith("zh") ? "zh-CN" : "en-US";
}
