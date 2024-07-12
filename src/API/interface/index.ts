export interface Result {
  code?: string;
  msg?: string;
}

export interface ResultData<T = any> extends Result {
  data: T;
}

export interface INTERFACE {}

export interface GlobalSetting {
  WINDOWS_SKIP_ALL_MANUAL_PASSWORD: boolean;
  SECURITY_MAX_IDLE_TIME: number;
  XPACK_LICENSE_IS_VALID: boolean;
  SECURITY_COMMAND_EXECUTION: boolean;
  SECURITY_LUNA_REMEMBER_AUTH: boolean;
  SECURITY_WATERMARK_ENABLED: boolean;
  HELP_DOCUMENT_URL: string;
  HELP_SUPPORT_URL: string;
  TERMINAL_RAZOR_ENABLED: boolean;
  TERMINAL_MAGNUS_ENABLED: boolean;
  TERMINAL_KOKO_SSH_ENABLED: boolean;
  INTERFACE: any;
  TERMINAL_GRAPHICAL_RESOLUTION: string;
  CONNECTION_TOKEN_REUSABLE: boolean;
  CHAT_AI_ENABLED: boolean;
}

export interface TreeMeta {
  type: string;

  data: {
    id: string;
    key: string;
    value: string;
  };
}

export interface Tree {
  id: string;

  isParent: Boolean;

  name: string;

  open: Boolean;

  pId: string;

  title: string;

  meta: TreeMeta;
}
