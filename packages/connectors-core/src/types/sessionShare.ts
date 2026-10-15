import type { Ref } from "vue";

export interface SessionShareUser {
  id: string;
  name: string;
  username: string;
}

export interface SessionShareOnlineUser {
  user_id: string;
  user: string;
  primary: boolean;
  writable: boolean;
  remote_addr?: string;
}

export interface SessionShareInfo {
  shareId: string;
  shareCode: string;
  sessionId: string;
  enableShare: boolean;
  shareURL: string;
}

export interface SessionShareLinkRequest {
  expiredTime: number;
  actionPerm: "writable" | "readonly";
  users: SessionShareUser[];
}

export interface SessionShareAdapter {
  onlineUsers: Readonly<Ref<SessionShareOnlineUser[]>>;
  shareInfo: Readonly<Ref<SessionShareInfo>>;
  userOptions: Readonly<Ref<SessionShareUser[]>>;
  hasMoreUsers: Readonly<Ref<boolean>>;
  searchUsers: (query: string, loadMore?: boolean) => void | Promise<void>;
  createShareLink: (request: SessionShareLinkRequest) => void | Promise<void>;
  copyShareURL: () => void | Promise<void>;
  removeShareUser: (user: SessionShareOnlineUser) => void | Promise<void>;
  resetShareState: () => void;
}
