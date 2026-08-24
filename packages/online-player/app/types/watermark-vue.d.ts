declare module "@watermark-design/vue" {
  import type { Plugin } from "vue";

  const plugin: Plugin;
  export default plugin;
}

declare module "vue" {
  export interface GlobalComponents {
    Watermark: import("vue").DefineComponent<{
      options: Record<string, unknown>;
      modelValue: boolean;
      isBody: boolean;
    }>;
  }
}

export {};
