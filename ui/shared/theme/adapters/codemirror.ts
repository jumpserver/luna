import type { Extension } from "@codemirror/state";

import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { readResolvedEditorTokens, readResolvedSyntaxTokens, readResolvedWorkspaceTokens } from "~/shared/theme/resolvedTokens";

export function createCodeMirrorTheme(): Extension {
  const editor = readResolvedEditorTokens();
  const workspace = readResolvedWorkspaceTokens();

  return EditorView.theme({
    "&": {
      height: "100%",
      backgroundColor: editor.background,
      color: editor.foreground
    },
    ".cm-scroller": {
      overflow: "auto",
      fontFamily: "var(--font-mono), 'SFMono-Regular', Consolas, monospace",
      fontSize: "13px",
      lineHeight: "21px"
    },
    ".cm-content": { padding: "10px 0", caretColor: editor.cursor },
    ".cm-gutters": {
      backgroundColor: editor.gutterBackground,
      color: editor.gutterForeground,
      borderRight: `1px solid ${workspace.border}`
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
    ".cm-indent-markers .cm-indent-mark": { borderColor: editor.indentGuide },
    ".cm-indent-markers .cm-indent-mark.cm-indent-mark-active": { borderColor: editor.indentGuideActive },
    "&.cm-focused": { outline: "none" }
  });
}

export function createCodeMirrorSyntaxTheme(): Extension {
  const syntax = readResolvedSyntaxTokens();

  return syntaxHighlighting(HighlightStyle.define([
    { tag: [tags.keyword, tags.modifier, tags.operatorKeyword], color: syntax.keyword },
    { tag: [tags.string, tags.special(tags.string)], color: syntax.string },
    { tag: [tags.number, tags.integer, tags.float, tags.bool], color: syntax.number },
    { tag: [tags.comment, tags.lineComment, tags.blockComment], color: syntax.comment, fontStyle: "italic" },
    { tag: [tags.variableName, tags.self, tags.atom], color: syntax.variable },
    { tag: [tags.typeName, tags.className, tags.namespace, tags.annotation], color: syntax.type },
    { tag: [tags.function(tags.variableName), tags.function(tags.propertyName), tags.labelName], color: syntax.function },
    { tag: [tags.operator, tags.punctuation, tags.separator], color: syntax.operator },
    { tag: [tags.constant(tags.name), tags.color, tags.standard(tags.name)], color: syntax.constant },
    { tag: [tags.propertyName], color: syntax.property }
  ]), { fallback: true });
}
