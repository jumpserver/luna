<script lang="ts" setup>
import type { ConfigItem } from "~/types/index";
import { desktopClipboard, desktopConvertFileSrc, desktopDialog, desktopOpener } from "~/shared/desktop/bridge";

const props = defineProps<{
  item: ConfigItem;
  protocol?: string;
  selected?: boolean;
  mode?: "application" | "protocol";
}>();

const emit = defineEmits<{
  (e: "toggle", value: boolean): void;
  (e: "makeDefault"): void;
}>();

// 批量导入所有图片资源
const imageModules = import.meta.glob<{ default: string }>("@/assets/images/*.png", { eager: true });

const { t, locale } = useI18n();
const toast = useToast();
const { addErrorToast } = useErrorToast();
const { isWindows } = usePlatform();
const { language } = useSettingManager();
const { selectClient } = useApplicationConfig();
const { activeApplicationView, activeApplicationId } = useSettingsWindow();
const cardElement = ref<HTMLElement | null>(null);
const configurationOpen = ref(false);
const isApplication = computed(() => props.mode === "application");
const applicationId = computed(() => props.item.plugin_id || `${props.item.type}:${props.item.name}`);
const isHighlighted = computed(() => isApplication.value && activeApplicationId.value === applicationId.value);
const imageFailed = ref(false);
watch(
  () => props.item.icon_path,
  () => (imageFailed.value = false)
);

const revealApplication = () => {
  if (isHighlighted.value) cardElement.value?.scrollIntoView({ block: "nearest" });
};
onMounted(revealApplication);
watch(isHighlighted, revealApplication, { flush: "post" });

const configureApplication = () => {
  if (isApplication.value) {
    configurationOpen.value = true;
    return;
  }
  activeApplicationId.value = props.item.uses_terminal_host ? "" : applicationId.value;
  activeApplicationView.value = "applications";
};

const imagesMap: Record<string, string | undefined> = {
  builtin_client: getImageByName("terminal"),
  iterm: getImageByName("item2"),
  dbeaver: getImageByName("dbeaver"),
  dbx: getImageByName("dbx"),
  heidisql: getImageByName("heidisql"),
  mstsc: getImageByName("mstsc"),
  terminal: getImageByName("terminal"),
  terminal_host: getImageByName("terminal"),
  vncviewer: getImageByName("realvnc"),
  realvnc: getImageByName("realvnc"),
  tigervnc: getImageByName("tigerVnc"),
  securefx: getImageByName("securecrt"),
  securecrt: getImageByName("securecrt"),
  another_redis: getImageByName("another_redis"),
  mongo_compass: getImageByName("mongodb"),
  xshell: getImageByName("xshell"),
  mobaxterm: getImageByName("mobaxterm"),
  putty: getImageByName("putty"),
  winscp: getImageByName("winscp"),
  xftp: getImageByName("xftp"),
  xfreerdp: getImageByName("xfreerdp"),
  remmina: getImageByName("remmina"),
  plsql: getImageByName("plsql"),
  ssms17: getImageByName("ssms17"),
  resp: getImageByName("resp"),
  navicat17: getImageByName("navicat17"),
  royalts: getImageByName("royalts"),
  windows_rdm: getImageByName("windows_rdm"),
  toad: getImageByName("toad")
};

const commentText = computed(() => {
  const lang = language.value || (locale?.value as string) || "en";
  return props.item?.comment?.[lang as "zh" | "en"] || props.item?.comment?.en || "";
});

const displayName = computed(() => {
  if (props.item?.uses_terminal_host) {
    return t("Setting.TerminalSettings");
  }
  return props.item?.display_name || "";
});

const bundledIconSrc = computed(() => imagesMap[props.item?.name?.toLowerCase?.()] || "");

const iconSrc = computed(() => {
  if (props.item?.icon_path && isDesktopRuntime() && !imageFailed.value) {
    return desktopConvertFileSrc(props.item.icon_path);
  }
  return bundledIconSrc.value || imagesMap.terminal || "";
});
const isBuiltInTerminal = computed(() => props.item?.name === "builtin_client");

