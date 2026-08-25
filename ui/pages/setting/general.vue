<script setup lang="ts">
import type { CharsetType, LangType, ResolutionType } from "~/types";

import { useSettingManager } from "~/composables/useSettingManager";

interface LangItem {
  id: LangType;
  label: string;
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
  <UCard
    variant="outline"
    :ui="{
      root: 'rounded-lg bg-[var(--app-surface-card)] ring-[var(--app-border)]',
      body: 'divide-y divide-[var(--app-border)] p-0 sm:p-0'
    }"
  >
    <div class="flex items-center justify-between gap-6 px-4 py-3">
      <span class="text-sm font-medium text-highlighted">{{ t("Common.Language") }}</span>
      <USelect
        v-model="selectedLanguage"
        :items="languageItems"
        value-key="id"
        :aria-label="t('Common.Language')"
        size="sm"
        class="w-48"
      />
    </div>

    <div class="flex items-center justify-between gap-6 px-4 py-3">
      <div class="min-w-0">
        <p class="text-sm font-medium text-highlighted">{{ t("Setting.Charset") }}</p>
        <p class="mt-0.5 text-xs leading-5 text-muted">{{ t("Setting.CharsetDescription") }}</p>
      </div>
      <USelect
        v-model="selectedCharset"
        :items="charsetItems"
        value-key="id"
        :aria-label="t('Setting.Charset')"
        size="sm"
        class="w-48"
      />
    </div>

    <div class="flex items-center justify-between gap-6 px-4 py-3">
      <div class="min-w-0">
        <p class="text-sm font-medium text-highlighted">{{ t("Setting.TerminalBackspace") }}</p>
        <p class="mt-0.5 text-xs leading-5 text-muted">{{ t("Setting.TerminalBackspaceDescription") }}</p>
      </div>
      <USwitch v-model="selectedEnabled" :aria-label="t('Setting.TerminalBackspace')" />
    </div>

    <div class="flex items-center justify-between gap-6 px-4 py-3">
      <div class="min-w-0">
        <p class="text-sm font-medium text-highlighted">{{ t("Setting.Resolution") }}</p>
        <p class="mt-0.5 text-xs leading-5 text-muted">{{ t("Setting.ResolutionDescription") }}</p>
      </div>
      <USelect
        v-model="selectedresolution"
        :items="resolutionItems"
        value-key="id"
        :aria-label="t('Setting.Resolution')"
        size="sm"
        class="w-48"
      />
    </div>
  </UCard>
</template>
