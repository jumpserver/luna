<script setup lang="ts">
import type { ChenGoApi, GoAnalysis } from "./api";
import type { SqlSourceRange } from "./executionRange";
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { chenSqlDialect } from "~/chen/utils/sqlDialect";
import { formatChenSql } from "~/chen/utils/sqlFormat";
import { completionFilterText, completionIsCurrent, waitForCompletion } from "./completion";
import { analysisMatches, statementAt } from "./executionRange";
import { applyChenMonacoTheme, monaco } from "./monaco";

const props = defineProps<{
  modelValue: string;
  dialect: string;
  consoleId: string;
  api: ChenGoApi;
  canCopy: boolean;
  canPaste: boolean;
  readOnly?: boolean;
  online?: boolean;
  visible?: boolean;
}>();
const emit = defineEmits<{
  "update:modelValue": [value: string];
  run: [sql: string, version: number];
  explain: [sql: string, version: number];
  scope: [mode: "selection" | "current" | "empty"];
  editorError: [message: string];
}>();
const { t } = useI18n();
const host = ref<HTMLElement | null>(null);
let editor: monaco.editor.IStandaloneCodeEditor | undefined;
let model: monaco.editor.ITextModel | undefined;
const disposables: monaco.IDisposable[] = [];
let themeObserver: MutationObserver | undefined;
let completion: AbortController | undefined;
let completionContext: { version: number; offset: number } | undefined;
let completionSerial = 0;
let layoutFrame = 0;
let analysis: { consoleId: string; result: GoAnalysis } | undefined;
let analysisRequest: { consoleId: string; version: number; promise: Promise<GoAnalysis | undefined> } | undefined;
let analysisController: AbortController | undefined;
let analysisTimer: ReturnType<typeof setTimeout> | undefined;
let currentDecoration: monaco.editor.IEditorDecorationsCollection | undefined;

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

function monacoRange(range: SqlSourceRange) {
  const from = model!.getPositionAt(range.from);
  const to = model!.getPositionAt(range.to);
  return new monaco.Range(from.lineNumber, from.column, to.lineNumber, to.column);
}

function currentAnalysis() {
  return model &&
    analysis &&
    analysisMatches(analysis.result.document_version, model.getVersionId(), analysis.consoleId, props.consoleId)
    ? analysis.result
    : undefined;
}

function updateScope() {
  if (!editor || !model) return;
  const selection = editor.getSelection();
  if (selection && !selection.isEmpty()) {
    currentDecoration?.clear();
    emit("scope", model.getValueInRange(selection).trim() ? "selection" : "empty");
    return;
  }
  const position = editor.getPosition();
  const result = currentAnalysis();
  const range = position && result && statementAt(model.getValue(), result.statements, model.getOffsetAt(position));
  currentDecoration?.set(
    range
      ? [
          {
            range: monacoRange(range),
            options: {
              inlineClassName: "chen-current-statement",
              linesDecorationsClassName: "chen-current-statement-gutter",
              stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
            }
          }
        ]
      : []
  );
  emit("scope", range ? "current" : "empty");
}

function invalidateAnalysis() {
  clearTimeout(analysisTimer);
  analysisController?.abort();
  analysisRequest = undefined;
  analysis = undefined;
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
  if (!model || model.isDisposed()) return;
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
function clipboard(event: Event) {
  if (event.type === "copy" || event.type === "cut" ? !props.canCopy : !props.canPaste) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}
function keydown(event: KeyboardEvent) {
  const key = event.key.toLowerCase();
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
  editor = monaco.editor.create(host.value, {
    model,
    theme: "chen-app",
    automaticLayout: true,
    fixedOverflowWidgets: true,
    minimap: { enabled: false },
    fontFamily: getComputedStyle(host.value).getPropertyValue("--font-mono"),
    fontSize: 13,
    lineNumbersMinChars: 3,
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
  currentDecoration = editor.createDecorationsCollection();
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
      label: t("Chen.GoV1RunCurrent"),
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
                label: { label: item.label, description: item.detail },
                insertText: item.insert_text,
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
    if (value === false) {
      dismissCompletion();
    }
    invalidateAnalysis();
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
  cancelAnimationFrame(layoutFrame);
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
  complete,
  snapshot,
  replaceDocument
});
</script>

<template>
  <div ref="host" class="h-full min-h-0 w-full" />
</template>

<style scoped>
:deep(.chen-current-statement) {
  background-color: var(--editor-selection-inactive);
}
:deep(.chen-current-statement-gutter) {
  border-left: 2px solid var(--editor-cursor);
  margin-left: 3px;
}
</style>
