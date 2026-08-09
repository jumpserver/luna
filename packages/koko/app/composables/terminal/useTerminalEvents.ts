import type { HostEventType } from "@jumpserver/connectors-core";
import type { TerminalSessionInfo } from "#koko/types";
import type { TerminalMittEvent } from "./protocol";
import { useKokoTerminalContext } from "#koko/context/terminalContext";
import { TerminalEventType } from "./protocol";

export const useKokoTerminalEvents = () => {
  const context = useKokoTerminalContext();

  const sendHostEvent = (event: string, data: unknown) => {
    context.sendHostEvent(event, data);
  };

  const onTerminalSession = (callback: (info: TerminalSessionInfo) => void) => {
    context.eventBus.on(TerminalEventType.Session, callback);
    onUnmounted(() => context.eventBus.off(TerminalEventType.Session, callback));

    return () => context.eventBus.off(TerminalEventType.Session, callback);
  };

  const onTerminalConnect = (callback: (data: { id: string }) => void) => {
    context.eventBus.on(TerminalEventType.Connect, callback);
    onUnmounted(() => context.eventBus.off(TerminalEventType.Connect, callback));

    return () => context.eventBus.off(TerminalEventType.Connect, callback);
  };

  const onHostBridgeEvent = (callback: (data: { event: string; data: unknown }) => void) => {
    context.eventBus.on(TerminalEventType.Host, callback);
    onUnmounted(() => context.eventBus.off(TerminalEventType.Host, callback));

    return () => context.eventBus.off(TerminalEventType.Host, callback);
  };

  const emitTerminalSession = (info: TerminalSessionInfo) => {
    context.eventBus.emit(TerminalEventType.Session, info);
  };

  const sendMittEvent = (event: TerminalMittEvent) => {
    context.sendMittEvent(event);
  };

  const onMittEvent = (event: TerminalMittEvent, callback: () => void) => {
    const unsubscribe = context.onMittEvent(event, callback);
    onUnmounted(() => unsubscribe());

    return unsubscribe;
  };

  const emitTerminalConnect = (id: string) => {
    context.eventBus.emit(TerminalEventType.Connect, { id });
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
    onMittEvent,
    onHostMessage,
    onTerminalSession,
    onTerminalConnect,
    onHostBridgeEvent,
    onHostMessageOnce,

    sendToHost,
    sendHostEvent,
    sendMittEvent,

    emitTerminalSession,
    emitTerminalConnect,

    hostBridge: context.hostBridge,
    setClipboardAccess: context.setClipboardAccess,
    validateClipboardText: context.validateClipboardText
  };
};
