<script setup lang="ts">
import type { LangType } from "~/types";
import type { SelectItem } from "@nuxt/ui";

import { useUserInfoStore } from "~/store/modules/userInfo";

type LangItem = SelectItem & { id: string };

definePageMeta({
  layout: "setting"
});

const { t, locales } = useI18n();
const { setLang } = useSettingManager();

const userInfoStore = useUserInfoStore();
const { currentLanguage } = storeToRefs(userInfoStore);

const languageItems = computed<LangItem[]>(() => {
  const arr = (locales.value as any[]) || [];
  return arr.map((l: any) => ({
    id: l.code || l,
    label: l.name || l
  }));
});

const selectedLanguage = ref<LangType>(currentLanguage.value);

watch(
  () => selectedLanguage.value,
  (code: LangType) => {
    if (!code) return;

    setLang(code);
    userInfoStore.applyLanguageToAll(code);
    useTauriEventEmit("language-changed", { code });
  },
  { immediate: false }
);

watch(
  () => currentLanguage.value,
  (code: LangType) => {
    if (!code) return;
    if (code === selectedLanguage.value) return;

    selectedLanguage.value = code;
  }
);
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <span class="text-sm font-medium">{{ t("Common.Language") }}</span>

      <USelect
        v-model="selectedLanguage"
        :items="languageItems"
        value-key="id"
        option-attribute="label"
        class="w-56"
      />
    </div>
  </div>
</template>
