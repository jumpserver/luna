<script setup lang="ts">
import type { SelectMenuItem } from "@nuxt/ui";
import type { AssetPageType, CharsetType, PermedAccount, PermedProtocol, ResolutionType } from "~/types/index";
import {
  createLocalApplicationConnectMethod,
  isApplicationConfigItemAvailable,
  isConnectMethodAvailable,
  useConnectMethods
} from "~/composables/useConnectMethods";
import { sortProtocolNames } from "~/utils";

const props = defineProps<{
  account: string;
  protocol: string;
  accounts: PermedAccount[];
  protocols: PermedProtocol[];
  manualUsername?: string;
  manualPassword?: string;
  dynamicPassword?: string;
  rememberSecret?: boolean;
  connectMethod?: string;
  preferredConnectMethod?: string;
  connectOptions?: Record<string, any>;
  assetType?: AssetPageType;
}>();

const emits = defineEmits<{
  (e: "update:protocol", v: string): void;
  (e: "update:account", v: string): void;
  (e: "update:manualUsername", v: string): void;
  (e: "update:manualPassword", v: string): void;
  (e: "update:dynamicPassword", v: string): void;
  (e: "update:rememberSecret", v: boolean): void;
  (e: "update:connectMethod", v: string): void;
  (e: "update:connectOptions", v: Record<string, any>): void;
}>();

const { t } = useI18n();
const { getMethodsForProtocol, getDefaultMethodForProtocol } = useConnectMethods();
const { appConfig } = useSettingManager();
const trailingIcon = "group-data-[state=open]:rotate-180 transition-transform duration-200";
const formFieldUi = {
  label: "text-xs font-semibold tracking-[0.025em] text-[var(--app-text-muted)]",
  container: "mt-2"
};
const controlBaseUi =
  "min-h-9 rounded-[4px] bg-[var(--app-input-bg)] ring-1 ring-inset ring-[var(--app-border)] shadow-sm transition-[box-shadow,background-color] hover:ring-[var(--app-border-strong)] focus-visible:ring-2 focus-visible:ring-[var(--app-focus-ring)]";

const showManualInputArea = ref(false);
const showDynamicUserArea = ref(false);
const advancedOptionOpen = ref(false);
const availableConnectMethods = ref<any[]>([]);
const selectedConnectMethodType = ref<string>("");
let connectMethodRequestId = 0;

const localManualUsername = computed<string>({
  get: () => props.manualUsername || "",
  set: (v: string) => emits("update:manualUsername", v ?? "")
});

const localManualPassword = computed<string>({
  get: () => props.manualPassword || "",
  set: (v: string) => emits("update:manualPassword", v ?? "")
});

const localDynamicPassword = computed<string>({
  get: () => props.dynamicPassword || "",
  set: (v: string) => emits("update:dynamicPassword", v ?? "")
});

const localRememberSecret = computed<boolean>({
  get: () => props.rememberSecret || false,
  set: (v: boolean) => emits("update:rememberSecret", !!v)
});

const localConnectMethod = computed<string>({
  get: () => props.connectMethod || "",
  set: (v: string) => emits("update:connectMethod", v ?? "")
});

const localConnectOptions = computed<Record<string, any>>({
  get: () => props.connectOptions || {},
  set: (v: Record<string, any>) => emits("update:connectOptions", v || {})
});

const updateConnectOption = (field: string, value: any) => {
  localConnectOptions.value = {
    ...localConnectOptions.value,
    [field]: value
  };
};

watch(
  () => props.account,
  (newVal) => {
    handleSpecialAccount(newVal || "");
  },
  { immediate: true }
);

