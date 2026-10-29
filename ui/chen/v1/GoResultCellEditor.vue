<script setup lang="ts">
import type { ICellEditorParams } from "ag-grid-community";
import { ref } from "vue";

const props = defineProps<{ params: ICellEditorParams }>();
const input = ref<HTMLInputElement | null>(null);
const value = ref(props.params.value == null ? "" : String(props.params.value));
let changed = false;
const key = props.params.eventKey;
if (key === "Backspace" || key === "Delete") {
  value.value = "";
  changed = true;
} else if (key?.length === 1) {
  value.value = key;
  changed = true;
}

defineExpose({
  // An untouched NULL stays NULL; deleting text deliberately produces an empty
  // string. Keep numbers as text so the grid never rounds precise values.
  getValue: () => (changed ? value.value : props.params.value),
  afterGuiAttached: () => {
    input.value?.focus({ preventScroll: true });
    if (key === "F2" || changed) {
      input.value?.setSelectionRange(value.value.length, value.value.length);
    } else {
      input.value?.select();
    }
  }
});
function change(event: Event) {
  value.value = (event.target as HTMLInputElement).value;
  changed = true;
}
function keydown(event: KeyboardEvent) {
  if (event.isComposing || ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
    event.stopPropagation();
  }
}
</script>

<template>
  <input
    ref="input"
    class="ag-input-field-input ag-text-field-input h-full w-full"
    type="text"
    :value="value"
    :aria-label="params.colDef.headerName"
    :spellcheck="false"
    @input="change"
    @keydown="keydown"
  />
</template>
