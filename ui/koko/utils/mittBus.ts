import type { Ref } from "vue";
import type { OnlineUser, ShareUserOptions } from "#koko/types/session";

import mitt from "mitt";

export enum KokoMittEvent {
  RemoveEvent = "remove-event",
  AltShiftRight = "alt-shift-right",
  AltShiftLeft = "alt-shift-left",
  OpenSetting = "open-setting",
  ReloadTable = "reload-table",
  OpenFileList = "open-fileList",
  FoldTreeClick = "fold-tree-click",
  ShowThemeConfig = "show-theme-config",
  SetTerminalTheme = "set-Terminal-theme",
  SetTheme = "set-theme",
  FileManage = "file-manage",
  FileUpload = "file-upload",
  DownloadFile = "download-file",
  StopUpload = "stop-upload",
  UploadStopped = "upload-stopped",
  TerminalSearch = "terminal-search",
  ShareUser = "share-user",
  SyncTheme = "sync-theme",
  RemoveShareUser = "remove-share-user",
  CreateShareUrl = "create-share-url",
  WriteDataToTerminal = "writeDataToTerminal",
  WriteCommand = "write-command",
  ConnectError = "connect-error",
  CloseDrawer = "close-drawer"
}

interface Event extends Record<string | symbol, unknown> {
  [KokoMittEvent.RemoveEvent]: void;
  [KokoMittEvent.AltShiftRight]: void;
  [KokoMittEvent.AltShiftLeft]: void;
  [KokoMittEvent.OpenSetting]: void;
  [KokoMittEvent.ReloadTable]: void;
  [KokoMittEvent.OpenFileList]: void;
  [KokoMittEvent.FoldTreeClick]: void;
  [KokoMittEvent.ShowThemeConfig]: void;
  [KokoMittEvent.SetTerminalTheme]: string;
  [KokoMittEvent.SetTheme]: { themeName: string };
  [KokoMittEvent.FileManage]: { path: string; type: string; new_name?: string };
  [KokoMittEvent.FileUpload]: {
    uploadFileList: Ref<File[]>;
    onFinish: () => void;
    onError: () => void;
    onProgress: (e: { percent: number }) => void;
  };
  [KokoMittEvent.DownloadFile]: { path: string; is_dir: boolean; size: string };
  [KokoMittEvent.StopUpload]: { fileInfo: File };
  [KokoMittEvent.UploadStopped]: { fileInfo: File };
  [KokoMittEvent.TerminalSearch]: { keyword: string; type?: string };
  [KokoMittEvent.ShareUser]: { type: string; query: string };
  [KokoMittEvent.SyncTheme]: { type: string; data: unknown };
  [KokoMittEvent.RemoveShareUser]: { sessionId: string; userMeta: OnlineUser; type: string };
  [KokoMittEvent.CreateShareUrl]: {
    type: string;
    sessionId: string;
    shareLinkRequest: {
      expiredTime: number;
      actionPerm: string;
      users: ShareUserOptions[];
    };
  };
  [KokoMittEvent.WriteDataToTerminal]: { type: string };
  [KokoMittEvent.WriteCommand]: { type: string };
  [KokoMittEvent.ConnectError]: void;
  [KokoMittEvent.CloseDrawer]: void;
}

const mittBus = mitt<Event>();

export default mittBus;
