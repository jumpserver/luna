import { setTimeout as delay } from "node:timers/promises";
import { normalizedWebOrigin, releaseCredentials, selectorLookupScript } from "./credentials";
import { INTERACTION_WORLD, WebProxyInteraction } from "./interaction";

const documentSetup = `
const scriptDocument = globalThis.__jmsScriptDocument ||= globalThis.crypto?.randomUUID?.() || String(Date.now()) + Math.random();
const protectedFields = globalThis.__jmsScriptCredentials ||= new Set();
if (!globalThis.__jmsScriptCleanup) {
  globalThis.__jmsScriptCleanup = () => {
    for (const element of protectedFields) {
      const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, '');
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return [...protectedFields].every(element => !element.isConnected || element.value === '');
  };
  // Clear old documents too, including pages retained in Chromium's history cache.
  addEventListener('pagehide', globalThis.__jmsScriptCleanup, true);
}
`;

function probeScript(step) {
  return `(() => {
if (location.origin.toLowerCase() !== ${JSON.stringify(step.origin)} || document.readyState === 'loading') return null;
${selectorLookupScript}
${documentSetup}
const element = findElement(${JSON.stringify(step.target)});
if (!(element instanceof Element) || !element.isConnected || !element.getClientRects().length || getComputedStyle(element).visibility !== 'visible') return null;
const command = ${JSON.stringify(step.command)};
if (['click','button'].includes(command) && !(element instanceof HTMLElement)) return null;
if (command === 'type' && !((element instanceof HTMLInputElement && ['text','email','tel','password','search','url','number'].includes(element.type)) || element instanceof HTMLTextAreaElement)) return null;
if (['type','click','button'].includes(command) && (element.disabled || element.getAttribute('aria-disabled') === 'true')) return null;
if (command === 'type' && element.readOnly) return null;
return scriptDocument;
})()`;
}

function actionScript(step, documentId, value) {
  return `(() => {
if (location.origin.toLowerCase() !== ${JSON.stringify(step.origin)} || globalThis.__jmsScriptDocument !== ${JSON.stringify(documentId)}) return false;
${selectorLookupScript}
const element = findElement(${JSON.stringify(step.target)});
if (!(element instanceof HTMLElement) || !element.isConnected || !element.getClientRects().length || element.disabled || element.getAttribute('aria-disabled') === 'true') return false;
if (${JSON.stringify(step.command)} === 'type') {
  if (!((element instanceof HTMLInputElement && ['text','email','tel','password','search','url','number'].includes(element.type)) || element instanceof HTMLTextAreaElement) || element.readOnly) return false;
  globalThis.__jmsScriptCredentials.add(element);
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, element.value + ${JSON.stringify(value)});
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
} else {
  element.click();
}
return true;
})()`;
}

// A runner belongs to the native session, so document replacements never reset
// its step index or cause a completed click/credential release to be replayed.
export class WebProxyScript {
  private controller = new AbortController();
  private credentials: { username: string; password: string } | null = null;
  private interaction: WebProxyInteraction | null = null;
  private verificationReady = false;
  private verificationDone = false;
  private completing = false;
  private navigation = 0;

  constructor(
    private contents,
    private session,
    private hooks: {
      active: () => boolean;
      state: (status: string, message: string) => void;
      interaction: (interaction: WebProxyInteraction | null, ready: boolean) => void;
      frame: (frame) => void;
    }
  ) {}

  private navigated = (event) => {
    if (event.isMainFrame) {
      this.navigation += 1;
      this.interaction?.invalidate();
    }
  };

  private assertRunning() {
    if (this.controller.signal.aborted) throw this.controller.signal.reason;
    if (this.contents.isDestroyed()) throw new Error("Web Proxy 页面已关闭");
  }

  private async runCode(code) {
    this.assertRunning();
    const signal = this.controller.signal;
    return new Promise((resolve, reject) => {
      const aborted = () => reject(signal.reason);
      signal.addEventListener("abort", aborted, { once: true });
      this.contents
        .executeJavaScriptInIsolatedWorld(INTERACTION_WORLD, [{ code }])
        .then(resolve, reject)
        .finally(() => signal.removeEventListener("abort", aborted));
    });
  }

  private onOrigin(origin) {
    try {
      return normalizedWebOrigin(this.contents.getURL()) === origin;
    } catch {
      return false;
    }
  }

  private async pause(ms = 100) {
    try {
      await delay(ms, undefined, { signal: this.controller.signal });
    } catch {
      this.assertRunning();
    }
    this.assertRunning();
  }

  private async waitFor(step, read, timeout = (step.timeout || 20) * 1000) {
    const deadline = Date.now() + timeout;
    const timedOut = new Error(`登录脚本第 ${step.step} 步（${step.command}）超时`);
    const timer = setTimeout(() => this.cancel(timedOut), timeout);
    try {
      while (Date.now() < deadline) {
        this.assertRunning();
        if (this.onOrigin(step.origin)) {
          let result;
          try {
            result = await read();
          } catch {
            this.assertRunning();
          }
          this.assertRunning();
          if (result) return result;
        }
        await this.pause();
      }
      throw timedOut;
    } finally {
      clearTimeout(timer);
    }
  }

