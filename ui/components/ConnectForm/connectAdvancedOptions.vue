<script setup lang="ts">
import type { CharsetType, RdpGraphics, ResolutionType } from "~/types/index";
import { resolveAdvancedOptionFlags } from "./advancedOptionFlags";

const props = withDefaults(
  defineProps<{
    protocol: string;
    component?: string;
    hasXPack?: boolean;
    appletClientEnabled?: boolean;
    connectionTokenReusable?: boolean;
  }>(),
  {
    component: "",
    hasXPack: false,
    appletClientEnabled: false,
    connectionTokenReusable: false
  }
);

const connectOptions = defineModel<Record<string, any>>("connectOptions", { default: () => ({}) });

const { t } = useI18n();
const { modernIsland, formFieldUi, controlBaseUi, overlayMenuUi } = useConnectFormAppearance();
const advancedOptionOpen = ref(false);
const flags = computed(() =>
  resolveAdvancedOptionFlags({
    protocol: props.protocol,
    component: props.component,
    hasXPack: props.hasXPack,
    connectionTokenReusable: props.connectionTokenReusable,
    appletConnectMethod: connectOptions.value.appletConnectMethod
  })
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
const appletConnectMethodItems = computed(() => [
  { label: t("Menu.Web"), value: "web" },
  ...(props.appletClientEnabled ? [{ label: t("ConnectionSetup.Client"), value: "client" }] : [])
]);
const rdpConnectionSpeedItems = computed(() => [
  { label: t("Setting.Auto"), value: "auto" },
  { label: t("Setting.RdpLowSpeedBroadband"), value: "low_speed_broadband" },
  { label: t("Setting.RdpHighSpeedBroadband"), value: "high_speed_broadband" }
]);
const virtualappConnectMethodItems = computed(() => [
  { label: t("Menu.Web"), value: "web" },
  { label: t("ConnectionSetup.Client"), value: "client" }
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
  set: (value) => updateConnectOption("resolution", value || "auto")
});
const selectedAppletConnectMethod = computed<string>({
  get: () => connectOptions.value.appletConnectMethod || "web",
  set: (value) => updateConnectOption("appletConnectMethod", value || "web")
});
const selectedRemoteMicrophone = computed<boolean>({
  get: () => !!connectOptions.value.remote_microphone,
  set: (value) => updateConnectOption("remote_microphone", !!value)
});
const selectedReusable = computed<boolean>({
  get: () => !!connectOptions.value.reusable,
  set: (value) => updateConnectOption("reusable", !!value)
});
const selectedRdpConnectionSpeed = computed<RdpGraphics["rdp_connection_speed"]>({
  get: () => connectOptions.value.rdp_connection_speed || "auto",
  set: (value) => updateConnectOption("rdp_connection_speed", value || "auto")
});
const selectedVirtualappConnectMethod = computed<string>({
  get: () => connectOptions.value.virtualappConnectMethod || "web",
  set: (value) => updateConnectOption("virtualappConnectMethod", value || "web")
});

watch(
  [() => props.protocol, () => props.component, () => flags.value.show],
  () => {
    advancedOptionOpen.value = false;
  },
  { immediate: true }
);
</script>

<template>
  <div v-if="flags.show">
    <button
      type="button"
      class="flex w-full items-center justify-between border-b py-2"
      :class="
        modernIsland
          ? `${formFieldUi.label} border-[color-mix(in_srgb,var(--theme-fg)_14%,transparent)] px-0`
          : 'border-gray-200 dark:border-white/10 px-3 text-sm'
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
      v-show="modernIsland || advancedOptionOpen"
      :class="modernIsland ? ['advanced-fold', { 'is-open': advancedOptionOpen }] : 'space-y-3 px-3 py-3'"
    >
      <div :class="modernIsland ? 'advanced-fold__inner' : ''">
        <div class="space-y-3" :class="modernIsland ? 'pt-3' : ''">
          <UFormField v-if="flags.charset" :label="t('Setting.Charset')" :ui="formFieldUi" size="sm">
            <USelect
              v-model="selectedCharset"
              :items="charsetItems"
              :ui="{ base: controlBaseUi, ...overlayMenuUi }"
              trailing-icon="i-lucide-chevrons-up-down"
              size="md"
              class="w-full"
            />
          </UFormField>

          <div v-if="flags.backspace" class="flex items-center justify-between">
            <span class="text-sm">{{ t("Setting.TerminalBackspace") }}</span>
            <USwitch v-model="selectedBackspaceAsCtrlH" />
          </div>

          <div v-if="flags.disableAutoHash" class="flex items-center justify-between">
            <span class="text-sm">Disable auto completion</span>
            <USwitch v-model="selectedDisableAutoHash" />
          </div>

          <div v-if="flags.sysdba" class="flex items-center justify-between">
            <span class="text-sm">SYSDBA</span>
            <USwitch v-model="selectedUseSysDBA" />
          </div>

          <UFormField v-if="flags.applet" :label="t('EditModal.AppletConnectMethod')" :ui="formFieldUi" size="sm">
            <USelect
              v-model="selectedAppletConnectMethod"
              :items="appletConnectMethodItems"
              :ui="{ base: controlBaseUi, ...overlayMenuUi }"
              trailing-icon="i-lucide-chevrons-up-down"
              size="md"
              class="w-full"
            />
          </UFormField>

          <div v-if="flags.remoteMicrophone || flags.reusable" class="grid grid-cols-2 gap-4">
            <UFormField
              v-if="flags.remoteMicrophone"
              :label="t('Setting.RemoteMicrophone')"
              :ui="{ ...formFieldUi, root: 'items-center', container: 'mt-0 shrink-0' }"
              orientation="horizontal"
              size="sm"
            >
              <USwitch v-model="selectedRemoteMicrophone" />
            </UFormField>
            <UFormField
              v-if="flags.reusable"
              :label="t('Setting.RdpFileReusable')"
              :ui="{ ...formFieldUi, root: 'items-center', container: 'mt-0 shrink-0' }"
              orientation="horizontal"
              size="sm"
            >
              <USwitch v-model="selectedReusable" />
            </UFormField>
          </div>

          <div v-if="flags.resolution || flags.rdpConnectionSpeed" class="grid grid-cols-2 gap-4">
            <UFormField
              v-if="flags.resolution"
              :label="t('Setting.Resolution')"
              :ui="{ ...formFieldUi, root: 'items-center', wrapper: 'shrink-0', container: 'mt-0 min-w-0 flex-1' }"
              orientation="horizontal"
              size="sm"
              class="min-w-0"
            >
              <USelect
                v-model="selectedResolution"
                :items="resolutionItems"
                :ui="{ base: controlBaseUi, ...overlayMenuUi }"
                trailing-icon="i-lucide-chevrons-up-down"
                size="md"
                class="w-full"
              />
            </UFormField>
            <UFormField
              v-if="flags.rdpConnectionSpeed"
              :label="t('Setting.RdpConnectionSpeed')"
              :ui="{ ...formFieldUi, root: 'items-center', wrapper: 'shrink-0', container: 'mt-0 min-w-0 flex-1' }"
              orientation="horizontal"
              size="sm"
              class="min-w-0"
            >
              <USelect
                v-model="selectedRdpConnectionSpeed"
                :items="rdpConnectionSpeedItems"
                :ui="{ base: controlBaseUi, ...overlayMenuUi }"
                trailing-icon="i-lucide-chevrons-up-down"
                size="md"
                class="w-full"
              />
            </UFormField>
          </div>

          <UFormField
            v-if="flags.virtualapp"
            :label="t('ConnectMethodType.VirtualApplication')"
            :ui="formFieldUi"
            size="sm"
          >
            <USelect
              v-model="selectedVirtualappConnectMethod"
              :items="virtualappConnectMethodItems"
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
