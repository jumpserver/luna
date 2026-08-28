<script lang="ts" setup>
import type { ConfigItem } from "~/types/index";
import { desktopClipboard, desktopConvertFileSrc, desktopDialog, desktopOpener } from "~/shared/desktop/bridge";

const props = defineProps<{
  item: ConfigItem;
  protocol?: string;
  selected?: boolean;
}>();

const emit = defineEmits<{ (e: "toggle", value: boolean): void }>();

// 批量导入所有图片资源
const imageModules = import.meta.glob<{ default: string }>("@/assets/images/*.png", { eager: true });

const { t, locale } = useI18n();
const toast = useToast();
const { addErrorToast } = useErrorToast();
const { isWindows } = usePlatform();
const { language } = useSettingManager();
const { selectClient } = useApplicationConfig();

const imagesMap: Record<string, string | undefined> = {
  builtin_client: getImageByName("terminal"),
  iterm: getImageByName("item2"),
  dbeaver: getImageByName("dbeaver"),
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
  if (props.item?.name === "terminal" && props.item?.type === "databases") {
    return t("Setting.TerminalSettings");
  }
  return props.item?.display_name || "";
});

const bundledIconSrc = computed(() => imagesMap[props.item?.name?.toLowerCase?.()] || "");

const iconSrc = computed(() => {
  if (bundledIconSrc.value) {
    return bundledIconSrc.value;
  }
  if (props.item?.icon_path && isDesktopRuntime()) {
    return desktopConvertFileSrc(props.item.icon_path);
  }
  return imagesMap.terminal || "";
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
            ? [{ name: "Executable", extensions: ["exe"] }]
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
  <UCard
    variant="outline"
    :class="props.selected || isBuiltInTerminal ? '' : 'opacity-60'"
    :ui="{
      root: 'rounded-[length:var(--app-radius)] bg-[var(--app-surface-card)] ring-[var(--app-border)]',
      body: 'p-3.5 sm:p-3.5'
    }"
  >
    <div class="grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2">
      <img
        :src="iconSrc"
        :alt="displayName"
        loading="lazy"
        class="col-start-1 row-span-2 size-10 self-start rounded-[length:var(--app-radius)] border border-[var(--app-border)] bg-[var(--app-surface-panel)] object-contain p-1"
      />

      <p class="col-start-2 min-w-0 truncate text-sm font-medium leading-5 text-highlighted">
        {{ displayName }}
      </p>

      <USwitch
        class="col-start-3 row-start-1 justify-self-end"
        :model-value="props.selected ?? false"
        :disabled="switchDisabled"
        @update:model-value="onSwitch"
      />

      <div class="col-start-2 row-start-2 flex min-h-6 min-w-0 items-center gap-1.5">
        <template v-if="canPickPath && !props.item.path">
          <UButton
            :label="t('Setting.SelectPath')"
            color="neutral"
            variant="outline"
            size="xs"
            class="shrink-0"
            @click="selectExecutablePath()"
          />
        </template>
        <template v-else>
          <UButton
            :label="displayedPath || '-'"
            color="neutral"
            :variant="canPickPath ? 'soft' : 'subtle'"
            size="xs"
            class="min-w-0"
            :ui="{ base: 'min-w-0 max-w-full', label: 'truncate font-normal' }"
            :title="displayedPath || '-'"
            @click="onPathClick"
          />
          <UButton
            v-if="canCopyPath"
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-lucide-copy"
            class="shrink-0"
            :title="t('Setting.CopyPath')"
            @click.stop="handleCopyPath"
          />
        </template>
        <UBadge
          size="xs"
          class="shrink-0 whitespace-nowrap"
          :color="props.selected ? 'success' : 'neutral'"
          variant="soft"
        >
          {{ props.selected ? t("UserProfile.Enabled") : t("UserProfile.Disabled") }}
        </UBadge>
      </div>

      <div class="col-span-2 col-start-2 flex items-center justify-between gap-4">
        <div class="min-w-0 flex-1">
          <UTooltip
            v-if="commentText"
            :text="commentText"
            :delay-duration="150"
            :ui="{
              content: 'h-auto max-w-xs items-start py-1.5',
              text: 'whitespace-normal break-words'
            }"
          >
            <p class="truncate text-xs leading-5 text-muted">
              {{ commentText }}
            </p>
          </UTooltip>
        </div>
        <UButton
          v-if="props.item.download_url"
          size="sm"
          color="neutral"
          variant="outline"
          icon="i-lucide-arrow-down-to-line"
          class="shrink-0 rounded-full text-nowrap"
          @click="openDownloadPage(props.item.download_url)"
        >
          {{ t("Setting.DownloadApplication") }}
        </UButton>
      </div>
    </div>
  </UCard>
</template>
