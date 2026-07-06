<script setup lang="ts">
import type { Extension } from "@codemirror/state";
import { defaultHighlightStyle, indentUnit, StreamLanguage, syntaxHighlighting } from "@codemirror/language";
import { Compartment, EditorState, Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { basicSetup } from "codemirror";

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
const languageSlot = new Compartment();
const themeSlot = new Compartment();
let editor: EditorView | null = null;
let languageRequest = 0;
let applyingExternalValue = false;

const editorTheme = (dark: boolean) => EditorView.theme({
  "&": {
    height: "100%",
    backgroundColor: "var(--ui-bg)",
    color: "var(--ui-text-highlighted)"
  },
  ".cm-scroller": {
    overflow: "auto",
    fontFamily: "var(--font-mono), 'SFMono-Regular', Consolas, monospace",
    fontSize: "13px",
    lineHeight: "21px"
  },
  ".cm-content": { padding: "10px 0", caretColor: "var(--ui-text-highlighted)" },
  ".cm-gutters": {
    backgroundColor: "var(--ui-bg-elevated)",
    color: "var(--ui-text-muted)",
    borderRight: "1px solid var(--ui-border)"
  },
  ".cm-activeLine, .cm-activeLineGutter": {
    backgroundColor: dark ? "rgba(255,255,255,.045)" : "rgba(0,0,0,.035)"
  },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": {
    backgroundColor: dark ? "rgba(80,140,255,.3) !important" : "rgba(40,100,220,.2) !important"
  },
  "&.cm-focused": { outline: "none" }
}, { dark });

async function languageExtension(language: string): Promise<Extension> {
  switch (language) {
    case "javascript": return (await import("@codemirror/lang-javascript")).javascript({ jsx: /\.[jt]sx$/i.test(props.path) });
    case "typescript": return (await import("@codemirror/lang-javascript")).javascript({ typescript: true, jsx: /\.tsx$/i.test(props.path) });
    case "json": return (await import("@codemirror/lang-json")).json();
    case "html": return /\.vue$/i.test(props.path) ? (await import("@codemirror/lang-vue")).vue() : (await import("@codemirror/lang-html")).html();
    case "css":
    case "scss":
    case "less": return (await import("@codemirror/lang-css")).css();
    case "markdown": return (await import("@codemirror/lang-markdown")).markdown();
    case "python": return (await import("@codemirror/lang-python")).python();
    case "rust": return (await import("@codemirror/lang-rust")).rust();
    case "go": return (await import("@codemirror/lang-go")).go();
    case "c":
    case "cpp": return (await import("@codemirror/lang-cpp")).cpp();
    case "java": return (await import("@codemirror/lang-java")).java();
    case "sql": return (await import("@codemirror/lang-sql")).sql();
    case "xml": return (await import("@codemirror/lang-xml")).xml();
    case "yaml": return (await import("@codemirror/lang-yaml")).yaml();
    case "shell": {
      const { shell } = await import("@codemirror/legacy-modes/mode/shell");
      return StreamLanguage.define(shell);
    }
    default: return [];
  }
}

async function applyLanguage() {
  const request = ++languageRequest;
  const extension = await languageExtension(props.language);
  if (request !== languageRequest || !editor) return;
  editor.dispatch({ effects: languageSlot.reconfigure(extension) });
}

onMounted(() => {
  if (!container.value) return;
  editor = new EditorView({
    parent: container.value,
    state: EditorState.create({
      doc: props.modelValue,
      extensions: [
        basicSetup,
        EditorState.tabSize.of(2),
        indentUnit.of("  "),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        languageSlot.of([]),
        themeSlot.of(editorTheme(colorMode.value === "dark")),
        Prec.highest(keymap.of([{
          key: "Mod-s",
          run: () => {
            emit("save");
            return true;
          }
        }])),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !applyingExternalValue) emit("update:modelValue", update.state.doc.toString());
        })
      ]
    })
  });
  void applyLanguage();
  editor.focus();
});

watch(() => props.modelValue, (value) => {
  if (!editor || editor.state.doc.toString() === value) return;
  applyingExternalValue = true;
  editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } });
  applyingExternalValue = false;
});
watch(() => [props.path, props.language], () => void applyLanguage());
watch(() => colorMode.value, (mode) => editor?.dispatch({ effects: themeSlot.reconfigure(editorTheme(mode === "dark")) }));
onBeforeUnmount(() => editor?.destroy());
</script>

<template>
  <div ref="container" class="h-full min-h-0 w-full overflow-hidden" />
</template>
