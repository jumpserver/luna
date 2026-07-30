<script lang="ts" setup>
import { useDebounceFn } from "@vueuse/core";
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import CardContainer from "@/lion/components/CardContainer/index.vue";
import { readClipboardText } from "@/lion/utils/clipboard";

const props = defineProps<{
  remoteText?: string;
  disabled?: boolean;
}>();
const emit = defineEmits(["update:text"]);
const { t } = useI18n();

const inputValue = ref<string>("");
const isLoading = ref<boolean>(false);
const showRemoteText = ref<boolean>(false);

const handleInput = useDebounceFn((value: string) => {
  emit("update:text", value);
}, 300);

const loadClipboardText = async () => {
  try {
    isLoading.value = true;
    const text = await readClipboardText();
    inputValue.value = text;
    await handleInput(text);
  } catch (error) {
    console.log("Failed to read clipboard text:", error);
  } finally {
    isLoading.value = false;
  }
};

const handleFocus = async () => {
  if (!inputValue.value.trim()) {
    try {
      await loadClipboardText();
    } catch {
      console.debug("Auto-read clipboard failed, user can click button to read manually");
    }
  }
};
</script>

<template>
  <CardContainer :title="t('Clipboard')">
    <div class="mb-3 flex items-center justify-between gap-3">
      <span class="text-sm">{{ t("ShowRemoteClip") }}</span>
      <USwitch v-model="showRemoteText" :disabled="props.disabled" />
    </div>

    <UTextarea
      v-model="inputValue"
      :rows="4"
      :maxlength="4096"
      autoresize
      :disabled="props.disabled"
      :placeholder="t('AutoPasteOnClick')"
      class="w-full"
      @update:model-value="handleInput"
      @focus="handleFocus"
    />

    <UTextarea
      v-if="showRemoteText"
      :model-value="props.remoteText"
      :rows="4"
      readonly
      autoresize
      :disabled="props.disabled"
      class="mt-3 w-full"
    />
  </CardContainer>
</template>
