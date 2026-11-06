// Browser Session coordination. Keep API and storage keys aligned between Lina and Luna.
// No credentials enter browser storage.
export function describeWebSessionError(error) {
  const status = Number(error?.response?.status ?? error?.status ?? error?.statusCode);
  /** @type {Record<string, number>} */
  const params = {};
  let key = "RequestFailedUnknown";
  if (Number.isInteger(status) && status >= 400 && status <= 599) {
    params.status = status;
    key =
      status === 404
        ? "EndpointNotFound"
        : status === 429
          ? "RequestRateLimited"
          : status >= 500
            ? "ServiceUnavailable"
            : "RequestFailed";
  } else if (error?.code === "invalid_web_session_state") {
    key = "InvalidResponse";
  } else if (error?.name === "TimeoutError" || ["ECONNABORTED", "ETIMEDOUT"].includes(error?.code)) {
    key = "RequestTimeout";
  } else if (
    error?.code === "ERR_NETWORK" ||
    (error?.name === "TypeError" && /fetch|network|load failed/i.test(error?.message || ""))
  ) {
    key = "NetworkUnavailable";
  }
  // Show actionable categories, never raw response HTML, stack traces or request credentials.
  return { key: `ScreenLock.${key}`, params };
}

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
  let lifecycle = 0;
  let syncAgain = false;
  let confirmingState = false;
  let pendingLock = null;
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
  let documents = new WeakSet();
  let frames = new WeakSet();
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
    const message = {
      id: newId(),
      scope: state.session.scope,
      state_version: state.session.state_version,
      type,
      ...extra
    };
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
    lifecycle++;
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
    if (message.type === "signed_out" && Number.isFinite(message.at)) {
      beginSignOut(message.at);
      return;
    }
    if (message.type === "logout") {
      onUnauthenticated?.();
      return;
    }
    if (!Number.isSafeInteger(message.state_version) || message.state_version < state.session.state_version) return;
    if (
      message.type === "attempts" &&
      message.state_version === state.session.state_version &&
      Number.isInteger(message.remaining) &&
      message.remaining > 0 &&
      message.remaining < 5
    ) {
      state.attemptsRemaining =
        state.attemptsRemaining === null ? message.remaining : Math.min(state.attemptsRemaining, message.remaining);
      publish();
      return;
    }
    if (
      (message.type === "locked" || message.type === "unlocked") &&
      message.state_version > state.session.state_version
    ) {
      // Broadcasts only request a fresh read; only a Core response may remove the shield.
      confirmingState = true;
      state.locked = true;
      publish();
      void sync(true);
    }
  }
  function validate(data) {
    if (
      !data ||
      typeof data.scope !== "string" ||
      !/^[a-f0-9]{40}$/.test(data.scope) ||
      !Number.isSafeInteger(data.state_version) ||
      data.state_version < 0 ||
      typeof data.locked !== "boolean" ||
      typeof data.has_password !== "boolean" ||
      !Number.isInteger(data.idle_lock_time) ||
      data.idle_lock_time < 0 ||
      typeof data.user?.id !== "string"
    ) {
      throw Object.assign(new Error("Invalid Web Session lock state"), {
        code: "invalid_web_session_state"
      });
    }
    return data;
  }
  function apply(data, confirmedRead = false) {
    if (state.logoutAt) return false;
    validate(data);
    if (state.session && state.session.scope !== data.scope) {
      state.locked = true;
      publish();
      lifecycle++;
      onSessionChanged?.();
      return false;
    }
    if (state.session && data.state_version < state.session.state_version) return false;
    if (confirmedRead) confirmingState = false;
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
    }
    if (!channel && "BroadcastChannel" in env) {
      channel = new env.BroadcastChannel(prefix);
      channel.onmessage = (event) => receive(event.data);
    }
    const sameVersion = state.session?.state_version === data.state_version;
    const newlyUnlocked = data.unlocked_at !== state.session?.unlocked_at;
    if (pendingLock && data.state_version > pendingLock.version) pendingLock = null;
    state.session = data;
    if (Number.isInteger(data.attempts_remaining) && data.attempts_remaining >= 0 && data.attempts_remaining <= 5) {
      state.attemptsRemaining =
        sameVersion && data.locked && state.attemptsRemaining !== null
          ? Math.min(state.attemptsRemaining, data.attempts_remaining)
          : data.attempts_remaining;
    }
    const unlockedAge = Date.parse(data.server_time) - Date.parse(data.unlocked_at);
    if (newlyUnlocked && Number.isFinite(unlockedAge)) {
      lastActivity = Math.max(lastActivity, now() - Math.max(0, unlockedAge));
      write(`${prefix}:activity`, lastActivity);
    }
    if (!data.locked && !pendingLock && !confirmingState && idleExpired())
      pendingLock = { version: data.state_version };
    state.locked = data.locked || Boolean(pendingLock) || confirmingState;
    state.ready = true;
    state.error = null;
    publish();
    return true;
  }
  function fail(error, initial = false) {
    if (state.logoutAt) return;
    const status = error?.status || error?.response?.status;
    if (status === 409 && (error?.data?.code || error?.response?.data?.code) === "web_session_changed") {
      lifecycle++;
      onSessionChanged?.();
      return;
    }
    const detail = error?.data || error?.response?.data;
    if (status === 401 && detail?.code === "authentication_required" && typeof detail.login_url === "string") {
      lifecycle++;
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
      if (previouslyManaged) {
        lifecycle++;
        onUnauthenticated?.();
      }
      publish();
      return;
    }
    state.error = error;
    state.ready = true;
    publish();
  }
  function active(generation, id) {
    return generation === lifecycle && id === pageId && !stopped && !pageHidden && !state.logoutAt;
  }
  function conflict(error) {
    const detail = error?.data || error?.response?.data;
    if ((error?.status || error?.response?.status) !== 409 || detail?.code !== "web_session_state_conflict")
      return false;
    const data = validate(detail.session);
    apply(data);
    return true;
  }
  async function flushLock() {
    if (!pendingLock || !state.session) return;
    if (locking) return locking;
    const intent = pendingLock;
    const generation = lifecycle;
    const id = pageId;
    const promise = (async () => {
      try {
        const data = validate(
          await request("POST", "/api/v1/authentication/session-lock/lock/", {
            scope: state.session.scope,
            expected_version: intent.version
          })
        );
        if (!active(generation, id)) return;
        if (pendingLock === intent) pendingLock = null;
        if (apply(data) && !confirmingState) emit(data.locked ? "locked" : "unlocked");
      } catch (error) {
        if (!active(generation, id)) return;
        if (!conflict(error) && (state.session?.state_version ?? Infinity) <= intent.version) throw error;
      }
    })();
    locking = promise;
    try {
      await promise;
    } finally {
      if (locking === promise) locking = null;
    }
  }
  async function sync(fresh = false) {
    if (stopped || pageHidden || state.logoutAt) return;
    if (syncing) {
      if (fresh || pageEntering || !state.ready) syncAgain = true;
      return syncing;
    }
    const generation = lifecycle;
    const syncPageId = pageId;
    const promise = (async () => {
      do {
        syncAgain = false;
        lastPoll = now();
        let requestedVersion = state.session?.state_version;
        try {
          await flushLock();
          if (!active(generation, syncPageId)) return;
          const headers = pageEntering ? { "X-JMS-Page-ID": pageId } : undefined;
          pageStarted = true;
          requestedVersion = state.session?.state_version;
          const data = validate(await request("GET", "/api/v1/authentication/web-session/status/", undefined, headers));
          if (!active(generation, syncPageId)) return;
          pageEntering = false;
          // A hint arriving during this read requires one more read, never trusting the hint itself.
          if (syncAgain) continue;
          if (apply(data, true)) await flushLock();
          else if (confirmingState && data.scope === state.session?.scope) syncAgain = true;
        } catch (error) {
          if (active(generation, syncPageId) && !syncAgain) {
            if (requestedVersion === state.session?.state_version) fail(error, true);
            else if (confirmingState) syncAgain = true;
          }
        }
      } while (syncAgain && active(generation, syncPageId));
    })();
    syncing = promise;
    try {
      await promise;
    } finally {
      if (syncing === promise) syncing = null;
      // BFCache/start may request a new registration while an old page's request is finishing.
      if (syncAgain && !stopped && !pageHidden && !state.logoutAt) void sync();
    }
  }
  async function lock() {
    if (!state.session) await sync();
    if (!state.session || state.locked || stopped || pageHidden || state.logoutAt) return;
    pendingLock = { version: state.session.state_version };
    state.locked = true;
    state.error = null;
    publish();
    try {
      await flushLock();
    } catch (error) {
      fail(error);
    }
  }
  async function unlock(password) {
    if (state.logoutAt || state.pending || stopped || pageHidden) return;
    if (!state.session) throw new Error("No Web Session available");
    const generation = lifecycle;
    const id = pageId;
    let attemptVersion;
    state.pending = true;
    publish();
    try {
      await flushLock();
      if (!active(generation, id)) return;
      attemptVersion = state.session.state_version;
      const data = validate(
        await request("POST", "/api/v1/authentication/session-lock/unlock/", {
          scope: state.session.scope,
          expected_version: attemptVersion,
          password
        })
      );
      if (!active(generation, id)) return;
      if (data.locked) throw new Error("The server did not unlock the session");
      if (apply(data) && !confirmingState) {
        activity(true);
        emit("unlocked");
      }
    } catch (error) {
      if (!active(generation, id) || conflict(error)) return;
      const data = error?.data || error?.response?.data;
      if (data?.code !== "lock_password_attempts_exceeded" && state.session?.state_version > attemptVersion) return;
      if (data?.code === "lock_password_unset") {
        state.session = { ...state.session, has_password: false };
        publish();
        return;
      }
      if (data?.code !== "lock_password_attempts_exceeded") {
        if (Number.isInteger(data?.attempts_remaining) && data.attempts_remaining > 0 && data.attempts_remaining < 5) {
          state.attemptsRemaining = Math.min(state.attemptsRemaining ?? 5, data.attempts_remaining);
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
    if (cleanup.length) return syncing;
    if (stopped) {
      stopped = false;
      pageId = newId();
      pageEntering = true;
      pageStarted = false;
      pageLeaving = false;
      pageHidden = false;
      state.ready = false;
      state.locked = true;
      publish();
    }
    lifecycle++;
    listen(env, "storage", (event) => {
      if (event.key === `${prefix}:signal`) receive(read(event.key));
      if (event.key === `${prefix}:activity`) {
        const at = read(event.key);
        if (Number.isFinite(at)) lastActivity = Math.max(lastActivity, Math.min(now(), at));
      }
    });
    listen(env, "jms:web-session-locked", () => {
      confirmingState = true;
      state.locked = true;
      publish();
      void sync(true);
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
      lifecycle++;
      pageHidden = true;
      leavePage();
    });
    listen(env, "pageshow", (event) => {
      if (event.persisted) {
        lifecycle++;
        // A cached page may outlive its login or lock while no page was open.
        state.ready = false;
        state.locked = true;
        publish();
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
    interval = env.setInterval(tick, 1000);
    await sync();
    if (!stopped) tick();
  }
  function stop() {
    lifecycle++;
    leavePage();
    stopped = true;
    env.clearInterval(interval);
    env.clearTimeout(logoutTimer);
    channel?.close();
    channel = null;
    for (const remove of cleanup.splice(0)) remove();
    documents = new WeakSet();
    frames = new WeakSet();
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
