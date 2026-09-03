import type { FileTransferStatus } from "@jumpserver/connectors-core";
import { computed } from "vue";
import { useFileTransferStore } from "#koko/stores/fileTransfer";

export type SftpTransferTone = "idle" | "moving" | "paused" | "failed";

const movingTransferStatuses = new Set<FileTransferStatus>(["queued", "preparing", "transferring", "verifying"]);
const activeTransferStatuses = new Set<FileTransferStatus>([...movingTransferStatuses, "paused"]);

export function useSftpTransferUi() {
  const store = useFileTransferStore();
  const open = useState("sftp-transfer-drawer-open", () => false);
  const attentionSequence = useState("sftp-transfer-attention-sequence", () => 0);
  const tasks = computed(() => store.tasks ?? []);

  const hasTasks = computed(() => tasks.value.length > 0);
  const hasMovingTasks = computed(() => tasks.value.some((task) => movingTransferStatuses.has(task.status)));
  const hasPausedTasks = computed(() => tasks.value.some((task) => task.status === "paused"));
  const hasFailedTasks = computed(() => tasks.value.some((task) => task.status === "failed"));
  const hasActiveTasks = computed(() => tasks.value.some((task) => activeTransferStatuses.has(task.status)));
  const taskCount = computed(() => tasks.value.filter((task) => activeTransferStatuses.has(task.status)).length);
  const transferTone = computed<SftpTransferTone>(() => {
    if (hasFailedTasks.value) return "failed";
    if (hasMovingTasks.value) return "moving";
    if (hasPausedTasks.value) return "paused";
    return "idle";
  });

  function setOpen(value: boolean) {
    open.value = value;
  }

  function toggle() {
    setOpen(!open.value);
  }

  function signalQueued() {
    setOpen(true);
    attentionSequence.value += 1;
  }

  async function ensureRestored() {
    await store.restore();
  }

  return {
    open,
    hasTasks,
    hasMovingTasks,
    hasPausedTasks,
    hasActiveTasks,
    hasFailedTasks,
    transferTone,
    taskCount,
    attentionSequence,
    toggle,
    setOpen,
    signalQueued,
    ensureRestored
  };
}
