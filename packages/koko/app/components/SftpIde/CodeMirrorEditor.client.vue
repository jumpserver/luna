<script setup lang="ts">
import type { Extension } from "@codemirror/state";
import { indentUnit, StreamLanguage } from "@codemirror/language";
import { Compartment, EditorState, Prec } from "@codemirror/state";
import { Decoration, EditorView, keymap } from "@codemirror/view";
import { useKokoHostAdapter } from "@jumpserver/koko/host";
import { basicSetup } from "codemirror";

const props = withDefaults(
  defineProps<{
    modelValue: string;
    baseline?: string;
    language?: string;
    path?: string;
    lineWrapping?: boolean;
    active?: boolean;
  }>(),
  {
    baseline: "",
    language: "plaintext",
    path: "remote.txt",
    lineWrapping: false,
    active: true
  }
);
const emit = defineEmits<{
  "update:modelValue": [value: string];
  cursor: [line: number, column: number];
  save: [];
}>();
const hostAdapter = useKokoHostAdapter();
const colorMode = useColorMode();
const container = shallowRef<HTMLElement | null>(null);
const languageSlot = new Compartment();
const themeSlot = new Compartment();
const syntaxThemeSlot = new Compartment();
const lineWrappingSlot = new Compartment();
const changedLinesSlot = new Compartment();
let editor: EditorView | null = null;
let themeObserver: MutationObserver | null = null;
let languageRequest = 0;
let applyingExternalValue = false;

async function languageExtension(language: string): Promise<Extension> {
  switch (language) {
    case "javascript":
      return (await import("@codemirror/lang-javascript")).javascript({ jsx: /\.[jt]sx$/i.test(props.path) });
    case "typescript":
      return (await import("@codemirror/lang-javascript")).javascript({
        typescript: true,
        jsx: /\.tsx$/i.test(props.path)
      });
    case "json":
      return (await import("@codemirror/lang-json")).json();
    case "html":
      return /\.vue$/i.test(props.path)
        ? (await import("@codemirror/lang-vue")).vue()
        : (await import("@codemirror/lang-html")).html();
    case "css":
    case "scss":
    case "less":
      return (await import("@codemirror/lang-css")).css();
    case "markdown":
      return (await import("@codemirror/lang-markdown")).markdown();
    case "python":
      return (await import("@codemirror/lang-python")).python();
    case "rust":
      return (await import("@codemirror/lang-rust")).rust();
    case "go":
      return (await import("@codemirror/lang-go")).go();
    case "c":
    case "cpp":
      return (await import("@codemirror/lang-cpp")).cpp();
    case "java":
      return (await import("@codemirror/lang-java")).java();
    case "sql":
      return (await import("@codemirror/lang-sql")).sql();
    case "xml":
      return (await import("@codemirror/lang-xml")).xml();
    case "yaml":
      return (await import("@codemirror/lang-yaml")).yaml();
    case "shell": {
      const { shell } = await import("@codemirror/legacy-modes/mode/shell");
      return StreamLanguage.define(shell);
    }
    default:
      return [];
  }
}

async function applyLanguage() {
  const request = ++languageRequest;
  const extension = await languageExtension(props.language);
  if (request !== languageRequest || !editor) return;
  editor.dispatch({ effects: languageSlot.reconfigure(extension) });
}

function emitCursor(view: EditorView) {
  const head = view.state.selection.main.head;
  const line = view.state.doc.lineAt(head);
  emit("cursor", line.number, head - line.from + 1);
}

function changedLineExtension(before: string, after: string) {
  if (!editor || before === after) return EditorView.decorations.of(Decoration.none);
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before.charCodeAt(prefix) === after.charCodeAt(prefix))
    prefix++;

  let suffix = 0;
  while (
    suffix < before.length - prefix &&
    suffix < after.length - prefix &&
    before.charCodeAt(before.length - suffix - 1) === after.charCodeAt(after.length - suffix - 1)
  )
    suffix++;

  const changedEnd = Math.max(prefix, after.length - suffix);
  const firstLine = editor.state.doc.lineAt(Math.min(prefix, editor.state.doc.length)).number;
  const lastLine = editor.state.doc.lineAt(Math.min(Math.max(prefix, changedEnd - 1), editor.state.doc.length)).number;
  const markers = [];
  for (let number = firstLine; number <= Math.min(lastLine, editor.state.doc.lines); number++) {
    markers.push(Decoration.line({ class: "cm-local-change-line" }).range(editor.state.doc.line(number).from));
  }
  return EditorView.decorations.of(Decoration.set(markers));
}

function applyChangedLines(content = props.modelValue) {
  if (!editor) return;
  editor.dispatch({ effects: changedLinesSlot.reconfigure(changedLineExtension(props.baseline, content)) });
}

onMounted(async () => {
  if (!container.value) return;
  await hostAdapter.theme.ensureCodeMirror?.();
  if (!container.value) return;
  editor = new EditorView({
    parent: container.value,
    state: EditorState.create({
      doc: props.modelValue,
      extensions: [
        basicSetup,
        EditorState.tabSize.of(2),
        indentUnit.of("  "),
        syntaxThemeSlot.of(hostAdapter.theme.codeMirrorSyntax()),
        languageSlot.of([]),
        themeSlot.of(hostAdapter.theme.codeMirror()),
        lineWrappingSlot.of(props.lineWrapping ? EditorView.lineWrapping : []),
        changedLinesSlot.of(EditorView.decorations.of(Decoration.none)),
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
          if (update.docChanged || update.selectionSet) emitCursor(update.view);
        })
      ]
    })
  });
  void applyLanguage();
  applyChangedLines();
  emitCursor(editor);
  if (props.active) editor.focus();
  themeObserver = new MutationObserver(() => {
    editor?.dispatch({
      effects: [
        themeSlot.reconfigure(hostAdapter.theme.codeMirror()),
        syntaxThemeSlot.reconfigure(hostAdapter.theme.codeMirrorSyntax())
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
    if (!editor) return;
    if (editor.state.doc.toString() !== value) {
      applyingExternalValue = true;
      editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } });
      applyingExternalValue = false;
    }
    applyChangedLines(value);
  }
);
watch(
  () => props.baseline,
  () => applyChangedLines()
);
watch(
  () => [props.path, props.language],
  () => void applyLanguage()
);
watch(
  () => colorMode.value,
  () => editor?.dispatch({ effects: themeSlot.reconfigure(hostAdapter.theme.codeMirror()) })
);
watch(
  () => props.lineWrapping,
  (enabled) =>
    editor?.dispatch({
      effects: lineWrappingSlot.reconfigure(enabled ? EditorView.lineWrapping : [])
    })
);
watch(
  () => props.active,
  (active) => {
    if (!active) return;
    requestAnimationFrame(() => {
      editor?.requestMeasure();
      editor?.focus();
      if (editor) emitCursor(editor);
    });
  }
);
onBeforeUnmount(() => {
  themeObserver?.disconnect();
  editor?.destroy();
});
</script>

<template>
  <div ref="container" class="h-full min-h-0 w-full overflow-hidden" />
</template>

<style scoped>
:deep(.cm-local-change-line) {
  background-color: color-mix(in srgb, var(--ui-warning) 7%, transparent);
  box-shadow: inset 2px 0 0 var(--ui-warning);
}
</style>
