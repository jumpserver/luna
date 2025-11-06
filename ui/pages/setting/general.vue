<script setup lang="ts">
import type { SelectItem } from "@nuxt/ui";
import { useUserInfoStore } from "~/store/modules/userInfo";

type LangItem = SelectItem & { id: string };

definePageMeta({
  layout: "setting"
});

const { setLang } = useSettingManager();
const { t, locales } = useI18n();

const userInfoStore = useUserInfoStore();
const { currentLanguage } = storeToRefs(userInfoStore);

const syncingFromLocale = ref(false);

const languageItems = computed<LangItem[]>(() => {
  const arr = (locales.value as any[]) || [];
  return arr.map((l: any) => ({
    id: l.code || l,
    label: l.name || l
  }));
});

const selectedLanguage = ref(currentLanguage.value);

watch(
  () => selectedLanguage.value,
  (code) => {
    if (!code) return;
    if (syncingFromLocale.value) {
      syncingFromLocale.value = false;
      return;
    }
    setLang(code);
    userInfoStore.applyLanguageToAll(code);
    try {
      useTauriEventEmit("language-changed", { code });
    } catch {}
  },
  { immediate: false }
);

watch(
  () => currentLanguage.value,
  (code) => {
    const val = (code as string) || "";
    if (!val) return;
    if (val === selectedLanguage.value) return;
    syncingFromLocale.value = true;
    selectedLanguage.value = val;
  }
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
