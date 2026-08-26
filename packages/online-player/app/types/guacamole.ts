export interface GuacamoleLayer {
  width: number;
  height: number;
  getCanvas?: () => HTMLCanvasElement;
}

export interface GuacamoleDisplay {
  getElement: () => HTMLElement;
  getWidth: () => number;
  getHeight: () => number;
  scale: (value: number) => void;
  getDefaultLayer?: () => GuacamoleLayer;
  onresize: ((width?: number, height?: number) => void) | null;
}

export interface GuacamoleRecording {
  getDisplay: () => GuacamoleDisplay;
  getDuration: () => number;
  getPosition: () => number;
  play: () => void;
  pause: () => void;
  seek: (millis: number, callback?: () => void) => void;
  setPlaybackRate?: (rate: number) => void;
  getPlaybackRate?: () => number;
  connect: (data: string) => void;
  disconnect: () => void;
  isPlaying: () => boolean;
  onplay: (() => void) | null;
  onpause: (() => void) | null;
  onseek: ((millis: number) => void) | null;
  onprogress: ((millis: number) => void) | null;
  onerror: ((message: string) => void) | null;
}

export interface GuacamoleStatus {
  message?: string;
}

export interface GuacamoleTunnel {
  connect: (data?: string) => void;
  disconnect: () => void;
  oninstruction: ((opcode: string, args: string[]) => void) | null;
  onstatechange: ((state: number) => void) | null;
  onerror: ((status: GuacamoleStatus) => void) | null;
}

export interface GuacamoleStatic {
  Tunnel: {
    State: {
      CONNECTING: number;
      OPEN: number;
      CLOSED: number;
      UNSTABLE: number;
    };
  };
  StaticHTTPTunnel: new (url?: string, crossDomain?: boolean, extraHeaders?: Record<string, string>) => GuacamoleTunnel;
  SessionRecording: new (tunnel: unknown) => GuacamoleRecording;
}
