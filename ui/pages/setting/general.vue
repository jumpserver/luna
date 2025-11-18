<script setup lang="ts">
import type { LangType, CharsetType, ResolutionType } from "~/types";
import type { SelectItem } from "@nuxt/ui";

import { useUserInfoStore } from "~/store/modules/userInfo";
import { useSettingManager } from "~/composables/useSettingManager";

type LangItem = SelectItem & { id: string };

definePageMeta({
  layout: "setting"
});

const { t, locales } = useI18n();
const settingManager = useSettingManager();
const {
  setLang,
  charset,
  rdpResolution,
  backspaceAsCtrlH,
  setCharsetPreference,
  setRdpResolutionPreference,
  setBackspacePreference
} = settingManager;

const userInfoStore = useUserInfoStore();
const { currentLanguage } = storeToRefs(userInfoStore);

const languageItems = computed<LangItem[]>(() => {
  const arr = (locales.value as any[]) || [];
  return arr.map((l: any) => ({
    id: l.code || l,
    label: l.name || l
  }));
});

const charsetItems = computed(() => {
  return [
    {
      label: t("Setting.Default"),
      id: "default"
    },
    {
      label: "UTF-8",
      id: "utf8"
    },
    {
      label: "GBK",
      id: "gbk"
    },
    {
      label: "GBK2312",
      id: "gb2312"
    },
    {
      label: "IOS-8859-1",
      id: "ios-8859-1"
    }
  ];
});

const resolutionItems = computed(() => {
  return [
    {
      label: t("Setting.Auto"),
      id: "auto"
    },
    {
      label: "1024x768",
      id: "1024x768"
    },
    {
      label: "1366x768",
      id: "1366x768"
    },
    {
      label: "1600x900",
      id: "1600x900"
    },
    {
      label: "1920x1080",
      id: "1920x1080"
    }
  ];
});

const boolOptions = computed(() => {
  return [
    { label: t("Setting.Enable"), id: true },
    { label: t("Setting.Disable"), id: false }
  ];
});

const selectedLanguage = ref<LangType>(currentLanguage.value);

const selectedCharset = computed<CharsetType>({
  get: () => (charset.value as CharsetType) || "default",
  set: (value) => setCharsetPreference((value || "default") as CharsetType)
});

const selectedresolution = computed<ResolutionType>({
  get: () => (rdpResolution.value as ResolutionType) || "auto",
  set: (value) => setRdpResolutionPreference((value || "auto") as ResolutionType)
});

const selectedEnabled = computed<boolean>({
  get: () => backspaceAsCtrlH.value ?? false,
  set: (value: boolean) => setBackspacePreference(!!value)
});

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

      <USelect v-model="selectedLanguage" :items="languageItems" value-key="id" option-attribute="label" class="w-56" />
    </div>

    <USeparator />

    <div class="flex items-center justify-between">
      <span class="text-sm font-medium">{{ t("Setting.Charset") }}</span>

      <USelect v-model="selectedCharset" :items="charsetItems" value-key="id" option-attribute="label" class="w-56" />
    </div>

    <USeparator />

    <div class="flex items-center justify-between">
      <span class="text-sm font-medium">{{ t("Setting.TerminalBackspace") }}</span>

      <USelect v-model="selectedEnabled" :items="boolOptions" value-key="id" option-attribute="label" class="w-56" />
    </div>

    <USeparator />

    <div class="flex items-center justify-between">
      <span class="text-sm font-medium">{{ t("Setting.Resolution") }}</span>

      <USelect
        v-model="selectedresolution"
        :items="resolutionItems"
        value-key="id"
        option-attribute="label"
        class="w-56"
      />
    </div>
  </div>
</template>
