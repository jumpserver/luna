export function parseOAuthCallback(rawUrl) {
  let value = String(rawUrl || "").trim();
  if (!value) return null;
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  try {
    if (!/^[a-z][a-z0-9+.-]*:/i.test(value) && /%[0-9A-F]{2}/i.test(value)) {
      value = decodeURIComponent(value);
    }
  } catch {
    // Keep the original string when it is not percent-encoded.
  }

  const match = value.match(
    /(?:jms2?:\/\/auth\/callback|jms:\/\/\/auth\/callback|jms:auth\/callback|http:\/\/127\.0\.0\.1:14876\/auth\/callback)\/?(?:\?([^#]*))?/i
  );
  if (!match) return null;

  const params = new URLSearchParams(match[1] || "");
  const code = params.get("code");
  if (!code) return null;
  return { code, state: params.get("state") };
}
