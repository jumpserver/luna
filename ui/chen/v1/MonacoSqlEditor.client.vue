<script setup lang="ts">
import type { ChenGoApi, GoAnalysis } from "./api";
import type { SqlSourceRange } from "./executionRange";
import { nextTick, onBeforeUnmount, onMounted, shallowRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import { chenSqlDialect } from "~/chen/utils/sqlDialect";
import { formatChenSql } from "~/chen/utils/sqlFormat";
import { registerWorkspaceClipboardSurface } from "~/composables/useWorkspaceClipboardPaste";
import { completionFilterText, completionIsCurrent, completionKeywordText, waitForCompletion } from "./completion";
import { analysisMatches, statementAt, statementFoldingRanges } from "./executionRange";
import { applyChenMonacoTheme, monaco } from "./monaco";

const props = defineProps<{
  modelValue: string;
  dialect: string;
  consoleId: string;
  api: ChenGoApi;
  canCopy: boolean;
  canPaste: boolean;
  canCancel?: boolean;
  readOnly?: boolean;
  online?: boolean;
  visible?: boolean;
  sqlKeywordCase?: "lower" | "upper";
}>();
const emit = defineEmits<{
  "update:modelValue": [value: string];
  run: [sql: string, version: number];
  explain: [sql: string, version: number];
  runScope: [mode: "selection" | "current"];
  editorError: [message: string];
  cancel: [];
  openSnippets: [];
  saveSnippet: [];
}>();
const { t } = useI18n();
const host = shallowRef<HTMLElement | null>(null);
let editor: monaco.editor.IStandaloneCodeEditor | undefined;
let model: monaco.editor.ITextModel | undefined;
const disposables: monaco.IDisposable[] = [];
const foldingChanged = new monaco.Emitter<monaco.languages.FoldingRangeProvider>();
let themeObserver: MutationObserver | undefined;
let completion: AbortController | undefined;
let completionContext: { version: number; offset: number } | undefined;
let completionSerial = 0;
let layoutFrame = 0;
let statementFrameRequest = 0;
let analysis: { consoleId: string; result: GoAnalysis } | undefined;
let analysisRequest: { consoleId: string; version: number; promise: Promise<GoAnalysis | undefined> } | undefined;
let analysisController: AbortController | undefined;
let analysisTimer: ReturnType<typeof setTimeout> | undefined;
let framedStatement: SqlSourceRange | null = null;
const statementFrame = shallowRef<{ left: number; top: number; width: number; height: number; gutter: number }>();
let unregisterClipboard: (() => void) | undefined;
const runMarkers = shallowRef<
  {
    from: number;
    to: number;
    line: number;
    top: number;
    left: number;
    version: number;
    consoleId: string;
  }[]
>([]);
function updateRunMarkers() {
  const result = currentAnalysis();
  if (!editor || !model || !result || props.readOnly || props.visible === false) {
    runMarkers.value = [];
    return;
  }
  const layout = editor.getLayoutInfo();
  const height = editor.getOption(monaco.editor.EditorOption.lineHeight);
  const lines = new Set<number>();
  const sql = model.getValue();
  runMarkers.value = result.statements.flatMap((range) => {
    if (
      !Number.isInteger(range.from) ||
      !Number.isInteger(range.to) ||
      range.from < 0 ||
      range.to > sql.length ||
      range.from >= range.to
    )
      return [];
    const source = sql.slice(range.from, range.to);
    if (!source.trim()) return [];
    const from = range.from + source.length - source.trimStart().length;
    const line = model!.getPositionAt(from).lineNumber;
    const top = editor!.getTopForLineNumber(line) - editor!.getScrollTop();
    if (lines.has(line) || top < 0 || top + height > layout.height) return [];
    lines.add(line);
    return [
      {
        from,
        to: range.to,
        line,
        top,
        left: layout.glyphMarginLeft,
        version: model!.getVersionId(),
        consoleId: props.consoleId
      }
    ];
  });
}
function runMarker(marker: (typeof runMarkers.value)[number]) {
  if (
    !model ||
    !currentAnalysis() ||
    props.online === false ||
    props.visible === false ||
    props.readOnly ||
    marker.version !== model.getVersionId() ||
    marker.consoleId !== props.consoleId
  )
    return;
  emit("run", model.getValue().slice(marker.from, marker.to), marker.version);
}

function invalidateCompletion() {
  completion?.abort();
  completionContext = undefined;
  completionSerial++;
}

function dismissCompletion() {
  invalidateCompletion();
  editor?.trigger("chen", "hideSuggestWidget", {});
}

function completionEnabled() {
  return !props.readOnly && props.online !== false && props.visible !== false && !!props.consoleId;
}

function complete() {
  if (!completionEnabled()) return;
  editor?.focus();
  editor?.trigger("chen", "editor.action.triggerSuggest", {});
}

function invalidateChangedCompletion() {
  if (!completionContext) return;
  const position = editor?.getPosition();
  // Monaco may already have started a fresh request from this same event.
  if (
    !model ||
    completionContext.version !== model.getVersionId() ||
    !position ||
    completionContext.offset !== model.getOffsetAt(position)
  )
    invalidateCompletion();
}

function updateStatementFrame() {
  cancelAnimationFrame(statementFrameRequest);
  if (!framedStatement) {
    statementFrame.value = undefined;
    return;
  }
  statementFrameRequest = requestAnimationFrame(() => {
    if (!editor || !model || !framedStatement) return;
    const start = model.getPositionAt(framedStatement.from);
    const end = model.getPositionAt(framedStatement.to);
    const layout = editor.getLayoutInfo();
    const gutter = layout.contentLeft - 3;
    const top = editor.getTopForLineNumber(start.lineNumber) - editor.getScrollTop();
    const bottom = editor.getBottomForLineNumber(end.lineNumber) - editor.getScrollTop();
    if (bottom <= 0 || top >= layout.height) {
      statementFrame.value = undefined;
      return;
    }

    const visible = editor.getVisibleRanges();
    const charWidth = editor.getOption(monaco.editor.EditorOption.fontInfo).typicalHalfwidthCharacterWidth;
    let left = Infinity;
    let right = 0;
    for (let lineNumber = start.lineNumber; lineNumber <= end.lineNumber; lineNumber++) {
      const from = lineNumber === start.lineNumber ? start.column : model.getLineFirstNonWhitespaceColumn(lineNumber);
      const to = lineNumber === end.lineNumber ? end.column : model.getLineLastNonWhitespaceColumn(lineNumber);
      if (!from || to <= from) continue;
      const isVisible = visible.some(
        (range) => lineNumber >= range.startLineNumber && lineNumber <= range.endLineNumber
      );
      const offset = (column: number) => {
        const measured = isVisible ? editor!.getOffsetForColumn(lineNumber, column) : -1;
        // ponytail: approximate unrendered lines by Monaco's display columns; exact widths would require rendering them.
        return measured >= 0
          ? measured
          : (editor!.getVisibleColumnFromPosition({ lineNumber, column }) - 1) * charWidth;
      };
      left = Math.min(left, offset(from));
      right = Math.max(right, offset(to));
    }
    if (right <= left) {
      statementFrame.value = undefined;
      return;
    }
    statementFrame.value = {
      left: left - editor.getScrollLeft(),
      top,
      width: right - left + 6,
      height: bottom - top,
      gutter
    };
  });
}

function frameStatement(range: SqlSourceRange | null) {
  if (range?.from === framedStatement?.from && range?.to === framedStatement?.to) return;
  framedStatement = range;
  updateStatementFrame();
}

function currentAnalysis() {
  return model &&
    analysis &&
    analysisMatches(analysis.result.document_version, model.getVersionId(), analysis.consoleId, props.consoleId)
    ? analysis.result
    : undefined;
}

const foldingProvider: monaco.languages.FoldingRangeProvider = {
  onDidChange: foldingChanged.event,
  provideFoldingRanges(candidate) {
    const result = currentAnalysis();
    if (candidate !== model || !result) return [];
    return statementFoldingRanges(
      candidate.getValue(),
      result.statements,
      (offset) => candidate.getPositionAt(offset).lineNumber
    );
  }
};

function updateScope() {
  updateRunMarkers();
  if (!editor || !model) return;
  const selection = editor.getSelection();
  if (selection && !selection.isEmpty()) {
    frameStatement(null);
    emit("runScope", "selection");
    return;
  }
  const position = editor.getPosition();
  const result = currentAnalysis();
  const range = position && result && statementAt(model.getValue(), result.statements, model.getOffsetAt(position));
  frameStatement(range || null);
  emit("runScope", "current");
}

function invalidateAnalysis() {
  clearTimeout(analysisTimer);
  analysisController?.abort();
  analysisRequest = undefined;
  analysis = undefined;
  foldingChanged.fire(foldingProvider);
  updateScope();
  if (model && props.consoleId && props.online !== false && props.visible !== false) {
    analysisTimer = setTimeout(() => {
      void analyzeDocument();
    }, 250);
  }
}

async function analyzeDocument(): Promise<GoAnalysis | undefined> {
  clearTimeout(analysisTimer);
  if (!model || model.isDisposed() || props.online === false || !props.consoleId) return undefined;
  if (currentAnalysis()) return currentAnalysis();
  const version = model.getVersionId();
  const consoleId = props.consoleId;
  if (analysisRequest && analysisMatches(analysisRequest.version, version, analysisRequest.consoleId, consoleId)) {
    return analysisRequest.promise;
  }
  analysisController?.abort();
  const controller = new AbortController();
  analysisController = controller;
  const candidate = model;
  const promise = props.api
    .analyze(consoleId, candidate.getValue(), version, controller.signal)
    .then((result) => {
      if (
        controller.signal.aborted ||
        candidate.isDisposed() ||
        !analysisMatches(result.document_version, candidate.getVersionId(), consoleId, props.consoleId)
      )
        return undefined;
      analysis = { consoleId, result };
      foldingChanged.fire(foldingProvider);
      updateScope();
      return result;
    })
    .catch(() => undefined)
    .finally(() => {
      if (analysisController === controller) analysisRequest = undefined;
    });
  analysisRequest = { consoleId, version, promise };
  return promise;
}

async function layoutWhenVisible() {
  await nextTick();
  cancelAnimationFrame(layoutFrame);
  // v-show keeps the model alive, but mounting/switching can initially measure a hidden pane.
  layoutFrame = requestAnimationFrame(() => {
    if (props.visible === false || !host.value || !editor) return;
    const { clientWidth: width, clientHeight: height } = host.value;
    if (width && height) {
      editor.layout({ width, height });
      editor.render(true);
    }
  });
}

function emitStatement(action: "run" | "explain", sql: string, version: number) {
  if (action === "explain") emit("explain", sql, version);
  else emit("run", sql, version);
}
function run() {
  if (props.online === false || props.visible === false) return;
  return currentStatement("run");
}
function explain() {
  return currentStatement("explain");
}
async function currentStatement(action: "run" | "explain") {
  if (!editor || !model) return;
  const selection = editor.getSelection();
  const version = model.getVersionId();
  if (selection && !selection.isEmpty()) {
    const sql = model.getValueInRange(selection);
    if (sql.trim()) emitStatement(action, sql, version);
    else emit("editorError", t("Chen.GoV1NothingAtCursor"));
    return;
  }
  const position = editor.getPosition();
  if (!position) return;
  const offset = model.getOffsetAt(position);
  const consoleId = props.consoleId;
  const result = await analyzeDocument();
  if (!model || model.isDisposed() || props.visible === false || props.online === false) return;
  const currentPosition = editor.getPosition();
  if (
    !analysisMatches(version, model.getVersionId(), consoleId, props.consoleId) ||
    !currentPosition ||
    model.getOffsetAt(currentPosition) !== offset ||
    !editor.getSelection()?.isEmpty()
  ) {
    emit("editorError", t("Chen.GoV1SqlChanged"));
    return;
  }
  if (!result) {
    emit("editorError", t("Chen.GoV1SelectExecutionRange"));
    return;
  }
  const range = statementAt(model.getValue(), result.statements, offset);
  if (!range) {
    emit("editorError", t("Chen.GoV1NothingAtCursor"));
    return;
  }
  emitStatement(action, model.getValue().slice(range.from, range.to), version);
}

function runAll() {
  if (!model || !model.getValue().trim()) return;
  emit("run", model.getValue(), model.getVersionId());
}

function format() {
  if (!editor || !model || props.readOnly) return;
  const selection = editor.getSelection();
  const hasSelection = !!selection && !selection.isEmpty();
  const range = hasSelection ? selection : model.getFullModelRange();
  const original = model.getValueInRange(range);
  const formatted = formatChenSql(original, props.dialect);
  if (formatted === original) return;
  const offset = model.getOffsetAt(range.getStartPosition());
  const caret = editor.getPosition();
  editor.pushUndoStop();
  editor.executeEdits("chen.format", [{ range, text: formatted }], () => {
    const from = model!.getPositionAt(offset);
    const to = model!.getPositionAt(offset + formatted.length);
    if (hasSelection) return [new monaco.Selection(from.lineNumber, from.column, to.lineNumber, to.column)];
    const position = model!.validatePosition(caret || from);
    return [new monaco.Selection(position.lineNumber, position.column, position.lineNumber, position.column)];
  });
  editor.pushUndoStop();
  // A long single-line query may leave the viewport scrolled far past the
  // shorter formatted lines. Reveal the restored caret after applying edits.
  const position = editor.getPosition();
  if (position) editor.revealPosition(position, monaco.editor.ScrollType.Immediate);
  editor.focus();
}

function insertText(text: string) {
  if (!editor || !model || props.readOnly || !props.canPaste) return;
  const range = editor.getSelection();
  if (!range) return;
  editor.pushUndoStop();
  editor.executeEdits("chen.insert", [{ range, text, forceMoveMarkers: true }]);
  editor.pushUndoStop();
  editor.focus();
}
// Snippets append independently of the selection, as one undoable editor edit.
function appendText(text: string) {
  if (!editor || !model || props.readOnly || !props.canPaste || !text) return false;
  const end = model.getPositionAt(model.getValueLength());
  const prefix = model.getValueLength() && !model.getValue().endsWith("\n") ? model.getEOL() : "";
  editor.pushUndoStop();
  const applied = editor.executeEdits("chen.snippet", [
    {
      range: new monaco.Range(end.lineNumber, end.column, end.lineNumber, end.column),
      text: prefix + text,
      forceMoveMarkers: true
    }
  ]);
  editor.pushUndoStop();
  editor.focus();
  return applied;
}
function clipboard(event: Event) {
  if (event.type === "copy" || event.type === "cut" ? !props.canCopy : !props.canPaste) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}
function keydown(event: KeyboardEvent) {
  const key = event.key.toLowerCase();
  if (!event.isComposing && !event.shiftKey && !event.altKey && props.visible !== false) {
    if (event.ctrlKey && !event.metaKey && ["r", "s"].includes(key)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (props.online !== false && !props.readOnly) {
        if (key === "r") emit("openSnippets");
        else emit("saveSnippet");
      }
      return;
    }
    if ((event.ctrlKey || event.metaKey) && ["d", "l"].includes(key)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (key === "d") {
        if (props.canCancel) emit("cancel");
      } else format();
      return;
    }
  }
  const copy = (event.ctrlKey || event.metaKey) && ["c", "x"].includes(key);
  const paste = ((event.ctrlKey || event.metaKey) && key === "v") || (event.shiftKey && key === "insert");
  if ((copy && !props.canCopy) || (paste && !props.canPaste)) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}
function beforeinput(event: InputEvent) {
  if (!props.canPaste && ["insertFromPaste", "insertFromDrop"].includes(event.inputType)) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}
onMounted(() => {
  if (!host.value) return;
  const dialect = chenSqlDialect(props.dialect);
  const language = dialect.monaco;
  applyChenMonacoTheme();
  model = monaco.editor.createModel(props.modelValue, language);
  disposables.push(
    monaco.languages.registerFoldingRangeProvider(
      { language, scheme: model.uri.scheme, pattern: model.uri.path },
      foldingProvider
    ),
    foldingChanged
  );
  editor = monaco.editor.create(host.value, {
    model,
    theme: "chen-app",
    automaticLayout: true,
    fixedOverflowWidgets: true,
    minimap: { enabled: false },
    fontFamily: getComputedStyle(host.value).getPropertyValue("--font-mono"),
    fontSize: 13,
    lineNumbersMinChars: 2,
    glyphMargin: true,
    lineDecorationsWidth: 14,
    renderLineHighlight: "all",
    padding: { top: 5, bottom: 5 },
    scrollBeyondLastLine: false,
    wordWrap: "off",
    tabSize: 2,
    readOnly: props.readOnly,
    accessibilitySupport: "auto",
    ariaLabel: "SQL editor",
    quickSuggestions: { other: true, comments: false, strings: false },
    acceptSuggestionOnEnter: "smart",
    suggestSelection: "first",
    suggest: {
      showWords: false,
      insertMode: "replace",
      localityBonus: false,
      shareSuggestSelections: false,
      showInlineDetails: true,
      showStatusBar: true,
      preview: true
    },
    dropIntoEditor: { enabled: props.canPaste },
    pasteAs: { enabled: props.canPaste },
    contextmenu: props.canCopy && props.canPaste
  });
  const updateOverlays = () => {
    updateRunMarkers();
    updateStatementFrame();
  };
  disposables.push(
    editor.onDidScrollChange(updateOverlays),
    editor.onDidLayoutChange(updateOverlays),
    editor.onDidChangeHiddenAreas(updateOverlays)
  );
  void layoutWhenVisible();
  disposables.push(
    editor.onDidChangeModelContent(() => {
      invalidateChangedCompletion();
      emit("editorError", "");
      emit("update:modelValue", model!.getValue());
      invalidateAnalysis();
    })
  );
  disposables.push(
    editor.onDidChangeCursorSelection(() => {
      invalidateChangedCompletion();
      emit("editorError", "");
      updateScope();
    })
  );
  invalidateAnalysis();
  disposables.push(
    editor.addAction({
      id: "chen.run",
      label: t("Chen.RunSelectedOrCurrent"),
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
      run
    })
  );
  disposables.push(
    editor.addAction({
      id: "chen.runAll",
      label: t("Chen.GoV1RunAll"),
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter],
      run: runAll
    })
  );
  disposables.push(
    editor.addAction({
      id: "chen.format",
      label: t("Chen.GoV1FormatSql"),
      keybindings: [monaco.KeyMod.Alt | monaco.KeyMod.Shift | monaco.KeyCode.KeyF],
      run: format
    })
  );
  disposables.push(
    editor.addAction({
      id: "chen.complete",
      label: t("Chen.GoV1CompleteSql"),
      keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.Slash],
      precondition: "!editorReadonly",
      contextMenuGroupId: "1_modification",
      contextMenuOrder: 1,
      run: complete
    })
  );
  disposables.push(
    monaco.languages.registerCompletionItemProvider(
      { language, scheme: model.uri.scheme, pattern: model.uri.path },
      {
        triggerCharacters: [...new Set([".", " ", ",", "(", dialect.quote, '"'])],
        async provideCompletionItems(candidate, position, _context, cancellation) {
          if (candidate !== model || !completionEnabled() || cancellation.isCancellationRequested)
            return { suggestions: [] };
          completion?.abort();
          const controller = new AbortController();
          completion = controller;
          const serial = ++completionSerial;
          const consoleId = props.consoleId;
          const subscription = cancellation.onCancellationRequested(() => controller.abort());
          const version = candidate.getVersionId();
          const document = candidate.getValue();
          const offset = candidate.getOffsetAt(position);
          completionContext = { version, offset };
          try {
            // Coalesce rapid typing; aborted requests never apply to a newer document.
            if (!(await waitForCompletion(controller.signal))) return { suggestions: [] };
            const result = await props.api.complete(consoleId, document, offset, version, controller.signal);
            if (
              serial !== completionSerial ||
              consoleId !== props.consoleId ||
              candidate.isDisposed() ||
              !completionEnabled() ||
              !completionIsCurrent(
                result,
                version,
                candidate.getVersionId(),
                candidate.getValueLength(),
                controller.signal.aborted,
                offset,
                editor?.getPosition() ? candidate.getOffsetAt(editor.getPosition()!) : -1
              )
            )
              return { suggestions: [] };
            const from = candidate.getPositionAt(result.from);
            const to = candidate.getPositionAt(result.to);
            // Monaco cannot replace a token that spans lines (legal for quoted SQL
            // identifiers). Decline it instead of applying a malformed edit.
            if (from.lineNumber !== to.lineNumber) return { suggestions: [] };
            const range = new monaco.Range(from.lineNumber, from.column, to.lineNumber, to.column);
            const kinds: Record<string, monaco.languages.CompletionItemKind> = {
              keyword: monaco.languages.CompletionItemKind.Keyword,
              table: monaco.languages.CompletionItemKind.Class,
              view: monaco.languages.CompletionItemKind.Class,
              column: monaco.languages.CompletionItemKind.Field,
              function: monaco.languages.CompletionItemKind.Function,
              schema: monaco.languages.CompletionItemKind.Module,
              alias: monaco.languages.CompletionItemKind.Variable,
              variable: monaco.languages.CompletionItemKind.Variable
            };
            return {
              // The backend filters and caps candidates. Requery after typing so
              // matches outside the previous page and a new SQL context can appear.
              incomplete: true,
              suggestions: result.items.map((item, index) => ({
                label: {
                  label: completionKeywordText(item.label, item.kind, props.sqlKeywordCase),
                  description: item.detail
                },
                insertText: completionKeywordText(item.insert_text, item.kind, props.sqlKeywordCase),
                kind: kinds[item.kind] || monaco.languages.CompletionItemKind.Text,
                detail: item.detail,
                documentation: item.documentation,
                range,
                filterText: completionFilterText(item, document.slice(result.from, offset)),
                sortText: item.sort_text || String(index).padStart(5, "0"),
                commitCharacters: ["alias", "variable", "schema"].includes(item.kind) ? ["."] : undefined
              }))
            };
          } catch {
            return { suggestions: [] };
          } finally {
            subscription.dispose();
          }
        }
      }
    )
  );
  themeObserver = new MutationObserver(applyChenMonacoTheme);
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "style", "data-theme-preset"]
  });
  for (const name of ["copy", "cut", "paste", "drop"]) host.value.addEventListener(name, clipboard, true);
  host.value.addEventListener("keydown", keydown, true);
  host.value.addEventListener("beforeinput", beforeinput, true);
  const instance = editor;
  const documentModel = model;
  unregisterClipboard = registerWorkspaceClipboardSurface(host.value, () => {
    const version = documentModel.getVersionId();
    const range = instance.getSelection();
    const consoleId = props.consoleId;
    if (!range) return null;
    const available = () =>
      editor === instance &&
      model === documentModel &&
      !documentModel.isDisposed() &&
      documentModel.getVersionId() === version &&
      props.consoleId === consoleId &&
      props.online !== false &&
      props.visible !== false;
    return {
      terminal: false,
      mode: "paste",
      paste(text) {
        if (!available()) return "unavailable";
        if (props.readOnly || !props.canPaste) return "denied";
        instance.pushUndoStop();
        const applied = instance.executeEdits("chen.clipboard-history", [{ range, text, forceMoveMarkers: true }]);
        instance.pushUndoStop();
        return applied ? "pasted" : "unavailable";
      },
      focus: () => editor?.focus()
    };
  });
});
watch(
  () => props.modelValue,
  (value) => {
    if (model && model.getValue() !== value) model.setValue(value);
  }
);
watch(
  () => props.readOnly,
  (value) => {
    editor?.updateOptions({ readOnly: value });
    if (value) dismissCompletion();
  }
);
watch(
  () => props.consoleId,
  () => {
    dismissCompletion();
    invalidateAnalysis();
  }
);
watch(
  () => props.online,
  (value) => {
    if (value === false) dismissCompletion();
    else if (props.visible !== false) void analyzeDocument();
  }
);
watch(
  () => props.visible,
  () => {
    void layoutWhenVisible();
    if (props.visible === false) dismissCompletion();
    if (props.visible !== false) void analyzeDocument();
  },
  { flush: "post" }
);
onBeforeUnmount(() => {
  unregisterClipboard?.();
  cancelAnimationFrame(layoutFrame);
  cancelAnimationFrame(statementFrameRequest);
  completion?.abort();
  clearTimeout(analysisTimer);
  analysisController?.abort();
  themeObserver?.disconnect();
  for (const disposable of disposables) disposable.dispose();
  editor?.dispose();
  model?.dispose();
  for (const name of ["copy", "cut", "paste", "drop"]) host.value?.removeEventListener(name, clipboard, true);
  host.value?.removeEventListener("keydown", keydown, true);
  host.value?.removeEventListener("beforeinput", beforeinput, true);
});
function snapshot() {
  const selection = editor?.getSelection();
  const from = model && selection ? model.getOffsetAt(selection.getStartPosition()) : 0;
  const to = model && selection ? model.getOffsetAt(selection.getEndPosition()) : 0;
  return {
    documentSql: model?.getValue() ?? props.modelValue,
    selectedSql: model?.getValue().slice(from, to) || "",
    selectionFrom: from,
    selectionTo: to,
    revision: model?.getVersionId() ?? 0
  };
}
function replaceDocument(sql: string) {
  if (!editor || !model || props.readOnly || !props.canPaste) return false;
  editor.pushUndoStop();
  editor.executeEdits("chen.ai", [{ range: model.getFullModelRange(), text: sql }]);
  editor.pushUndoStop();
  editor.focus();
  return true;
}
defineExpose({
  focus: () => editor?.focus(),
  run,
  runAll,
  explain,
  format,
  insertText,
  appendText,
  complete,
  snapshot,
  replaceDocument
});
</script>

