function callbackParameters(rawUrl: unknown) {
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
    /^(?:jms2:\/\/auth\/callback|jms2:\/\/\/auth\/callback|jms2:auth\/callback|http:\/\/127\.0\.0\.1:14876\/auth\/callback)\/?(?:\?([^#]*))?(?:#.*)?$/i
  );
  if (!match) return null;

  // Some JumpServer confirmation pages HTML-escape the URL inside JavaScript.
  // Restore separators before URL decoding so encoded entities in values stay intact.
  return new URLSearchParams((match[1] || "").replace(/&amp;/g, "&"));
}

export function isOAuthCallbackUrl(rawUrl: unknown) {
  return callbackParameters(rawUrl) !== null;
}

export function parseOAuthCallback(rawUrl: unknown) {
  const params = callbackParameters(rawUrl);
  if (!params) return null;
  if (["code", "state", "error"].some((name) => params.getAll(name).length > 1)) return null;
  const error = params.get("error");
  if (error) return { error, state: params.get("state") };
  const code = params.get("code");
  if (!code) return null;
  return { code, state: params.get("state") };
}
