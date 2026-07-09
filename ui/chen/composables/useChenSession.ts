import type { ChenPacket } from "~/chen/types";

interface UseChenSessionOptions {
  authenticate: () => Promise<string>
  connectSessionSocket: (token: string) => WebSocket
  markConnected: () => void
  onBeforeReady: () => Promise<void>
  onAfterReady: () => Promise<void>
}

export function useChenSession(options: UseChenSessionOptions) {
  const toast = useToast();
  const ready = ref(false);
  const loading = ref(true);
  const error = ref("");
  const dialogMessage = ref("");
  const sessionSocket = shallowRef<WebSocket | null>(null);

  async function bootstrapSession() {
    loading.value = true;
    error.value = "";

    try {
      const token = await options.authenticate();
      const socket = options.connectSessionSocket(token);
      sessionSocket.value = socket;

      socket.onmessage = async (event) => {
        const packet = JSON.parse(event.data) as ChenPacket;
        switch (packet.type) {
          case "show_dialog":
            dialogMessage.value = packet.data?.body || packet.data?.title || "";
            break;
          case "close_dialog":
            dialogMessage.value = "";
            break;
          case "show_message":
            toast.add({
              title: packet.data?.level || "Message",
              description: packet.data?.message || "",
              color: packet.data?.level?.toLowerCase() === "error" ? "error" : "primary"
            });
            break;
          case "set_ready":
            await options.onBeforeReady();
            ready.value = true;
            loading.value = false;
            options.markConnected();
            await options.onAfterReady();
            break;
          case "close_session":
            error.value = "Session closed";
            ready.value = false;
            break;
        }
      };

      socket.onerror = () => {
        error.value = "Chen session websocket error";
        loading.value = false;
      };

      socket.onclose = () => {
        if (!ready.value) error.value = error.value || "Chen session closed";
      };
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause);
      loading.value = false;
    }
  }

  function cleanupSession() {
    sessionSocket.value?.close();
    sessionSocket.value = null;
  }

  return {
    dialogMessage,
    error,
    loading,
    ready,
    sessionSocket,
    bootstrapSession,
    cleanupSession
  };
}
