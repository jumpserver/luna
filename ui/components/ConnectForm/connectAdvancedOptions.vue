<script setup lang="ts">
import type { CharsetType, ResolutionType } from "~/types/index";

const props = defineProps<{
  protocol: string;
}>();

const connectOptions = defineModel<Record<string, any>>("connectOptions", { default: () => ({}) });

const { t } = useI18n();
const { modernIsland, formFieldUi, controlBaseUi, overlayMenuUi } = useConnectFormAppearance();
const advancedOptionOpen = ref(false);

const showCharsetOption = computed(() => ["ssh", "telnet"].includes((props.protocol || "").toLowerCase()));
const showBackspaceOption = computed(() => showCharsetOption.value);
const showDisableAutoHashOption = computed(() => ["mysql", "mariadb"].includes((props.protocol || "").toLowerCase()));
const showResolutionOption = computed(() => (props.protocol || "").toLowerCase() === "rdp");
const showUseSysDBAOption = computed(() => (props.protocol || "").toLowerCase() === "oracle");
const showAdvancedOptions = computed(
  () =>
    showCharsetOption.value ||
    showBackspaceOption.value ||
    showDisableAutoHashOption.value ||
    showResolutionOption.value ||
    showUseSysDBAOption.value
);

const charsetItems = computed(() => [
  { label: t("Setting.Default"), value: "default" },
  { label: "UTF-8", value: "utf8" },
  { label: "GBK", value: "gbk" },
  { label: "GB2312", value: "gb2312" },
  { label: "IOS-8859-1", value: "ios-8859-1" }
]);
const resolutionItems = computed(() => [
  { label: t("Setting.Auto"), value: "auto" },
  { label: "1024x768", value: "1024x768" },
  { label: "1366x768", value: "1366x768" },
  { label: "1600x900", value: "1600x900" },
  { label: "1920x1080", value: "1920x1080" }
]);

const updateConnectOption = (field: string, value: unknown) => {
  connectOptions.value = {
    ...connectOptions.value,
    [field]: value
  };
};

const selectedCharset = computed<CharsetType>({
  get: () => (connectOptions.value.charset || "default") as CharsetType,
  set: (value) => updateConnectOption("charset", value || "default")
});
const selectedBackspaceAsCtrlH = computed<boolean>({
  get: () => !!connectOptions.value.backspaceAsCtrlH,
  set: (value) => updateConnectOption("backspaceAsCtrlH", !!value)
});
const selectedDisableAutoHash = computed<boolean>({
  get: () => !!connectOptions.value.disableautohash,
  set: (value) => updateConnectOption("disableautohash", !!value)
});
const selectedUseSysDBA = computed<boolean>({
  get: () => !!connectOptions.value.use_sysdba,
  set: (value) => updateConnectOption("use_sysdba", !!value)
});
const selectedResolution = computed<ResolutionType>({
  get: () => (connectOptions.value.resolution || "auto") as ResolutionType,
  set: (value) => {
    const resolved = (value || "auto") as ResolutionType;
    updateConnectOption("resolution", resolved);
    updateConnectOption("rdp_resolution", resolved);
  }
});

watch(
  () => [props.protocol, showAdvancedOptions.value] as const,
  () => {
    advancedOptionOpen.value = false;
  },
  { immediate: true }
);
</script>

<template>
  <div>
    <button
      type="button"
      :disabled="!showAdvancedOptions"
      class="flex w-full items-center justify-between border-b px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
      :class="
        modernIsland
          ? 'border-[color-mix(in_srgb,var(--theme-fg)_14%,transparent)] px-0 text-[var(--app-text-muted)]'
          : 'border-gray-200 dark:border-white/10'
      "
      @click="advancedOptionOpen = !advancedOptionOpen"
    >
      <span>{{ t("Common.Advanced") }}</span>
      <UIcon
        name="i-lucide-chevron-down"
        class="size-4 transition-transform duration-200"
        :class="advancedOptionOpen ? 'rotate-180' : ''"
      />
    </button>

    <div
      v-show="modernIsland || (showAdvancedOptions && advancedOptionOpen)"
      :class="
        modernIsland
          ? ['advanced-fold', { 'is-open': showAdvancedOptions && advancedOptionOpen }]
          : 'space-y-3 px-3 py-3'
      "
    >
      <div :class="modernIsland ? 'advanced-fold__inner' : ''">
        <div class="space-y-3" :class="modernIsland ? 'pt-3' : ''">
          <UFormField v-if="showCharsetOption" :label="t('Setting.Charset')" :ui="formFieldUi" size="sm">
            <USelect
              v-model="selectedCharset"
              :items="charsetItems"
              :ui="{ base: controlBaseUi, ...overlayMenuUi }"
              trailing-icon="i-lucide-chevrons-up-down"
              size="md"
              class="w-full"
            />
          </UFormField>

          <div v-if="showBackspaceOption" class="flex items-center justify-between">
            <span class="text-sm">{{ t("Setting.TerminalBackspace") }}</span>
            <USwitch v-model="selectedBackspaceAsCtrlH" />
          </div>

          <div v-if="showDisableAutoHashOption" class="flex items-center justify-between">
            <span class="text-sm">Disable auto completion</span>
            <USwitch v-model="selectedDisableAutoHash" />
          </div>

          <div v-if="showUseSysDBAOption" class="flex items-center justify-between">
            <span class="text-sm">SYSDBA</span>
            <USwitch v-model="selectedUseSysDBA" />
          </div>

          <UFormField v-if="showResolutionOption" :label="t('Setting.Resolution')" :ui="formFieldUi" size="sm">
            <USelect
              v-model="selectedResolution"
              :items="resolutionItems"
              :ui="{ base: controlBaseUi, ...overlayMenuUi }"
              trailing-icon="i-lucide-chevrons-up-down"
              size="md"
              class="w-full"
            />
          </UFormField>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.advanced-fold {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 200ms ease;
}

.advanced-fold.is-open {
  grid-template-rows: 1fr;
}

.advanced-fold__inner {
  overflow: hidden;
  min-height: 0;
}
</style>
