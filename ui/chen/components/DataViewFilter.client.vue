<script setup lang="ts">
import type { SQLNamespace } from "@codemirror/lang-sql";
import type { Extension } from "@codemirror/state";
import type { ChenDataViewField } from "~/chen/types";

import { sql } from "@codemirror/lang-sql";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { chenSqlDialect } from "~/chen/utils/sqlEditor";
import { createCodeMirrorSyntaxTheme, createCodeMirrorTheme } from "~/shared/theme/adapters/codemirror";

const props = withDefaults(
  defineProps<{
    modelValue: string;
    fields?: ChenDataViewField[];
    table?: string;
    dbType?: string;
    disabled?: boolean;
  }>(),
  {
    fields: () => [],
    table: "",
    dbType: "",
    disabled: false
  }
);

const emit = defineEmits<{
  "update:modelValue": [value: string];
  apply: [];
}>();

const colorMode = useColorMode();
const container = ref<HTMLElement | null>(null);
const themeSlot = new Compartment();
const syntaxThemeSlot = new Compartment();
const editableSlot = new Compartment();
const languageSlot = new Compartment();
let editor: EditorView | null = null;
let themeObserver: MutationObserver | null = null;
let applyingExternalValue = false;

function sqlExtension(): Extension {
  const table = props.table || "result";
  const schema: SQLNamespace = {
    [table]: props.fields.map((field) => ({
      label: field.name,
      type: "property",
      detail: field.type
    }))
  };
  return sql({ dialect: chenSqlDialect(props.dbType), schema, defaultTable: table });
}

onMounted(() => {
  if (!container.value) return;
  editor = new EditorView({
    parent: container.value,
    state: EditorState.create({
      doc: props.modelValue,
      extensions: [
        basicSetup,
        languageSlot.of(sqlExtension()),
        syntaxThemeSlot.of(createCodeMirrorSyntaxTheme()),
        placeholder("WHERE condition, e.g. status = 'active'"),
        EditorView.contentAttributes.of({ "aria-label": "Table WHERE condition" }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !applyingExternalValue) emit("update:modelValue", update.state.doc.toString());
        }),
        keymap.of([
          {
            key: "Enter",
            run: () => {
              if (!props.disabled) emit("apply");
              return true;
            }
          }
        ]),
        editableSlot.of(EditorView.editable.of(!props.disabled)),
        themeSlot.of(createCodeMirrorTheme())
      ]
    })
  });
  themeObserver = new MutationObserver(() => {
    editor?.dispatch({
      effects: [
        themeSlot.reconfigure(createCodeMirrorTheme()),
        syntaxThemeSlot.reconfigure(createCodeMirrorSyntaxTheme())
      ]
    });
  });
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
  () => props.disabled,
  (disabled) => editor?.dispatch({ effects: editableSlot.reconfigure(EditorView.editable.of(!disabled)) })
);

watch(
  () => [props.dbType, props.table, props.fields] as const,
  () => editor?.dispatch({ effects: languageSlot.reconfigure(sqlExtension()) })
);

watch(
  () => colorMode.value,
  async () => {
    await nextTick();
    editor?.dispatch({ effects: themeSlot.reconfigure(createCodeMirrorTheme()) });
  }
);

onBeforeUnmount(() => {
  themeObserver?.disconnect();
  editor?.destroy();
});
</script>

<template>
  <div
    ref="container"
    class="h-7 min-w-64 flex-1 overflow-hidden rounded-md border border-default bg-default"
    :class="disabled ? 'opacity-60' : ''"
  />
</template>

<style scoped>
:deep(.cm-editor),
:deep(.cm-scroller) {
  height: 100%;
}

:deep(.cm-editor) {
  color: var(--app-fg);
  font-size: 12px;
}

:deep(.cm-scroller) {
  overflow: hidden;
  font-family: inherit;
}

:deep(.cm-content) {
  padding: 2px 8px;
  white-space: nowrap;
}

:deep(.cm-line) {
  padding: 0;
}

:deep(.cm-gutters) {
  display: none;
}

:deep(.cm-activeLine) {
  background: transparent !important;
}

:deep(.cm-placeholder) {
  color: var(--app-muted);
}

:deep(.cm-selectionBackground),
:deep(.cm-focused .cm-selectionBackground),
:deep(.cm-selectionLayer .cm-selectionBackground) {
  background: color-mix(in srgb, var(--theme-accent) 22%, transparent) !important;
}
</style>
