import type { Emitter } from "mitt";

import type { LunaMessage, LunaMessageEvents } from "@/lion/types/postmessage.type";

import mitt from "mitt";

import { LUNA_MESSAGE_TYPE } from "@/lion/types/postmessage.type";

// 获取所有事件类型
export type LunaEventType = keyof LunaMessageEvents;

// 创建事件-数据映射类型
type EventPayloadMap = {
  [K in LunaEventType]: LunaMessageEvents[K]["data"] extends undefined ? void : LunaMessageEvents[K]["data"];
};

const allEventTypes = Object.keys(LUNA_MESSAGE_TYPE) as LunaEventType[];

class LunaCommunicator<T extends EventPayloadMap = EventPayloadMap> {
  private mitt: Emitter<T>;
  private lunaId: string = "";
  private targetOrigin: string = "";
  private messageHandler: ((event: MessageEvent) => void) | null = null;

  constructor() {
    this.mitt = mitt<T>();
    this.setupMessageListener();
  }

  private setupMessageListener() {
    if (typeof window === "undefined") return;
    this.messageHandler = (event: MessageEvent) => {
      if (event.source !== window.parent) return;
      if (!event.data || typeof event.data !== "object" || typeof event.data.name !== "string") return;

      const message = event.data as LunaMessage;
      switch (message.name) {
        case LUNA_MESSAGE_TYPE.PING:
          if (typeof message.id !== "string") return;
          this.lunaId = message.id;
          this.targetOrigin = event.origin === "null" ? "*" : event.origin;
          this.sendLuna(LUNA_MESSAGE_TYPE.PONG, "");
          break;
        default:
          if (!this.lunaId || (this.targetOrigin !== "*" && event.origin !== this.targetOrigin)) return;
          // 处理其他类型的消息
          if (allEventTypes.includes(message.name as LunaEventType)) {
            const eventType = message.name as keyof T;
            const data = message as T[keyof T];
            this.mitt.emit(eventType, data);
          } else {
            console.warn(`Unhandled Luna message type: ${message.name}`);
          }
      }
    };
    window.addEventListener("message", this.messageHandler);
  }

  // 发送消息到目标窗口
  public sendLuna<K extends keyof T>(name: K, data: T[K]) {
    if (typeof window === "undefined") return;
    if (!this.lunaId || !this.targetOrigin || window.parent === window) return;

    window.parent.postMessage({ name, id: this.lunaId, data }, this.targetOrigin);
  }

  // 监听事件
  public onLuna<K extends keyof T>(type: K, handler: (data: T[K]) => void) {
    this.mitt.on(type, handler);
  }

  // 移除监听器
  public offLuna<K extends keyof T>(type: K, handler?: (data: T[K]) => void) {
    this.mitt.off(type, handler);
  }

  // 监听一次性事件
  public once<K extends keyof T>(type: K, handler: (data: T[K]) => void) {
    const onceHandler = (data: T[K]) => {
      handler(data);
      this.offLuna(type, onceHandler);
    };
    this.onLuna(type, onceHandler);
  }

  // 销毁实例
  public destroy() {
    this.mitt.all.clear();
    if (this.messageHandler && typeof window !== "undefined") {
      window.removeEventListener("message", this.messageHandler);
      this.messageHandler = null;
    }
  }

  // 获取所有事件类型
  public getEventTypes(): Array<keyof T> {
    return Object.keys(this.mitt.all) as Array<keyof T>;
  }
}

export const lunaCommunicator = new LunaCommunicator<EventPayloadMap>();
