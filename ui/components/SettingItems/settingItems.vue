<script lang="ts" setup>
import type { ConfigItem } from "~/types/index";

// 批量导入所有图片资源
const imageModules = import.meta.glob<{ default: string }>("@/assets/images/*.png", { eager: true });

const props = defineProps<{
  item: ConfigItem;
  protocol?: string;
  selected?: boolean;
}>();

const emit = defineEmits<{ (e: "toggle", value: boolean): void }>();

const { t, locale } = useI18n();
const { isWindows } = usePlatform();
const { language } = useSettingManager();
const { setAppConfig } = useSettingManager();

const imagesMap: Record<string, string | undefined> = {
  iterm: getImageByName("item2"),
  dbeaver: getImageByName("dbeaver"),
  mstsc: getImageByName("mstsc"),
  terminal: getImageByName("terminal"),
  vncviewer: getImageByName("realvnc"),
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

const iconSrc = computed(() => imagesMap[props.item?.name?.toLowerCase?.()]);

// Windows 下，除 putty 与 mstsc 外，提供可选择 exe 路径的入口
const isWindowsPathPickTarget = computed(() => {
  return props.item?.is_internal === false && isWindows.value;
});

const canToggle = computed(() => !!(props.item?.path && props.item.path.trim()));

function getImageByName (filename: string): string | undefined {
  for (const path in imageModules) {
    if (path.includes(`/${filename}.png`)) {
      return imageModules[path]?.default;
    }
  }
  return undefined;
};

const onSwitch = (v: boolean) => {
  if (!canToggle.value) return;
  if (v) emit("toggle", true);
};

const openDownloadPage = async (url: string) => {
  await useTauriShellOpen(url);
};

const selectExecutablePath = async () => {
  try {
    const selected = (await useTauriDialogOpen({
      multiple: false,
      filters: [{ name: "Executable", extensions: ["exe"] }]
    })) as string | null;

    if (selected) {
      const updated = await useTauriCoreInvoke("update_config_selection", {
        category: props.item.type,
        protocol: props.protocol || "",
        name: props.item.name,
        path: selected
      });

      if (updated) {
        setAppConfig(updated as any);
      }
    }
  } catch (e) {
    console.error("select executable failed", e);
  }
};

// 在 Windows 下，已选择路径后仍允许点击展示区域以重新选择
const onPathClick = () => {
  if (isWindowsPathPickTarget.value) {
    selectExecutablePath();
  }
};
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <img
            :src="iconSrc"
            :alt="props.item.display_name"
            loading="lazy"
            class="w-10 h-10 p-1 object-contain rounded-md border border-black/5 dark:border-white/10 bg-gray-50 dark:bg-gray-800/60"
          />

          <div class="flex flex-col gap-1">
            <p class="text-sm font-medium">{{ props.item.display_name }}</p>

            <!-- Windows 下特定项显示路径选择，否则展示已有路径 -->
            <template v-if="isWindowsPathPickTarget && !props.item.path">
              <UButton label="Select path" color="neutral" variant="outline" @click="selectExecutablePath()" />
            </template>
            <template v-else>
              <div
                class="inline-flex items-center text-xs text-gray-600 dark:text-gray-300 bg-gray-100/80 dark:bg-white/10 rounded px-2 py-1 max-w-88 md:max-w-md truncate"
                :class="{ 'cursor-pointer hover:bg-gray-200/60 dark:hover:bg-white/15': isWindowsPathPickTarget }"
                :title="props.item.path || '-'"
                @click="onPathClick"
              >
                <span class="truncate">{{ props.item.path || "-" }}</span>
              </div>
            </template>
          </div>
        </div>

        <USwitch
          unchecked-icon="i-lucide-x"
          checked-icon="i-lucide-check"
          :model-value="props.selected ?? false"
          :disabled="!canToggle"
          @update:model-value="onSwitch"
        />
      </div>
    </template>

    <template #default>
      <div class="flex w-full justify-between items-center">
        <div class="flex flex-col gap-4">
          <div class="flex items-center gap-2">
            <UBadge v-for="(p, idx) in props.item.protocol" :key="idx" color="info" variant="soft">
              {{ p.toUpperCase() }}
            </UBadge>
          </div>

          <div class="text-xs text-gray-500 text-pretty">
            {{ commentText }}
          </div>
        </div>

        <div>
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
