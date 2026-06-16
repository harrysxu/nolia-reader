export function getHostname(value: string): string {
  try {
    return new URL(value).hostname;
  } catch {
    return "";
  }
}

export function hostPermissionPatternForUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return `${url.origin}/*`;
    }
    if (url.protocol === "file:") {
      return "file:///*";
    }
  } catch {
    return "";
  }
  return "";
}

export function isKnownRawHost(hostname: string): boolean {
  return [
    "raw.githubusercontent.com",
    "gist.githubusercontent.com",
    "gitlab.com",
    "gitee.com",
    "bitbucket.org"
  ].some((host) => hostname === host || hostname.endsWith(`.${host}`));
}

export function resolveUrl(value: string, baseUrl: string): string {
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return value;
  }
}

export function isSafeLinkUrl(value: string): boolean {
  if (value.startsWith("#")) {
    return true;
  }
  try {
    const protocol = new URL(value).protocol;
    return ["http:", "https:", "mailto:", "tel:"].includes(protocol);
  } catch {
    return false;
  }
}

export function isSafeImageUrl(value: string): boolean {
  if (/^data:image\//i.test(value)) {
    return true;
  }
  try {
    const protocol = new URL(value).protocol;
    return ["http:", "https:", "blob:"].includes(protocol);
  } catch {
    return false;
  }
}
