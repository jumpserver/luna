import { selectorLookupScript, submitElementScript, normalizedWebOrigin } from "./credentials";

// Only this isolated world owns the input guard. The target's main world cannot
// change its allowlist or call its methods. No credentials are passed here.
export const INTERACTION_WORLD = 1007;
let interactionRevision = 0;

export function buildInteractionGuardScript(selectors, origin, enabled = true) {
  return `(() => {
${selectorLookupScript}
${submitElementScript}
if (globalThis.__jmsVerification) {
  if (${JSON.stringify(enabled)}) globalThis.__jmsVerification.activate();
  return;
}
const selectors = ${JSON.stringify(selectors)};
const origin = ${JSON.stringify(origin)};
const documentId = globalThis.crypto?.randomUUID?.() || String(Date.now()) + Math.random();
let disposed = false;
let enabled = ${JSON.stringify(enabled)};
let pressed = null;
let pointerPosition = null;
let internalAction = false;
let loginSettledAt = 0;
const visible = (el) => el instanceof Element && el.isConnected && el.getClientRects().length > 0 && getComputedStyle(el).visibility === 'visible' && getComputedStyle(el).display !== 'none';
const intersects = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
const originalCredentials = [selectors.username ? findElement(selectors.username) : null, findElement(selectors.password)];
const protectedElements = () => [
  ...(globalThis.__jmsScriptCredentials || []),
  ...originalCredentials,
  selectors.username ? findElement(selectors.username) : null,
  findElement(selectors.password),
  ...document.querySelectorAll('input[type=password], input[autocomplete=current-password], input[autocomplete=new-password]')
].filter(el => el instanceof Element);
const area = () => {
  if (disposed || !enabled || location.origin.toLowerCase() !== origin) return null;
  const root = findElement(selectors.interactive);
  if (!visible(root) || root === document.body || root === document.documentElement) return null;
  // ponytail: same-document verification only. Iframes and shadow-root widgets
  // need frame-specific guards before their input can be safely enabled.
  if (root.matches('iframe, frame, object, embed') || root.querySelector('iframe, frame, object, embed') || root.shadowRoot || [...root.querySelectorAll('*')].some(el => el.shadowRoot)) return null;
  const rect = root.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2 || rect.left < 0 || rect.top < 0 || rect.right > innerWidth || rect.bottom > innerHeight) return null;
  if (protectedElements().some(el => root.contains(el) || el.contains(root) || (visible(el) && intersects(rect, el.getBoundingClientRect())))) return null;
  return { root, rect };
};
const permitted = (target, region = area()) => region && target instanceof Element && region.root.contains(target) && !protectedElements().some(el => el === target || el.contains(target));
const editable = (el) => permitted(el) && ((el instanceof HTMLInputElement && ['text', 'tel', 'number', 'email', 'search'].includes(el.type)) || el instanceof HTMLTextAreaElement) && !el.disabled && !el.readOnly;
const atPoint = (x, y) => {
  const region = area();
  if (!region || x < region.rect.left || x >= region.rect.right || y < region.rect.top || y >= region.rect.bottom) return null;
  const target = document.elementFromPoint(x, y);
  return permitted(target, region) ? target : null;
};
// Only transfer cursor keywords; page-provided cursor URLs must not be loaded by the client UI.
const cursorKeywords = new Set(['default', 'pointer', 'text', 'vertical-text', 'crosshair', 'move', 'grab', 'grabbing', 'not-allowed', 'no-drop', 'wait', 'progress', 'help', 'cell', 'copy', 'alias', 'all-scroll', 'col-resize', 'row-resize', 'n-resize', 'e-resize', 's-resize', 'w-resize', 'ne-resize', 'nw-resize', 'se-resize', 'sw-resize', 'ew-resize', 'ns-resize', 'nesw-resize', 'nwse-resize', 'zoom-in', 'zoom-out']);
const cursor = () => {
  const target = pointerPosition && atPoint(pointerPosition.x, pointerPosition.y);
  if (!target) return 'default';
  const value = getComputedStyle(target).cursor;
  if (value !== 'default' && cursorKeywords.has(value)) return value;
  if (target.closest(':disabled, [aria-disabled="true"]')) return 'not-allowed';
  if (editable(target)) return 'text';
  if (target.closest('button, a[href], [role="button"], input[type="button"], input[type="submit"]')) return 'pointer';
  return 'default';
};
const stop = event => { if (!enabled || internalAction) return; event.preventDefault(); event.stopImmediatePropagation(); };
const pointer = event => {
  if (!permitted(event.target) || !atPoint(event.clientX, event.clientY)) stop(event);
};
const keyboard = event => {
  if (!permitted(event.target) || event.ctrlKey || event.metaKey || event.altKey || event.key === 'Tab') stop(event);
};
const input = event => { if (!editable(event.target)) stop(event); };
const focus = event => {
  if (enabled && !permitted(event.target)) {
    stop(event);
    event.target?.blur?.();
  }
};
const pointerEvents = ['pointerdown', 'pointermove', 'pointerup', 'mousedown', 'mousemove', 'mouseup', 'click', 'dblclick', 'wheel', 'touchstart', 'touchmove', 'touchend'];
const keyboardEvents = ['keydown', 'keyup', 'keypress'];
const deniedEvents = ['copy', 'cut', 'paste', 'contextmenu', 'dragstart', 'dragover', 'drop', 'selectstart'];
for (const name of pointerEvents) window.addEventListener(name, pointer, true);
for (const name of keyboardEvents) window.addEventListener(name, keyboard, true);
for (const name of deniedEvents) window.addEventListener(name, stop, true);
window.addEventListener('beforeinput', input, true);
window.addEventListener('focusin', focus, true);
const snapshot = () => {
  const region = area();
  if (!region) return null;
  const { left, top, right, bottom } = region.rect;
  // Round inward: no pixel outside the configured verification area is sent.
  const x = Math.ceil(left), y = Math.ceil(top);
  return { documentId, x, y, width: Math.floor(right) - x, height: Math.floor(bottom) - y };
};
globalThis.__jmsVerification = {
  activate() { enabled = true; },
  snapshot,
  advanceLogin(shouldSubmit) {
    if (disposed || location.origin.toLowerCase() !== origin) return 'waiting';
    if (visible(findElement(selectors.interactive))) { loginSettledAt = 0; return 'interactive'; }
    if (shouldSubmit) return this.submit() ? 'submitted' : 'waiting';
    // ponytail: without a success selector, infer completion from the login form
    // staying gone for 500 ms. Sites retaining it need an explicit success selector.
    if (document.readyState !== 'complete' || visible(findElement(selectors.password)) || visible(findElement(selectors.submit))) {
      loginSettledAt = 0;
      return 'waiting';
    }
    if (!loginSettledAt) loginSettledAt = Date.now();
    return Date.now() - loginSettledAt >= 500 ? 'complete' : 'waiting';
  },
  submit() {
    if (disposed || location.origin.toLowerCase() !== origin) return false;
    internalAction = true;
    try { return submitElement(findElement(selectors.submit)); }
    finally { internalAction = false; }
  },
  clearCredentials(requireNoVerification = false) {
    if (disposed || location.origin.toLowerCase() !== origin) return false;
    if (requireNoVerification && this.advanceLogin(false) !== 'complete') return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    const fields = [...new Set(protectedElements())].filter(el => el instanceof HTMLInputElement && el.isConnected);
    for (const field of fields) {
      setter.call(field, '');
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return fields.every(field => !field.isConnected || field.value === '');
  },
  describe() {
    const region = area();
    if (!region) return {};
    const focused = document.activeElement;
    return {
      cursor: cursor(),
      text: String(region.root.innerText || '').slice(0, 2048),
      editable: editable(focused),
      focusLabel: permitted(focused) ? (focused.getAttribute('aria-label') || focused.labels?.[0]?.innerText || focused.getAttribute('placeholder') || focused.innerText || '').slice(0, 256) : ''
    };
  },
  authorize(action) {
    const current = snapshot();
    if (!current || JSON.stringify(current) !== action.snapshot) return false;
    if (action.type === 'text') return editable(document.activeElement);
    if (action.type === 'key') {
      if (action.key === 'Tab') {
        const root = area().root;
        const elements = [...root.querySelectorAll('input,textarea,button,a[href],[tabindex]')].filter(el => visible(el) && permitted(el) && !el.disabled && el.tabIndex >= 0);
        if (root.matches('input,textarea,button,a[href],[tabindex]') && visible(root) && !root.disabled) elements.unshift(root);
        const index = elements.indexOf(document.activeElement);
        const nextIndex = index < 0 ? (action.shift ? elements.length - 1 : 0) : (index + (action.shift ? elements.length - 1 : 1)) % elements.length;
        const next = elements[nextIndex];
        next?.focus();
        return false;
      }
      return permitted(document.activeElement);
    }
    const target = atPoint(action.x, action.y);
    if (!target) { pressed = null; pointerPosition = null; return false; }
    pointerPosition = { x: action.x, y: action.y };
    if (action.type === 'mouseDown') pressed = target;
    if (action.type === 'mouseUp') {
      const allowed = pressed && permitted(pressed);
      pressed = null;
      return Boolean(allowed);
    }
    return true;
  },
  dispose() {
    disposed = true;
    for (const name of pointerEvents) window.removeEventListener(name, pointer, true);
    for (const name of keyboardEvents) window.removeEventListener(name, keyboard, true);
    for (const name of deniedEvents) window.removeEventListener(name, stop, true);
    window.removeEventListener('beforeinput', input, true);
    window.removeEventListener('focusin', focus, true);
    delete globalThis.__jmsVerification;
  }
};
})()`;
}

