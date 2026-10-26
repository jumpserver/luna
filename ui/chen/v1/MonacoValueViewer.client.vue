<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { applyChenMonacoTheme, monaco } from "./monaco";

const props = defineProps<{ value: string; json: boolean; wrap: boolean; canCopy: boolean; label: string }>();
const host = ref<HTMLElement>();
let editor: monaco.editor.IStandaloneCodeEditor | undefined;
let model: monaco.editor.ITextModel | undefined;
let themeObserver: MutationObserver | undefined;

function preventCopy(event: Event) {
  if (props.canCopy) return;
  event.preventDefault();
  event.stopImmediatePropagation();
}
function keydown(event: KeyboardEvent) {
  if (!props.canCopy && (event.metaKey || event.ctrlKey) && /^(?:c|x)$/i.test(event.key)) preventCopy(event);
}
function find() {
  editor?.focus();
  void editor?.getAction("actions.find")?.run();
}
onMounted(() => {
  if (!host.value) return;
  // Tokenize values locally; there is no JSON schema fetch, validation worker or SQL provider.
  if (!monaco.languages.getLanguages().some((language) => language.id === "chen-value-json")) {
    monaco.languages.register({ id: "chen-value-json" });
    monaco.languages.setMonarchTokensProvider("chen-value-json", {
      tokenizer: {
        root: [
          [/"(?:\\.|[^"\\])*"(?=\s*:)/, "key"],
          [/"(?:\\.|[^"\\])*"/, "string"],
          [/-?(?:0|[1-9]\d*)(?:\.\d+)?(?:e[+-]?\d+)?/i, "number"],
          [/true|false|null/, "keyword"],
          [/[{}[\]]/, "delimiter.bracket"],
          [/[:,]/, "delimiter"],
          [/\s+/, "white"]
        ]
      }
    });
  }
  applyChenMonacoTheme();
  model = monaco.editor.createModel(props.value, props.json ? "chen-value-json" : "plaintext");
  editor = monaco.editor.create(host.value, {
    model,
    theme: "chen-app",
    automaticLayout: true,
    readOnly: true,
    domReadOnly: true,
    contextmenu: false,
    selectionClipboard: false,
    copyWithSyntaxHighlighting: false,
    ariaLabel: props.label,
    minimap: { enabled: false },
    fontFamily: getComputedStyle(host.value).getPropertyValue("--font-mono"),
    fontSize: 13,
    lineNumbersMinChars: 3,
    scrollBeyondLastLine: false,
    wordWrap: props.wrap ? "on" : "off",
    folding: true,
    lineDecorationsWidth: 12,
    renderLineHighlight: "none",
    renderValidationDecorations: "off",
    links: false,
    quickSuggestions: false,
    find: { seedSearchStringFromSelection: "selection" },
    suggestOnTriggerCharacters: false,
    wordBasedSuggestions: "off",
    hover: { enabled: "off" },
    stickyScroll: { enabled: false },
    dropIntoEditor: { enabled: false },
    pasteAs: { enabled: false },
    unicodeHighlight: { ambiguousCharacters: false, invisibleCharacters: false }
  });
  themeObserver = new MutationObserver(applyChenMonacoTheme);
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "style", "data-theme-preset"]
  });
  host.value.addEventListener("copy", preventCopy, true);
  host.value.addEventListener("cut", preventCopy, true);
  host.value.addEventListener("keydown", keydown, true);
});
watch(
  () => props.value,
  (value) => {
    if (model && value !== model.getValue()) model.setValue(value);
  }
);
watch(
  () => props.json,
  (json) => {
    if (model) monaco.editor.setModelLanguage(model, json ? "chen-value-json" : "plaintext");
  }
);
watch(
  () => props.wrap,
  (wrap) => editor?.updateOptions({ wordWrap: wrap ? "on" : "off" })
);
watch(
  () => props.label,
  (ariaLabel) => editor?.updateOptions({ ariaLabel })
);
onBeforeUnmount(() => {
  themeObserver?.disconnect();
  host.value?.removeEventListener("copy", preventCopy, true);
  host.value?.removeEventListener("cut", preventCopy, true);
  host.value?.removeEventListener("keydown", keydown, true);
  editor?.dispose();
  model?.dispose();
});
defineExpose({ find });
</script>

<template>
  <div ref="host" class="h-full min-h-0 w-full" data-chen-value-editor />
</template>