<template>
  <div class="relative h-full min-h-0 w-full">
    <div ref="host" class="chen-sql-editor h-full min-h-0 w-full" />
    <div
      v-if="statementFrame"
      class="pointer-events-none absolute inset-y-0 right-0 overflow-hidden"
      :style="{ left: `${statementFrame.gutter}px` }"
      aria-hidden="true"
    >
      <div
        class="chen-current-statement-frame absolute"
        :style="{
          left: `${statementFrame.left}px`,
          top: `${statementFrame.top}px`,
          width: `${statementFrame.width}px`,
          height: `${statementFrame.height}px`
        }"
      />
    </div>
    <button
      v-for="marker in runMarkers"
      :key="marker.from"
      type="button"
      class="chen-run-statement-button absolute z-10"
      :style="{ top: `${marker.top}px`, left: `${marker.left}px` }"
      :disabled="online === false"
      :aria-label="`${t('Chen.RunStatement')} · ${marker.line}`"
      :title="t('Chen.RunStatement')"
      data-chen-run-statement
      @click="runMarker(marker)"
    >
      <UIcon name="i-lucide-play" class="size-3" aria-hidden="true" />
    </button>
  </div>
</template>

<style scoped>
.chen-run-statement-button {
  display: grid;
  width: 20px;
  height: 20px;
  margin-top: 1px;
  place-items: center;
  border-radius: var(--app-radius);
  background: transparent;
  color: var(--theme-accent);
}
.chen-run-statement-button:enabled {
  cursor: pointer;
}
.chen-run-statement-button:enabled:hover {
  background: var(--app-hover-strong);
}
.chen-run-statement-button:focus-visible {
  outline: 2px solid var(--theme-accent);
  outline-offset: -2px;
}

