// Browser Session coordination. Keep API and storage keys aligned between Lina and Luna.
// No credentials enter browser storage.
export function createWebSessionLock({
  request,
  notifyClose,
  onChange,
  onSessionChanged,
  onUnauthenticated,
  env = window
}) {
  const doc = env.document;
  const newId = () =>
    env.crypto.randomUUID?.() ||
    Array.from(env.crypto.getRandomValues(new Uint32Array(4)), (value) => value.toString(16)).join("-");
  const owner = newId();
  const state = {
    ready: false,
    locked: true,
    pending: false,
    error: null,
    session: null,
    logoutAt: 0,
    attemptsRemaining: null
  };
  let prefix = "";
  let channel;
  let interval;
  let syncing;
  let locking;
  let pendingLock = false;
  let remoteLockPending = false;
  let lastActivity = Date.now();
  let lastWrite = 0;
  let lastPoll = 0;
  let lastLeaseWrite = 0;
  let lastSignal = "";
  let stopped = false;
  let logoutTimer;
  let pageId = newId();
  let pageHidden = false;
  let pageEntering = true;
  let pageStarted = false;
  let pageLeaving = false;
  function leavePage() {
    if (!pageStarted || pageLeaving) return;
    pageLeaving = true;
    // An early close must also retire the ID if its startup request is still in flight.
    notifyClose?.({ page_id: pageId, ...(state.session ? { scope: state.session.scope } : {}) });
  }
  const cleanup = [];
  const documents = new WeakSet();
  const frames = new WeakSet();
  const now = () => Date.now();
  const publish = () => onChange({ ...state });
  const read = (key) => {
    try {
      return JSON.parse(env.localStorage.getItem(key) || "null");
    } catch {
      return null;
    }
  };
  const write = (key, value) => {
    try {
      env.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  };
  const emit = (type, extra = {}) => {
    if (!prefix) return;
    const message = { id: newId(), scope: state.session.scope, type, ...extra };
    write(`${prefix}:signal`, message);
    channel?.postMessage(message);
  };
  function activity(force = false) {
    if (!prefix || (state.locked && !force)) return;
    if (!force && idleExpired()) {
      void lock();
      return;
    }
    lastActivity = now();
    if (!force && lastActivity - lastWrite < 1000) return;
    lastWrite = lastActivity;
    write(`${prefix}:activity`, lastActivity);
    channel?.postMessage({ scope: state.session.scope, type: "activity", at: lastActivity });
  }
  function beginSignOut(at) {
    if (state.logoutAt) return;
    state.logoutAt = Math.min(now() + 5000, Math.max(now(), at));
    state.locked = true;
    state.error = null;
    publish();
    logoutTimer = env.setTimeout(() => onUnauthenticated?.(), state.logoutAt - now());
  }
  function receive(message) {
    if (!message || message.scope !== state.session?.scope) return;
    if (message.type === "activity") {
      if (Number.isFinite(message.at)) lastActivity = Math.max(lastActivity, Math.min(now(), message.at));
      return;
    }
    if (message.id === lastSignal) return;
    lastSignal = message.id;
    if (message.type === "locked") {
      remoteLockPending = message.pending === true;
      state.locked = true;
      publish();
      if (remoteLockPending) return;
    }
    if (
      message.type === "attempts" &&
      Number.isInteger(message.remaining) &&
      message.remaining > 0 &&
      message.remaining < 5
    ) {
      state.attemptsRemaining =
        state.attemptsRemaining === null ? message.remaining : Math.min(state.attemptsRemaining, message.remaining);
      publish();
      return;
    }
    if (message.type === "signed_out" && Number.isFinite(message.at)) {
      beginSignOut(message.at);
      return;
    }
    if (message.type === "logout") {
      onUnauthenticated?.();
      return;
    }
    if (message.type === "locked" || message.type === "unlocked") {
      // Unlock notifications are hints. Each tab confirms the state with the server.
      void sync(message.type === "unlocked");
    }
  }
  function validate(data) {
    if (
      !data ||
      typeof data.scope !== "string" ||
      !/^[a-f0-9]{40}$/.test(data.scope) ||
      typeof data.locked !== "boolean" ||
      typeof data.has_password !== "boolean" ||
      !Number.isInteger(data.idle_lock_time) ||
      data.idle_lock_time < 0 ||
      typeof data.user?.id !== "string"
    ) {
      throw new Error("Invalid Web Session lock state");
    }
    return data;
  }
  function apply(data) {
    if (state.logoutAt) return;
    validate(data);
    if (state.session && state.session.scope !== data.scope) {
      state.locked = true;
      publish();
      onSessionChanged?.();
      return;
    }
    if (!state.session) {
      prefix = `jms-screen-lock:${data.scope}`;
      const stored = read(`${prefix}:activity`);
      const elapsed = Date.parse(data.server_time) - Date.parse(data.authenticated_at);
      const loggedInAt = now() - (Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0);
      lastActivity =
        Number.isFinite(stored) && stored <= now()
          ? Math.max(stored, Number.isFinite(elapsed) ? loggedInAt : stored)
          : loggedInAt;
      write(`${prefix}:activity`, lastActivity);
      if ("BroadcastChannel" in env) {
        channel = new env.BroadcastChannel(prefix);
        channel.onmessage = (event) => receive(event.data);
      }
    }
    const wasLocked = state.ready && state.locked;
    state.session = data;
    if (Number.isInteger(data.attempts_remaining) && data.attempts_remaining >= 0 && data.attempts_remaining <= 5) {
      state.attemptsRemaining =
        data.locked && state.attemptsRemaining !== null
          ? Math.min(state.attemptsRemaining, data.attempts_remaining)
          : data.attempts_remaining;
    }
    if (data.locked) remoteLockPending = false;
    if (wasLocked && !data.locked && !pendingLock && !remoteLockPending) activity(true);
    if (!data.locked && !pendingLock && !remoteLockPending && idleExpired()) {
      pendingLock = true;
      emit("locked", { pending: true });
    }
    state.locked = data.locked || pendingLock || remoteLockPending;
    state.ready = true;
    state.error = null;
    publish();
  }
  function fail(error, initial = false) {
    if (state.logoutAt) return;
    const status = error?.status || error?.response?.status;
    if (status === 409 && (error?.data?.code || error?.response?.data?.code) === "web_session_changed") {
      onSessionChanged?.();
      return;
    }
    const detail = error?.data || error?.response?.data;
    if (status === 401 && detail?.code === "authentication_required" && typeof detail.login_url === "string") {
      state.ready = false;
      state.locked = true;
      state.error = null;
      publish();
      onUnauthenticated?.(detail.login_url);
      return;
    }
    if (initial && (status === 401 || status === 403)) {
      const previouslyManaged = Boolean(state.session);
      state.ready = true;
      state.locked = previouslyManaged;
      state.session = null;
      if (previouslyManaged) onUnauthenticated?.();
      publish();
      return;
    }
    state.error = error;
    state.ready = true;
    publish();
  }
  async function flushLock() {
    if (!pendingLock || !state.session) return;
    if (locking) return locking;
    const promise = request("POST", "/api/v1/authentication/session-lock/lock/", { scope: state.session.scope }).then(
      (data) => {
        pendingLock = false;
        remoteLockPending = false;
        apply(data);
        emit("locked");
      }
    );
    locking = promise;
    try {
      await promise;
    } finally {
      if (locking === promise) locking = null;
    }
  }
  async function sync(afterUnlock = false) {
    if (stopped || pageHidden || state.logoutAt) return;
    if (syncing) {
      await syncing;
      // A concurrent status read must not swallow another tab's verified unlock.
      return afterUnlock || pageEntering ? sync(afterUnlock) : undefined;
    }
    lastPoll = now();
    const promise = (async () => {
      try {
        if (!afterUnlock) {
          if (remoteLockPending) pendingLock = true;
          await flushLock();
        }
        const enteringId = pageEntering ? pageId : null;
        const headers = enteringId ? { "X-JMS-Page-ID": enteringId } : undefined;
        pageStarted = true;
        const data = validate(await request("GET", "/api/v1/authentication/web-session/status/", undefined, headers));
        if (enteringId && enteringId !== pageId) return;
        pageEntering = false;
        if (pageHidden || stopped) return;
        if (afterUnlock) {
          pendingLock = false;
          remoteLockPending = false;
        }
        apply(data);
        await flushLock();
      } catch (error) {
        fail(error, true);
      }
    })();
    syncing = promise;
    try {
      await promise;
    } finally {
      if (syncing === promise) syncing = null;
    }
  }
  async function lock() {
    if (!state.session) await sync();
    if (!state.session || state.locked) return;
    pendingLock = true;
    state.locked = true;
    state.error = null;
    emit("locked", { pending: true });
    publish();
    try {
      await flushLock();
    } catch (error) {
      fail(error);
    }
  }
  async function unlock(password) {
    if (state.logoutAt) return;
    if (!state.session) throw new Error("No Web Session available");
    state.pending = true;
    publish();
    try {
      if (remoteLockPending) pendingLock = true;
      await flushLock();
      const data = validate(
        await request("POST", "/api/v1/authentication/session-lock/unlock/", {
          scope: state.session.scope,
          password
        })
      );
      if (data.locked) throw new Error("The server did not unlock the session");
      pendingLock = false;
      remoteLockPending = false;
      state.attemptsRemaining = 5;
      apply(data);
      activity(true);
      emit("unlocked");
    } catch (error) {
      const data = error?.data || error?.response?.data;
      if (data?.code === "lock_password_unset") {
        state.session = { ...state.session, has_password: false };
        publish();
        return;
      }
      if (data?.code !== "lock_password_attempts_exceeded") {
        if (Number.isInteger(data?.attempts_remaining) && data.attempts_remaining > 0 && data.attempts_remaining < 5) {
          state.attemptsRemaining = data.attempts_remaining;
          emit("attempts", { remaining: state.attemptsRemaining });
          publish();
        }
        throw error;
      }
      beginSignOut(now() + 5000);
      emit("signed_out", { at: state.logoutAt });
    } finally {
      state.pending = false;
      publish();
    }
  }
  function leader() {
    if (!prefix) return false;
    const lease = read(`${prefix}:leader`);
    if (lease && lease.owner !== owner && lease.until > now()) return false;
    if (now() - lastLeaseWrite >= 4000) {
      lastLeaseWrite = now();
      write(`${prefix}:leader`, { owner, until: now() + 12000 });
    }
    return true;
  }
  function idleExpired() {
    const shared = read(`${prefix}:activity`);
    if (Number.isFinite(shared)) lastActivity = Math.max(lastActivity, Math.min(now(), shared));
    return state.session?.idle_lock_time > 0 && now() - lastActivity >= state.session.idle_lock_time * 60000;
  }
  function tick() {
    if (pageHidden || state.logoutAt || !state.ready || !state.session || !leader()) return;
    if (!state.locked && idleExpired()) {
      void lock();
    }
    if (now() - lastPoll >= 60000) void sync();
  }
  function listen(target, name, handler, options) {
    target.addEventListener(name, handler, options);
    cleanup.push(() => target.removeEventListener(name, handler, options));
  }
  function resume() {
    if (!state.locked && idleExpired()) void lock();
    tick();
    if (now() - lastPoll >= 5000) void sync();
  }
  function observeDocument(document) {
    if (!document?.documentElement || documents.has(document)) return;
    documents.add(document);
    for (const name of ["pointermove", "pointerdown", "wheel", "keydown"]) {
      listen(
        document,
        name,
        (event) => {
          if (event.isTrusted) activity();
        },
        { capture: true, passive: true }
      );
    }
    const bind = (root) => {
      const candidates = root.matches?.("iframe") ? [root] : root.querySelectorAll?.("iframe") || [];
      for (const frame of candidates) {
        const attach = () => {
          try {
            observeDocument(frame.contentDocument);
          } catch {
            /* Cross-origin content is outside this site's activity scope. */
          }
        };
        if (!frames.has(frame)) {
          frames.add(frame);
          listen(frame, "load", attach);
        }
        attach();
      }
    };
    bind(document);
    const observer = new env.MutationObserver((records) => {
      for (const record of records) for (const node of record.addedNodes) bind(node);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    cleanup.push(() => observer.disconnect());
  }
  async function start() {
    listen(env, "storage", (event) => {
      if (event.key === `${prefix}:signal`) receive(read(event.key));
      if (event.key === `${prefix}:activity`) {
        const at = read(event.key);
        if (Number.isFinite(at)) lastActivity = Math.max(lastActivity, Math.min(now(), at));
      }
    });
    listen(env, "jms:web-session-locked", () => {
      state.locked = true;
      publish();
      void sync();
    });
    listen(doc, "visibilitychange", () => {
      if (doc.hidden) {
        if (read(`${prefix}:leader`)?.owner === owner) {
          try {
            env.localStorage.removeItem(`${prefix}:leader`);
          } catch {}
        }
      } else {
        resume();
      }
    });
    listen(env, "pagehide", () => {
      pageHidden = true;
      leavePage();
    });
    listen(env, "pageshow", (event) => {
      if (event.persisted) {
        pageHidden = false;
        pageId = newId();
        pageEntering = true;
        pageStarted = false;
        pageLeaving = false;
        void sync();
        resume();
      }
    });
    observeDocument(doc);
    await sync();
    tick();
    interval = env.setInterval(tick, 1000);
  }
  function stop() {
    leavePage();
    stopped = true;
    env.clearInterval(interval);
    env.clearTimeout(logoutTimer);
    channel?.close();
    for (const remove of cleanup) remove();
    const lease = read(`${prefix}:leader`);
    if (lease?.owner === owner) {
      try {
        env.localStorage.removeItem(`${prefix}:leader`);
      } catch {}
    }
  }
  return {
    start,
    stop,
    sync,
    lock,
    unlock,
    get state() {
      return { ...state };
    }
  };
}
