import * as monaco from "monaco-editor/editor/editor.api.js";
import EditorWorker from "monaco-editor/editor/editor.worker?worker";
import "monaco-editor/languages/definitions/mysql/register.js";
import "monaco-editor/languages/definitions/pgsql/register.js";
import "monaco-editor/languages/definitions/sql/register.js";
import "monaco-editor/editor/browser/coreCommands.js";
import "monaco-editor/editor/contrib/suggest/browser/suggestController.js";
import "monaco-editor/editor/contrib/snippet/browser/snippetController2.js";
import "monaco-editor/editor/contrib/find/browser/findController.js";
import "monaco-editor/editor/contrib/folding/browser/folding.js";
import "monaco-editor/editor/contrib/bracketMatching/browser/bracketMatching.js";
import "monaco-editor/editor/contrib/comment/browser/comment.js";
import "monaco-editor/editor/contrib/hover/browser/hoverContribution.js";
import "monaco-editor/editor/contrib/multicursor/browser/multicursor.js";
import "monaco-editor/editor/contrib/wordOperations/browser/wordOperations.js";
import "monaco-editor/editor/contrib/clipboard/browser/clipboard.js";
import "monaco-editor/editor/contrib/contextmenu/browser/contextmenu.js";
import { parseColorToRgb } from "~/shared/theme/color";
import {
  readResolvedEditorTokens,
  readResolvedSyntaxTokens,
  readResolvedWorkspaceTokens
} from "~/shared/theme/resolvedTokens";

// Vite emits one same-origin worker asset; SQL semantics are HTTP, no LSP WebSocket or CDN.
globalThis.MonacoEnvironment = { getWorker: () => new EditorWorker() };

export function applyChenMonacoTheme() {
  const editor = readResolvedEditorTokens();
  const syntax = readResolvedSyntaxTokens();
  const workspace = readResolvedWorkspaceTokens();
  // Monaco requires hex colors; the shared resolver intentionally returns CSS rgb/rgba.
  const hex = (color: string) => {
    const rgb = parseColorToRgb(color);
    if (!rgb) return undefined;
    const alpha = color.match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\s*\)$/)?.[1];
    const channels = alpha ? [...rgb, Math.round(Number(alpha) * 255)] : rgb;
    return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
  };
  monaco.editor.defineTheme("chen-app", {
    base: document.documentElement.classList.contains("dark") ? "vs-dark" : "vs",
    inherit: true,
    rules: Object.entries(syntax).flatMap(([token, value]) => {
      const foreground = hex(value);
      return foreground ? [{ token, foreground: foreground.slice(1) }] : [];
    }),
    colors: Object.fromEntries(
      Object.entries({
        "editor.background": editor.background,
        "editor.foreground": editor.foreground,
        "editorLineNumber.foreground": editor.gutterForeground,
        "editor.lineHighlightBackground": editor.lineHighlight,
        "editor.selectionBackground": editor.selection,
        "editor.inactiveSelectionBackground": editor.selectionInactive,
        "editorCursor.foreground": editor.cursor,
        "editor.findMatchBackground": editor.findMatchActive,
        "editor.findMatchHighlightBackground": editor.findMatch,
        "editorWidget.background": workspace.panel,
        "editorWidget.border": workspace.border,
        "editorSuggestWidget.background": workspace.panel,
        "editorSuggestWidget.foreground": editor.foreground,
        "editorSuggestWidget.selectedBackground": editor.selection
      }).flatMap(([key, value]) => {
        const color = hex(value);
        return color ? [[key, color]] : [];
      })
    )
  });
  monaco.editor.setTheme("chen-app");
}

export { monaco };
