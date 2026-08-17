import type { ComputedRef, Ref } from "vue";

import type { SuggestionUser } from "@/lion/api";
import type { LionUploadCustomRequestOptions, LionUploadFileInfo } from "@/lion/types/upload";

export interface LionOnlineUser {
  user_id: string;
  user: string;
  primary: boolean;
  writable: boolean;
  remote_addr?: string;
}

export interface LionShareInfo {
  shareId: string;
  shareCode: string;
  sessionId: string;
  enableShare: boolean;
  shareURL: string;
}

export interface LionShareLinkRequest {
  expiredTime: number;
  actionPerm: string;
  users: SuggestionUser[];
}

export interface LionSessionShareAdapter {
  sessionId: ComputedRef<string>;
  enableShare: Ref<boolean>;
  onlineUsers: ComputedRef<LionOnlineUser[]>;
  shareInfo: ComputedRef<LionShareInfo>;
  userOptions: Ref<SuggestionUser[]>;
  hasMoreUsers: Ref<boolean>;
  searchUsers: (query: string, loadMore?: boolean) => Promise<void>;
  createShareLink: (request: LionShareLinkRequest) => Promise<void>;
  copyShareURL: () => Promise<void>;
  removeShareUser: (user: LionOnlineUser) => Promise<void>;
  resetShareState: () => void;
}

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
  share: LionSessionShareAdapter;
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
