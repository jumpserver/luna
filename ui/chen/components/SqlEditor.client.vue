<script setup lang="ts">
import type { Extension } from "@codemirror/state";
import type { ChenSqlHints } from "~/chen/types";
import { sql } from "@codemirror/lang-sql";
import { Compartment, EditorState, Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { chenSqlConfig, replaceChenSqlDocument } from "~/chen/utils/sqlEditor";
import { createCodeMirrorSyntaxTheme, createCodeMirrorTheme } from "~/shared/theme/adapters/codemirror";

const props = withDefaults(
  defineProps<{
    modelValue: string
    dbType?: string
    hints?: ChenSqlHints
    readOnly?: boolean
  }>(),
  {
    dbType: "",
    hints: () => ({}),
    readOnly: false
  }
);

const emit = defineEmits<{
  "update:modelValue": [value: string]
  selectionChange: [hasSelection: boolean]
  format: []
  openSnippets: []
  run: []
  saveSnippet: []
  stop: []
}>();

const colorMode = useColorMode();
const container = ref<HTMLElement | null>(null);
const themeSlot = new Compartment();
const editableSlot = new Compartment();
const sqlLanguageSlot = new Compartment();
let editor: EditorView | null = null;
let applyingExternalValue = false;

const editorExtensions: Extension[] = [
  basicSetup,
  sqlLanguageSlot.of(sql(chenSqlConfig(props.dbType, props.hints))),
  createCodeMirrorSyntaxTheme(),
  EditorView.lineWrapping,
  EditorState.tabSize.of(2),
  Prec.highest(
    keymap.of([
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

function selectedText() {
  if (!editor) return "";
  const { state } = editor;
  const { from, to } = state.selection.main;
  return from === to ? "" : state.doc.sliceString(from, to);
}

function focus() {
  editor?.focus();
}

function replaceDocument(value: string) {
  if (!editor) return;
  replaceChenSqlDocument(editor, value);
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
  () => [props.dbType, props.hints] as const,
  ([dbType, hints]) => {
    editor?.dispatch({ effects: sqlLanguageSlot.reconfigure(sql(chenSqlConfig(dbType, hints))) });
  }
);

watch(
  () => colorMode.value,
  () => {
    editor?.dispatch({ effects: themeSlot.reconfigure(createCodeMirrorTheme()) });
  }
);

onBeforeUnmount(() => editor?.destroy());

defineExpose({
  focus,
  replaceDocument,
  selectedText
});
</script>

<template>
  <div ref="container" class="h-full min-h-0 w-full overflow-hidden rounded-md border border-default bg-default" />
</template>

<style scoped>
:deep(.cm-editor) {
  color: var(--app-fg);
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
</style>
