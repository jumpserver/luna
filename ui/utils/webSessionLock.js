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
  const state = {
    ready: false,
    locked: true,
    pending: false,
    error: null,
    session: null,
    logoutAt: 0,
    attemptsRemaining: null,
    idleRemaining: null,
    expiryRemaining: null
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
  let configSnapshot;
  let expiryDeadline = null;
  let retryTimer;
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
  const publish = () => {
    updateCountdowns();
    onChange({ ...state });
  };
  function updateCountdowns(notify = false) {
    const applicable = !stopped && !pageHidden && state.ready && state.session && !state.logoutAt;
    const remaining = (deadline, warningSeconds) => {
      const seconds = Math.max(0, Math.ceil((deadline - now()) / 1000));
      return Number.isFinite(deadline) && seconds <= warningSeconds ? seconds : null;
    };
    let idleRemaining = null;
    if (applicable && !state.locked && !state.error && state.session.idle_lock_time > 0) {
      const duration = state.session.idle_lock_time * 60;
      const seconds = remaining(lastActivity + duration * 1000, 60);
      // With a one-minute idle setting, activity clears the warning until 59 seconds remain.
      if (seconds !== null && seconds < duration) idleRemaining = seconds;
    }
    const expiryRemaining =
      applicable && state.session.sliding_expiry === false ? remaining(expiryDeadline, 600) : null;
    if (idleRemaining === state.idleRemaining && expiryRemaining === state.expiryRemaining) return;
    state.idleRemaining = idleRemaining;
    state.expiryRemaining = expiryRemaining;
    if (notify) onChange({ ...state });
  }
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
  function cancelRetry() {
    env.clearTimeout(retryTimer);
    retryTimer = undefined;
  }
  function retryLock(intent, error) {
    const status = Number(error?.response?.status ?? error?.status ?? error?.statusCode);
    const temporary =
      status >= 500 || status === 408 || status === 429 || (!status && error?.code !== "invalid_web_session_state");
    const delays = [1000, 2000, 5000];
    if (
      !temporary ||
      pendingLock !== intent ||
      intent.retries >= delays.length ||
      stopped ||
      pageHidden ||
      state.logoutAt
    ) {
      return;
    }
    cancelRetry();
    retryTimer = env.setTimeout(
      () => {
        retryTimer = undefined;
        if (pendingLock === intent && !stopped && !pageHidden && !state.logoutAt) {
          void flushLock().catch((error) => fail(error));
        }
      },
      delays[intent.retries++]
    );
  }
  function setPendingLock(announce = false) {
    if (pendingLock || state.session?.locked) return false;
    pendingLock = { version: state.session.state_version, retries: 0 };
    state.locked = true;
    if (announce) emit("lock_pending");
    return true;
  }
  function acceptActivity(at) {
    // Ignore future values instead of repeatedly treating them as activity happening now.
    if (Number.isFinite(at) && at <= now()) lastActivity = Math.max(lastActivity, at);
  }
  function selectConfig(data) {
    const config = {};
    for (const name of ["idle_lock_time", "idle_lock_time_limit", "session_timeout"]) {
      if (Number.isSafeInteger(data?.[name]) && data[name] >= 0) config[name] = data[name];
    }
    for (const name of ["has_password", "sliding_expiry", "expire_at_browser_close"]) {
      if (typeof data?.[name] === "boolean") config[name] = data[name];
    }
    return config;
  }
  function acceptConfig(snapshot) {
    if (
      snapshot?.scope !== state.session?.scope ||
      !Number.isFinite(Date.parse(snapshot.server_time)) ||
      (configSnapshot && Date.parse(snapshot.server_time) <= Date.parse(configSnapshot.server_time))
    ) {
      return false;
    }
    const config = selectConfig(snapshot.config);
    if (!Number.isSafeInteger(config.idle_lock_time)) return false;
    configSnapshot = { scope: snapshot.scope, server_time: snapshot.server_time, config };
    state.session = { ...state.session, ...config };
    return true;
  }
  function shareConfig(data) {
    acceptConfig(read(`${prefix}:config`));
    const snapshot = {
      scope: data.scope,
      server_time: data.server_time,
      config: selectConfig(data)
    };
    if (acceptConfig(snapshot)) {
      write(`${prefix}:config`, configSnapshot);
      // Configuration hints never carry authoritative lock state or cause another GET.
      channel?.postMessage({ type: "config", ...configSnapshot });
    }
    if (configSnapshot) state.session = { ...state.session, ...configSnapshot.config };
  }
  function activity(force = false) {
    if (!prefix || (state.locked && !force)) return;
    if (!force && acceptConfig(read(`${prefix}:config`))) publish();
    if (!force && idleExpired()) {
      void lock();
      return;
    }
    lastActivity = now();
    updateCountdowns(true);
    if (!force && lastActivity - lastWrite < 1000) return;
    lastWrite = lastActivity;
    write(`${prefix}:activity`, lastActivity);
    channel?.postMessage({ scope: state.session.scope, type: "activity", at: lastActivity });
  }
  function beginSignOut(at) {
    if (state.logoutAt) return;
    cancelRetry();
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
      acceptActivity(message.at);
      updateCountdowns(true);
      return;
    }
    if (message.type === "config") {
      if (acceptConfig(message)) {
        publish();
        tick();
      }
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
    if (!Number.isSafeInteger(message.state_version) || message.state_version < state.session.state_version) {
      return;
    }
    if (message.type === "lock_pending" && message.state_version === state.session.state_version) {
      if (setPendingLock()) {
        publish();
        // The originating page may close before its request finishes. Each peer gets one
        // attempt and its own bounded retry budget, rather than leaving an orphaned shield.
        void flushLock().catch((error) => fail(error));
      }
      return;
    }
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
      ["locked", "unlocked", "lock_pending"].includes(message.type) &&
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
  function apply(data, confirmedRead = false, checkIdle = true) {
    if (state.logoutAt) return false;
    validate(data);
    if (state.session && state.session.scope !== data.scope) {
      cancelRetry();
      expiryDeadline = null;
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
    if (pendingLock && (data.locked || data.state_version > pendingLock.version)) {
      pendingLock = null;
      cancelRetry();
    }
    state.session = data;
    // Only Core's fixed login deadline is authoritative; a sliding expires_at is not a limit.
    const expiryDuration = Date.parse(data.max_expires_at) - Date.parse(data.server_time);
    expiryDeadline = data.sliding_expiry === false && Number.isFinite(expiryDuration) ? now() + expiryDuration : null;
    shareConfig(data);
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
    const signal = read(`${prefix}:signal`);
    if (
      checkIdle &&
      signal?.scope === data.scope &&
      signal.type === "lock_pending" &&
      signal.state_version === data.state_version
    ) {
      setPendingLock();
    }
    if (checkIdle && !data.locked && !pendingLock && !confirmingState && idleExpired()) {
      setPendingLock(true);
    }
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
      cancelRetry();
      lifecycle++;
      onSessionChanged?.();
      return;
    }
    const detail = error?.data || error?.response?.data;
    if (status === 401 && detail?.code === "authentication_required" && typeof detail.login_url === "string") {
      cancelRetry();
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
        cancelRetry();
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
    if ((error?.status || error?.response?.status) !== 409 || detail?.code !== "web_session_state_conflict") {
      return false;
    }
    const data = validate(detail.session);
    // Discard this intent; do not upgrade its version and resend from this request.
    // The next local tick may reassess idle after applying Core's latest unlocked_at.
    // apply() ignores stale responses and preserves any newer, independent lock intent.
    apply(data, false, false);
    return true;
  }
  async function flushLock() {
    if (!pendingLock || !state.session) return;
    if (locking) {
      const running = locking;
      await running.promise;
      if (pendingLock && pendingLock !== running.intent) await flushLock();
      return;
    }
    cancelRetry();
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
        if (!data.locked) {
          throw Object.assign(new Error("The server did not lock the session"), {
            code: "invalid_web_session_state"
          });
        }
        if (pendingLock === intent) {
          pendingLock = null;
          cancelRetry();
        }
        if (apply(data, false, false) && !confirmingState) emit(data.locked ? "locked" : "unlocked");
      } catch (error) {
        if (!active(generation, id)) return;
        if (!conflict(error) && (state.session?.state_version ?? Infinity) <= intent.version) {
          retryLock(intent, error);
          throw error;
        }
      }
    })();
    const operation = { promise, intent };
    locking = operation;
    try {
      await promise;
    } finally {
      if (locking === operation) locking = null;
      if (pendingLock && pendingLock !== intent && !stopped && !pageHidden && !state.logoutAt) {
        // A newer user intent may have queued behind this request. Advance it once,
        // without turning failure of the original intent into an unbounded retry loop.
        void flushLock().catch((error) => fail(error));
      }
    }
  }
  async function sync(fresh = false) {
    if (stopped || pageHidden || state.logoutAt) return;
    // Explicit refresh/recovery starts a fresh bounded retry budget, never a periodic API loop.
    cancelRetry();
    if (pendingLock) pendingLock.retries = 0;
    if (syncing) {
      if (fresh || pageEntering || !state.ready) syncAgain = true;
      return syncing;
    }
    const generation = lifecycle;
    const syncPageId = pageId;
    const promise = (async () => {
      do {
        syncAgain = false;
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
    setPendingLock(true);
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
      cancelRetry();
      if (pendingLock) pendingLock.retries = 0;
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
      if (apply(data, false, false) && !confirmingState) {
        activity(true);
        emit("unlocked");
      }
    } catch (error) {
      if (!active(generation, id) || conflict(error)) return;
      const data = error?.data || error?.response?.data;
      if (data?.code !== "lock_password_attempts_exceeded" && state.session?.state_version > attemptVersion) {
        return;
      }
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
  function idleExpired() {
    acceptActivity(read(`${prefix}:activity`));
    return state.session?.idle_lock_time > 0 && now() - lastActivity >= state.session.idle_lock_time * 60000;
  }
  function tick() {
    if (stopped || pageHidden || state.logoutAt || !state.ready || !state.session) return;
    // Each page checks the shared activity locally; no leader lease or periodic API polling.
    if (acceptConfig(read(`${prefix}:config`))) publish();
    if (!state.locked && idleExpired()) {
      void lock();
    }
    updateCountdowns(true);
  }
  function listen(target, name, handler, options) {
    target.addEventListener(name, handler, options);
    cleanup.push(() => target.removeEventListener(name, handler, options));
  }
  function resume() {
    tick();
    void sync(true);
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
        acceptActivity(read(event.key));
        updateCountdowns(true);
      }
      if (event.key === `${prefix}:config`) {
        receive({ ...read(event.key), type: "config" });
      }
    });
    listen(env, "jms:web-session-locked", () => {
      confirmingState = true;
      state.locked = true;
      publish();
      void sync(true);
    });
    listen(doc, "visibilitychange", () => {
      if (!doc.hidden) resume();
    });
    listen(env, "online", resume);
    listen(env, "pagehide", () => {
      cancelRetry();
      lifecycle++;
      pageHidden = true;
      updateCountdowns(true);
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
        resume();
      }
    });
    observeDocument(doc);
    interval = env.setInterval(tick, 1000);
    await sync();
    if (!stopped) tick();
  }
  function stop() {
    cancelRetry();
    lifecycle++;
    leavePage();
    stopped = true;
    updateCountdowns(true);
    env.clearInterval(interval);
    env.clearTimeout(logoutTimer);
    channel?.close();
    channel = null;
    for (const remove of cleanup.splice(0)) remove();
    documents = new WeakSet();
    frames = new WeakSet();
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
