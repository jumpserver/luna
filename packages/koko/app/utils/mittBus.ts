import type { Ref } from "vue";
import type { TerminalMittEvent } from "#koko/composables/terminal/protocol";
import type { OnlineUser, ShareUserOptions } from "#koko/types";

import mitt from "mitt";

interface Event {
  "remove-event": void;
  "alt-shift-right": void;
  "alt-shift-left": void;
  "open-setting": void;
  "reload-table": void;
  "open-fileList": void;
  "fold-tree-click": void;
  "show-theme-config": void;
  "set-Terminal-theme": string;
  "set-theme": { themeName: string };
  "file-manage": { path: string; type: string; new_name?: string };
  "file-upload": {
    uploadFileList: Ref<File[]>;
    onFinish: () => void;
    onError: () => void;
    onProgress: (e: { percent: number }) => void;
  };
  "download-file": { path: string; is_dir: boolean; size: string };
  "stop-upload": { fileInfo: File };
  "upload-stopped": { fileInfo: File };
  "terminal-search": { keyword: string; type?: string };
  "share-user": { type: string; query: string };
  "sync-theme": { type: string; data: unknown };
  "remove-share-user": { sessionId: string; userMeta: OnlineUser; type: string };
  "create-share-url": {
    type: string;
    sessionId: string;
    shareLinkRequest: {
      expiredTime: number;
      actionPerm: string;
      users: ShareUserOptions[];
    };
  };
  writeDataToTerminal: { type: string };
  "write-command": { type: string };
  [TerminalMittEvent.OpenSearch]: void;
  "file-manager-expired": void;
  "connect-error": void;
  "close-drawer": void;
}

const mittBus = mitt<Event>();

export default mittBus;
