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
    if (!newProtocol) return;

    try {
      const methods = await getMethodsForProtocol(newProtocol);
      availableConnectMethods.value = methods;

      if (!props.connectMethod || !methods.some((m) => m.value === props.connectMethod)) {
        const defaultMethod = await getDefaultMethodForProtocol(newProtocol);
        if (defaultMethod) {
          emits("update:connectMethod", defaultMethod);
        }
      }
    } catch {
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
      : props.protocols.filter((protocol: PermedProtocol) => protocol?.public !== false))
      .map((p: PermedProtocol) => p.name)
  ).map((name) => ({ label: name.toUpperCase(), value: name }))
);
const connectMethodTypeItems = computed(() => {
  const metaMap: Record<string, { label: string, icon: string }> = {
    web: { label: "Web CLI", icon: "i-lucide-globe" },
    native: { label: "客户端", icon: "i-lucide-monitor" },
    applet: { label: "Applet", icon: "i-lucide-box" },
    virtual_app: { label: "VirtualApp", icon: "i-lucide-app-window" }
  };
  const order = ["web", "native", "applet", "virtual_app"];
  const grouped = new Set(availableConnectMethods.value.map((method) => String(method.type || "")));
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
      return String(method.type || "") === selectedConnectMethodType.value;
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
const showAdvancedOptions = computed(() =>
  showCharsetOption.value || showBackspaceOption.value || showDisableAutoHashOption.value || showResolutionOption.value
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
    if (current?.type) {
      selectedConnectMethodType.value = String(current.type);
      return;
    }

    if (!selectedConnectMethodType.value) {
      selectedConnectMethodType.value = String(availableConnectMethods.value[0]?.type || "");
    }
  },
  { deep: true, immediate: true }
);

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
  <div class="flex flex-col gap-3">
    <div class="flex justify-start border-b border-gray-200 dark:border-white/10">
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

    <UFormField :label="t('EditModal.OptionalAccount')" size="md">
      <USelectMenu
        v-model="selectedAccount"
        :items="accountItems"
        value-key="value"
        label-key="label"
        :ui="{
          trailingIcon
        }"
        icon="lucide:user-round"
        class="w-full"
      />
    </UFormField>

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
      <div class="rounded-md border border-gray-200 p-2 dark:border-white/10">
        <URadioGroup
          v-model="localConnectMethod"
          :items="connectMethodTabItems"
          value-key="value"
          label-key="label"
          orientation="horizontal"
          :ui="{
            fieldset: 'flex flex-wrap gap-2',
            item: 'rounded px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-white/5'
          }"
        />
      </div>
    </UFormField>

    <div v-if="showAdvancedOptions" class="rounded-md border border-gray-200 dark:border-white/10">
      <button
        type="button"
        class="flex w-full items-center justify-between px-3 py-2 text-sm"
        @click="advancedOptionOpen = !advancedOptionOpen"
      >
        <span>{{ t("Common.Advanced") }}</span>
        <UIcon
          name="i-lucide-chevron-down"
          class="size-4 transition-transform"
          :class="advancedOptionOpen ? 'rotate-180' : ''"
        />
      </button>

      <div v-if="advancedOptionOpen" class="space-y-3 border-t border-gray-200 px-3 py-3 dark:border-white/10">
        <UFormField v-if="showCharsetOption" :label="t('Setting.Charset')" size="sm">
          <USelect v-model="selectedCharset" :items="charsetItems" class="w-full" />
        </UFormField>

        <div v-if="showBackspaceOption" class="flex items-center justify-between">
          <span class="text-sm">{{ t("Setting.TerminalBackspace") }}</span>
          <USwitch v-model="selectedBackspaceAsCtrlH" />
        </div>

        <div v-if="showDisableAutoHashOption" class="flex items-center justify-between">
          <span class="text-sm">Disable auto completion</span>
          <USwitch v-model="selectedDisableAutoHash" />
        </div>

        <UFormField v-if="showResolutionOption" :label="t('Setting.Resolution')" size="sm">
          <USelect v-model="selectedResolution" :items="resolutionItems" class="w-full" />
        </UFormField>
      </div>
    </div>

    <template v-if="showManualInputArea">
      <UFormField :label="t('Account.Username')" size="md">
        <UInput
          v-model="localManualUsername"
          autocapitalize="none"
          autocorrect="off"
          :placeholder="t('Account.Username')"
        />
      </UFormField>

      <UFormField :label="t('Account.Password')" size="md">
        <UInput
          v-model="localManualPassword"
          type="password"
          autocapitalize="none"
          autocorrect="off"
          :placeholder="t('Account.Password')"
        />
      </UFormField>

      <div class="flex justify-end items-center w-full">
        <USwitch v-model="localRememberSecret" :label="t('Account.RememberPassword')" />
      </div>
    </template>

    <template v-if="showDynamicUserArea">
      <UFormField :label="t('Account.Password')" size="md">
        <UInput
          v-model="localDynamicPassword"
          type="password"
          autocapitalize="none"
          autocorrect="off"
          :placeholder="t('Account.Password')"
        />
      </UFormField>

      <div class="flex justify-end items-center w-full">
        <USwitch v-model="localRememberSecret" :label="t('Account.RememberPassword')" />
      </div>
    </template>
  </div>
</template>

<style scoped>
.protocol-tabs {
  display: inline-flex;
  width: fit-content;
  max-width: 100%;
  align-items: center;
  justify-content: flex-start;
  gap: 0.25rem;
}

.protocol-tab-button {
  flex: 0 0 auto;
  border-bottom: 2px solid transparent;
  padding: 0.25rem 0.875rem;
  font-size: 0.875rem;
  font-weight: 500;
  line-height: 1.25rem;
  transition:
    border-color 0.15s ease,
    color 0.15s ease;
}

.protocol-tab-button-active {
  border-bottom-color: var(--ui-primary);
  color: var(--ui-text-highlighted);
}

.protocol-tab-button-idle {
  color: var(--ui-text-muted);
}

.protocol-tab-button-idle:hover {
  color: var(--ui-text);
}

:deep(.connect-method-type-tabs [data-slot="list"]) {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(0, 1fr);
  width: 100%;
}
</style>