export class WebProxyInteraction {
  private timer: ReturnType<typeof setInterval>;
  private disposed = false;
  private generation = 0;
  private capturing = false;
  private snapshot = "";
  private revision = 0;
  private pressed = false;
  private queue = Promise.resolve();
  private queued = 0;
  private completing = false;
  private submitted = false;
  private autoSubmitted = false;
  private disposal: Promise<void> | null = null;

  constructor(
    private contents,
    private selectors,
    private origin: string,
    private active: () => boolean,
    private emit,
    private onReady
  ) {
    this.timer = setInterval(() => void this.capture(), 80);
    void this.capture();
  }

  private run(code: string) {
    return this.contents.executeJavaScriptInIsolatedWorld(INTERACTION_WORLD, [{ code }]);
  }

  invalidate() {
    this.generation += 1;
    this.snapshot = "";
    this.cancelPointer();
    this.emit(null);
  }

  private cancelPointer() {
    if (this.pressed && !this.contents.isDestroyed()) {
      // Release the browser's pressed state outside the viewport. The isolated
      // guard blocks delivery to page controls, so cancel cannot click a button.
      this.contents.sendInputEvent({ type: "mouseUp", x: -1, y: -1, button: "left", clickCount: 1 });
    }
    this.pressed = false;
  }

