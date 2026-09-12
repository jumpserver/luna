import type { Terminal } from "@xterm/xterm";
import { connectorSessionKey } from "@jumpserver/connectors-core";
import { describe, expect, it, vi } from "vitest";
import { createApp, ref, shallowRef } from "vue";
import { useKokoTerminalCommandSuggestions } from "#koko/composables/terminal/useTerminalCommandSuggestions";
import { kokoHostAdapterKey } from "#koko/host";

function createFakeTerminal(line: { value: string; cursorX: number }) {
  let writeListener = () => {};
  const terminal = {
    cols: 80,
    rows: 24,
    buffer: {
      active: {
        type: "normal",
        baseY: 0,
        cursorY: 0,
        get cursorX() {
          return line.cursorX;
        },
        getLine: () => ({
          translateToString: (_trim?: boolean, start = 0, end = line.value.length) => line.value.slice(start, end)
        })
      }
    },
    element: null,
    focus: vi.fn(),
    onWriteParsed: vi.fn((listener: () => void) => {
      writeListener = listener;
      return { dispose: vi.fn() };
    })
  };
  return { terminal: terminal as unknown as Terminal, fireWriteParsed: () => writeListener() };
}

function mountSuggestions(terminal: Terminal) {
  let api!: ReturnType<typeof useKokoTerminalCommandSuggestions>;
  const app = createApp({});
  app.provide(kokoHostAdapterKey, {
    terminalCommandSuggestions: {
      enabled: () => true,
      scope: () => "https://example.test::user-1",
      loadHistory: async () => [],
      recordHistory: async () => {},
      clearHistory: async () => {},
      subscribeHistory: () => () => {}
    }
  } as never);
  app.provide(connectorSessionKey, {
    terminalCommandHistoryScope: "https://example.test::user-1",
    terminalProfile: { protocol: "ssh", assetPlatform: "Linux" }
  } as never);
  app.runWithContext(() => {
    api = useKokoTerminalCommandSuggestions({
      terminal: shallowRef(terminal),
      container: ref(undefined),
      send: () => true,
      disabled: () => false
    });
  });
  return { api, app };
}

describe("useKokoTerminalCommandSuggestions", () => {
  it("shows catalog suggestions on echo write, not on the keystroke", async () => {
    const line = { value: "root@y4:~# ", cursorX: 11 };
    const { terminal, fireWriteParsed } = createFakeTerminal(line);
    const { api, app } = mountSuggestions(terminal);

    api.handleData("l");
    await Promise.resolve();
    expect(api.suggestions.value).toEqual([]);

    line.value = "root@y4:~# l";
    line.cursorX = 12;
    fireWriteParsed();
    await Promise.resolve();
    expect(api.suggestions.value).toContainEqual({ command: "ls", source: "catalog" });

    app.unmount();
  });
});
