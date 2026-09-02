<script setup lang="ts">
import type { Extension } from "@codemirror/state";
import type { ChenSqlKeywordCase } from "~/chen/composables/useChenWorkspacePreferences";
import type { ChenSqlEditorSnapshot } from "~/chen/types";
import type { ChenSqlCompletionSource } from "~/chen/utils/sqlCompletion";
import { acceptCompletion } from "@codemirror/autocomplete";
import { Compartment, EditorState, Prec } from "@codemirror/state";
import { EditorView, gutter, GutterMarker, keymap } from "@codemirror/view";
import { basicSetup } from "codemirror";
import {
  chenSqlExtensions,
  chenSqlStatementAtCursor,
  chenSqlStatementRanges,
  executableChenSql,
  replaceChenSqlDocument
} from "~/chen/utils/sqlEditor";
import { createCodeMirrorSyntaxTheme, createCodeMirrorTheme } from "~/shared/theme/adapters/codemirror";

const props = withDefaults(
  defineProps<{
    modelValue: string;
    dbType?: string;
    completionSource?: ChenSqlCompletionSource;
    sqlKeywordCase?: ChenSqlKeywordCase;
    readOnly?: boolean;
  }>(),
  {
    dbType: "",
    sqlKeywordCase: "lower",
    readOnly: false
  }
);

const emit = defineEmits<{
  "update:modelValue": [value: string];
  selectionChange: [hasSelection: boolean];
  format: [];
  openSnippets: [];
  run: [sql?: string];
  saveSnippet: [];
  stop: [];
}>();

const colorMode = useColorMode();
const container = shallowRef<HTMLElement | null>(null);
const themeSlot = new Compartment();
const syntaxThemeSlot = new Compartment();
const editableSlot = new Compartment();
const sqlLanguageSlot = new Compartment();
let editor: EditorView | null = null;
let themeObserver: MutationObserver | null = null;
let applyingExternalValue = false;
let gutterDocument: EditorState["doc"] | null = null;
let gutterStatementLineStarts = new Set<number>();

function statementLineStarts(state: EditorState) {
  if (gutterDocument === state.doc) return gutterStatementLineStarts;
  gutterDocument = state.doc;
  gutterStatementLineStarts = new Set(chenSqlStatementRanges(state).map(({ from }) => state.doc.lineAt(from).from));
  return gutterStatementLineStarts;
}

class RunStatementMarker extends GutterMarker {
  override toDOM() {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cm-run-statement-button";
    button.title = "Run statement";
    button.setAttribute("aria-label", "Run statement");
    button.textContent = "▶";
    return button;
  }
}

const runStatementMarker = new RunStatementMarker();

const runStatementGutter = gutter({
  class: "cm-run-statement-gutter",
  lineMarker(view, line) {
    return statementLineStarts(view.state).has(line.from) ? runStatementMarker : null;
  },
  domEventHandlers: {
    click(view, line, event) {
      const statement = chenSqlStatementAtCursor(view.state, line.from);
      if (!statement) return false;
      event.preventDefault();
      emit("run", statement.sql);
      return true;
    }
  }
});

const editorExtensions: Extension[] = [
  basicSetup,
  runStatementGutter,
  sqlLanguageSlot.of(chenSqlExtensions(props.dbType, props.completionSource, props.sqlKeywordCase)),
  syntaxThemeSlot.of(createCodeMirrorSyntaxTheme()),
  EditorView.lineWrapping,
  EditorState.tabSize.of(2),
  Prec.highest(
    keymap.of([
      {
        key: "Tab",
        run: acceptCompletion
      },
      {
        key: "Mod-l",
        run: () => {
          emit("format");
          return true;
        }
      },
      {
        key: "Ctrl-r",
        run: () => {
          emit("openSnippets");
          return true;
        }
      },
      {
        key: "Ctrl-s",
        run: () => {
          emit("saveSnippet");
          return true;
        }
      },
      {
        key: "Mod-Enter",
        run: () => {
          emit("run");
          return true;
        }
      },
      {
        key: "Mod-d",
        run: () => {
          emit("stop");
          return true;
        }
      }
    ])
  ),
  EditorView.updateListener.of((update) => {
    if (update.docChanged && !applyingExternalValue) {
      emit("update:modelValue", update.state.doc.toString());
    }
    if (update.selectionSet) {
      emit("selectionChange", !update.state.selection.main.empty);
    }
  })
];

