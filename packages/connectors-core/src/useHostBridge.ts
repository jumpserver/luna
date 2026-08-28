import mitt from "mitt";
import { HOST_MESSAGE_TYPE } from "./types/message";

export type HostEventType = `${HOST_MESSAGE_TYPE}`;

export interface HostMessage {
  name: HostEventType | string;
  id?: string;
  origin?: string;
  data?: unknown;
  theme?: string;
  token?: string;
  disableFileManager?: boolean;
}

type HostBusEvents = Record<string, HostMessage>;

export function createHostBridge() {
  const bus = mitt<HostBusEvents>();
  let hostId = "";
  let disableFileManager = false;
  const sendHost = <K extends HostEventType>(name: K, data: unknown = "") =>
    bus.emit(name, { name, id: hostId, data } as HostMessage);
  const onHost = <K extends HostEventType>(type: K, handler: (data: HostMessage) => void) => bus.on(type, handler);
  const offHost = <K extends HostEventType>(type: K, handler?: (data: HostMessage) => void) => bus.off(type, handler);
  const once = <K extends HostEventType>(type: K, handler: (data: HostMessage) => void) => {
    const onceHandler = (data: HostMessage) => {
      handler(data);
      offHost(type, onceHandler);
    };
    onHost(type, onceHandler);
  };
  const handleExternalMessage = (message: HostMessage) => {
    if (message.name === HOST_MESSAGE_TYPE.PING) {
      hostId = message.id || hostId;
      disableFileManager = !!message.disableFileManager;
      sendHost(HOST_MESSAGE_TYPE.PONG, "");
    }
    bus.emit(message.name, message);
  };
  const bindPostMessage = () => {
    if (!import.meta.client) return () => {};
    const listener = (event: MessageEvent) => {
      const message = event.data as HostMessage;
      if (!message?.name) return;
      handleExternalMessage(message);
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  };
  return {
    sendHost,
    onHost,
    offHost,
    once,
    bindPostMessage,
    destroy: () => bus.all.clear(),
    getHostId: () => hostId,
    getDisableFileManager: () => disableFileManager
  };
}

export type HostBridge = ReturnType<typeof createHostBridge>;
