/** Keep structured API errors intact, but never put an HTML error page in an exception. */
export function compactApiErrorBody(body: string, contentType = ""): string {
  let text = body.trim();
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed !== "string") return body;
    text = parsed;
  } catch {
    // Non-JSON error responses are summarized below.
  }

  const html = /\b(?:text\/html|application\/xhtml\+xml)\b/i.test(contentType) || /<\/?[a-z][^>]*>/i.test(text);
  if (html) {
    const heading =
      text.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i) || text.match(/<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/i);
    text = (heading?.[1] || "").replace(/<[^>]*>/g, " ");
    text = text.replace(
      /&(?:amp|lt|gt|quot|apos|#39|nbsp);/g,
      (entity) =>
        ({
          "&amp;": "&",
          "&lt;": "<",
          "&gt;": ">",
          "&quot;": '"',
          "&apos;": "'",
          "&#39;": "'",
          "&nbsp;": " "
        })[entity] || entity
    );
    text = `HTML response omitted${text.trim() ? `: ${text}` : ""}`;
  }

  text = text.replace(/\s+/g, " ").trim();
  return text.length > 500 ? `${text.slice(0, 499)}…` : text;
}