const canPickPath = computed(() => {
  if (props.item?.path_selectable === false) {
    return false;
  }
  return !props.item?.is_internal && !!props.item?.executable_type;
});

const requiresLocalPath = computed(() =>
  ["user_path", "application_bundle"].includes(props.item?.executable_type || "")
);

const displayedPath = computed(() => props.item?.path_display ?? props.item?.path ?? "");
const canCopyPath = computed(() => props.item?.path_copyable !== false && !!props.item?.path);

const canEnable = computed(() => {
  if (isBuiltInTerminal.value) {
    return true;
  }

  if (requiresLocalPath.value) {
    return props.item?.path_exists === true;
  }
  return !!(props.item?.path && props.item.path.trim());
});

const switchDisabled = computed(() => {
  if (isBuiltInTerminal.value) {
    return true;
  }

  return requiresLocalPath.value ? false : !canEnable.value;
});

function getImageByName(filename: string): string | undefined {
  for (const path in imageModules) {
    if (path.includes(`/${filename}.png`)) {
      return imageModules[path]?.default;
    }
  }
  return undefined;
}

const showExecutableNotFoundToast = () => {
  const path = props.item?.path?.trim?.() || "";
  const description = path ? `${t("Setting.ExecutableNotFound")}\n${path}` : t("Setting.ExecutableNotFound");
  addErrorToast({
    title: t("Setting.EnableFailed"),
    description,
    icon: "line-md:close-circle",
    progress: true,
    duration: 4000
  });
};

const handleCopyPath = async () => {
  const path = props.item?.path?.trim?.() || "";
  if (!path) return;

  try {
    await desktopClipboard.writeText(path);
    toast.add({
      title: t("Setting.CopyPathSuccess"),
      color: "primary",
      icon: "line-md:check-all",
      progress: false,
      duration: 1000
    });
  } catch (e) {
    console.error("copy executable path failed", e);
  }
};

const onSwitch = (v: boolean) => {
  if (!v) {
    emit("toggle", false);
    return;
  }

  // path_exists is a snapshot from the last config build and can be stale if
  // the executable or application was moved/restored. Ask the backend to live-check
  // when a path is configured; only block locally when path is empty.
  if (requiresLocalPath.value) {
    if (!props.item?.path?.trim()) {
      showExecutableNotFoundToast();
      return;
    }
    emit("toggle", true);
    return;
  }

  if (!canEnable.value) return;
  emit("toggle", true);
};

const openDownloadPage = async (url: string) => {
  await desktopOpener.openUrl(url);
};

const selectExecutablePath = async () => {
  try {
    const selected = (await desktopDialog.open({
      multiple: false,
      directory: props.item?.executable_type === "application_bundle",
      filters:
        props.item?.executable_type === "application_bundle"
          ? undefined
          : isWindows.value
            ? [{ name: t("Setting.ExecutableFile"), extensions: ["exe"] }]
            : undefined
    })) as string | null;

    if (selected) {
      await selectClient(
        props.item.type as any,
        props.protocol || "",
        props.item.name,
        true,
        props.item.plugin_id,
        selected
      );
    }
  } catch (e) {
    console.error("select executable failed", e);
  }
};

const onPathClick = () => {
  if (canPickPath.value) {
    selectExecutablePath();
  }
};
</script>