function executionText() {
  return editor ? executableChenSql(editor.state) : "";
}

function snapshot(): ChenSqlEditorSnapshot {
  if (!editor) {
    return {
      documentSql: props.modelValue,
      selectedSql: "",
      selectionFrom: 0,
      selectionTo: 0
    };
  }
  const { state } = editor;
  const { from, to } = state.selection.main;
  return {
    documentSql: state.doc.toString(),
    selectedSql: from === to ? "" : state.doc.sliceString(from, to),
    selectionFrom: from,
    selectionTo: to
  };
}

function focus() {
  editor?.focus();
}

function replaceDocument(value: string) {
  if (!editor) return;
  replaceChenSqlDocument(editor, value);
}

function refreshTheme() {
  editor?.dispatch({
    effects: [
      themeSlot.reconfigure(createCodeMirrorTheme()),
      syntaxThemeSlot.reconfigure(createCodeMirrorSyntaxTheme())
    ]
  });
}

onMounted(() => {
  if (!container.value) return;
  editor = new EditorView({
    parent: container.value,
    state: EditorState.create({
      doc: props.modelValue,
      extensions: [
        ...editorExtensions,
        editableSlot.of(EditorView.editable.of(!props.readOnly)),
        themeSlot.of(createCodeMirrorTheme())
      ]
    })
  });
  themeObserver = new MutationObserver(refreshTheme);
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "data-theme-preset", "data-codemirror-theme-preset", "style"]
  });
});

watch(
  () => props.modelValue,
  (value) => {
    if (!editor || editor.state.doc.toString() === value) return;
    applyingExternalValue = true;
    editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } });
    applyingExternalValue = false;
  }
);

watch(
  () => props.readOnly,
  (value) => {
    editor?.dispatch({ effects: editableSlot.reconfigure(EditorView.editable.of(!value)) });
  }
);

watch(
  () => [props.dbType, props.completionSource, props.sqlKeywordCase] as const,
  ([dbType, completionSource, sqlKeywordCase]) => {
    editor?.dispatch({
      effects: sqlLanguageSlot.reconfigure(chenSqlExtensions(dbType, completionSource, sqlKeywordCase))
    });
  }
);

watch(() => colorMode.value, refreshTheme);

onBeforeUnmount(() => {
  themeObserver?.disconnect();
  editor?.destroy();
});

defineExpose({
  focus,
  executionText,
  replaceDocument,
  snapshot
});
</script>

<template>
  <div
    ref="container"
    class="h-full min-h-0 w-full overflow-hidden rounded-r-md border-y border-r border-default bg-default"
  />
</template>

<style scoped>
:deep(.cm-editor) {
  color: var(--app-fg);
}

:deep(.cm-content) {
  padding-block: 5px !important;
}

:deep(.cm-activeLine),
:deep(.cm-activeLineGutter) {
  background: var(--app-hover-soft) !important;
  color: inherit !important;
}

:deep(.cm-selectionBackground),
:deep(.cm-focused .cm-selectionBackground),
:deep(.cm-selectionLayer .cm-selectionBackground) {
  background: color-mix(in srgb, var(--theme-accent) 22%, transparent) !important;
}

:deep(.cm-gutters) {
  color: var(--app-muted);
}

:deep(.cm-run-statement-gutter) {
  width: 22px;
}

:deep(.cm-run-statement-button) {
  display: grid;
  width: 20px;
  height: 20px;
  margin-top: 1px;
  cursor: pointer;
  place-items: center;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--theme-accent);
  font-size: 10px;
  line-height: 1;
}

:deep(.cm-run-statement-button:hover) {
  background: var(--app-hover-soft);
  color: var(--theme-accent);
}

:deep(.cm-run-statement-button:focus-visible) {
  outline: 2px solid var(--theme-accent);
  outline-offset: -2px;
}
</style>
