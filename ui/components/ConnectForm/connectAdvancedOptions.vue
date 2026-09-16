<script setup lang="ts">
import type { CharsetType, RdpGraphics, ResolutionType } from "~/types/index";
import { resolveAdvancedOptionFlags } from "./advancedOptionFlags";

const props = withDefaults(
  defineProps<{
    protocol: string;
    component?: string;
    connectMethod?: string;
    hasXPack?: boolean;
    appletClientEnabled?: boolean;
    connectionTokenReusable?: boolean;
  }>(),
  {
    component: "",
    connectMethod: "",
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
    connectMethod: props.connectMethod,
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
const selectedTokenReusable = computed<boolean>({
  get: () => !!connectOptions.value.token_reusable,
  set: (value) => updateConnectOption("token_reusable", !!value)
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

function setAdvancedFoldHeight(el: Element, height: string) {
  const node = el as HTMLElement;
  node.style.height = height;
  node.style.overflow = "hidden";
}

function clearAdvancedFoldHeight(el: Element) {
  const node = el as HTMLElement;
  node.style.height = "";
  node.style.overflow = "";
}

function onAdvancedFoldBeforeEnter(el: Element) {
  setAdvancedFoldHeight(el, "0px");
}

function onAdvancedFoldEnter(el: Element) {
  const node = el as HTMLElement;
  void node.offsetHeight;
  node.style.height = `${node.scrollHeight}px`;
}

function onAdvancedFoldBeforeLeave(el: Element) {
  const node = el as HTMLElement;
  setAdvancedFoldHeight(el, `${node.scrollHeight}px`);
}

function onAdvancedFoldLeave(el: Element) {
  const node = el as HTMLElement;
  void node.offsetHeight;
  node.style.height = "0px";
}
</script>

<template>
  <div
    v-if="flags.show"
    :class="{
      'advanced-options--island': modernIsland,
      'advanced-options--open': modernIsland && advancedOptionOpen
    }"
  >
    <button
      type="button"
      class="flex w-full items-center justify-between border-b py-2"
      :class="
        modernIsland
          ? `${formFieldUi.label} border-[color-mix(in_srgb,var(--theme-fg)_14%,transparent)] px-0`
          : 'border-gray-200 px-0 text-sm dark:border-white/10'
      "
      @click="advancedOptionOpen = !advancedOptionOpen"
    >
      <span>{{ t("Common.Advanced") }}</span>
      <UIcon
        name="i-lucide-chevron-down"
        class="me-3 size-4 transition-transform duration-200"
        :class="advancedOptionOpen ? 'rotate-180' : ''"
      />
    </button>

    <Transition
      name="advanced-fold"
      @before-enter="onAdvancedFoldBeforeEnter"
      @enter="onAdvancedFoldEnter"
      @after-enter="clearAdvancedFoldHeight"
      @before-leave="onAdvancedFoldBeforeLeave"
      @leave="onAdvancedFoldLeave"
      @after-leave="clearAdvancedFoldHeight"
    >
      <div v-if="advancedOptionOpen" :class="modernIsland ? 'space-y-3 pt-3 pb-3' : 'space-y-3 px-3 py-3'">
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

        <div v-if="flags.tokenReusable" class="flex items-center justify-between">
          <span class="text-sm">{{ t("ConnectionGuide.SetReusable") }}</span>
          <USwitch v-model="selectedTokenReusable" />
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
            :class="{ 'col-span-2': !flags.reusable }"
          >
            <USwitch v-model="selectedRemoteMicrophone" />
          </UFormField>
          <UFormField
            v-if="flags.reusable"
            :label="t('Setting.RdpFileReusable')"
            :ui="{ ...formFieldUi, root: 'items-center', container: 'mt-0 shrink-0' }"
            orientation="horizontal"
            size="sm"
            :class="{ 'col-span-2': !flags.remoteMicrophone }"
          >
            <USwitch v-model="selectedReusable" />
          </UFormField>
        </div>

        <div v-if="flags.resolution || flags.rdpConnectionSpeed" class="grid grid-cols-2 gap-4">
          <UFormField
            v-if="flags.resolution"
            :label="t('Setting.Resolution')"
            :description="t('Setting.ConnectionResolutionDescription')"
            :ui="{ ...formFieldUi, root: 'items-center', wrapper: 'shrink-0', container: 'mt-0 w-48 shrink-0' }"
            orientation="horizontal"
            size="sm"
            class="min-w-0"
            :class="{ 'col-span-2': !flags.rdpConnectionSpeed }"
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
            :ui="{ ...formFieldUi, root: 'items-center', wrapper: 'shrink-0', container: 'mt-0 w-48 shrink-0' }"
            orientation="horizontal"
            size="sm"
            class="min-w-0"
            :class="{ 'col-span-2': !flags.resolution }"
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
    </Transition>
  </div>
</template>

<style scoped>
.advanced-options--island > button {
  padding-inline: 0;
  border-bottom-color: color-mix(in srgb, var(--theme-fg) 14%, transparent);
}

.advanced-options--open {
  border-bottom: 1px solid color-mix(in srgb, var(--theme-fg) 14%, transparent);
}

.advanced-fold-enter-active,
.advanced-fold-leave-active {
  transition:
    height 200ms ease,
    opacity 160ms ease;
}

.advanced-fold-enter-from,
.advanced-fold-leave-to {
  opacity: 0;
}
</style>
