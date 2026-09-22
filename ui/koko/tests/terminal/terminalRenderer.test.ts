import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";
import { watchTerminalRenderer } from "#koko/utils/terminalRenderer";
import "@xterm/xterm/css/xterm.css";

it.skipIf(typeof document === "undefined")(
  "keeps mobile font sizing and terminal contents correct when switching renderers",
  async () => {
    // DevTools can report a mobile DPR while ResizeObserver still reports the
    // physical screen's pixels. Exercise this without changing the real screen.
    const dpr = vi.spyOn(window, "devicePixelRatio", "get").mockReturnValue(3);
    const container = document.createElement("div");
    container.style.cssText = "width: 600px; height: 300px";
    document.body.appendChild(container);
    const terminal = new Terminal({ fontSize: 11, fontFamily: "monospace", lineHeight: 1.2 });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(container);
    const mobile = ref(true);
    const stop = watchTerminalRenderer(terminal, mobile, () => fit.fit());

    try {
      await new Promise<void>((resolve) => terminal.write("font size stays in CSS pixels", resolve));
      const rows = () => container.querySelector<HTMLElement>(".xterm-rows")!;
      await vi.waitFor(() => expect(rows().textContent).toContain("font size stays in CSS pixels"));
      expect(getComputedStyle(rows()).fontSize).toBe("11px");
      expect(container.querySelector(".xterm-screen canvas")).toBeNull();
      const smallFontColumns = terminal.cols;

      terminal.options.fontSize = 18;
      fit.fit();
      expect(getComputedStyle(rows()).fontSize).toBe("18px");
      expect(terminal.cols).toBeLessThan(smallFontColumns);
      terminal.options.fontSize = 11;
      fit.fit();
      expect(terminal.cols).toBe(smallFontColumns);

      mobile.value = false;
      await nextTick();
      expect(container.querySelector(".xterm-screen canvas")).not.toBeNull();
      expect(container.querySelector(".xterm-rows")).toBeNull();

      mobile.value = true;
      await nextTick();
      await vi.waitFor(() => expect(rows().textContent).toContain("font size stays in CSS pixels"));
      expect(getComputedStyle(rows()).fontSize).toBe("11px");
      expect(container.querySelector(".xterm-screen canvas")).toBeNull();
      expect(terminal.cols).toBe(smallFontColumns);
      expect(terminal.buffer.active.getLine(0)?.translateToString(true)).toBe("font size stays in CSS pixels");

      mobile.value = false;
      await nextTick();
      stop();
      expect(container.querySelector(".xterm-screen canvas")).toBeNull();
    } finally {
      stop();
      terminal.dispose();
      container.remove();
      dpr.mockRestore();
    }
  }
);
