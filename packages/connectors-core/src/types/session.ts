import type { JmsComponent } from "./component";

export interface ConnectorSessionContext {
  component: JmsComponent;
  tokenId: string;
  ticket?: string;
  endpointUrl: string;
  tabId?: string;
  terminalThemeName?: string;
  colorMode?: string;
  themeType?: string;
  disableAutoHash?: string;
  actions?: Array<string | { value?: string; label?: string }>;
}
