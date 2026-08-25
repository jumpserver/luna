import type { Extension } from "@codemirror/state";

type CodeMirrorThemeModule = typeof import("./codemirror");

let adapters: CodeMirrorThemeModule | undefined;
let loading: Promise<CodeMirrorThemeModule> | undefined;

export function ensureCodeMirrorThemeAdapters() {
  loading ??= import("./codemirror").then((module) => {
    adapters = module;
    return module;
  });
  return loading;
}

export function createHostCodeMirrorTheme(): Extension {
  if (!adapters) {
    throw new Error("CodeMirror theme adapters are not loaded");
  }
  return adapters.createCodeMirrorTheme();
}

export function createHostCodeMirrorSyntaxTheme(): Extension {
  if (!adapters) {
    throw new Error("CodeMirror theme adapters are not loaded");
  }
  return adapters.createCodeMirrorSyntaxTheme();
}
