<script setup lang="ts">
import type { CharsetType, LangType, ResolutionType } from "~/types";

import { useSettingManager } from "~/composables/useSettingManager";
import {
  clearTerminalCommandHistory,
  getAuthenticatedTerminalCommandHistoryScope
} from "~/composables/useTerminalCommandHistory";
import { desktopInvoke, desktopListen } from "~/shared/desktop/bridge";
import { useUserInfoStore } from "~/store/modules/userInfo";

interface FfmpegPluginStatus {
  installed: boolean;
  installing: boolean;
  version: string;
  size: number;
  downloadSize: number;
  license: string;
}

interface FfmpegPluginProgress {
  status: "downloading" | "installed" | "error";
  progress: number;
  error?: string;
}

interface LangItem {
  id: LangType;
  label: string;
}

const { t, locales, locale } = useI18n();
const settingManager = useSettingManager();
const { addErrorToast } = useErrorToast();
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
const { debugLog, setDebugLog, clearLogs, copyLogs, downloadLogs, clearFeedback, copyFeedback, downloadFeedback } =
  useDebugLog();

const logActionIcon = (feedback: typeof clearFeedback.value) => {
  if (feedback === "done") return "i-lucide-check";
  if (feedback === "empty") return "i-lucide-minus";
  return undefined;
};

const logActionLabel = (feedback: typeof clearFeedback.value, idle: string, done: string) => {
  if (feedback === "done") return done;
  if (feedback === "empty") return t("Setting.LogsEmpty");
  return idle;
};
const debugLogEnabled = computed({
  get: () => debugLog.value,
  set: (value: boolean) => setDebugLog(value)
});

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

const ffmpegStatus = ref<FfmpegPluginStatus | null>(null);
const ffmpegProgress = ref(0);
const ffmpegBusy = ref(false);
let unlistenFfmpegProgress: (() => void) | undefined;

