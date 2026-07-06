import type { ConnectorSessionContext } from "~/shared/connectors/types/session";
import { resolveWsUrl } from "~/shared/connectors/useConnectorEndpoint";

export interface SftpFileEntry {
  name: string
  size: string
  perm: string
  mod_time: string
  type: string
  is_dir: boolean
}

const id = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;

export function useSftpFileManager(ctx: Ref<ConnectorSessionContext | null>) {
  const entries = ref<SftpFileEntry[]>([]);
  const currentPath = ref("");
  const initialPath = ref("");
  const loading = ref(true);
  const error = ref("");
  const connected = ref(false);
  const uploadProgress = ref(0);
  let socket: WebSocket | null = null;
  let downloadParts: Uint8Array[] = [];
  const pendingReads = new Map<string, { parts: Uint8Array[], resolve: (blob: Blob) => void, reject: (error: Error) => void }>();
  const pendingLists = new Map<string, { resolve: (entries: SftpFileEntry[]) => void, reject: (error: Error) => void }>();

  const rejectPendingRead = (message: string) => {
    for (const pending of pendingReads.values()) pending.reject(new Error(message));
    pendingReads.clear();
    downloadParts = [];
    for (const pending of pendingLists.values()) pending.reject(new Error(message));
    pendingLists.clear();
  };

  const decodeRaw = (raw: unknown) => {
    if (typeof raw === "string") {
      if (!raw) return new Uint8Array();
      const binary = atob(raw);
      return Uint8Array.from(binary, (char) => char.charCodeAt(0));
    }
    if (Array.isArray(raw)) return Uint8Array.from(raw);
    return new Uint8Array();
  };

  const send = (cmd: string, data: Record<string, unknown>, raw = "", messageId = id()) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) throw new Error("SFTP connection is not ready");
    socket.send(JSON.stringify({ id: messageId, type: "SFTP_DATA", cmd, data: JSON.stringify(data), raw }));
  };

  const list = (path = currentPath.value) => {
    loading.value = true;
    send("list", { path });
  };

  const setList = (items: SftpFileEntry[]) => {
    const atRoot = currentPath.value === "/" || currentPath.value === initialPath.value;
    entries.value = atRoot ? items : [{ name: "..", size: "", perm: "", mod_time: "", type: "", is_dir: true }, ...items];
    loading.value = false;
  };

  const connect = () => {
    const context = ctx.value;
    if (!context) return;
    rejectPendingRead("SFTP connection reset");
    socket?.close();
    loading.value = true;
    error.value = "";
    socket = new WebSocket(resolveWsUrl(context.component, "sftp", context), ["JMS-KOKO"]);
    socket.onopen = () => {
      connected.value = true;
    };
    socket.onerror = () => {
      error.value = "SFTP WebSocket connection failed";
      loading.value = false;
      rejectPendingRead(error.value);
    };
    socket.onclose = () => {
      connected.value = false;
      rejectPendingRead("SFTP connection closed");
    };
    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(String(event.data));
        const isBackgroundList = message.cmd === "list" && pendingLists.has(message.id);
        if (message.current_path !== undefined && !isBackgroundList) {
          currentPath.value = message.current_path;
          if (!initialPath.value) initialPath.value = message.current_path;
        }
        if (message.type === "CONNECT") {
          send("list", { path: "" }, "", message.id);
        } else if (message.type === "PING") {
          socket?.send(JSON.stringify({ id: id(), type: "PONG", data: "pong" }));
        } else if (message.type === "SFTP_BINARY") {
          const pending = pendingReads.get(message.id);
          if (pending) pending.parts.push(decodeRaw(message.raw));
          else downloadParts.push(decodeRaw(message.raw));
        } else if (message.type === "SFTP_DATA") {
          if (message.cmd === "list") {
            const items = JSON.parse(message.data || "[]") as SftpFileEntry[];
            const pending = pendingLists.get(message.id);
            if (pending) {
              if (message.err) pending.reject(new Error(message.err));
              else pending.resolve(items);
              pendingLists.delete(message.id);
            } else {
              setList(items);
            }
          } else if (message.cmd === "download") {
            if (message.err) {
              error.value = message.err;
              const pending = pendingReads.get(message.id);
              if (pending) {
                pending.reject(new Error(message.err));
                pendingReads.delete(message.id);
              }
            } else {
              const pending = pendingReads.get(message.id);
              const blob = new Blob(pending?.parts || downloadParts, { type: "application/octet-stream" });
              if (pending) {
                pending.resolve(blob);
                pendingReads.delete(message.id);
              } else if (message.data) {
                const link = document.createElement("a");
                link.href = URL.createObjectURL(blob);
                link.download = message.data;
                link.click();
                URL.revokeObjectURL(link.href);
                downloadParts = [];
              } else {
                downloadParts = [];
              }
            }
          } else if (["mkdir", "rm", "rename", "upload"].includes(message.cmd) && message.data === "ok") {
            list();
          } else if (message.err) {
            error.value = message.err;
          }
        } else if (message.type === "ERROR" || message.type === "CLOSE" || message.type === "closed") {
          error.value = message.err || "SFTP session expired";
          rejectPendingRead(error.value);
          loading.value = false;
        }
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        error.value = message;
        rejectPendingRead(message);
      }
    };
  };

  const changeDirectory = (entry: SftpFileEntry) => {
    const path = entry.name === ".."
      ? currentPath.value.replace(/\/?[^/]+\/?$/, "") || "/"
      : `${currentPath.value.replace(/\/$/, "")}/${entry.name}`;
    list(path);
  };
  const listDirectory = (path: string) => new Promise<SftpFileEntry[]>((resolve, reject) => {
    const messageId = id();
    pendingLists.set(messageId, { resolve, reject });
    try {
      send("list", { path }, "", messageId);
    } catch (cause) {
      pendingLists.delete(messageId);
      reject(cause instanceof Error ? cause : new Error(String(cause)));
    }
  });
  const createDirectory = (name: string) => send("mkdir", { path: `${currentPath.value.replace(/\/$/, "")}/${name}` });
  const renameEntry = (entry: SftpFileEntry, name: string) => send("rename", { path: `${currentPath.value.replace(/\/$/, "")}/${entry.name}`, new_name: name });
  const removeEntry = (entry: SftpFileEntry) => send("rm", { path: `${currentPath.value.replace(/\/$/, "")}/${entry.name}` });
  const downloadEntry = (entry: SftpFileEntry) => {
    downloadParts = [];
    send("download", { path: `${currentPath.value.replace(/\/$/, "")}/${entry.name}`, is_dir: entry.is_dir });
  };
  const readFile = (entry: SftpFileEntry, targetPath?: string) => new Promise<Blob>((resolve, reject) => {
    const messageId = id();
    pendingReads.set(messageId, { parts: [], resolve, reject });
    try {
      send("download", { path: targetPath || `${currentPath.value.replace(/\/$/, "")}/${entry.name}`, is_dir: false }, "", messageId);
    } catch (cause) {
      pendingReads.delete(messageId);
      reject(cause instanceof Error ? cause : new Error(String(cause)));
    }
  });
  const uploadFile = async (file: File, targetPath?: string) => {
    const chunkSize = 5 * 1024 * 1024;
    const chunks = Math.max(1, Math.ceil(file.size / chunkSize));
    // koko uses this id as the numeric key for chunked uploads.
    const messageId = String(Date.now());
    uploadProgress.value = 0;
    for (let index = 0; index < chunks; index++) {
      const bytes = new Uint8Array(await file.slice(index * chunkSize, (index + 1) * chunkSize).arrayBuffer());
      let binary = "";
      for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
      send("upload", {
        offSet: index * chunkSize,
        size: file.size,
        path: targetPath || `${currentPath.value.replace(/\/$/, "")}/${file.name}`,
        chunk: chunks > 1
      }, btoa(binary), messageId);
      uploadProgress.value = Math.round(((index + 1) / chunks) * 100);
    }
    if (chunks > 1) send("upload", { offSet: 0, merge: true, size: 0, path: targetPath || `${currentPath.value.replace(/\/$/, "")}/${file.name}` }, "", messageId);
    uploadProgress.value = 0;
  };
  const uploadBlob = async (fileName: string, blob: Blob) => {
    const file = blob instanceof File ? blob : new File([blob], fileName, { type: blob.type || "application/octet-stream" });
    await uploadFile(file);
  };

  watch(ctx, connect, { immediate: true });
  onUnmounted(() => socket?.close());
  return { entries, currentPath, loading, error, connected, uploadProgress, list, listDirectory, changeDirectory, createDirectory, renameEntry, removeEntry, downloadEntry, readFile, uploadFile, uploadBlob, reconnect: connect };
}
