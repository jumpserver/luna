<script setup lang="ts">
import type { SelectItem } from "@nuxt/ui";
import { useUserSettingStore } from "~/store/modules/userSetting";

definePageMeta({
  layout: "setting"
});

const { t, locales, locale, setLocale } = useI18n();
const { setLang } = useUserSettingStore();

type LangItem = SelectItem & { id: string };

const languageItems = computed<LangItem[]>(() => {
  const arr = (locales.value as any[]) || [];
  return arr.map((l: any) => ({
    id: l.code || l,
    label: l.name || l
  }));
});

const selectedLanguage = ref<string>(
  (locale.value as string) || languageItems.value?.[0]?.id || "zh"
);

watch(
  () => selectedLanguage.value,
  (code) => {
    if (!code) return;
    setLang(code);
    setLocale(code as any);
    // Notify other windows (main) to switch language
    try {
      useTauriEventEmit('language-changed', { code });
    } catch {}
  },
  { immediate: false }
);
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <span class="text-sm font-medium">{{ t("Common.Language") }}</span>
      <USelect
        v-model="selectedLanguage"
        :items="(languageItems as unknown as SelectItem[])"
        value-key="id"
        option-attribute="label"
        class="w-56"
      />
    </div>
  </div>
</template>
