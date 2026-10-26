// The API consumed by Luna v3, kept compatible with TypeScript 3.5.
declare namespace Guacamole {
  interface Display {
    onresize: ((width: number, height: number) => void) | null;
    getElement(): HTMLElement;
    getWidth(): number;
    getHeight(): number;
    scale(value: number): void;
  }

  namespace SessionRecording {
    interface Source {
      stream(signal?: AbortSignal): AsyncIterable<Uint8Array>;
      read(start: number, end: number): Promise<Blob>;
      close(): void;
    }
  }

  class SessionRecording {
    constructor(source: SessionRecording.Source);
    onload: (() => void) | null;
    onplay: (() => void) | null;
    onpause: (() => void) | null;
    onseek: ((position: number, current: number, total: number) => void) | null;
    onprogress: ((duration: number, size: number) => void) | null;
    onerror: ((message: string) => void) | null;
    getDisplay(): Display;
    getDuration(): number;
    getPosition(): number;
    isPlaying(): boolean;
    play(): void;
    pause(): void;
    seek(position: number, callback?: () => void): void;
    cancel(): void;
    dispose(): void;
  }
}

export default Guacamole;
