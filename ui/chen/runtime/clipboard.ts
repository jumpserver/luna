import { writeText as writeWebText } from "clipboard-polyfill";

import { desktopClipboard } from "~/shared/desktop/bridge";
import { isDesktopRuntime } from "~/utils/runtime";

export interface ChenClipboardRuntime {
  isDesktop: () => boolean;
  writeWeb: (text: string) => Promise<unknown>;
  writeDesktop: (text: string) => Promise<unknown>;
}

const defaultRuntime: ChenClipboardRuntime = {
  isDesktop: isDesktopRuntime,
  writeWeb: writeWebText,
  writeDesktop: desktopClipboard.writeText
};

export async function writeChenClipboardText(text: string, runtime: ChenClipboardRuntime = defaultRuntime) {
  if (runtime.isDesktop()) {
    await runtime.writeDesktop(text);
    return;
  }
  await runtime.writeWeb(text);
}
