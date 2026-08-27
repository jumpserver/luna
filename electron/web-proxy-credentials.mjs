import { createDecipheriv, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync } from "node:crypto";
import { requestWebProxyControl } from "./web-proxy-control.mjs";

const CREDENTIAL_PATH = "/_jumpserver/web-sessions/";
const CREDENTIAL_KDF_INFO = Buffer.from("jumpserver-web-autofill-v1");
const X25519_SPKI_PREFIX = Buffer.from([0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x6e, 0x03, 0x21, 0x00]);
const SUPPORTED_SELECTOR_KINDS = new Set(["name", "id", "type", "class_name", "css", "css_selector", "xpath"]);

async function fetchWithTimeout(proxyUrl, path, options, timeout = 15_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await requestWebProxyControl(proxyUrl, path, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function required(value, field) {
  if (typeof value !== "string" || !value) throw new Error(`Koko 返回的${field}为空`);
  return value;
}

async function responseError(response, action) {
  const detail = (await response.text()).trim();
  return new Error(`${action}: ${detail || `HTTP ${response.status}`}`);
}

export function normalizedWebOrigin(value) {
  const url = value instanceof URL ? value : new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || !url.hostname) throw new Error("Website origin 无效");
  return url.origin.toLowerCase();
}

export function validateWebSelector(selector) {
  if (typeof selector !== "string" || !selector || selector.length > 1024) {
    throw new Error("Website 代填元素配置无效");
  }
  const separator = selector.indexOf("=");
  const kind = selector.slice(0, separator).trim().toLowerCase();
  const value = selector.slice(separator + 1).trim();
  if (separator < 1 || !value || !SUPPORTED_SELECTOR_KINDS.has(kind)) {
    throw new Error("Website 代填元素配置无效");
  }
  return selector;
}

export async function createCredentialSession(proxyUrl, targetUrl, tokenId, tokenValue) {
  if (!tokenId || !tokenValue) return null;

  const { privateKey, publicKey } = generateKeyPairSync("x25519");
  const endpoint = new URL(CREDENTIAL_PATH, proxyUrl);
  let response;
  try {
    response = await fetchWithTimeout(proxyUrl, endpoint.pathname, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token_id: tokenId,
        token_value: tokenValue,
        client_public_key: publicKey.export({ type: "spki", format: "der" }).toString("base64")
      })
    });
  } catch (error) {
    throw new Error(`创建 Web 代填会话失败: ${error}`);
  }
  if (!response.ok) throw await responseError(response, "创建 Web 代填会话失败");

  let data;
  try {
    data = await response.json();
  } catch (error) {
    throw new Error(`解析 Web 代填会话失败: ${error}`);
  }
  const responseTarget = new URL(data.target_url);
  const targetOrigin = normalizedWebOrigin(targetUrl);
  if (normalizedWebOrigin(responseTarget) !== targetOrigin || String(data.origin).toLowerCase() !== targetOrigin) {
    throw new Error("Koko 返回的 Website origin 不匹配");
  }
  if (!data.autofill_available) return null;

  const usernameSelector = data.username_selector || "";
  if (usernameSelector) validateWebSelector(usernameSelector);
  const passwordSelector = validateWebSelector(required(data.password_selector, "密码元素配置"));
  const submitSelector = validateWebSelector(required(data.submit_selector, "提交元素配置"));
  const serverPublicKey = Buffer.from(required(data.server_public_key, "Web 公钥"), "base64");
  if (
    serverPublicKey.length !== X25519_SPKI_PREFIX.length + 32 ||
    !serverPublicKey.subarray(0, X25519_SPKI_PREFIX.length).equals(X25519_SPKI_PREFIX)
  ) {
    throw new Error("Koko Web 公钥格式无效");
  }

  return {
    id: required(data.id, "代填会话 ID"),
    accessToken: required(data.access_token, "代填访问令牌"),
    endpoint,
    origin: targetOrigin,
    selectors: { username: usernameSelector, password: passwordSelector, submit: submitSelector },
    serverPublicKey,
    privateKey
  };
}

export async function releaseCredentials(session, currentUrl) {
  if (normalizedWebOrigin(currentUrl) !== session.origin) throw new Error("页面 origin 与代填会话不匹配");
  const url = new URL(`${encodeURIComponent(session.id)}/credentials`, session.endpoint);
  const accessToken = session.accessToken;
  session.accessToken = "";
  let response;
  try {
    response = await fetchWithTimeout(session.endpoint, url.pathname, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ origin: session.origin })
    });
  } catch (error) {
    throw new Error(`领取 Web 凭据失败: ${error}`);
  }
  if (!response.ok) throw await responseError(response, "领取 Web 凭据失败");

  let released;
  try {
    released = await response.json();
  } catch (error) {
    throw new Error(`解析 Web 凭据失败: ${error}`);
  }
  const nonce = Buffer.from(String(released.nonce || ""), "base64");
  const ciphertext = Buffer.from(String(released.ciphertext || ""), "base64");
  if (nonce.length !== 12 || ciphertext.length <= 16) throw new Error("Web 凭据密文格式无效");

  const serverKey = createPublicKey({ key: session.serverPublicKey, type: "spki", format: "der" });
  const sharedSecret = diffieHellman({ privateKey: session.privateKey, publicKey: serverKey });
  const key = Buffer.from(hkdfSync("sha256", sharedSecret, Buffer.alloc(0), CREDENTIAL_KDF_INFO, 32));
  sharedSecret.fill(0);
  const tagOffset = ciphertext.length - 16;
  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAAD(Buffer.from(`${session.id}\n${session.origin}`));
  decipher.setAuthTag(ciphertext.subarray(tagOffset));
  let plaintext;
  try {
    plaintext = Buffer.concat([decipher.update(ciphertext.subarray(0, tagOffset)), decipher.final()]);
  } catch {
    throw new Error("Web 凭据校验失败");
  } finally {
    key.fill(0);
  }
  try {
    const credentials = JSON.parse(plaintext.toString("utf8"));
    if (typeof credentials.username !== "string" || typeof credentials.password !== "string") {
      throw new Error("invalid credential fields");
    }
    return credentials;
  } catch {
    throw new Error("Web 凭据内容无效");
  } finally {
    plaintext.fill(0);
  }
}