.chen-sql-editor :deep(.monaco-editor) {
  --chen-sql-content-inset: 6px;
  --vscode-editorGutter-background: var(--editor-gutter-background);
  --vscode-editorLineNumber-foreground: var(--editor-gutter-foreground);
  --vscode-editorLineNumber-activeForeground: color-mix(
    in srgb,
    var(--editor-gutter-foreground) 90%,
    var(--editor-foreground)
  );
}

.chen-sql-editor :deep(.monaco-editor .margin) {
  /* Keep v5.1.1's text inset inside Monaco's native layout, including hit testing. */
  background-image: linear-gradient(
    to left,
    var(--editor-background) var(--chen-sql-content-inset),
    transparent var(--chen-sql-content-inset)
  );
}

.chen-sql-editor :deep(.monaco-editor .margin::after) {
  position: absolute;
  inset: 0 var(--chen-sql-content-inset) 0 auto;
  border-right: 1px solid var(--workspace-surface-border);
  content: "";
  pointer-events: none;
}

.chen-sql-editor :deep(.monaco-editor .margin-view-overlays .codicon[class*="codicon-folding-"]) {
  font-size: 12px;
}

.chen-sql-editor :deep(.monaco-editor .view-overlays .current-line),
.chen-sql-editor :deep(.monaco-editor .margin-view-overlays .current-line-margin) {
  background-color: color-mix(in srgb, var(--app-hover-soft) 75%, transparent);
}

.chen-current-statement-frame {
  border: 1px solid var(--color-border-accent);
  border-radius: var(--app-radius);
}
</style>
