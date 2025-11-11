import type { Emitter, EventType } from "mitt";
import type { PermedAccount, PermedProtocol, SortType } from "~/types";

import mitt from "mitt";

type BusEvents = {
  setSort: SortType;
  search: string;
  login: undefined;
  loaded: undefined;
  loading: undefined;
  refresh: undefined;
  versionAlert: {
    type: string;
    version?: string;
  };
  assetRenamed: {
    assetId: string;
    name: string;
  };
  favoriteChanged: {
    assetId: string;
    favorite: boolean;
  };
  assetDetailUpdated: {
    assetId: string;
    permedAccounts: PermedAccount[];
    permedProtocols: PermedProtocol[];
  };
} & Record<EventType, unknown>;

const emitter: Emitter<BusEvents> = mitt<BusEvents>();

export const useEventBus = () => {
  const emit = <K extends keyof BusEvents>(event: K, payload: BusEvents[K]) => {
    emitter.emit(event, payload);
  };

  const on = <K extends keyof BusEvents>(
    event: K,
    handler: (payload: BusEvents[K]) => void,
    autoUnsubscribe = true
  ) => {
    emitter.on(event, handler as any);

    if (autoUnsubscribe) {
      onBeforeUnmount(() => emitter.off(event, handler as any));
    }

    // 返回取消订阅函数
    return () => emitter.off(event, handler as any);
  };

  const off = <K extends keyof BusEvents>(event: K, handler?: (payload: BusEvents[K]) => void) => {
    if (handler) {
      emitter.off(event, handler as any);
    } else {
      emitter.off(event as any);
    }
  };

  const once = <K extends keyof BusEvents>(event: K, handler: (payload: BusEvents[K]) => void) => {
    const wrapper = (payload: BusEvents[K]) => {
      handler(payload);
      off(event, wrapper as any);
    };
    const unsubscribe = on(event, wrapper as any, false);
    return unsubscribe;
  };

  return { emit, on, off, once };
};
