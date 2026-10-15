export default defineNuxtPlugin({
  name: "session-freeze-protection",
  enforce: "pre",
  setup() {
    const locks = navigator.locks;
    if (!locks?.request) {
      console.warn("Luna: background freeze protection requires Web Locks in a secure context.");
      return;
    }

    const NativeWebSocket = window.WebSocket;
    const ProtectedWebSocket = new Proxy(NativeWebSocket, {
      construct(target, args, newTarget) {
        const socket: WebSocket = Reflect.construct(target, args, newTarget);
        // Match connector paths, including site prefixes and desktop endpoint origins.
        if (!/\/(?:koko(?:\/lion)?|chen)\/ws\//.test(new URL(socket.url).pathname)) return socket;

        // ponytail: Web Locks prevent Chromium automatic freezing, not unload or OS sleep.
        // Preserving sessions across those interruptions requires server-side resumption.
        const controller = new AbortController();
        let release: (() => void) | undefined;
        const finish = () => {
          controller.abort();
          release?.();
          socket.removeEventListener("close", finish);
          socket.removeEventListener("error", finish);
        };
        socket.addEventListener("close", finish);
        socket.addEventListener("error", finish);
        const reportFailure = () => {
          if (!controller.signal.aborted) console.warn("Luna: could not acquire the session background freeze lock.");
        };
        try {
          void locks
            .request("jumpserver:luna:active-session", { mode: "shared", signal: controller.signal }, () => {
              if (controller.signal.aborted) return;
              return new Promise<void>((resolve) => {
                release = resolve;
              });
            })
            .catch(reportFailure);
        } catch {
          reportFailure();
        }
        return socket;
      }
    });
    window.WebSocket = ProtectedWebSocket;
    import.meta.hot?.dispose(() => {
      if (window.WebSocket === ProtectedWebSocket) window.WebSocket = NativeWebSocket;
    });
  }
});