const formatMegabytes = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024 / 1024))} MB`;

const refreshFfmpegStatus = async () => {
  if (!isDesktopRuntime()) return;
  ffmpegStatus.value = await desktopInvoke<FfmpegPluginStatus>("get_ffmpeg_plugin_status");
};

const installFfmpeg = async () => {
  ffmpegBusy.value = true;
  ffmpegProgress.value = 0;
  try {
    ffmpegStatus.value = await desktopInvoke<FfmpegPluginStatus>("install_ffmpeg_plugin");
    toast.add({ title: t("Setting.FfmpegInstallSuccess"), color: "success", icon: "i-lucide-check" });
  } catch (error) {
    addErrorToast({
      title: t("Setting.FfmpegInstallFailed"),
      description: error instanceof Error ? error.message : String(error),
      icon: "line-md:close-circle"
    });
  } finally {
    ffmpegBusy.value = false;
    await refreshFfmpegStatus();
  }
};

const uninstallFfmpeg = async () => {
  ffmpegBusy.value = true;
  try {
    ffmpegStatus.value = await desktopInvoke<FfmpegPluginStatus>("uninstall_ffmpeg_plugin");
    ffmpegProgress.value = 0;
    toast.add({ title: t("Setting.FfmpegUninstallSuccess"), color: "success", icon: "i-lucide-trash-2" });
  } catch (error) {
    addErrorToast({
      title: t("Setting.FfmpegUninstallFailed"),
      description: error instanceof Error ? error.message : String(error),
      icon: "line-md:close-circle"
    });
  } finally {
    ffmpegBusy.value = false;
  }
};

onMounted(async () => {
  if (!isDesktopRuntime()) return;
  await refreshFfmpegStatus();
  unlistenFfmpegProgress = await desktopListen<FfmpegPluginProgress>("ffmpeg-plugin-progress", (event) => {
    ffmpegProgress.value = event.payload.progress || 0;
  });
});

onBeforeUnmount(() => unlistenFfmpegProgress?.());

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
  <div class="flex flex-col gap-4">
    <SettingsGroup>
      <SettingsRow :title="t('Common.Language')">
        <USelect
          v-model="selectedLanguage"
          :items="languageItems"
          value-key="id"
          :aria-label="t('Common.Language')"
          size="sm"
          class="w-48"
        />
      </SettingsRow>

      <SettingsRow :title="t('Setting.Charset')" :description="t('Setting.CharsetDescription')">
        <USelect
          v-model="selectedCharset"
          :items="charsetItems"
          value-key="id"
          :aria-label="t('Setting.Charset')"
          size="sm"
          class="w-48"
        />
      </SettingsRow>

      <SettingsRow :title="t('Setting.TerminalBackspace')" :description="t('Setting.TerminalBackspaceDescription')">
        <USwitch v-model="selectedEnabled" :aria-label="t('Setting.TerminalBackspace')" />
      </SettingsRow>

      <SettingsRow
        :title="t('Setting.TerminalCommandSuggestions')"
        :description="t('Setting.TerminalCommandSuggestionsDescription')"
      >
        <div class="flex items-center gap-2">
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
      </SettingsRow>

      <SettingsRow :title="t('Setting.Resolution')" :description="t('Setting.ResolutionDescription')">
        <USelect
          v-model="selectedresolution"
          :items="resolutionItems"
          value-key="id"
          :aria-label="t('Setting.Resolution')"
          size="sm"
          class="w-48"
        />
      </SettingsRow>
    </SettingsGroup>

    <SettingsGroup v-if="isDesktopRuntime() && ffmpegStatus" :divided="false" padded>
      <div class="flex items-start justify-between gap-6">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <p class="text-sm font-medium text-highlighted">{{ t("Setting.FfmpegPlugin") }}</p>
            <UBadge :color="ffmpegStatus.installed ? 'success' : 'neutral'" variant="soft" size="sm">
              {{ ffmpegStatus.installed ? t("Setting.Installed") : t("Setting.NotInstalled") }}
            </UBadge>
          </div>
          <p class="mt-1 text-xs leading-5 text-muted">
            {{ t("Setting.FfmpegPluginDescription", { size: formatMegabytes(ffmpegStatus.downloadSize) }) }}
          </p>
          <p class="mt-1 text-xs text-dimmed">
            FFmpeg {{ ffmpegStatus.version }} · {{ ffmpegStatus.license }}
            <template v-if="ffmpegStatus.installed">· {{ formatMegabytes(ffmpegStatus.size) }}</template>
          </p>
        </div>

        <UButton
          v-if="!ffmpegStatus.installed"
          color="neutral"
          variant="outline"
          size="sm"
          icon="i-lucide-download"
          :loading="ffmpegBusy"
          :label="t('Setting.DownloadFfmpeg')"
          class="rounded-full"
          @click="installFfmpeg"
        />
        <UButton
          v-else
          color="neutral"
          variant="outline"
          size="sm"
          icon="i-lucide-trash-2"
          :loading="ffmpegBusy"
          :label="t('Setting.UninstallFfmpeg')"
          class="rounded-full"
          @click="uninstallFfmpeg"
        />
      </div>

      <div v-if="ffmpegBusy" class="mt-4 flex items-center gap-3">
        <UProgress :value="ffmpegProgress" size="sm" class="flex-1" />
        <span class="w-10 text-right text-xs tabular-nums text-muted">{{ ffmpegProgress }}%</span>
      </div>
    </SettingsGroup>

    <SettingsGroup :divided="false" padded>
      <div class="flex items-start justify-between gap-6">
        <div class="min-w-0">
          <p class="text-sm font-medium text-highlighted">{{ t("Setting.DebugLog") }}</p>
          <p class="mt-1 text-xs leading-5 text-muted">{{ t("Setting.DebugLogDescription") }}</p>
        </div>
        <USwitch v-model="debugLogEnabled" :aria-label="t('Setting.DebugLog')" />
      </div>
      <div class="mt-3 flex flex-wrap justify-end gap-2">
        <UButton
          color="neutral"
          variant="outline"
          size="sm"
          class="shrink-0 rounded-full"
          :class="clearFeedback !== 'idle' ? 'settings-log-pop' : undefined"
          @click="clearLogs"
        >
          <Transition name="settings-log-label" mode="out-in">
            <span :key="clearFeedback" class="inline-flex items-center gap-1.5">
              <UIcon v-if="logActionIcon(clearFeedback)" :name="logActionIcon(clearFeedback)!" class="size-3.5" />
              {{ logActionLabel(clearFeedback, t("Setting.ClearLogs"), t("Setting.LogsCleared")) }}
            </span>
          </Transition>
        </UButton>
        <UButton
          color="neutral"
          variant="outline"
          size="sm"
          class="shrink-0 rounded-full"
          :class="copyFeedback !== 'idle' ? 'settings-log-pop' : undefined"
          @click="copyLogs"
        >
          <Transition name="settings-log-label" mode="out-in">
            <span :key="copyFeedback" class="inline-flex items-center gap-1.5">
              <UIcon v-if="logActionIcon(copyFeedback)" :name="logActionIcon(copyFeedback)!" class="size-3.5" />
              {{ logActionLabel(copyFeedback, t("Setting.CopyLogs"), t("Setting.LogsCopied")) }}
            </span>
          </Transition>
        </UButton>
        <UButton
          color="neutral"
          variant="outline"
          size="sm"
          class="shrink-0 rounded-full"
          :class="downloadFeedback !== 'idle' ? 'settings-log-pop' : undefined"
          @click="downloadLogs"
        >
          <Transition name="settings-log-label" mode="out-in">
            <span :key="downloadFeedback" class="inline-flex items-center gap-1.5">
              <UIcon v-if="logActionIcon(downloadFeedback)" :name="logActionIcon(downloadFeedback)!" class="size-3.5" />
              {{ logActionLabel(downloadFeedback, t("Setting.DownloadLogs"), t("Setting.LogsDownloaded")) }}
            </span>
          </Transition>
        </UButton>
      </div>
    </SettingsGroup>

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