  private available(requireActive = true) {
    return (
      !this.disposed &&
      (!requireActive || this.active()) &&
      !this.contents.isDestroyed() &&
      normalizedWebOrigin(this.contents.getURL()) === this.origin
    );
  }

  async capture() {
    if (this.capturing || this.disposed || this.completing) return;
    this.capturing = true;
    const generation = this.generation;
    try {
      if (!this.available()) {
        if (this.snapshot) this.invalidate();
        return;
      }
      await this.run(buildInteractionGuardScript(this.selectors, this.origin));
      const before = await this.run("globalThis.__jmsVerification?.snapshot()");
      if (!before) {
        if (this.snapshot) this.invalidate();
        return;
      }
      const { documentId: _documentId, ...rect } = before;
      const image = await this.contents.capturePage(rect, { stayHidden: true });
      const after = await this.run("globalThis.__jmsVerification?.snapshot()");
      if (this.disposed || generation !== this.generation || !this.available()) return;
      const snapshot = JSON.stringify(before);
      if (snapshot !== JSON.stringify(after) || image.isEmpty()) {
        this.invalidate();
        return;
      }
      if (this.snapshot !== snapshot) {
        this.cancelPointer();
        this.snapshot = snapshot;
        this.revision = ++interactionRevision;
      }
      const description = await this.run("globalThis.__jmsVerification?.describe()");
      if (this.disposed || generation !== this.generation || !this.available()) return;
      this.emit({
        ...description,
        image: `data:image/jpeg;base64,${image.toJPEG(85).toString("base64")}`,
        width: rect.width,
        height: rect.height,
        revision: this.revision
      });
      this.onReady();
    } catch {
      if (!this.disposed) this.invalidate();
    } finally {
      this.capturing = false;
    }
  }

