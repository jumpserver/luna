import type { TerminalSessionInfo } from "~/koko/types";
import type { HostEventType } from "~/shared/connectors/useHostBridge";
import { useKokoTerminalContext } from "~/koko/context/terminalContext";

export const useKokoTerminalEvents = () => {
  const context = useKokoTerminalContext();

  const sendHostEvent = (event: string, data: unknown) => {
    context.sendHostEvent(event, data);
  };

  const onTerminalSession = (callback: (info: TerminalSessionInfo) => void) => {
    context.eventBus.on("terminal-session", callback);
    onUnmounted(() => context.eventBus.off("terminal-session", callback));
    return () => context.eventBus.off("terminal-session", callback);
  };

  const onTerminalConnect = (callback: (data: { id: string }) => void) => {
    context.eventBus.on("terminal-connect", callback);
    onUnmounted(() => context.eventBus.off("terminal-connect", callback));
    return () => context.eventBus.off("terminal-connect", callback);
  };

  const onHostBridgeEvent = (callback: (data: { event: string, data: unknown }) => void) => {
    context.eventBus.on("host-event", callback);
    onUnmounted(() => context.eventBus.off("host-event", callback));
    return () => context.eventBus.off("host-event", callback);
  };

  const emitTerminalSession = (info: TerminalSessionInfo) => {
    context.eventBus.emit("terminal-session", info);
  };

  const sendMittEvent = (event: string, data?: unknown) => {
    context.sendMittEvent(event, data || {});
  };

  const onMittEvent = (event: string, callback: (data: unknown) => void) => {
    const unsubscribe = context.onMittEvent(event, callback);
    onUnmounted(() => unsubscribe());
    return unsubscribe;
  };

  const emitTerminalConnect = (id: string) => {
    context.eventBus.emit("terminal-connect", { id });
  };

  const sendToHost = <K extends HostEventType>(name: K, data: unknown = "") => {
    context.hostBridge.sendHost(name, data);
  };

  const onHostMessage = <K extends HostEventType>(type: K, handler: (data: unknown) => void) => {
    context.hostBridge.onHost(type, (message) => handler(message.data));
    onUnmounted(() => context.hostBridge.offHost(type));
    return () => context.hostBridge.offHost(type);
  };

  const onHostMessageOnce = <K extends HostEventType>(type: K, handler: (data: unknown) => void) => {
    context.hostBridge.once(type, (message) => handler(message.data));
  };

  return {
    sendHostEvent,
    emitTerminalSession,
    emitTerminalConnect,
    onTerminalSession,
    onTerminalConnect,
    onHostBridgeEvent,
    sendMittEvent,
    onMittEvent,
    sendToHost,
    onHostMessage,
    onHostMessageOnce,
    hostBridge: context.hostBridge
  };
};
