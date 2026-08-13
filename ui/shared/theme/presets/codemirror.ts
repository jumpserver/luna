import type { Extension } from "@codemirror/state";

import { dracula } from "@uiw/codemirror-theme-dracula";
import { githubDark, githubLight } from "@uiw/codemirror-theme-github";
import { tokyoNight } from "@uiw/codemirror-theme-tokyo-night";
import { vscodeDark, vscodeLight } from "@uiw/codemirror-theme-vscode";

export type CodeMirrorThemePresetId =
  | "follow-app"
  | "github-light"
  | "github-dark"
  | "vscode-light"
  | "vscode-dark"
  | "dracula"
  | "tokyo-night";

export const CODEMIRROR_THEME_PRESETS: Array<{
  id: CodeMirrorThemePresetId;
  label: string;
  extension?: Extension;
}> = [
  { id: "follow-app", label: "Follow App Theme" },
  { id: "github-light", label: "GitHub Light", extension: githubLight },
  { id: "github-dark", label: "GitHub Dark", extension: githubDark },
  { id: "vscode-light", label: "VS Code Light", extension: vscodeLight },
  { id: "vscode-dark", label: "VS Code Dark", extension: vscodeDark },
  { id: "dracula", label: "Dracula", extension: dracula },
  { id: "tokyo-night", label: "Tokyo Night", extension: tokyoNight }
];

export function getCodeMirrorThemePreset(id: string | null | undefined) {
  return CODEMIRROR_THEME_PRESETS.find((preset) => preset.id === id) || CODEMIRROR_THEME_PRESETS[0]!;
}

export function isCodeMirrorThemePresetId(value: string): value is CodeMirrorThemePresetId {
  return CODEMIRROR_THEME_PRESETS.some((preset) => preset.id === value);
}