<template>
  <div ref="cardElement" class="scroll-mt-4">
    <UCard
      variant="outline"
      :ui="{
        root: `rounded-[length:var(--app-radius)] bg-[var(--app-surface-card)] ${isHighlighted ? 'ring-[var(--app-focus-ring)]' : 'ring-[var(--app-border)]'}`,
        body: 'p-3.5 sm:p-3.5'
      }"
    >
      <div class="flex items-start gap-3">
        <img
          :src="iconSrc"
          :alt="displayName"
          class="size-10 shrink-0 rounded-[length:var(--app-radius)] border border-(--app-border) bg-(--app-surface-panel) object-contain p-1"
          @error="imageFailed = true"
        />
        <div class="min-w-0 flex-1">
          <div class="flex min-h-6 flex-wrap items-center justify-between gap-2">
            <p class="min-w-0 truncate text-sm font-medium text-highlighted">{{ displayName }}</p>
            <div class="flex items-center gap-2">
              <slot name="actions" />
              <template v-if="!isApplication">
                <template v-if="props.selected && props.protocol">
                  <UBadge
                    v-if="props.item.match_first?.includes(props.protocol)"
                    color="neutral"
                    variant="soft"
                    size="xs"
                  >
                    {{ t("Setting.DefaultApplication") }}
                  </UBadge>
                  <UButton
                    v-else
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    :label="t('Setting.SetDefaultApplication')"
                    @click="emit('makeDefault')"
                  />
                </template>
                <USwitch
                  :model-value="props.selected ?? false"
                  :disabled="switchDisabled"
                  :aria-label="`${t('Setting.Enable')} ${displayName}`"
                  @update:model-value="onSwitch"
                />
              </template>
              <UBadge v-else size="xs" :color="canEnable ? 'success' : 'neutral'" variant="soft">
                {{ canEnable ? t("Setting.ApplicationAvailable") : t("Setting.ApplicationMissing") }}
              </UBadge>
            </div>
          </div>

          <div class="mt-1 flex min-w-0 items-center justify-between gap-2">
            <span
              class="min-w-0 flex-1 truncate text-xs"
              :class="canEnable ? 'text-muted' : 'text-warning'"
              :title="isApplication ? displayedPath : item.path_display"
            >
              {{
                isApplication
                  ? displayedPath || "-"
                  : item.path_display ||
                    (canEnable ? t("Setting.ApplicationAvailable") : t("Setting.ApplicationMissing"))
              }}
            </span>
            <UButton
              size="xs"
              color="neutral"
              variant="link"
              icon="i-lucide-settings-2"
              :label="t('Setting.ConfigureApplication')"
              @click="configureApplication"
            />
          </div>
        </div>
      </div>
    </UCard>
    <UModal
      v-if="isApplication"
      v-model:open="configurationOpen"
      :title="displayName"
      :description="t('Setting.ConfigureApplication')"
    >
      <template #body>
        <div class="mt-2 flex min-w-0 items-center gap-1.5">
          <UButton
            :label="displayedPath || t('Setting.SelectPath')"
            color="neutral"
            :variant="canPickPath ? 'soft' : 'subtle'"
            size="xs"
            class="min-w-0"
            :ui="{ base: 'min-w-0 max-w-full', label: 'truncate font-normal' }"
            :title="displayedPath || t('Setting.SelectPath')"
            @click="onPathClick"
          />
          <UButton
            v-if="canCopyPath"
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-lucide-copy"
            class="shrink-0"
            :aria-label="t('Setting.CopyPath')"
            :title="t('Setting.CopyPath')"
            @click="handleCopyPath"
          />
          <UButton
            v-if="canPickPath"
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-lucide-folder-open"
            :label="t('Setting.SelectPath')"
            class="shrink-0"
            @click="selectExecutablePath"
          />
        </div>
        <div class="mt-2 flex flex-wrap gap-1">
          <UBadge
            v-for="supportedProtocol in item.protocol"
            :key="supportedProtocol"
            size="xs"
            color="neutral"
            variant="subtle"
          >
            {{ supportedProtocol.toUpperCase() }}
          </UBadge>
        </div>
        <div v-if="commentText || item.download_url" class="mt-2 flex items-center justify-between gap-3">
          <UTooltip
            v-if="commentText"
            :text="commentText"
            :delay-duration="150"
            :ui="{ content: 'h-auto max-w-xs', text: 'whitespace-normal break-words' }"
          >
            <p class="min-w-0 truncate text-xs text-muted">{{ commentText }}</p>
          </UTooltip>
          <UButton
            v-if="item.download_url"
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-lucide-arrow-down-to-line"
            :label="t('Setting.DownloadApplication')"
            class="shrink-0"
            @click="openDownloadPage(item.download_url)"
          />
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end">
          <UButton color="neutral" variant="outline" :label="t('Common.Close')" @click="configurationOpen = false" />
        </div>
      </template>
    </UModal>
  </div>
</template>
