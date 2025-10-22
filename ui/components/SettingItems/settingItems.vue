<script lang="ts" setup>
import type { ConfigItem } from "~/types/index";

import item2 from "@/assets/images/item2.png";
import realvnc from "@/assets/images/realvnc.png";
import dbeaver from "@/assets/images/dbeaver.png";
import terminal from "@/assets/images/terminal.png";
import tigerVnc from "@/assets/images/tigerVnc.png";
import securecrt from "@/assets/images/securecrt.png";
import windowsApp from "@/assets/images/windowsApp.png";
import anotherRedis from "@/assets/images/anotherRedis.png";
import mongodbCompass from "@/assets/images/mongodb.png";

import { useUserSettingStore } from "~/store/modules/userSetting";

const props = defineProps<{
  item: ConfigItem;
  protocol?: string;
  selected?: boolean;
}>();

const imagesMap: Record<string, string> = {
  iterm: item2,
  dbeaver: dbeaver,
  mstsc: windowsApp,
  terminal: terminal,
  vncviewer: realvnc,
  tigervnc: tigerVnc,
  securefx: securecrt,
  securecrt: securecrt,
  another_redis: anotherRedis,
  mongo_compass: mongodbCompass
};

const emit = defineEmits<{ (e: "toggle", value: boolean): void }>();

const { t, locale } = useI18n();
const userSettingStore = useUserSettingStore();
const { language } = storeToRefs(userSettingStore);

const commentText = computed(() => {
  const lang = language.value || (locale?.value as string) || "en";
  return props.item?.comment?.[lang as "zh" | "en"] || props.item?.comment?.en || "";
});

const iconSrc = computed(() => imagesMap[props.item?.name?.toLowerCase?.()]);

const onSwitch = (v: boolean) => {
  if (v) emit("toggle", true);
};

const openDownloadPage = async (url: string) => {
  console.log("url", url);
  await useTauriShellOpen(url);
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

            <div
              class="inline-flex items-center text-xs text-gray-600 dark:text-gray-300 bg-gray-100/80 dark:bg-white/10 rounded px-2 py-1 max-w-[22rem] md:max-w-[28rem] truncate"
              :title="props.item.path || '-'"
            >
              <span class="truncate">{{ props.item.path || "-" }}</span>
            </div>
          </div>
        </div>

        <USwitch
          unchecked-icon="i-lucide-x"
          checked-icon="i-lucide-check"
          :model-value="props.selected ?? false"
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
