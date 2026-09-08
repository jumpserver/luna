import type { DefineComponent } from "vue";
import type { WebProxyBridge } from "./bridge";
export interface WebProxySurfaceProps {
  request: Record<string, any> | undefined;
  bridge: WebProxyBridge;
  active: boolean;
  supported: boolean;
  colorScheme?: "light" | "dark";
  macInset?: boolean;
  recordingRequired?: boolean;
  reconnectable?: boolean;
}
declare const component: DefineComponent<WebProxySurfaceProps, { focus(): void; close(): Promise<boolean> }>;
export default component;
