import { describe, expect, it } from "vitest";
import connectView from "../../pages/ConnectView.vue?raw";
import terminalComponent from "../../components/Terminal/index.vue?raw";
import terminalProvider from "../../components/TerminalProvider/index.vue?raw";
import drawerComponent from "../../components/Drawer/index.vue?raw";
import drawerGeneral from "../../components/Drawer/General/index.vue?raw";
import sessionShare from "../../components/Drawer/SessionShare/index.vue?raw";
import searchInput from "../../components/SearchInput/index.vue?raw";
import terminalSessionSurface from "../../workspaces/TerminalSessionSurface.vue?raw";
import baseWorkspaceShell from "../../workspaces/BaseWorkspaceShell.vue?raw";

describe("terminal UI composition", () => {
  it("wires ConnectView through the terminal provider, xterm surface, and drawer", () => {
    expect(connectView).toContain("KokoTerminalProvider");
    expect(connectView).toContain("#terminal");
    expect(connectView).toContain("<KokoTerminal");
    expect(connectView).toContain("#drawer");
    expect(connectView).toContain("<KokoDrawer");
  });

  it("keeps the workspace terminal surface behind BaseWorkspaceShell", () => {
    expect(terminalSessionSurface).toContain("useBaseWorkspaceSession");
    expect(terminalSessionSurface).toContain("<BaseWorkspaceShell");
    expect(terminalSessionSurface).toContain("<KokoConnectView");
    expect(terminalSessionSurface).toContain('disableAutoHash: "false"');
  });

  it("creates and tears down terminal context in the provider", () => {
    expect(terminalProvider).toContain("createKokoTerminalContext");
    expect(terminalProvider).toContain("kokoTerminalContextKey");
    expect(terminalProvider).toContain("terminalContext.initialize()");
    expect(terminalProvider).toContain("terminalContext.cleanup()");
  });

  it("exposes search, zmodem upload, context menu, and connection errors on the xterm surface", () => {
    expect(terminalComponent).toContain("KokoSearchInput");
    expect(terminalComponent).toContain("TerminalMittEvent.OpenSearch");
    expect(terminalComponent).toContain('id="terminal-container"');
    expect(terminalComponent).toContain("contextMenuItems");
    expect(terminalComponent).toContain("canUseClipboard");
    expect(terminalComponent).toContain("host.splitSession");
    expect(terminalComponent).toContain("uploadOpen");
    expect(terminalComponent).toContain("confirmUpload");
    expect(terminalComponent).toContain("connectionError");
  });

  it("opens the drawer from host OPEN and koko mitt events", () => {
    expect(drawerComponent).toContain("HOST_MESSAGE_TYPE.OPEN");
    expect(drawerComponent).toContain("KokoMittEvent.OpenSetting");
    expect(drawerComponent).toContain("KokoMittEvent.CloseDrawer");
    expect(drawerComponent).toContain('id="drawer-inner-target"');
    expect(drawerComponent).toContain("KokoDrawerGeneral");
  });

  it("sends shortcut keys through KokoMittEvent.WriteCommand", () => {
    expect(drawerGeneral).toContain("KokoMittEvent.WriteCommand");
    expect(drawerGeneral).toContain("\\x03");
    expect(drawerGeneral).toContain("writeDataToTerminal");
  });

  it("copies a share URL only when sharing is enabled", () => {
    expect(sessionShare).toContain("copyShareURL");
    expect(sessionShare).toContain(':disabled="!shareInfo.enableShare || !shareInfo.shareId"');
    expect(sessionShare).toContain("onlineUsers");
  });

  it("keeps SearchInput clicks void-typed and bound to the xterm search addon", () => {
    expect(searchInput).toContain("void props.searchAddon.findPrevious");
    expect(searchInput).toContain("void props.searchAddon.findNext");
    expect(searchInput).toContain("void emit('close')");
    expect(searchInput).toContain("toggleSearchOption");
  });

  it("voids the workspace shell retry emit for UButton", () => {
    expect(baseWorkspaceShell).toContain("@click=\"void $emit('retry')\"");
    expect(baseWorkspaceShell).toContain("i-lucide-circle-alert");
    expect(baseWorkspaceShell).toContain("i-lucide-loader-circle");
  });
});
