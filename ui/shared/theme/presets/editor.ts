export interface EditorThemePresetOption {
  id: string
  label: string
  source: "follow-app" | "built-in"
}

export const EDITOR_THEME_PRESETS: EditorThemePresetOption[] = [
  { id: "follow-app", label: "Follow App Theme", source: "follow-app" },
  { id: "app-classic", label: "App Classic", source: "built-in" }
];