  input(action) {
    if (this.completing || !action || typeof action !== "object") return Promise.resolve(false);
    if (this.queued >= 64) {
      this.invalidate();
      return Promise.resolve(false);
    }
    // Bound IPC data before it can enter the serialized input queue.
    if (!["mouseDown", "mouseMove", "mouseUp", "cancel", "text", "key"].includes(action.type))
      return Promise.resolve(false);
    if (action.type === "text" && (typeof action.text !== "string" || action.text.length > 256))
      return Promise.resolve(false);
    if (
      action.type === "key" &&
      ![
        "Tab",
        "Enter",
        "Backspace",
        "Delete",
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "Home",
        "End",
        "Escape",
        "Space"
      ].includes(action.key)
    )
      return Promise.resolve(false);
    this.queued += 1;
    const generation = this.generation;
    const pending = this.queue
      .then(async () => {
        if (!this.available() || generation !== this.generation || !this.snapshot || action.revision !== this.revision)
          return false;
        if (action.type === "cancel") {
          this.cancelPointer();
          return true;
        }
        const snapshot = this.snapshot;
        const rect = JSON.parse(snapshot);
        const pointer = action.type.startsWith("mouse");
        let x = 0;
        let y = 0;
        if (pointer) {
          if (
            !Number.isFinite(action.x) ||
            !Number.isFinite(action.y) ||
            action.x < 0 ||
            action.y < 0 ||
            action.x >= 1 ||
            action.y >= 1
          )
            return false;
          x = rect.x + Math.floor(action.x * rect.width);
          y = rect.y + Math.floor(action.y * rect.height);
        }
        const allowed = await this.run(
          `globalThis.__jmsVerification?.authorize(${JSON.stringify({ type: action.type, key: action.key, shift: action.shift === true, x, y, snapshot })})`
        );
        if (!allowed || !this.available() || generation !== this.generation || snapshot !== this.snapshot) return false;
        if (action.type === "text") await this.contents.insertText(action.text);
        else if (action.type === "key") {
          this.contents.sendInputEvent({
            type: "keyDown",
            keyCode: action.key,
            modifiers: action.shift ? ["shift"] : []
          });
          this.contents.sendInputEvent({
            type: "keyUp",
            keyCode: action.key,
            modifiers: action.shift ? ["shift"] : []
          });
        } else {
          this.contents.sendInputEvent({
            type: action.type,
            x,
            y,
            button: this.pressed || action.type !== "mouseMove" ? "left" : undefined,
            clickCount: action.type === "mouseMove" ? 0 : 1
          });
          if (action.type === "mouseDown") this.pressed = true;
          if (action.type === "mouseUp") this.pressed = false;
        }
        return true;
      })
      .catch(() => false)
      .finally(() => {
        this.queued -= 1;
      });
    this.queue = pending.then(() => {});
    return pending;
  }

  async advanceLogin() {
    if (this.completing || !this.available()) return "waiting";
    this.completing = true;
    try {
      await this.queue;
      if (!this.available()) return "waiting";
      await this.run(buildInteractionGuardScript(this.selectors, this.origin));
      const shouldSubmit = !this.autoSubmitted;
      // Record the attempt before executing it: navigation may replace the JS
      // context before its response reaches us, but must never replay the click.
      this.autoSubmitted = true;
      const state = await this.run(`globalThis.__jmsVerification?.advanceLogin(${shouldSubmit})`);
      if (shouldSubmit && state !== "submitted") this.autoSubmitted = false;
      return state;
    } finally {
      this.completing = false;
    }
  }

  async submit() {
    if (this.completing || !this.available()) return false;
    // A retry after cleanup/navigation must not duplicate a completed submission.
    if (this.submitted && !this.selectors.success) return true;
    this.completing = true;
    const generation = this.generation;
    try {
      await this.queue;
      if (!this.available() || generation !== this.generation) return false;
      this.submitted = Boolean(await this.run("globalThis.__jmsVerification?.submit()"));
      return this.submitted;
    } finally {
      this.completing = false;
    }
  }

  async complete(requireNoVerification = false) {
    if (this.completing || !this.available(false)) return false;
    this.completing = true;
    const generation = this.generation;
    try {
      await this.queue;
      if (!this.available(false) || generation !== this.generation) return false;
      // A successful full-page login may have replaced the original document.
      await this.run(buildInteractionGuardScript(this.selectors, this.origin));
      const cleared = await this.run(`globalThis.__jmsVerification?.clearCredentials(${requireNoVerification})`);
      if (!cleared || !this.available(false) || generation !== this.generation) return false;
      await this.dispose();
      return true;
    } finally {
      this.completing = false;
    }
  }

  dispose() {
    if (this.disposal) return this.disposal;
    this.disposed = true;
    clearInterval(this.timer);
    this.invalidate();
    // Automatic success and manual completion can finish at the same time. Both
    // must await the same teardown before the full page becomes visible.
    this.disposal = this.queue.then(async () => {
      if (!this.contents.isDestroyed())
        await this.run("globalThis.__jmsVerification?.dispose()").catch(() => undefined);
    });
    return this.disposal;
  }
}
