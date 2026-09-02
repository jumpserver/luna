<script setup lang="ts">
import type { ConnectMethod } from "~/composables/useConnectMethods";
import type { AssetPageType, PermedAccount, PermedProtocol } from "~/types/index";
import {
  createLocalApplicationConnectMethod,
  isApplicationConfigItemAvailable,
  isConnectMethodAvailable,
  useConnectMethods
} from "~/composables/useConnectMethods";
import { sortProtocolNames } from "~/utils";
import ConnectAccountFields from "./connectAccountFields.vue";
import ConnectAdvancedOptions from "./connectAdvancedOptions.vue";
import ConnectMethodPicker from "./connectMethodPicker.vue";
import { categoryOfConnectMethod } from "./connectMethodUtils";

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

const { getMethodsForProtocol } = useConnectMethods();
const { appConfig, modernIsland } = useSettingManager();
const methodsByProtocol = reactive<Record<string, ConnectMethod[]>>({});
const availableConnectMethods = computed(() => methodsByProtocol[props.protocol] || []);

const selectedProtocol = computed<string>({
  get: () => props.protocol,
  set: (value) => emits("update:protocol", value ?? "")
});

const selectedAccount = computed<string>({
  get: () => props.account,
  set: (value) => emits("update:account", value ?? "")
});

const localManualUsername = computed<string>({
  get: () => props.manualUsername || "",
  set: (value) => emits("update:manualUsername", value ?? "")
});

const localManualPassword = computed<string>({
  get: () => props.manualPassword || "",
  set: (value) => emits("update:manualPassword", value ?? "")
});

const localDynamicPassword = computed<string>({
  get: () => props.dynamicPassword || "",
  set: (value) => emits("update:dynamicPassword", value ?? "")
});

const localRememberSecret = computed<boolean>({
  get: () => props.rememberSecret || false,
  set: (value) => emits("update:rememberSecret", !!value)
});

const localConnectMethod = computed<string>({
  get: () => props.connectMethod || "",
  set: (value) => emits("update:connectMethod", value ?? "")
});

const localConnectOptions = computed<Record<string, any>>({
  get: () => props.connectOptions || {},
  set: (value) => emits("update:connectOptions", value || {})
});

const protocolTabItems = computed(() =>
  sortProtocolNames(
    (isDesktopRuntime() ? props.protocols : props.protocols.filter((protocol) => protocol?.public !== false)).map(
      (protocol) => protocol.name
    )
  ).map((name) => ({ label: name.toUpperCase(), value: name }))
);

const ensureProtocolMethods = async (protocol: string) => {
  if (!protocol) return [];
  if (!methodsByProtocol[protocol]) {
    methodsByProtocol[protocol] = await getMethodsForProtocol(protocol);
  }
  return methodsByProtocol[protocol] || [];
};

const pickConnectMethod = (protocol: string, methods: ConnectMethod[], previousProtocol?: string) => {
  const previousMethod = previousProtocol && previousProtocol !== protocol ? "" : props.connectMethod || "";
  if (isConnectMethodAvailable(previousMethod, methods, protocol, appConfig.value)) return previousMethod;

  const preferredMethod = props.preferredConnectMethod || "";
  if (isConnectMethodAvailable(preferredMethod, methods, protocol, appConfig.value)) return preferredMethod;

  if (isDesktopRuntime()) {
    const normalizedProtocol = protocol.toLowerCase();
    const preferredClient = Object.values(appConfig.value || {})
      .flat()
      .find(
        (item) =>
          isApplicationConfigItemAvailable(item, normalizedProtocol) &&
          item.match_first?.some((value) => value.toLowerCase() === normalizedProtocol)
      );
    const nativeMethod = methods.find((method) => categoryOfConnectMethod(method) === "native");
    if (preferredClient && nativeMethod) {
      return createLocalApplicationConnectMethod(nativeMethod.value, preferredClient.name);
    }
  }

  return methods[0]?.value || "";
};

watch(
  protocolTabItems,
  (items) => {
    for (const item of items) {
      void ensureProtocolMethods(item.value);
    }
  },
  { immediate: true }
);

watch(
  () => props.protocol,
  async (newProtocol, previousProtocol) => {
    if (!newProtocol) {
      emits("update:connectMethod", "");
      return;
    }

    try {
      const methods = await ensureProtocolMethods(newProtocol);
      if (newProtocol !== props.protocol) return;
      emits("update:connectMethod", pickConnectMethod(newProtocol, methods, previousProtocol));
    } catch {
      if (newProtocol !== props.protocol) return;
      emits("update:connectMethod", "");
    }
  },
  { immediate: true }
);
</script>

<template>
  <div class="flex flex-col gap-4" :class="{ 'connect-form--island': modernIsland }">
    <div class="protocol-tabs-track">
      <div class="protocol-tabs">
        <button
          v-for="item in protocolTabItems"
          :key="item.value"
          type="button"
          class="protocol-tab-button text-sm"
          :class="item.value === selectedProtocol ? 'protocol-tab-button-active' : 'protocol-tab-button-idle'"
          @click="selectedProtocol = item.value"
        >
          {{ item.label }}
        </button>
      </div>
    </div>

    <div class="flex flex-col gap-4">
      <ConnectAccountFields
        v-model:account="selectedAccount"
        v-model:manual-username="localManualUsername"
        v-model:manual-password="localManualPassword"
        v-model:dynamic-password="localDynamicPassword"
        v-model:remember-secret="localRememberSecret"
        :accounts="accounts"
        :asset-type="assetType"
      />
      <ConnectMethodPicker
        v-model:connect-method="localConnectMethod"
        :protocol="selectedProtocol"
        :methods="availableConnectMethods"
      />
      <ConnectAdvancedOptions v-model:connect-options="localConnectOptions" :protocol="selectedProtocol" />
    </div>
  </div>
</template>

<style scoped>
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
  font-weight: 500;
  letter-spacing: 0.08em;
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

.connect-form--island .protocol-tab-button {
  height: 32px;
  padding: 0 14px;
  letter-spacing: 0.04em;
}

.connect-form--island .protocol-tabs-track {
  border-bottom-color: color-mix(in srgb, var(--theme-fg) 14%, transparent);
}

.connect-form--island .protocol-tab-button-active::after {
  right: 8px;
  left: 8px;
  border-radius: 2px 2px 0 0;
  background: var(--theme-accent);
}
</style>
