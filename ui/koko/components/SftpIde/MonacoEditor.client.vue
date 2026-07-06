<script setup lang="ts">
import type * as Monaco from "monaco-editor";

import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";
import "monaco-editor/esm/vs/editor/editor.main.css";
import "monaco-editor/esm/vs/basic-languages/monaco.contribution";
import "monaco-editor/esm/vs/language/css/monaco.contribution";
import "monaco-editor/esm/vs/language/html/monaco.contribution";
import "monaco-editor/esm/vs/language/json/monaco.contribution";
import "monaco-editor/esm/vs/language/typescript/monaco.contribution";

const props = withDefaults(defineProps<{
  modelValue: string
  language?: string
  path?: string
}>(), {
  language: "plaintext",
  path: "remote.txt"
});
const emit = defineEmits<{ "update:modelValue": [value: string], save: [] }>();
const colorMode = useColorMode();
const container = ref<HTMLElement | null>(null);
let monaco: typeof Monaco | null = null;
let editor: Monaco.editor.IStandaloneCodeEditor | null = null;
let model: Monaco.editor.ITextModel | null = null;
let resizeObserver: ResizeObserver | null = null;
let applyingExternalValue = false;

function configureWorkers() {
  globalThis.MonacoEnvironment = {
    getWorker(_moduleId: string, label: string) {
      if (label === "json") return new jsonWorker();
      if (label === "css" || label === "scss" || label === "less") return new cssWorker();
      if (label === "html" || label === "handlebars" || label === "razor") return new htmlWorker();
      if (label === "typescript" || label === "javascript") return new tsWorker();
      return new editorWorker();
    }
  };
}

function modelUri() {
  const safePath = props.path.replace(/^\/+/, "") || "remote.txt";
  return monaco!.Uri.parse(`sftp://remote/${safePath}`);
}

function createModel() {
  if (!monaco || !editor) return;
  model?.dispose();
  model = monaco.editor.createModel(props.modelValue, props.language, modelUri());
  editor.setModel(model);
  editor.focus();
}

onMounted(async () => {
  configureWorkers();
  monaco = await import("monaco-editor/esm/vs/editor/editor.api");
  if (!container.value) return;
  editor = monaco.editor.create(container.value, {
    automaticLayout: false,
    fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', monospace",
    fontSize: 13,
    lineHeight: 21,
    minimap: { enabled: true },
    padding: { top: 10 },
    renderWhitespace: "selection",
    scrollBeyondLastLine: false,
    smoothScrolling: true,
    tabSize: 2,
    theme: colorMode.value === "dark" ? "vs-dark" : "vs",
    wordWrap: "off"
  });
  createModel();
  editor.onDidChangeModelContent(() => {
    if (!applyingExternalValue) emit("update:modelValue", editor?.getValue() || "");
  });
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => emit("save"));
  resizeObserver = new ResizeObserver(() => editor?.layout());
  resizeObserver.observe(container.value);
});

watch(() => props.modelValue, (value) => {
  if (!editor || editor.getValue() === value) return;
  applyingExternalValue = true;
  editor.setValue(value);
  applyingExternalValue = false;
});
watch(() => [props.path, props.language], () => createModel());
watch(() => colorMode.value, (mode) => monaco?.editor.setTheme(mode === "dark" ? "vs-dark" : "vs"));

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  editor?.dispose();
  model?.dispose();
});
</script>

<template>
  <div ref="container" class="h-full min-h-0 w-full" />
</template>
