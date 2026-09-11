import { createDecipheriv, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync } from "node:crypto";
import { requestWebProxyControl } from "./control";
const parseUrl = (value, base?) => new URL(value, base);

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
  const url = value instanceof URL ? value : parseUrl(value);
  if (!["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password)
    throw new Error("Website origin 无效");
  return url.origin.toLowerCase();
}

export function exactWebOrigin(value) {
  if (
    typeof value !== "string" ||
    value.length > 512 ||
    /[\s\\%*?#@\u0080-\uffff]/.test(value) ||
    !/^https?:\/\/[^/]+\/?$/i.test(value)
  )
    throw new Error("脚本 origin 请填写完整的 HTTP/HTTPS origin，不支持路径或通配符");
  const url = parseUrl(value);
  if (url.pathname !== "/" || url.hostname.endsWith(".") || url.port === "0") throw new Error("Website origin 无效");
  return normalizedWebOrigin(value);
}

export function validateWebScript(value, origin) {
  if (!Array.isArray(value) || !value.length || value.length > 128) throw new Error("登录脚本需要 1 至 128 个步骤");
  const steps = value
    .map((item) => {
      if (!item || typeof item !== "object" || !Number.isSafeInteger(item.step) || item.step < 1)
        throw new Error("登录脚本步骤编号无效");
      const step = {
        ...item,
        origin: item.origin ? exactWebOrigin(item.origin) : origin,
        target: item.target ?? "",
        value: item.value ?? ""
      };
      if (
        typeof step.target !== "string" ||
        step.target.length > 1024 ||
        typeof step.value !== "string" ||
        step.value.length > 4096
      )
        throw new Error("登录脚本步骤内容无效");
      if (step.timeout !== undefined && (!Number.isInteger(step.timeout) || step.timeout < 1 || step.timeout > 180))
        throw new Error("步骤超时应为 1 至 180 秒");
      if (step.optional !== undefined && (step.command !== "interactive" || typeof step.optional !== "boolean"))
        throw new Error("optional 仅支持 interactive 步骤，且必须是布尔值");
      if (/\{USERNAME\}|\{SECRET\}/.test(step.value) && step.command !== "type")
        throw new Error(`第 ${step.step} 步不允许填写凭据`);
      if (["type", "click", "button", "check", "code", "interactive", "success"].includes(step.command))
        validateWebSelector(step.target);
      else if (step.command === "open") {
        const url = parseUrl(step.value || step.target, `${step.origin}/`);
        normalizedWebOrigin(url);
        step.url = url.toString();
      } else if (step.command === "sleep") {
        const seconds = Number(step.target);
        if (!/^\d+$/.test(step.target) || seconds < 0 || seconds > 30) throw new Error("脚本 sleep 应为 0 至 30 秒");
      } else throw new Error(`Web Proxy 不支持脚本命令 ${step.command}，当前支持同一窗口内的主页面`);
      return step;
    })
    .sort((a, b) => a.step - b.step);
  if (
    steps.some(
      (step, i) => (i > 0 && step.step === steps[i - 1].step) || (step.command === "success" && i !== steps.length - 1)
    )
  )
    throw new Error("步骤编号不能重复，success 必须是最后一步");
  return steps;
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

export async function createCredentialSession(
  proxyUrl,
  targetUrl,
  tokenId,
  tokenValue,
  configuredSuccessSelector = "",
  configuredInteractiveSelector = "",
  ticket = ""
) {
  if (!tokenId || !tokenValue || !ticket) throw new Error("Web Proxy 连接缺少认证令牌");

  const { privateKey, publicKey } = generateKeyPairSync("x25519");
  const endpoint = parseUrl(CREDENTIAL_PATH, proxyUrl);
  let response;
  try {
    response = await fetchWithTimeout(proxyUrl, endpoint.pathname, {
      method: "POST",
      headers: { "content-type": "application/json", "X-Koko-Connect-Ticket": ticket },
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
  const responseTarget = parseUrl(data.target_url);
  const targetOrigin = normalizedWebOrigin(targetUrl);
  if (normalizedWebOrigin(responseTarget) !== targetOrigin || String(data.origin).toLowerCase() !== targetOrigin) {
    throw new Error("Koko 返回的 Website origin 不匹配");
  }
  const sessionId = required(data.session_id, "Web 会话 ID");
  if (data.proxy_auth !== "connect_ticket") throw new Error("Koko 未启用 connect ticket 代理认证，请同步更新 Koko");
  const proxyAuth = { username: sessionId, password: ticket };
  const mode = data.autofill === "script" ? "script" : "basic";
  const steps = mode === "script" ? validateWebScript(data.script, targetOrigin) : null;
  if (!data.autofill_available) return { sessionId, proxyAuth, autofillAvailable: false, mode, origin: targetOrigin };
  const credentialOrigins = steps
    ? [
        ...new Set(
          steps
            .filter((step) => step.command === "type" && /\{USERNAME\}|\{SECRET\}/.test(step.value))
            .map((step) => step.origin)
        )
      ]
    : [targetOrigin];

  const usernameSelector = data.username_selector || "";
  if (usernameSelector) validateWebSelector(usernameSelector);
  const passwordSelector =
    mode === "script" ? "" : validateWebSelector(required(data.password_selector, "密码元素配置"));
  const submitSelector = mode === "script" ? "" : validateWebSelector(required(data.submit_selector, "提交元素配置"));
  const successSelector = configuredSuccessSelector || data.success_selector || "";
  if (successSelector) validateWebSelector(successSelector);
  const interactiveSelector = configuredInteractiveSelector || data.interactive_selector || "";
  if (interactiveSelector) {
    validateWebSelector(interactiveSelector);
  }
  const serverPublicKey = Buffer.from(required(data.server_public_key, "Web 公钥"), "base64");
  if (
    serverPublicKey.length !== X25519_SPKI_PREFIX.length + 32 ||
    !serverPublicKey.subarray(0, X25519_SPKI_PREFIX.length).equals(X25519_SPKI_PREFIX)
  ) {
    throw new Error("Koko Web 公钥格式无效");
  }

  return {
    sessionId,
    proxyAuth,
    autofillAvailable: true,
    id: required(data.id, "代填会话 ID"),
    accessToken: required(data.access_token, "代填访问令牌"),
    endpoint,
    origin: targetOrigin,
    mode,
    steps,
    credentialOrigins,
    selectors: {
      username: usernameSelector,
      password: passwordSelector,
      submit: submitSelector,
      success: successSelector,
      interactive: interactiveSelector
    },
    serverPublicKey,
    privateKey
  };
}

export async function closeWebProxySession(proxyUrl, sessionId, proxyAuth) {
  const response = await fetchWithTimeout(proxyUrl, `${CREDENTIAL_PATH}${encodeURIComponent(sessionId)}`, {
    method: "DELETE",
    proxyAuth
  });
  if (!response.ok && response.status !== 407) throw await responseError(response, "关闭 Web 代理会话失败");
}

export async function heartbeatWebProxySession(proxyUrl, sessionId, proxyAuth) {
  const response = await fetchWithTimeout(proxyUrl, `${CREDENTIAL_PATH}${encodeURIComponent(sessionId)}/heartbeat`, {
    method: "POST",
    proxyAuth
  });
  if (!response.ok) throw await responseError(response, "Web 代理会话心跳失败");
}

export async function releaseCredentials(session, currentUrl) {
  const currentOrigin = normalizedWebOrigin(currentUrl);
  if (!session.credentialOrigins.includes(currentOrigin)) throw new Error("当前页面与脚本指定的凭据填写域不匹配");
  if (session.release) return session.release();
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
      body: JSON.stringify({ origin: currentOrigin })
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
  const decipher = createDecipheriv("aes-256-gcm", key, nonce, { authTagLength: 16 });
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

export const selectorLookupScript = `
const findElement = (selector) => {
  if (!selector) return null;
  const separator = selector.indexOf("=");
  const kind = selector.slice(0, separator).trim().toLowerCase();
  const value = selector.slice(separator + 1).trim();
  if (kind === "id") return document.getElementById(value);
  if (kind === "name") return document.getElementsByName(value)[0];
  if (kind === "type") return document.querySelector('[type="' + CSS.escape(value) + '"]');
  if (kind === "class_name") return document.getElementsByClassName(value)[0];
  if (kind === "css" || kind === "css_selector") return document.querySelector(value);
  if (kind === "xpath") return document.evaluate(value, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
};`;

export const submitElementScript = `
const submitElement = (submit) => {
  if (!(submit instanceof HTMLElement) || !submit.isConnected || submit.disabled) return false;
  const form = submit.closest("form");
  if (form instanceof HTMLFormElement && !form.reportValidity()) return false;
  if (submit instanceof HTMLAnchorElement && form instanceof HTMLFormElement) form.requestSubmit();
  else submit.click();
  return true;
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
  const submitReady = (submit instanceof HTMLButtonElement || submit instanceof HTMLAnchorElement || (submit instanceof HTMLInputElement && ["submit", "button"].includes(submit.type))) && (selectors.interactive || (!submit.disabled && visible(submit)));
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
    submitSelector: selectors.submit,
    successSelector: selectors.success,
    interactiveSelector: selectors.interactive
  };
  return `(() => {
${selectorLookupScript}
${submitElementScript}
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
if (!payload.interactiveSelector) document.documentElement.appendChild(overlay);
let internalAction = false;
const blockedEvents = ["pointerdown", "pointerup", "mousedown", "mouseup", "click", "dblclick", "keydown", "keyup", "keypress", "touchstart", "touchend"];
const blocker = (event) => {
  if (internalAction) return;
  event.preventDefault();
  event.stopImmediatePropagation();
};
if (!payload.interactiveSelector) for (const name of blockedEvents) document.addEventListener(name, blocker, true);
let cleanedUp = false;
const cleanup = () => {
  if (cleanedUp) return;
  cleanedUp = true;
  successObserver?.disconnect();
  for (const name of blockedEvents) document.removeEventListener(name, blocker, true);
  overlay.remove();
  if (username?.isConnected) setValue(username, "");
  if (password.isConnected) setValue(password, "");
};
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
const successObserver = !payload.interactiveSelector && payload.successSelector ? new MutationObserver(() => {
  if (findElement(payload.successSelector)) cleanup();
}) : null;
if (successObserver) {
  successObserver.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
  setTimeout(cleanup, 20000);
}
// The main process decides whether a visible verification area must precede submission.
if (payload.interactiveSelector) return true;
internalAction = true;
try {
  return submitElement(submit);
} finally {
  internalAction = false;
  if (!payload.successSelector && !payload.interactiveSelector) cleanup();
}
})()`;
}

export function buildLoginSuccessProbeScript(selector, requireVisible = false) {
  if (!selector) return "false";
  return `(() => {
${selectorLookupScript}
const element = findElement(${JSON.stringify(selector)});
return ${requireVisible ? 'element instanceof Element && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden"' : "Boolean(element)"};
})()`;
}
