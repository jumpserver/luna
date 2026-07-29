import type Zmodem from "zmodem-ts";

export type KokoZmodemSentry = InstanceType<typeof Zmodem.Sentry>;

export interface ZmodemTransferDetails {
  name: string;
  size: number;
}

export interface KokoZmodemTransfer {
  get_details: () => ZmodemTransferDetails;
  get_offset: () => number;
  on: (event: "input", handler: (payload: Uint8Array) => void) => KokoZmodemTransfer;
  send: (payload: Uint8Array) => void;
  end: (payload?: Uint8Array) => Promise<unknown>;
  accept: (options?: {
    offset?: number;
    on_input?: "spool_uint8array" | "spool_array" | ((payload: Uint8Array) => void);
  }) => Promise<Uint8Array[]>;
  skip: (...args: unknown[]) => Promise<unknown> | void;
}

interface BaseKokoZmodemSession {
  abort: () => void;
  aborted: () => boolean;
  has_ended: () => boolean;
  on: (event: "session_end", handler: () => void) => KokoZmodemSession;
}

export interface KokoZmodemSendSession extends BaseKokoZmodemSession {
  type: "send";
  send_offer: (offer: {
    name: string;
    size: number;
    mtime: Date;
    files_remaining: number;
    bytes_remaining: number;
  }) => Promise<KokoZmodemTransfer | undefined>;
}

export interface KokoZmodemReceiveSession extends BaseKokoZmodemSession {
  type: "receive";
  on: ((event: "session_end", handler: () => void) => KokoZmodemReceiveSession) &
    ((event: "offer", handler: (transfer: KokoZmodemTransfer) => void) => KokoZmodemReceiveSession);
  start: () => Promise<unknown>;
}

export type KokoZmodemSession = KokoZmodemSendSession | KokoZmodemReceiveSession;

export interface KokoZmodemDetection {
  confirm: () => KokoZmodemSession;
}
