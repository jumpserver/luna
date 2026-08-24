<script setup lang="ts">
const props = defineProps<{
  modelValue: string;
  colors?: string[];
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
}>();

const { t } = useI18n();

const open = ref(false);
const draft = ref(props.modelValue);

watch(
  () => open.value,
  (isOpen) => {
    if (isOpen) draft.value = props.modelValue || draft.value;
  }
);

watch(
  () => props.modelValue,
  (v) => {
    if (!open.value && typeof v === "string") draft.value = v;
  }
);

const chip = computed(() => ({ backgroundColor: props.modelValue || draft.value }));

function selectSwatch(c: string) {
  draft.value = c;
}

function onCancel() {
  draft.value = props.modelValue || draft.value;
  open.value = false;
}

function onConfirm() {
  emit("update:modelValue", draft.value);
  open.value = false;
}
</script>

<template>
  <UPopover v-model:open="open" :ui="{ content: 'p-0' }">
    <UButton
      :label="props.modelValue?.toUpperCase() || t('Common.ChooseColor')"
      color="neutral"
      variant="outline"
      class="w-full justify-start font-mono"
    >
      <template #leading>
        <span :style="chip" class="size-3 rounded-full" />
      </template>
    </UButton>

    <template #content>
      <div
        class="flex max-w-64 flex-col items-center gap-4 rounded-lg px-4 py-4"
        :style="{ backgroundColor: 'var(--app-panel-bg)', color: 'var(--app-fg)' }"
      >
        <UColorPicker v-model="draft" class="rounded-md" />

        <section v-if="props.colors?.length" class="flex flex-1 flex-wrap w-full gap-2">
          <button
            v-for="c in props.colors"
            :key="c"
            type="button"
            :style="{ backgroundColor: c }"
            :title="c"
            class="size-5 cursor-pointer rounded-md ring-1 ring-[var(--app-border)] transition will-change-transform hover:scale-105"
            @click="selectSwatch(c)"
          />
        </section>

        <div class="flex w-full justify-end gap-2 pt-1">
          <UButton size="sm" variant="soft" color="neutral" @click="onCancel">
            {{ t("Common.Cancel") }}
          </UButton>
          <UButton size="sm" variant="soft" color="primary" @click="onConfirm">
            {{ t("Common.Confirm") }}
          </UButton>
        </div>
      </div>
    </template>
  </UPopover>
</template>
