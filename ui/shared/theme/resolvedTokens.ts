import type {
  ThemeEditorTokens,
  ThemeSyntaxTokens,
  ThemeTerminalTokens,
  ThemeUiTokens,
  ThemeWorkspaceTokens
} from "./schema";

import { normalizeResolvedCssColor } from "~/koko/utils/color";

function resolveCssColor(varName: string, fallback: string): string {
  if (!import.meta.client) return fallback;

  const probe = document.createElement("span");
  probe.style.setProperty("color", `var(${varName})`);
  probe.style.setProperty("position", "absolute");
  probe.style.setProperty("visibility", "hidden");
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();

  return normalizeResolvedCssColor(resolved) || fallback;
}

function resolveTokenMap<const T extends Record<string, string>>(mapping: T) {
  return Object.fromEntries(
    Object.entries(mapping).map(([key, value]) => [key, resolveCssColor(value, "") || value])
  ) as { [K in keyof T]: string };
}

export function readResolvedUiTokens(): ThemeUiTokens {
  return resolveTokenMap({
    textPrimary: "--color-text-primary",
    textSecondary: "--color-text-secondary",
    textMuted: "--color-text-tertiary",
    textInverse: "--app-text-inverse",
    borderSubtle: "--color-border-primary",
    borderStrong: "--color-border-secondary",
    focusRing: "--color-outline-primary",
    surfaceCanvas: "--color-bg-secondary",
    surfaceSidebar: "--color-app-sidebar",
    surfacePanel: "--app-surface-panel",
    surfacePanelStrong: "--color-bg-tertiary",
    surfaceHeader: "--app-surface-header",
    surfaceFooter: "--app-surface-footer",
    surfaceInput: "--app-surface-input",
    surfaceCard: "--app-surface-card",
    surfaceCardSoft: "--app-surface-card-soft",
    surfaceOverlay: "--app-surface-overlay",
    stateHover: "--color-bg-hover",
    stateHoverStrong: "--app-state-hover-strong",
    stateSelected: "--app-state-selected",
    scrollbarThumb: "--app-scrollbar-thumb",
    scrollbarThumbHover: "--app-scrollbar-thumb-hover"
  });
}

export function readResolvedEditorTokens(): ThemeEditorTokens {
  return resolveTokenMap({
    background: "--editor-background",
    foreground: "--editor-foreground",
    gutterBackground: "--editor-gutter-background",
    gutterForeground: "--editor-gutter-foreground",
    lineHighlight: "--editor-line-highlight",
    selection: "--editor-selection",
    selectionInactive: "--editor-selection-inactive",
    cursor: "--editor-cursor",
    findMatch: "--editor-find-match",
    findMatchActive: "--editor-find-match-active",
    bracketMatch: "--editor-bracket-match",
    indentGuide: "--editor-indent-guide",
    indentGuideActive: "--editor-indent-guide-active"
  });
}

export function readResolvedSyntaxTokens(): ThemeSyntaxTokens {
  return resolveTokenMap({
    keyword: "--syntax-keyword",
    string: "--syntax-string",
    number: "--syntax-number",
    comment: "--syntax-comment",
    variable: "--syntax-variable",
    type: "--syntax-type",
    function: "--syntax-function",
    operator: "--syntax-operator",
    constant: "--syntax-constant",
    property: "--syntax-property"
  });
}

export function readResolvedTerminalTokens(): ThemeTerminalTokens {
  return resolveTokenMap({
    background: "--terminal-background",
    foreground: "--terminal-foreground",
    cursor: "--terminal-cursor",
    selection: "--terminal-selection"
  });
}

export function readResolvedWorkspaceTokens(): ThemeWorkspaceTokens {
  return resolveTokenMap({
    background: "--workspace-surface-background",
    panel: "--workspace-surface-panel",
    sidebar: "--workspace-surface-sidebar",
    header: "--workspace-surface-header",
    footer: "--workspace-surface-footer",
    border: "--workspace-surface-border",
    subSidebar: "--workspace-surface-sub-sidebar",
    subPanel: "--workspace-surface-sub-panel",
    subHeader: "--workspace-surface-sub-header",
    subTab: "--workspace-surface-sub-tab",
    subTabActive: "--workspace-surface-sub-tab-active",
    subTree: "--workspace-surface-sub-tree",
    subBorder: "--workspace-surface-sub-border"
  });
}