  private async fillOrClick(step) {
    const documentId = await this.waitFor(step, () => this.runCode(probeScript(step)));
    const sensitive = /\{USERNAME\}|\{SECRET\}/.test(step.value);
    if (sensitive && !this.credentials) {
      this.credentials = await releaseCredentials(this.session, this.contents.getURL());
      this.assertRunning();
    }
    // Recheck after a potentially slow network release. Never deliver a value to
    // another document that happened to reuse the same field id.
    const currentDocument = await this.waitFor(step, () => this.runCode(probeScript(step)));
    if (currentDocument !== documentId) throw new Error(`第 ${step.step} 步代填前页面已变化，请重新连接`);
    let value = step.value.replace(/\{USERNAME\}|\{SECRET\}/g, (key) =>
      key === "{USERNAME}" ? this.credentials?.username || "" : this.credentials?.password || ""
    );
    const navigation = this.navigation;
    try {
      const done = await this.runCode(actionScript(step, documentId, value));
      if (!done) throw new Error(`第 ${step.step} 步执行前元素已变化，请重新连接`);
    } catch (error) {
      this.assertRunning();
      // Navigation can destroy the reply after the input/click was delivered.
      // Continue to the next condition; an ambiguous action is never replayed.
      if (this.navigation === navigation) throw error;
    } finally {
      value = "";
    }
  }

  private async verify(step) {
    await this.waitFor(step, () => this.runCode(probeScript(step)));
    this.verificationReady = false;
    this.verificationDone = false;
    const interaction = new WebProxyInteraction(
      this.contents,
      { username: "", password: "", submit: "", interactive: step.target },
      step.origin,
      this.hooks.active,
      this.hooks.frame,
      () => {
        if (this.controller.signal.aborted || this.verificationDone || this.verificationReady) return;
        this.verificationReady = true;
        this.hooks.interaction(interaction, true);
        this.hooks.state("interactive", `第 ${step.step} 步：请完成验证，然后继续脚本`);
      }
    );
    this.interaction = interaction;
    this.hooks.interaction(interaction, false);
    try {
      const deadline = Date.now() + (step.timeout || 180) * 1000;
      while (!this.verificationDone) {
        if (Date.now() >= deadline) throw new Error(`第 ${step.step} 步人工验证超时`);
        await this.pause();
      }
    } finally {
      await interaction.dispose();
      this.interaction = null;
      this.hooks.interaction(null, false);
    }
  }

  async completeVerification() {
    if (
      this.completing ||
      !this.interaction ||
      !this.verificationReady ||
      !this.hooks.active() ||
      this.controller.signal.aborted
    )
      return false;
    this.completing = true;
    try {
      await this.interaction.dispose();
      this.assertRunning();
      // Values must remain present for the following script submit step.
      this.verificationDone = true;
      return true;
    } finally {
      this.completing = false;
    }
  }

  cancel(reason = new Error("登录脚本已结束")) {
    if (!this.controller.signal.aborted) this.controller.abort(reason);
    if (this.credentials) {
      this.credentials.username = "";
      this.credentials.password = "";
    }
    this.credentials = null;
    this.session.accessToken = "";
    void this.interaction?.dispose();
  }

  async run() {
    const timer = setTimeout(() => this.cancel(new Error("登录脚本总耗时超过 10 分钟")), 600_000);
    this.contents.on("did-start-navigation", this.navigated);
    try {
      const finalStep = this.session.steps.at(-1);
      if (finalStep.command === "success" && this.onOrigin(finalStep.origin)) {
        const authenticated = await this.runCode(probeScript(finalStep)).catch(() => null);
        this.assertRunning();
        if (authenticated && (await this.runCode("globalThis.__jmsScriptCleanup?.() ?? true"))) return "success";
      }
      for (const step of this.session.steps) {
        this.assertRunning();
        this.hooks.state("filling", `正在执行登录脚本第 ${step.step} 步（${step.command}）`);
        switch (step.command) {
          case "open":
            // Script URLs are validated as HTTP(S) before the runner starts.
            await this.contents.loadURL(step.url);
            break;
          case "sleep":
            await this.pause(Number(step.target) * 1000);
            break;
          case "type":
          case "click":
          case "button":
            await this.fillOrClick(step);
            break;
          case "interactive":
          case "code":
            await this.verify(step);
            break;
          case "check":
          case "success":
            await this.waitFor(step, () => this.runCode(probeScript(step)));
            break;
        }
      }
      this.assertRunning();
      const cleaned = await this.runCode("globalThis.__jmsScriptCleanup?.() ?? true");
      if (!cleaned) throw new Error("登录脚本完成后未能清理凭据");
      return finalStep.command === "success" ? "success" : "submitted";
    } finally {
      clearTimeout(timer);
      this.contents.removeListener("did-start-navigation", this.navigated);
      this.cancel();
      await this.interaction?.dispose();
    }
  }
}

export function installWebProxyNavigationGuard(contents, blocked) {
  const guard = (event) => {
    if (!event.isMainFrame) return;
    try {
      normalizedWebOrigin(event.url);
    } catch {
      event.preventDefault();
      blocked("页面跳转地址无效");
    }
  };
  contents.on("will-navigate", guard);
  contents.on("will-redirect", guard);
}
