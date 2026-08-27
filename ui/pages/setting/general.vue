<script setup lang="ts">
import type { CharsetType, LangType, ResolutionType } from "~/types";

import { useSettingManager } from "~/composables/useSettingManager";
import { desktopInvoke, desktopListen } from "~/shared/desktop/bridge";

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

definePageMeta({
  layout: "setting"
});

const { t, locales, locale } = useI18n();
const settingManager = useSettingManager();
const toast = useToast();
const { addErrorToast } = useErrorToast();
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
</script>

<template>
  <div class="flex flex-col gap-4">
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

    <UCard
      v-if="isDesktopRuntime() && ffmpegStatus"
      variant="outline"
      :ui="{
        root: 'rounded-lg bg-[var(--app-surface-card)] ring-[var(--app-border)]',
        body: 'p-4 sm:p-4'
      }"
    >
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
          color="primary"
          icon="i-lucide-download"
          :loading="ffmpegBusy"
          :label="t('Setting.DownloadFfmpeg')"
          @click="installFfmpeg"
        />
        <UButton
          v-else
          color="error"
          variant="soft"
          icon="i-lucide-trash-2"
          :loading="ffmpegBusy"
          :label="t('Setting.UninstallFfmpeg')"
          @click="uninstallFfmpeg"
        />
      </div>

      <div v-if="ffmpegBusy" class="mt-4 flex items-center gap-3">
        <UProgress :value="ffmpegProgress" size="sm" class="flex-1" />
        <span class="w-10 text-right text-xs tabular-nums text-muted">{{ ffmpegProgress }}%</span>
      </div>
    </UCard>
  </div>
</template>
