<script setup lang="ts">
import type { Extension } from "@codemirror/state";
import { python } from "@codemirror/lang-python";
import { MariaSQL, MSSQL, MySQL, PLSQL, PostgreSQL, sql } from "@codemirror/lang-sql";
import { StreamLanguage } from "@codemirror/language";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { Compartment, EditorState, Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { createCodeMirrorSyntaxTheme, createCodeMirrorTheme } from "~/shared/theme/adapters/codemirror";

const props = defineProps<{ modelValue: string; module: string }>();
const emit = defineEmits<{ "update:modelValue": [value: string]; save: [] }>();
const colorMode = useColorMode();
const container = shallowRef<HTMLElement | null>(null);
const themeSlot = new Compartment();
const syntaxThemeSlot = new Compartment();
const languageSlot = new Compartment();
let editor: EditorView | null = null;
let themeObserver: MutationObserver | null = null;
let applyingExternalValue = false;

function languageExtension(module: string): Extension {
  if (module === "python") return python();
  if (["shell", "win_shell"].includes(module)) return StreamLanguage.define(shell);
  if (module === "mysql") return sql({ dialect: MySQL });
  if (module === "mariadb") return sql({ dialect: MariaSQL });
  if (module === "postgresql") return sql({ dialect: PostgreSQL });
  if (module === "sqlserver") return sql({ dialect: MSSQL });
  if (module === "oracle") return sql({ dialect: PLSQL });
  return [];
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
        basicSetup,
        languageSlot.of(languageExtension(props.module)),
        syntaxThemeSlot.of(createCodeMirrorSyntaxTheme()),
        themeSlot.of(createCodeMirrorTheme()),
        EditorView.lineWrapping,
        EditorState.tabSize.of(2),
        Prec.highest(
          keymap.of([
            {
              key: "Mod-s",
              run: () => {
                emit("save");
                return true;
              }
            }
          ])
        ),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !applyingExternalValue) emit("update:modelValue", update.state.doc.toString());
        })
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
  () => props.module,
  (module) => editor?.dispatch({ effects: languageSlot.reconfigure(languageExtension(module)) })
);
watch(() => colorMode.value, refreshTheme);
onBeforeUnmount(() => {
  themeObserver?.disconnect();
  editor?.destroy();
});
</script>

<template>
  <div ref="container" class="h-full min-h-0 w-full overflow-hidden bg-[var(--workspace-surface-background)]" />
</template>

<style scoped>
:deep(.cm-editor) {
  height: 100%;
  color: var(--app-fg);
}
:deep(.cm-scroller) {
  overflow: auto;
}
:deep(.cm-activeLine),
:deep(.cm-activeLineGutter) {
  background: var(--app-hover-soft) !important;
}
:deep(.cm-gutters) {
  color: var(--app-muted);
}
</style>
