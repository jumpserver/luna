import { ElectronAPI } from '@electron-toolkit/preload';

declare global {
  interface Window {
    electron: ElectronAPI & {
      ipcRenderer: {
        invoke: (
          channel: string,
          ...args: any[]
        ) => Promise<any>;
        on: (channel: string, listener: (...args: any[]) => void) => void;
        off: (channel: string, listener: (...args: any[]) => void) => void;
        send: (channel: string, ...args: any[]) => void;
      };
    };
    api: unknown;
  }
}
