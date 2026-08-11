<script lang="ts" setup>
import { useDebounceFn } from "@vueuse/core";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import CardContainer from "@/lion/components/CardContainer/index.vue";
import { readClipboardText } from "@/lion/utils/clipboard";

const props = defineProps<{
  remoteText?: string;
  disabled?: boolean;
  copyDisabled?: boolean;
  pasteDisabled?: boolean;
  pastePolicyDisabled?: boolean;
  textLimit?: number;
}>();
const emit = defineEmits(["update:text"]);
const { t } = useI18n();
const toast = useToast();

const inputValue = ref<string>("");
const isLoading = ref<boolean>(false);
const showRemoteText = ref<boolean>(false);
const maxLength = computed(() => (props.textLimit && props.textLimit > 0 ? props.textLimit : undefined));
const inputLength = computed(() => Array.from(inputValue.value).length);

const validateText = (text: string) => {
  if (props.pastePolicyDisabled) {
    toast.add({ title: t("ClipboardPasteDeniedByPolicy"), color: "warning" });
    return false;
  }
  if (props.disabled || props.pasteDisabled) {
    toast.add({ title: `${t("Paste")} ${t("NoPermission")}`, color: "warning" });
    return false;
  }
  if (maxLength.value && Array.from(text).length > maxLength.value) {
    toast.add({ title: `${t("Paste")} ${t("ClipboardTextLimitExceeded")}: ${maxLength.value}`, color: "warning" });
    return false;
  }
  return true;
};

const handleInput = useDebounceFn((value: string) => {
  if (!validateText(value)) return;
  emit("update:text", value);
}, 300);

const loadClipboardText = async () => {
  try {
    isLoading.value = true;
    const text = await readClipboardText();
    if (!validateText(text)) return;
    inputValue.value = text;
    await handleInput(text);
  } catch (error) {
    console.debug("Failed to read clipboard text:", error);
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
      <USwitch v-model="showRemoteText" :disabled="props.disabled || props.copyDisabled" />
    </div>

    <UTextarea
      v-model="inputValue"
      :rows="4"
      autoresize
      :disabled="props.disabled || props.pasteDisabled || props.pastePolicyDisabled"
      :placeholder="t('AutoPasteOnClick')"
      class="w-full"
      @update:model-value="handleInput"
      @focus="handleFocus"
    />
    <div class="mt-1 text-right text-xs text-muted">
      {{ inputLength }}
      <template v-if="maxLength">/ {{ maxLength }}</template>
    </div>

    <UTextarea
      v-if="showRemoteText"
      :model-value="props.remoteText"
      :rows="4"
      readonly
      autoresize
      :disabled="props.disabled || props.copyDisabled"
      class="mt-3 w-full"
    />
  </CardContainer>
</template>
