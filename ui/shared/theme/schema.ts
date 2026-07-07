export interface ThemeSeedTokens {
  bg: string
  fg: string
  muted: string
  border: string
  accent: string
  surface: string
  surfaceHover: string
  shadowSoft: string
}

export interface ThemeUiTokens {
  textPrimary: string
  textSecondary: string
  textMuted: string
  textInverse: string
  borderSubtle: string
  borderStrong: string
  focusRing: string
  surfaceCanvas: string
  surfaceSidebar: string
  surfacePanel: string
  surfacePanelStrong: string
  surfaceHeader: string
  surfaceFooter: string
  surfaceInput: string
  surfaceCard: string
  surfaceCardSoft: string
  surfaceOverlay: string
  stateHover: string
  stateHoverStrong: string
  stateSelected: string
  scrollbarThumb: string
  scrollbarThumbHover: string
}

export interface ThemeEditorTokens {
  background: string
  foreground: string
  gutterBackground: string
  gutterForeground: string
  lineHighlight: string
  selection: string
  selectionInactive: string
  cursor: string
  findMatch: string
  findMatchActive: string
  bracketMatch: string
  indentGuide: string
  indentGuideActive: string
}

export interface ThemeSyntaxTokens {
  keyword: string
  string: string
  number: string
  comment: string
  variable: string
  type: string
  function: string
  operator: string
  constant: string
  property: string
}

export interface ThemeTerminalTokens {
  background: string
  foreground: string
  cursor: string
  selection: string
}

export interface ThemeDataGridTokens {
  headerBackground: string
  rowBackground: string
  rowHover: string
  rowSelected: string
  border: string
  text: string
  textMuted: string
}

export interface ThemeWorkspaceTokens {
  background: string
  panel: string
  sidebar: string
  header: string
  footer: string
  border: string
  subSidebar: string
  subPanel: string
  subHeader: string
  subTab: string
  subTabActive: string
  subTree: string
  subBorder: string
}

export interface AppThemeDefinition {
  id: string
  label: string
  appearance: "light" | "dark"
  seed: ThemeSeedTokens
  ui: Partial<ThemeUiTokens>
  editor: Partial<ThemeEditorTokens>
  syntax: Partial<ThemeSyntaxTokens>
  terminal: Partial<ThemeTerminalTokens>
  dataGrid: Partial<ThemeDataGridTokens>
  workspace: Partial<ThemeWorkspaceTokens>
  metadata?: {
    source?: "built-in" | "zed-import"
    sourceThemeId?: string
    sourceThemeName?: string
  }
}

export const THEME_DOMAINS = [
  "seed",
  "ui",
  "editor",
  "syntax",
  "terminal",
  "dataGrid",
  "workspace"
] as const;

export type ThemeDomain = (typeof THEME_DOMAINS)[number];
