<script setup lang="ts">
import type { CharsetType, LangType, ResolutionType } from "~/types";

import { useSettingManager } from "~/composables/useSettingManager";

interface LangItem {
  id: LangType
  label: string
}

definePageMeta({
  layout: "setting"
});

const { t, locales, locale } = useI18n();
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

const languageItems = computed<LangItem[]>(() => {
  const arr = (locales.value as any[]) || [];
  return arr.map((l: any) => ({
    id: (l.code || l) as LangType,
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

const selectedLanguage = computed<LangType>({
  get: () => (locale.value as LangType) || "zh",
  set: (code: LangType) => {
    if (!code) return;
    setLang(code);
  }
});

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
</script>

<template>
  <div class="flex flex-col gap-3 p-4">
    <div class="flex items-center justify-between">
      <span class="text-sm font-medium">{{ t("Common.Language") }}</span>

      <SettingSelect
        v-model="selectedLanguage"
        :items="languageItems"
        :aria-label="t('Common.Language')"
        class="w-48"
      />
    </div>

    <USeparator />

    <div class="flex items-center justify-between">
      <span class="text-sm font-medium">{{ t("Setting.Charset") }}</span>

      <SettingSelect
        v-model="selectedCharset"
        :items="charsetItems"
        :aria-label="t('Setting.Charset')"
        class="w-48"
      />
    </div>

    <USeparator />

    <div class="flex items-center justify-between">
      <span class="text-sm font-medium">{{ t("Setting.TerminalBackspace") }}</span>

      <USwitch v-model="selectedEnabled" :aria-label="t('Setting.TerminalBackspace')" />
    </div>

    <USeparator />

    <div class="flex items-center justify-between">
      <span class="text-sm font-medium">{{ t("Setting.Resolution") }}</span>

      <SettingSelect
        v-model="selectedresolution"
        :items="resolutionItems"
        :aria-label="t('Setting.Resolution')"
        class="w-48"
      />
    </div>
  </div>
</template>