watch(
  () => props.protocol,
  async (newProtocol, previousProtocol) => {
    const requestId = ++connectMethodRequestId;
    availableConnectMethods.value = [];

    if (!newProtocol) {
      emits("update:connectMethod", "");
      return;
    }

    // A method belongs to a protocol. Clear it before the async lookup so a
    // quick protocol-switch-and-connect cannot submit the previous protocol's method.
    const previousMethod = previousProtocol && previousProtocol !== newProtocol ? "" : props.connectMethod || "";
    emits("update:connectMethod", "");

    try {
      const methods = await getMethodsForProtocol(newProtocol);
      if (requestId !== connectMethodRequestId || newProtocol !== props.protocol) return;
      availableConnectMethods.value = methods;

      if (isConnectMethodAvailable(previousMethod, methods, newProtocol, appConfig.value)) {
        emits("update:connectMethod", previousMethod);
        return;
      }

      const protocolPreferredMethod = props.preferredConnectMethod || "";
      if (isConnectMethodAvailable(protocolPreferredMethod, methods, newProtocol, appConfig.value)) {
        emits("update:connectMethod", protocolPreferredMethod);
        return;
      }

      if (isTauriRuntime()) {
        const protocol = newProtocol.toLowerCase();
        const preferredClient = Object.values(appConfig.value || {})
          .flat()
          .find(
            (item) =>
              isApplicationConfigItemAvailable(item, protocol) &&
              item.match_first?.some((value) => value.toLowerCase() === protocol)
          );
        const nativeMethod = methods.find((method) => categoryOfConnectMethod(method) === "native");

        if (preferredClient && nativeMethod) {
          emits("update:connectMethod", createLocalApplicationConnectMethod(nativeMethod.value, preferredClient.name));
          return;
        }
      }

      const defaultMethod = await getDefaultMethodForProtocol(newProtocol);
      if (requestId === connectMethodRequestId && newProtocol === props.protocol && defaultMethod) {
        emits("update:connectMethod", defaultMethod);
      }
    } catch {
      if (requestId !== connectMethodRequestId) return;
      availableConnectMethods.value = [];
      emits("update:connectMethod", "");
    }
  },
  { immediate: true }
);

const protocolTabItems = computed(() =>
  sortProtocolNames(
    (isTauriRuntime()
      ? props.protocols
      : props.protocols.filter((protocol: PermedProtocol) => protocol?.public !== false)
    ).map((p: PermedProtocol) => p.name)
  ).map((name) => ({ label: name.toUpperCase(), value: name }))
);
const connectMethodTypeItems = computed(() => {
  const metaMap: Record<string, { label: string; icon: string }> = {
    builtin: { label: t("ConnectMethodType.BuiltIn"), icon: "i-lucide-box" },
    native: {
      label: t("ConnectMethodType.Application"),
      icon: "i-lucide-layout-grid"
    },
    remote_app: {
      label: t("ConnectMethodType.RemoteApplication"),
      icon: "i-lucide-app-window"
    }
  };
  const order = ["builtin", "native", "remote_app"];
  const grouped = new Set(availableConnectMethods.value.map((method) => categoryOfConnectMethod(method)));
  const sorted = [
    ...order.filter((type) => grouped.has(type)),
    ...Array.from(grouped).filter((type) => !order.includes(type))
  ].filter(Boolean);

  return sorted.map((type) => ({
    value: type,
    label: metaMap[type]?.label || type,
    icon: metaMap[type]?.icon || "i-lucide-circle"
  }));
});
const configuredClients = computed(() => {
  const protocol = (props.protocol || "").toLowerCase();
  if (!protocol || !appConfig.value) return [];

  return Object.values(appConfig.value)
    .flat()
    .filter((item) => isApplicationConfigItemAvailable(item, protocol))
    .sort((a, b) => Number(b.match_first?.includes(protocol)) - Number(a.match_first?.includes(protocol)));
});
const connectMethodTabItems = computed(() => {
  const methods = availableConnectMethods.value.filter((method) => {
    if (!selectedConnectMethodType.value) return true;
    return categoryOfConnectMethod(method) === selectedConnectMethodType.value;
  });

  // 服务端提供通用 native 入口，具体应用完全由全局应用配置决定。
  if (isTauriRuntime() && selectedConnectMethodType.value === "native") {
    if (!configuredClients.value.length) return [];

    const nativeMethod = methods[0];

    return nativeMethod
      ? configuredClients.value.map((client) => ({
          label: client.display_name || client.name,
          value: createLocalApplicationConnectMethod(nativeMethod.value, client.name)
        }))
      : [];
  }

  return methods.map((method) => ({
    label: method.label || method.value,
    value: method.value
  }));
});

