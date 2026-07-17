<script setup lang="ts">
import type { SelectMenuItem } from "@nuxt/ui";
import type { AssetPageType, CharsetType, PermedAccount, PermedProtocol, ResolutionType } from "~/types/index";
import { useConnectMethods } from "~/composables/useConnectMethods";
import { sortProtocolNames } from "~/utils";

const props = defineProps<{
  account: string
  protocol: string
  accounts: PermedAccount[]
  protocols: PermedProtocol[]
  manualUsername?: string
  manualPassword?: string
  dynamicPassword?: string
  rememberSecret?: boolean
  connectMethod?: string
  connectOptions?: Record<string, any>
  assetType?: AssetPageType
  hideProtocol?: boolean
  hideAdvanced?: boolean
}>();

const emits = defineEmits<{
  (e: "update:protocol", v: string): void
  (e: "update:account", v: string): void
  (e: "update:manualUsername", v: string): void
  (e: "update:manualPassword", v: string): void
  (e: "update:dynamicPassword", v: string): void
  (e: "update:rememberSecret", v: boolean): void
  (e: "update:connectMethod", v: string): void
  (e: "update:connectOptions", v: Record<string, any>): void
}>();

const { t } = useI18n();
const { getMethodsForProtocol, getDefaultMethodForProtocol } = useConnectMethods();
const trailingIcon = "group-data-[state=open]:rotate-180 transition-transform duration-200";

