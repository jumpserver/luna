<script lang="ts" setup>
import type { ConfigItem } from "~/types/index";

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
  if (props.item?.icon_path && isTauriRuntime()) {
    return useTauriCoreConvertFileSrc(props.item.icon_path);
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
    await useTauriClipboardManagerWriteText(path);
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
  await useTauriOpenerOpenUrl(url);
};

const selectExecutablePath = async () => {
  try {
    const selected = (await useTauriDialogOpen({
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
    :ui="{
      root: 'rounded-lg bg-[var(--app-surface-card)] ring-[var(--app-border)]',
      header: 'p-4 sm:px-4 sm:py-3',
      body: 'p-4 sm:p-4'
    }"
  >
    <template #header>
      <div class="flex items-center gap-3">
        <img
          :src="iconSrc"
          :alt="displayName"
          loading="lazy"
          class="size-10 shrink-0 rounded-md border border-[var(--app-border)] bg-[var(--app-surface-panel)] object-contain p-1"
        />

        <div class="flex min-w-0 flex-1 flex-col gap-0.5">
          <div class="flex items-center justify-between gap-3">
            <p class="min-w-0 truncate text-sm font-medium leading-tight text-highlighted">
              {{ displayName }}
            </p>

            <USwitch
              class="shrink-0"
              :model-value="props.selected ?? false"
              :disabled="switchDisabled"
              @update:model-value="onSwitch"
            />
          </div>

          <div class="min-w-0">
            <template v-if="canPickPath && !props.item.path">
              <UButton
                :label="t('Setting.SelectPath')"
                color="neutral"
                variant="outline"
                size="xs"
                @click="selectExecutablePath()"
              />
            </template>
            <template v-else>
              <div class="flex max-w-full items-center gap-2">
                <UButton
                  :label="displayedPath || '-'"
                  color="neutral"
                  :variant="canPickPath ? 'soft' : 'subtle'"
                  size="xs"
                  class="max-w-full"
                  :ui="{ base: 'max-w-full', label: 'truncate font-normal' }"
                  :title="displayedPath || '-'"
                  @click="onPathClick"
                />

                <UButton
                  v-if="canCopyPath"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-copy"
                  :title="t('Setting.CopyPath')"
                  @click.stop="handleCopyPath"
                />
              </div>
            </template>
          </div>
        </div>
      </div>
    </template>

    <template #default>
      <div class="flex w-full items-start justify-between gap-3">
        <div class="flex min-w-0 flex-1 flex-col gap-4">
          <div class="flex flex-wrap items-center gap-2">
            <UBadge v-for="(p, idx) in props.item.protocol" :key="idx" color="info" variant="soft">
              {{ p.toUpperCase() }}
            </UBadge>
          </div>

          <div class="text-pretty text-xs text-muted">
            {{ commentText }}
          </div>
        </div>

        <div class="shrink-0">
          <UButton
            v-if="props.item.download_url"
            size="sm"
            color="neutral"
            variant="soft"
            icon="i-lucide-arrow-down-to-line"
            class="text-nowrap"
            @click="openDownloadPage(props.item.download_url)"
          >
            {{ t("Setting.DownloadApplication") }}
          </UButton>
        </div>
      </div>
    </template>
  </UCard>
</template>
