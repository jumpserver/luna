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
}> = [
  { id: "follow-app", label: "Follow App Theme" },
  { id: "github-light", label: "GitHub Light" },
  { id: "github-dark", label: "GitHub Dark" },
  { id: "vscode-light", label: "VS Code Light" },
  { id: "vscode-dark", label: "VS Code Dark" },
  { id: "dracula", label: "Dracula" },
  { id: "tokyo-night", label: "Tokyo Night" }
];

export function getCodeMirrorThemePreset(id: string | null | undefined) {
  return CODEMIRROR_THEME_PRESETS.find((preset) => preset.id === id) || CODEMIRROR_THEME_PRESETS[0]!;
}

export function isCodeMirrorThemePresetId(value: string): value is CodeMirrorThemePresetId {
  return CODEMIRROR_THEME_PRESETS.some((preset) => preset.id === value);
}