const showManualInputArea = ref(false);
const showDynamicUserArea = ref(false);
const advancedOptionOpen = ref(false);
const availableConnectMethods = ref<any[]>([]);
const selectedConnectMethodType = ref<string>("");
const syncingConnectMethodType = ref(false);
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
  async (newProtocol) => {
    const requestId = ++connectMethodRequestId;
    availableConnectMethods.value = [];

    if (!newProtocol) {
      emits("update:connectMethod", "");
      return;
    }

    // A method belongs to a protocol. Clear it before the async lookup so a
    // quick protocol-switch-and-connect cannot submit the previous protocol's method.
    const previousMethod = props.connectMethod || "";
    emits("update:connectMethod", "");

    try {
      const methods = await getMethodsForProtocol(newProtocol);
      if (requestId !== connectMethodRequestId || newProtocol !== props.protocol) return;
      availableConnectMethods.value = methods;

      if (previousMethod && methods.some((m) => m.value === previousMethod)) {
        emits("update:connectMethod", previousMethod);
        return;
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
  const metaMap: Record<string, { label: string, icon: string }> = {
    builtin: { label: "Web", icon: "i-lucide-globe" },
    native: { label: "客户端", icon: "i-lucide-monitor" },
    remote_app: { label: "远程应用", icon: "i-lucide-app-window" }
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
const connectMethodTabItems = computed(() =>
  availableConnectMethods.value
    .filter((method) => {
      if (!selectedConnectMethodType.value) return true;
      return categoryOfConnectMethod(method) === selectedConnectMethodType.value;
    })
    .map((method) => ({
      label: method.label || method.value,
      value: method.value
    }))
);

const showCharsetOption = computed(() => ["ssh", "telnet"].includes((props.protocol || "").toLowerCase()));
const showBackspaceOption = computed(() => showCharsetOption.value);
const showDisableAutoHashOption = computed(() => ["mysql", "mariadb"].includes((props.protocol || "").toLowerCase()));
const showResolutionOption = computed(() => (props.protocol || "").toLowerCase() === "rdp");
const showAdvancedOptions = computed(
  () =>
    showCharsetOption.value
    || showBackspaceOption.value
    || showDisableAutoHashOption.value
    || showResolutionOption.value
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

    const current = availableConnectMethods.value.find((method) => method.value === props.connectMethod);
    if (current) {
      syncingConnectMethodType.value = true;
      selectedConnectMethodType.value = categoryOfConnectMethod(current);
      nextTick(() => {
        syncingConnectMethodType.value = false;
      });
      return;
    }

    if (!selectedConnectMethodType.value) {
      syncingConnectMethodType.value = true;
      selectedConnectMethodType.value = categoryOfConnectMethod(availableConnectMethods.value[0]);
      nextTick(() => {
        syncingConnectMethodType.value = false;
      });
    }
  },
  { deep: true, immediate: true }
);

watch(selectedConnectMethodType, (type, previousType) => {
  if (!type || !previousType || syncingConnectMethodType.value) return;

  const firstMethod = connectMethodTabItems.value[0]?.value;
  if (firstMethod && firstMethod !== props.connectMethod) {
    emits("update:connectMethod", firstMethod);
  }
});

function categoryOfConnectMethod(method: any) {
  const type = String(method?.type || "").toLowerCase();

  if (type === "web" || type === "builtin") return "builtin";
  if (["applet", "virtual_app", "remote_app", "remoteapp"].includes(type)) return "remote_app";
  if (["native", "client", "local", "desktop"].includes(type)) return "native";
  return type || "builtin";
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
  <div class="connection-form flex flex-col gap-4">
    <div v-if="!props.hideProtocol" class="settings-section">
      <div class="settings-section-label">
        <UIcon name="i-lucide-cable" class="size-3.5" />
        <span>{{ t("AssetCard.Protocol") }}</span>
      </div>
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
    </div>

    <div class="settings-section settings-section-plain">
      <UFormField :label="t('EditModal.OptionalAccount')" size="md">
        <USelectMenu
          v-model="selectedAccount"
          :items="accountItems"
          value-key="value"
          label-key="label"
          :ui="{
            trailingIcon
          }"
          icon="i-lucide-user-round"
          class="w-full"
        />
      </UFormField>

      <template v-if="showManualInputArea">
        <UFormField :label="t('Account.Username')" size="md" class="mt-3">
          <UInput
            v-model="localManualUsername"
            autocapitalize="none"
            autocorrect="off"
            :placeholder="t('Account.Username')"
          />
        </UFormField>

        <UFormField :label="t('Account.Password')" size="md" class="mt-3">
          <UInput
            v-model="localManualPassword"
            type="password"
            autocapitalize="none"
            autocorrect="off"
            :placeholder="t('Account.Password')"
          />
        </UFormField>

        <div class="settings-row justify-end pt-3">
          <USwitch v-model="localRememberSecret" :label="t('Account.RememberPassword')" />
        </div>
      </template>

      <template v-if="showDynamicUserArea">
        <UFormField :label="t('Account.Password')" size="md" class="mt-3">
          <UInput
            v-model="localDynamicPassword"
            type="password"
            autocapitalize="none"
            autocorrect="off"
            :placeholder="t('Account.Password')"
          />
        </UFormField>

        <div class="settings-row justify-end pt-3">
          <USwitch v-model="localRememberSecret" :label="t('Account.RememberPassword')" />
        </div>
      </template>
    </div>

    <div class="settings-section settings-section-plain">
      <UFormField :label="t('EditModal.ConnectMethod')" size="md">
        <UTabs
          v-if="connectMethodTypeItems.length > 1"
          v-model="selectedConnectMethodType"
          :items="connectMethodTypeItems"
          value-key="value"
          label-key="label"
          color="neutral"
          variant="link"
          :content="false"
          :ui="{
            root: 'p-0',
            list: 'p-0 justify-start'
          }"
          class="w-full mb-2 connect-method-type-tabs"
        />

        <div class="connect-method-list">
          <label
            v-for="item in connectMethodTabItems"
            :key="item.value"
            class="connect-method-option"
            :class="item.value === localConnectMethod ? 'connect-method-option-active' : ''"
          >
            <input v-model="localConnectMethod" class="sr-only" type="radio" :value="item.value">
            <span class="connect-method-radio">
              <span />
            </span>
            <span class="truncate">{{ item.label }}</span>
          </label>
        </div>
      </UFormField>
    </div>

    <div v-if="showAdvancedOptions && !props.hideAdvanced" class="settings-section p-0">
      <button type="button" class="advanced-trigger" @click="advancedOptionOpen = !advancedOptionOpen">
        <span class="flex min-w-0 items-center gap-2">
          <UIcon name="i-lucide-sliders-horizontal" class="size-3.5 text-[var(--app-muted)]" />
          <span>{{ t("Common.Advanced") }}</span>
        </span>
        <UIcon
          name="i-lucide-chevron-down"
          class="size-4 transition-transform"
          :class="advancedOptionOpen ? 'rotate-180' : ''"
        />
      </button>

      <div v-if="advancedOptionOpen" class="space-y-3 border-t border-[var(--app-border)] px-3 py-3">
        <UFormField v-if="showCharsetOption" :label="t('Setting.Charset')" size="sm">
          <USelect v-model="selectedCharset" :items="charsetItems" class="w-full" />
        </UFormField>

        <div v-if="showBackspaceOption" class="settings-row">
          <span>{{ t("Setting.TerminalBackspace") }}</span>
          <USwitch v-model="selectedBackspaceAsCtrlH" />
        </div>

        <div v-if="showDisableAutoHashOption" class="settings-row">
          <span>Disable auto completion</span>
          <USwitch v-model="selectedDisableAutoHash" />
        </div>

        <UFormField v-if="showResolutionOption" :label="t('Setting.Resolution')" size="sm">
          <USelect v-model="selectedResolution" :items="resolutionItems" class="w-full" />
        </UFormField>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-section {
  border: 1px solid var(--app-border);
  border-radius: 0.375rem;
  background: var(--workspace-surface-sub-panel);
  padding: 0.75rem;
}

.settings-section-plain {
  border: 0;
  background: transparent;
  padding: 0;
}

.settings-section-label {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  margin-bottom: 0.625rem;
  color: var(--app-muted);
  font-size: 0.75rem;
  font-weight: 600;
  line-height: 1rem;
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
  margin-bottom: -1px;
  border: 0;
  background: transparent;
  padding: 0.25rem 0.875rem 0.375rem;
  font-size: 0.875rem;
  font-weight: 500;
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
  right: 0.125rem;
  bottom: -1px;
  left: 0.125rem;
  height: 2px;
  border-radius: 999px 999px 0 0;
  background: var(--ui-primary);
  pointer-events: none;
}

.protocol-tab-button-idle:hover {
  color: var(--app-fg);
}

.connect-method-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}

.connect-method-option {
  display: inline-flex;
  min-width: 0;
  max-width: 100%;
  cursor: pointer;
  align-items: center;
  gap: 0.5rem;
  border: 1px solid var(--app-border);
  border-radius: 0.375rem;
  background: var(--app-surface-panel);
  padding: 0.375rem 0.625rem;
  color: var(--app-fg);
  font-size: 0.8125rem;
  line-height: 1.125rem;
  transition: border-color 0.15s ease, background-color 0.15s ease;
}

.connect-method-option:hover {
  background: var(--app-hover-soft);
}

.connect-method-option-active {
  border-color: var(--ui-primary);
  background: color-mix(in srgb, var(--ui-primary) 14%, var(--app-surface-panel));
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--ui-primary) 36%, transparent) inset;
}

.connect-method-radio {
  display: grid;
  width: 0.875rem;
  height: 0.875rem;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid var(--app-border-strong);
  border-radius: 999px;
  background: var(--app-input-bg);
}

.connect-method-option-active .connect-method-radio {
  border-color: var(--ui-primary);
}

.connect-method-radio > span {
  width: 0.375rem;
  height: 0.375rem;
  border-radius: 999px;
  background: transparent;
}

.connect-method-option-active .connect-method-radio > span {
  background: var(--ui-primary);
}

.advanced-trigger {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.625rem 0.75rem;
  color: var(--app-fg);
  font-size: 0.8125rem;
  line-height: 1.125rem;
}

.advanced-trigger:hover {
  background: var(--app-hover-soft);
}

.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  color: var(--app-fg);
  font-size: 0.8125rem;
  line-height: 1.125rem;
}

:deep(.connect-method-type-tabs [data-slot="list"]) {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(0, 1fr);
  width: 100%;
}

:deep(.connect-method-type-tabs [data-slot="trigger"][data-state="active"]) {
  color: var(--app-fg);
}
</style>