const showCharsetOption = computed(() => ["ssh", "telnet"].includes((props.protocol || "").toLowerCase()));
const showBackspaceOption = computed(() => showCharsetOption.value);
const showDisableAutoHashOption = computed(() => ["mysql", "mariadb"].includes((props.protocol || "").toLowerCase()));
const showResolutionOption = computed(() => (props.protocol || "").toLowerCase() === "rdp");
const showAdvancedOptions = computed(
  () =>
    showCharsetOption.value ||
    showBackspaceOption.value ||
    showDisableAutoHashOption.value ||
    showResolutionOption.value
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

const selectedCharset = computed<CharsetType>({
  get: () => (localConnectOptions.value.charset || "default") as CharsetType,
  set: (value) => updateConnectOption("charset", value || "default")
});
const selectedBackspaceAsCtrlH = computed<boolean>({
  get: () => !!localConnectOptions.value.backspaceAsCtrlH,
  set: (value) => updateConnectOption("backspaceAsCtrlH", !!value)
});
const selectedDisableAutoHash = computed<boolean>({
  get: () => !!localConnectOptions.value.disableautohash,
  set: (value) => updateConnectOption("disableautohash", !!value)
});
const selectedResolution = computed<ResolutionType>({
  get: () => (localConnectOptions.value.resolution || "auto") as ResolutionType,
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

watch(
  () => [availableConnectMethods.value, props.connectMethod] as const,
  () => {
    if (availableConnectMethods.value.length === 0) {
      selectedConnectMethodType.value = "";
      return;
    }

    if (props.connectMethod?.startsWith("native_app:")) {
      selectedConnectMethodType.value = "native";
      if (!connectMethodTabItems.value.some((item) => item.value === props.connectMethod)) {
        emits("update:connectMethod", connectMethodTabItems.value[0]?.value || "");
      }
      return;
    }

    const current = availableConnectMethods.value.find((method) => method.value === props.connectMethod);
    if (current) {
      selectedConnectMethodType.value = categoryOfConnectMethod(current);
      return;
    }

    if (!selectedConnectMethodType.value) {
      selectedConnectMethodType.value = categoryOfConnectMethod(availableConnectMethods.value[0]);
    }
  },
  { deep: true, immediate: true }
);

function categoryOfConnectMethod(method: any) {
  if (String(method?.value || "").startsWith("native_app:")) return "native";
  if (isBuiltinConnectMethod(method)) return "builtin";

  const type = String(method?.type || "").toLowerCase();

  if (type === "web" || type === "builtin") return "builtin";
  if (["applet", "virtual_app", "remote_app", "remoteapp"].includes(type)) return "remote_app";
  if (["native", "client", "local", "desktop"].includes(type)) return "native";
  return type || "builtin";
}

function isBuiltinConnectMethod(method: any) {
  return String(method?.value || "").toLowerCase() === "web_cli_native";
}

function selectConnectMethodType(type: string | number) {
  selectedConnectMethodType.value = String(type);

  localConnectMethod.value = connectMethodTabItems.value[0]?.value || "";
}

async function openProtocolApplicationSettings() {
  const protocol = (props.protocol || "").toLowerCase();
  const routeProtocol = protocol === "postgresql" ? "pg" : protocol;
  if (!routeProtocol) return;

  const path = `/setting/application/${encodeURIComponent(routeProtocol)}`;
  if (isTauriRuntime()) {
    await useTauriCoreInvoke("open_settings_window", { path });
    return;
  }

  await navigateTo(path);
}

const accountItems = computed(() => {
  // web 类型的资产需要保留匿名账号，其它类型不展示 @ANON
  const filteredAnonymous = props.accounts.filter((a: PermedAccount) => {
    return a.alias !== "@ANON" || props.assetType?.toLowerCase() === "web";
  });

  const hosted = filteredAnonymous
    .filter((acc: PermedAccount) => !acc.alias.includes("@"))
    .map((acc: PermedAccount) => ({
      label: acc.name,
      value: acc.name
    }));

  const manual = filteredAnonymous
    .filter((acc: PermedAccount) => acc.alias.includes("@"))
    .map((acc: PermedAccount) => {
      if (acc.alias === "@USER") {
        const base = t("Account.DynamicUser");
        const username = acc.username || "";
        const text = username ? `${base}(${username})` : base;
        return { label: text, value: text };
      }

      if (acc.alias === "@INPUT") {
        const text = t("Account.ManualInput");
        return { label: text, value: text };
      }

      if (acc.alias === "@ANON") {
        const text = t("Account.Anonymous");
        return { label: text, value: "@ANON" };
      }

      return { label: acc.name, value: acc.name };
    });

  const items: SelectMenuItem[] = [];

  if (hosted.length > 0) {
    items.push({ type: "label", label: t("Account.Hosted") });
    items.push(...hosted);
  }

  if (manual.length > 0) {
    if (items.length > 0) items.push({ type: "separator" });
    items.push({ type: "label", label: t("Account.Manual") });
    items.push(...manual);
  }

  return items;
});

const selectedProtocol = computed<string>({
  get: () => props.protocol,
  set: (v: string) => emits("update:protocol", v ?? "")
});

const selectedAccount = computed<string>({
  get: () => props.account,
  set: (v: string) => emits("update:account", v ?? "")
});

function handleSpecialAccount(v: string) {
  showManualInputArea.value = false;
  showDynamicUserArea.value = false;

  if (v === "手动输入" || v === "Manual input") {
    showManualInputArea.value = true;
  }

  if (v.includes("同名账号") || v.includes("Dynamic user")) {
    showDynamicUserArea.value = true;
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="protocol-tabs-track">
      <div class="protocol-tabs">
        <button
          v-for="item in protocolTabItems"
          :key="item.value"
          type="button"
          class="protocol-tab-button"
          :class="item.value === selectedProtocol ? 'protocol-tab-button-active' : 'protocol-tab-button-idle'"
          @click="selectedProtocol = item.value"
        >
          {{ item.label }}
        </button>
      </div>
    </div>

    <UFormField :label="t('EditModal.OptionalAccount')" :ui="formFieldUi" size="md">
      <USelectMenu
        v-model="selectedAccount"
        :items="accountItems"
        value-key="value"
        label-key="label"
        :ui="{
          base: controlBaseUi,
          trailingIcon
        }"
        icon="i-lucide-user-round"
        size="md"
        class="w-full"
      />
    </UFormField>

    <template v-if="showManualInputArea">
      <div class="credentials-fields">
        <UFormField :label="t('Account.Username')" :ui="formFieldUi" size="md">
          <UInput
            v-model="localManualUsername"
            autocapitalize="none"
            autocorrect="off"
            :placeholder="t('Account.Username')"
            :ui="{ base: controlBaseUi }"
            icon="i-lucide-user-round"
            size="md"
            class="w-full"
          />
        </UFormField>

        <UFormField :label="t('Account.Password')" :ui="formFieldUi" size="md">
          <UFieldGroup class="w-full">
            <UInput
              v-model="localManualPassword"
              type="password"
              autocapitalize="none"
              autocorrect="off"
              :placeholder="t('Account.Password')"
              :ui="{ base: controlBaseUi }"
              icon="i-lucide-lock-keyhole"
              size="md"
              class="min-w-0 flex-1"
            />
            <UButton
              type="button"
              icon="i-lucide-save"
              :aria-label="t('Account.RememberPassword')"
              :title="t('Account.RememberPassword')"
              :color="localRememberSecret ? 'primary' : 'neutral'"
              :variant="localRememberSecret ? 'solid' : 'outline'"
              size="md"
              @click="localRememberSecret = !localRememberSecret"
            />
          </UFieldGroup>
        </UFormField>
      </div>
    </template>

    <template v-if="showDynamicUserArea">
      <div class="credentials-fields">
        <UFormField :label="t('Account.Password')" :ui="formFieldUi" size="md">
          <UFieldGroup class="w-full">
            <UInput
              v-model="localDynamicPassword"
              type="password"
              autocapitalize="none"
              autocorrect="off"
              :placeholder="t('Account.Password')"
              :ui="{ base: controlBaseUi }"
              icon="i-lucide-lock-keyhole"
              size="md"
              class="min-w-0 flex-1"
            />
            <UButton
              type="button"
              icon="i-lucide-save"
              :aria-label="t('Account.RememberPassword')"
              :title="t('Account.RememberPassword')"
              :color="localRememberSecret ? 'primary' : 'neutral'"
              :variant="localRememberSecret ? 'solid' : 'outline'"
              size="md"
              @click="localRememberSecret = !localRememberSecret"
            />
          </UFieldGroup>
        </UFormField>
      </div>
    </template>

    <UFormField :label="t('EditModal.ConnectMethod')" :ui="formFieldUi" size="md">
      <div class="rounded-[4px] border border-[var(--app-border)] bg-[var(--app-input-bg)] shadow-sm">
        <UTabs
          v-if="connectMethodTypeItems.length > 1"
          :model-value="selectedConnectMethodType"
          :items="connectMethodTypeItems"
          value-key="value"
          label-key="label"
          color="neutral"
          variant="link"
          :content="false"
          :ui="{
            root: 'p-0',
            list: 'p-0 justify-start',
            trigger: 'py-2'
          }"
          class="w-full mb-2 connect-method-type-tabs"
          @update:model-value="selectConnectMethodType"
        />
        <div class="p-2 pt-1">
          <URadioGroup
            v-if="connectMethodTabItems.length"
            v-model="localConnectMethod"
            :items="connectMethodTabItems"
            value-key="value"
            label-key="label"
            orientation="horizontal"
            :ui="{
              fieldset: 'flex flex-wrap gap-2',
              item: 'rounded-[3px] px-2 py-1.5 hover:bg-[var(--app-hover-soft)]'
            }"
          />
          <div
            v-else-if="isTauriRuntime() && selectedConnectMethodType === 'native'"
            class="flex flex-col items-center gap-2 py-3 text-center"
          >
            <p class="text-sm text-[var(--app-text-muted)]">
              {{ t("Setting.NoClientConfigured") }}
            </p>
            <UButton
              type="button"
              icon="i-lucide-settings"
              color="neutral"
              variant="outline"
              size="sm"
              :label="t('Setting.ConfigureClient')"
              @click="openProtocolApplicationSettings"
            />
          </div>
        </div>
      </div>
    </UFormField>

    <div v-if="showAdvancedOptions">
      <button
        type="button"
        class="flex w-full items-center justify-between border-b border-gray-200 px-3 py-2 text-sm dark:border-white/10"
        @click="advancedOptionOpen = !advancedOptionOpen"
      >
        <span>{{ t("Common.Advanced") }}</span>
        <UIcon
          name="i-lucide-chevron-down"
          class="size-4 transition-transform"
          :class="advancedOptionOpen ? 'rotate-180' : ''"
        />
      </button>

      <div v-if="advancedOptionOpen" class="space-y-3 px-3 py-3">
        <UFormField v-if="showCharsetOption" :label="t('Setting.Charset')" :ui="formFieldUi" size="sm">
          <USelect
            v-model="selectedCharset"
            :items="charsetItems"
            :ui="{ base: controlBaseUi }"
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

        <UFormField v-if="showResolutionOption" :label="t('Setting.Resolution')" :ui="formFieldUi" size="sm">
          <USelect
            v-model="selectedResolution"
            :items="resolutionItems"
            :ui="{ base: controlBaseUi }"
            size="md"
            class="w-full"
          />
        </UFormField>
      </div>
    </div>
  </div>
</template>

<style scoped>
.credentials-fields {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.protocol-tabs-track {
  display: flex;
  justify-content: flex-start;
  border-bottom: 1px solid var(--app-border);
}

.protocol-tabs {
  display: inline-flex;
  width: fit-content;
  max-width: 100%;
  align-items: flex-end;
  justify-content: flex-start;
  gap: 0.25rem;
}

.protocol-tab-button {
  position: relative;
  flex: 0 0 auto;
  cursor: pointer;
  margin-bottom: -1px;
  border: 0;
  background: transparent;
  padding: 0.25rem 1.25rem 0.375rem;
  font-size: 0.875rem;
  font-weight: 500;
  letter-spacing: 0.08em;
  line-height: 1.25rem;
  color: var(--app-text-muted);
  transition: color 0.15s ease;
}

.protocol-tab-button-active {
  z-index: 1;
  color: var(--app-fg);
}

.protocol-tab-button-active::after {
  content: "";
  position: absolute;
  right: 0;
  bottom: -1px;
  left: 0;
  height: 2px;
  background: var(--ui-primary);
  pointer-events: none;
}

.protocol-tab-button-idle:hover {
  color: var(--app-fg);
}

:deep(.connect-method-type-tabs [data-slot="list"]) {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(0, 1fr);
  width: 100%;
}

:deep(.connect-method-type-tabs [data-slot="trigger"]) {
  cursor: pointer;
}
</style>
