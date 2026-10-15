import type { Terminal } from "@xterm/xterm";
import type { Ref } from "vue";
import { WebglAddon } from "@xterm/addon-webgl";
import { watch } from "vue";

export function watchTerminalRenderer(terminal: Terminal, mobile: Ref<boolean>, fit: () => void) {
  return watch(
    mobile,
    (isMobile, _previous, onCleanup) => {
      // ponytail: WebGL 0.19 can mix emulated DPR with physical canvas pixels and
      // enlarge text. Use xterm's DOM renderer on mobile until upstream fixes it.
      if (!isMobile) {
        const webgl = new WebglAddon();
        let disposed = false;
        const dispose = () => {
          if (disposed) return;
          disposed = true;
          webgl.dispose();
        };
        onCleanup(dispose);
        webgl.onContextLoss(dispose);
        terminal.loadAddon(webgl);
      }
      fit();
    },
    { immediate: true, flush: "post" }
  );
}