const selectorLookupScript = `
const findElement = (selector) => {
  const separator = selector.indexOf("=");
  const kind = selector.slice(0, separator).trim().toLowerCase();
  const value = selector.slice(separator + 1);
  if (kind === "id") return document.getElementById(value);
  if (kind === "name") return document.getElementsByName(value)[0];
  if (kind === "type") return document.querySelector('[type="' + CSS.escape(value) + '"]');
  if (kind === "class_name") return document.getElementsByClassName(value)[0];
  if (kind === "css" || kind === "css_selector") return document.querySelector(value);
  if (kind === "xpath") return document.evaluate(value, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
};`;

export function buildAutofillProbeScript(selectors) {
  return `(() => new Promise((resolve) => {
${selectorLookupScript}
const selectors = ${JSON.stringify(selectors)};
const visible = (element) => {
  if (!(element instanceof Element) || !element.isConnected || element.getClientRects().length === 0) return false;
  const style = getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden";
};
const elementsReady = () => {
  if (document.readyState !== "complete") return false;
  const username = selectors.username ? findElement(selectors.username) : null;
  const password = findElement(selectors.password);
  const submit = findElement(selectors.submit);
  const usernameReady = !selectors.username || (username instanceof HTMLInputElement && ["text", "email", "tel"].includes(username.type) && !username.disabled && visible(username));
  const passwordReady = password instanceof HTMLInputElement && password.type === "password" && !password.disabled && visible(password);
  const submitReady = ((submit instanceof HTMLButtonElement && !submit.disabled) || submit instanceof HTMLAnchorElement || (submit instanceof HTMLInputElement && ["submit", "button"].includes(submit.type) && !submit.disabled)) && visible(submit);
  return usernameReady && passwordReady && submitReady;
};
let readySince = 0;
let finished = false;
const finish = (ready) => {
  if (finished) return;
  finished = true;
  observer.disconnect();
  clearInterval(interval);
  clearTimeout(timeout);
  resolve(ready);
};
const check = () => {
  if (!elementsReady()) { readySince = 0; return; }
  if (!readySince) readySince = performance.now();
  if (performance.now() - readySince >= 300) finish(true);
};
const observer = new MutationObserver(check);
observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
const interval = setInterval(check, 50);
const timeout = setTimeout(() => finish(false), 15000);
check();
}))()`;
}

export function buildAutofillScript(selectors, credentials) {
  const payload = {
    usernameValue: credentials.username,
    passwordValue: credentials.password,
    usernameSelector: selectors.username,
    passwordSelector: selectors.password,
    submitSelector: selectors.submit
  };
  return `(() => {
${selectorLookupScript}
let payload = ${JSON.stringify(payload)};
const username = payload.usernameSelector ? findElement(payload.usernameSelector) : null;
const password = findElement(payload.passwordSelector);
const submit = findElement(payload.submitSelector);
if ((payload.usernameSelector && !(username instanceof HTMLInputElement)) || !(password instanceof HTMLInputElement) || !submit) {
  payload.usernameValue = "";
  payload.passwordValue = "";
  return false;
}
const overlay = document.createElement("div");
overlay.setAttribute("data-jms-secure-login", "true");
Object.assign(overlay.style, { position: "fixed", inset: "0", zIndex: "2147483647", cursor: "wait", background: "transparent" });
document.documentElement.appendChild(overlay);
let internalAction = false;
const blockedEvents = ["pointerdown", "pointerup", "mousedown", "mouseup", "click", "dblclick", "keydown", "keyup", "keypress", "touchstart", "touchend"];
const blocker = (event) => {
  if (internalAction) return;
  event.preventDefault();
  event.stopImmediatePropagation();
};
for (const name of blockedEvents) document.addEventListener(name, blocker, true);
const setValue = (element, value) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
  setter.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
};
if (username) setValue(username, payload.usernameValue);
setValue(password, payload.passwordValue);
payload.usernameValue = "";
payload.passwordValue = "";
setTimeout(() => {
  for (const name of blockedEvents) document.removeEventListener(name, blocker, true);
  overlay.remove();
  if (!password.isConnected) return;
  if (username?.isConnected) setValue(username, "");
  setValue(password, "");
}, 20000);
internalAction = true;
try {
  const form = submit.closest("form");
  if (submit instanceof HTMLAnchorElement && form instanceof HTMLFormElement) {
    if (typeof form.requestSubmit === "function") form.requestSubmit();
    else form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  } else {
    submit.click();
  }
} finally {
  internalAction = false;
}
return true;
})()`;
}
