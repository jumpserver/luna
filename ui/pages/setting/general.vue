<script setup lang="ts">
import type { CharsetType, LangType, ResolutionType } from "~/types";

import { useSettingManager } from "~/composables/useSettingManager";
import {
  clearTerminalCommandHistory,
  getAuthenticatedTerminalCommandHistoryScope
} from "~/composables/useTerminalCommandHistory";
import { useUserInfoStore } from "~/store/modules/userInfo";

interface LangItem {
  id: LangType;
  label: string;
}

definePageMeta({
  layout: "setting"
});

const { t, locales, locale } = useI18n();
const settingManager = useSettingManager();
const userInfoStore = useUserInfoStore();
const { currentSite, currentUser, loggedIn } = storeToRefs(userInfoStore);
const commandHistoryScope = computed(() =>
  getAuthenticatedTerminalCommandHistoryScope({
    authenticated: loggedIn.value,
    site: currentSite.value,
    userId: currentUser.value?.userId || ""
  })
);
const commandHistoryConfirmOpen = ref(false);
const clearingCommandHistory = ref(false);
const toast = useToast();
const {
  setLang,
  charset,
  rdpResolution,
  backspaceAsCtrlH,
  terminalCommandSuggestionsEnabled,
  setCharsetPreference,
  setRdpResolutionPreference,
  setBackspacePreference,
  setTerminalCommandSuggestionsEnabled
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

const commandSuggestionsEnabled = computed<boolean>({
  get: () => terminalCommandSuggestionsEnabled.value ?? true,
  set: (value: boolean) => setTerminalCommandSuggestionsEnabled(!!value)
});

async function clearCommandHistory() {
  const scope = commandHistoryScope.value;
  if (!scope || clearingCommandHistory.value) return;
  clearingCommandHistory.value = true;
  try {
    await clearTerminalCommandHistory(scope);
    commandHistoryConfirmOpen.value = false;
    toast.add({ title: t("Setting.TerminalCommandHistoryCleared"), color: "success" });
  } finally {
    clearingCommandHistory.value = false;
  }
}
</script>

<template>
  <div class="space-y-4">
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
          <p class="text-sm font-medium text-highlighted">{{ t("Setting.TerminalCommandSuggestions") }}</p>
          <p class="mt-0.5 text-xs leading-5 text-muted">
            {{ t("Setting.TerminalCommandSuggestionsDescription") }}
          </p>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            size="sm"
            :disabled="!commandHistoryScope"
            :label="t('Setting.ClearTerminalCommandHistory')"
            @click="commandHistoryConfirmOpen = true"
          />
          <USwitch v-model="commandSuggestionsEnabled" :aria-label="t('Setting.TerminalCommandSuggestions')" />
        </div>
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

    <UModal
      v-model:open="commandHistoryConfirmOpen"
      :title="t('Setting.ClearTerminalCommandHistory')"
      :description="t('Setting.ClearTerminalCommandHistoryConfirm')"
    >
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            :label="t('Common.Cancel')"
            @click="commandHistoryConfirmOpen = false"
          />
          <UButton
            color="error"
            :loading="clearingCommandHistory"
            :label="t('Common.Confirm')"
            @click="clearCommandHistory"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
