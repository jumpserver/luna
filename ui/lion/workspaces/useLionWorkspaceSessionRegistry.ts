import type { FileTransferTask, SessionShareAdapter } from "@jumpserver/connectors-core";
import type { ComputedRef, Ref } from "vue";

import type { LionUploadCustomRequestOptions, LionUploadFileInfo } from "@/lion/types/upload";

export interface LionWorkspaceSessionController {
  actionPermission: Ref<Record<string, any>>;
  autoFit: Ref<boolean>;
  clipboardDraft: Ref<string>;
  clipboardPasteTextLimit: ComputedRef<number | undefined>;
  currentFolder: Ref<any>;
  currentFolderFiles: Ref<any[]>;
  displayUploadingFiles: Ref<LionUploadFileInfo[]>;
  driverName: Ref<string>;
  fileSystemLoading: Ref<boolean>;
  fitPercentage: ComputedRef<number>;
  hasClipboardPermission: Ref<boolean>;
  isRemoteApp: ComputedRef<boolean>;
  keyboardLayout: Ref<string>;
  remoteClipboardText: Ref<string>;
  share: SessionShareAdapter;
  showRemoteClipboard: Ref<boolean>;
  virtualKeyboardOpen: Ref<boolean>;
  downloadFile: (file: any) => Promise<void>;
  openFolder: (folder: any) => void;
  removeUploadFile: (file: LionUploadFileInfo) => void;
  sendClipboardText: (text: string) => void;
  sendCombinationKeys: (keys: string[]) => void;
  setAutoFit: (value: boolean) => void;
  setScalePercentage: (value: number) => void;
  uploadFile: (options: LionUploadCustomRequestOptions, folder: any) => Promise<void>;
}

const sessions = shallowReactive(new Map<string, LionWorkspaceSessionController>());

export function registerLionWorkspaceSession(tabId: string, controller: LionWorkspaceSessionController) {
  if (!tabId) return () => {};
  sessions.set(tabId, controller);

  return () => {
    if (sessions.get(tabId) === controller) sessions.delete(tabId);
  };
}

export function getLionWorkspaceSession(tabId: string) {
  return tabId ? sessions.get(tabId) || null : null;
}

export function isLionUploadTransfer(task: FileTransferTask): boolean {
  return task.sourceEndpoint.id === "lion-upload";
}

// Read-only queue rows: Guacamole continues to own upload execution and file bytes.
export function getLionUploadTransferTasks(localLabel: string): FileTransferTask[] {
  return [...sessions.entries()].flatMap(([tabId, controller]) =>
    controller.displayUploadingFiles.value.map((file): FileTransferTask => {
      const id = `lion-upload:${tabId}:${file.id}`;
      const size = file.file?.size || 0;
      const status =
        file.status === "finished"
          ? "completed"
          : file.status === "error"
            ? "failed"
            : file.status === "uploading"
              ? "transferring"
              : "queued";
      const percentage = status === "completed" ? 100 : Math.max(0, Math.min(99, file.percentage || 0));
      return {
        id,
        batchId: id,
        sourceEndpoint: { id: "lion-upload", label: localLabel },
        destinationEndpoint: { id: `lion:${tabId}`, label: file.destinationLabel || controller.driverName.value },
        source: { path: file.name, name: file.name, size },
        destinationPath: file.destinationPath || "/",
        conflictPolicy: "overwrite",
        status,
        confirmedBytes: Math.floor((size * percentage) / 100),
        checksumState: "",
        error: file.error,
        createdAt: file.createdAt || 0,
        updatedAt: file.createdAt || 0
      };
    })
  );
}

export function removeLionUploadTransfer(taskId: string): void {
  for (const [tabId, controller] of sessions) {
    const file = controller.displayUploadingFiles.value.find((item) => `lion-upload:${tabId}:${item.id}` === taskId);
    if (!file) continue;
    if (file.status !== "uploading") controller.removeUploadFile(file);
    return;
  }
}
