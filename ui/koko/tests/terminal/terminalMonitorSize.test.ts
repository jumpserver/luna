import { Terminal } from "@xterm/xterm";
import { expect, it } from "vitest";
import { shallowRef } from "vue";
import { createKokoTerminalMessageHandlers } from "#koko/composables/terminal/useTerminalMessageHandler";

it("uses the source terminal width before rendering monitored readline redraws", async () => {
  const terminal = new Terminal({ cols: 20, rows: 24 });
  const handlers = createKokoTerminalMessageHandlers({
    terminalRef: shallowRef(terminal),
    sessionCtxRef: shallowRef({ wsQuery: { type: "monitor" } })
  } as unknown as Parameters<typeof createKokoTerminalMessageHandlers>[0]);
  try {
    handlers.TERMINAL_RESIZE?.({
      id: "",
      type: "TERMINAL_RESIZE",
      data: JSON.stringify({ Width: 40, Height: 24 })
    });
    expect(terminal.cols).toBe(40);
    const command = "dameng=>select id, name from test;";
    await new Promise<void>((resolve) => terminal.write(`${command}\r\x1b[2K${command}\r\n`, resolve));
    const lines = Array.from({ length: 3 }, (_, index) =>
      terminal.buffer.active.getLine(index)?.translateToString(true)
    );
    expect(lines.filter((line) => line?.includes("dameng=>"))).toHaveLength(1);
    expect(lines[0]).toBe(command);
  } finally {
    terminal.dispose();
  }
});
