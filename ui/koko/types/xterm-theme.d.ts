declare module "xterm-theme" {
  import type { ITheme } from "@xterm/xterm";

  const themes: Record<string, ITheme>;
  export default themes;
}
