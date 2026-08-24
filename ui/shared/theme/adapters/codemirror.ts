import type { Extension } from "@codemirror/state";

import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { tokyoNightStyle } from "@uiw/codemirror-theme-tokyo-night";
import { getCodeMirrorThemePreset } from "~/shared/theme/presets/codemirror";

export function createCodeMirrorTheme(): Extension {
  const preset = getCodeMirrorThemePreset(useSettingManager().codeMirrorThemePreset.value);
  const typography = EditorView.theme({
    "&": { height: "100%" },
    ".cm-scroller": {
      fontFamily: "var(--font-mono), 'SFMono-Regular', Consolas, monospace",
      fontSize: "var(--app-code-font-size)",
      lineHeight: "1.6"
    }
  });

  if (preset.extension) {
    return [preset.extension, typography];
  }

  const editor = {
    background: "var(--editor-background)",
    foreground: "var(--editor-foreground)",
    gutterBackground: "var(--editor-gutter-background)",
    gutterForeground: "var(--editor-gutter-foreground)",
    lineHighlight: "var(--editor-line-highlight)",
    selection: "var(--editor-selection)",
    selectionInactive: "var(--editor-selection-inactive)",
    cursor: "var(--editor-cursor)",
    findMatch: "var(--editor-find-match)",
    findMatchActive: "var(--editor-find-match-active)",
    bracketMatch: "var(--editor-bracket-match)",
    indentGuide: "var(--editor-indent-guide)",
    indentGuideActive: "var(--editor-indent-guide-active)"
  };

  return [
    typography,
    EditorView.theme({
      "&": {
        height: "100%",
        backgroundColor: editor.background,
        color: editor.foreground
      },
      ".cm-scroller": { overflow: "auto" },
      ".cm-content": { padding: "10px 0", caretColor: editor.cursor },
      ".cm-gutters": {
        backgroundColor: editor.gutterBackground,
        color: editor.gutterForeground,
        borderRight: "1px solid var(--workspace-surface-border)"
      },
      ".cm-activeLine, .cm-activeLineGutter": {
        backgroundColor: editor.lineHighlight
      },
      ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": {
        backgroundColor: `${editor.selection} !important`
      },
      ".cm-cursor, .cm-dropCursor": { borderLeftColor: editor.cursor },
      ".cm-selectionMatch": { backgroundColor: editor.selectionInactive },
      ".cm-searchMatch": { backgroundColor: editor.findMatch, outline: "1px solid transparent" },
      ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: editor.findMatchActive },
      ".cm-matchingBracket, .cm-nonmatchingBracket": {
        backgroundColor: editor.bracketMatch,
        outline: "1px solid transparent"
      },
      ".cm-tooltip": {
        backgroundColor: "var(--workspace-surface-panel)",
        color: editor.foreground,
        border: "1px solid var(--workspace-surface-border)",
        boxShadow: "var(--theme-shadow-soft)"
      },
      ".cm-tooltip-autocomplete > ul > li": { color: editor.foreground },
      ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
        backgroundColor: editor.selection,
        color: editor.foreground
      },
      ".cm-completionDetail": { color: editor.gutterForeground },
      ".cm-completionIcon": { color: editor.gutterForeground },
      ".cm-completionMatchedText": { color: editor.foreground },
      ".cm-indent-markers .cm-indent-mark": { borderColor: editor.indentGuide },
      ".cm-indent-markers .cm-indent-mark.cm-indent-mark-active": { borderColor: editor.indentGuideActive },
      "&.cm-focused": { outline: "none" }
    })
  ];
}

export function createCodeMirrorSyntaxTheme(): Extension {
  if (getCodeMirrorThemePreset(useSettingManager().codeMirrorThemePreset.value).extension) return [];

  if (import.meta.client && document.documentElement.classList.contains("dark")) {
    return syntaxHighlighting(HighlightStyle.define(tokyoNightStyle));
  }

  const syntax = {
    keyword: "var(--syntax-keyword)",
    string: "var(--syntax-string)",
    number: "var(--syntax-number)",
    comment: "var(--syntax-comment)",
    variable: "var(--syntax-variable)",
    type: "var(--syntax-type)",
    function: "var(--syntax-function)",
    operator: "var(--syntax-operator)",
    constant: "var(--syntax-constant)",
    property: "var(--syntax-property)"
  };

  return syntaxHighlighting(
    HighlightStyle.define([
      { tag: [tags.keyword, tags.modifier, tags.operatorKeyword], color: syntax.keyword },
      { tag: [tags.string, tags.special(tags.string)], color: syntax.string },
      { tag: [tags.number, tags.integer, tags.float, tags.bool], color: syntax.number },
      { tag: [tags.comment, tags.lineComment, tags.blockComment], color: syntax.comment, fontStyle: "italic" },
      { tag: [tags.variableName, tags.self, tags.atom], color: syntax.variable },
      { tag: [tags.typeName, tags.className, tags.namespace, tags.annotation], color: syntax.type },
      {
        tag: [tags.function(tags.variableName), tags.function(tags.propertyName), tags.labelName],
        color: syntax.function
      },
      { tag: [tags.operator, tags.punctuation, tags.separator], color: syntax.operator },
      { tag: [tags.constant(tags.name), tags.color, tags.standard(tags.name)], color: syntax.constant },
      { tag: [tags.propertyName], color: syntax.property }
    ]),
    { fallback: true }
  );
}
