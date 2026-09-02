<script setup lang="ts">
import type { ConnectMethod } from "~/composables/useConnectMethods";
import { createLocalApplicationConnectMethod, isApplicationConfigItemAvailable } from "~/composables/useConnectMethods";
import { categoryOfConnectMethod, islandMethodIcon } from "./connectMethodUtils";

const props = defineProps<{
  protocol: string;
  methods: ConnectMethod[];
}>();

const connectMethod = defineModel<string>("connectMethod", { default: "" });

const { t } = useI18n();
const { appConfig, modernIsland } = useSettingManager();
const { formFieldUi } = useConnectFormAppearance();
const selectedConnectMethodType = ref("");

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
  const grouped = new Set(props.methods.map((method) => categoryOfConnectMethod(method)));
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
  if (!selectedConnectMethodType.value) return [];

  const tabMethods = props.methods.filter(
    (method) => categoryOfConnectMethod(method) === selectedConnectMethodType.value
  );

  if (isDesktopRuntime() && selectedConnectMethodType.value === "native") {
    if (!configuredClients.value.length) return [];

    const nativeMethod = tabMethods[0];

    return nativeMethod
      ? configuredClients.value.map((client) => ({
          label: client.display_name || client.name,
          value: createLocalApplicationConnectMethod(nativeMethod.value, client.name)
        }))
      : [];
  }

  return tabMethods.map((method) => ({
    label: method.label || method.value,
    value: method.value
  }));
});

const islandConnectMethodItems = computed(() =>
  connectMethodTabItems.value.map((item) => ({
    ...item,
    icon: islandMethodIcon(item.value)
  }))
);

watch(
  () => [props.methods, connectMethod.value] as const,
  () => {
    if (props.methods.length === 0) {
      selectedConnectMethodType.value = "";
      return;
    }

    if (connectMethod.value?.startsWith("native_app:")) {
      selectedConnectMethodType.value = "native";
      if (!connectMethodTabItems.value.some((item) => item.value === connectMethod.value)) {
        connectMethod.value = connectMethodTabItems.value[0]?.value || "";
      }
      return;
    }

    const current = props.methods.find((method) => method.value === connectMethod.value);
    if (current) {
      selectedConnectMethodType.value = categoryOfConnectMethod(current);
    }
  },
  { deep: true, immediate: true }
);

function selectConnectMethodType(type: string | number) {
  selectedConnectMethodType.value = String(type);
  connectMethod.value = connectMethodTabItems.value[0]?.value || "";
}

async function openProtocolApplicationSettings() {
  const protocol = (props.protocol || "").toLowerCase();
  const routeProtocol = protocol === "postgresql" ? "pg" : protocol;
  if (!routeProtocol) return;

  const path = `/setting/application/${encodeURIComponent(routeProtocol)}`;
  await useSettingsWindow().openSettings(path);
}
</script>

<template>
  <UFormField :label="t('EditModal.ConnectMethod')" :ui="formFieldUi" size="md">
    <div v-if="modernIsland" class="connect-method-island">
      <UTabs
        v-if="connectMethodTypeItems.length > 1"
        :model-value="selectedConnectMethodType"
        :items="connectMethodTypeItems"
        value-key="value"
        label-key="label"
        color="neutral"
        variant="pill"
        size="sm"
        :content="false"
        :ui="{
          root: 'w-full p-1.5',
          list: 'w-full',
          trigger: 'cursor-pointer data-[state=active]:text-[var(--app-text-primary)]',
          indicator:
            'bg-[var(--app-surface-overlay)] shadow-none ring-1 ring-[color-mix(in_srgb,var(--theme-fg)_12%,transparent)]'
        }"
        class="w-full"
        @update:model-value="selectConnectMethodType"
      />
      <div class="connect-method-island__content">
        <Transition name="island-method" mode="out-in">
          <div :key="selectedConnectMethodType || 'methods'">
            <URadioGroup
              v-if="islandConnectMethodItems.length"
              v-model="connectMethod"
              :items="islandConnectMethodItems"
              value-key="value"
              label-key="label"
              variant="card"
              orientation="vertical"
              indicator="start"
              size="sm"
              color="primary"
              :ui="{
                fieldset: 'w-full gap-1.5',
                item: 'w-full items-center rounded-[length:var(--workspace-island-radius)] border-0 bg-[var(--app-surface-overlay)] ring-1 ring-inset ring-[color-mix(in_srgb,var(--theme-fg)_16%,transparent)] has-data-[state=checked]:bg-[var(--app-state-selected)] has-data-[state=checked]:ring-[color-mix(in_srgb,var(--theme-accent)_50%,transparent)]',
                base: 'bg-transparent ring-[color-mix(in_srgb,var(--theme-fg)_40%,transparent)] data-[state=checked]:bg-transparent data-[state=checked]:ring-[var(--theme-accent)]',
                indicator:
                  'bg-transparent after:block after:size-1.5 after:rounded-full after:bg-[var(--theme-accent)]',
                wrapper: 'flex items-center',
                label: '!flex items-center gap-2 text-[13px] font-medium',
                description: 'text-[11px] text-[var(--app-text-muted)]'
              }"
            >
              <template #label="{ item }">
                <UIcon :name="item.icon || 'i-lucide-box'" class="size-4 text-[var(--app-text-muted)]" />
                {{ item.label }}
              </template>
            </URadioGroup>
            <div
              v-else-if="isDesktopRuntime() && selectedConnectMethodType === 'native'"
              class="connect-method-island__empty"
            >
              <p class="text-xs text-[var(--app-text-muted)]">
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
        </Transition>
      </div>
    </div>
    <div v-else class="rounded-[4px] border border-[var(--app-border)] bg-[var(--app-input-bg)] shadow-sm">
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
        class="mb-2 w-full connect-method-type-tabs"
        @update:model-value="selectConnectMethodType"
      />
      <div class="connect-method-classic__content p-2 pt-1">
        <URadioGroup
          v-if="connectMethodTabItems.length"
          v-model="connectMethod"
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
          v-else-if="isDesktopRuntime() && selectedConnectMethodType === 'native'"
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
</template>

<style scoped>
:deep(.connect-method-type-tabs [data-slot="list"]) {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(0, 1fr);
  width: 100%;
}

:deep(.connect-method-type-tabs [data-slot="trigger"]) {
  cursor: pointer;
}

.connect-method-island {
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--theme-fg) 14%, transparent);
  border-radius: var(--workspace-island-radius);
  background: color-mix(in srgb, var(--theme-fg) 6%, transparent);
}

.connect-method-island__content,
.connect-method-classic__content {
  max-height: min(13.5rem, 40vh);
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
}

.connect-method-island__content {
  padding: 8px;
}

.connect-method-island > :first-child + .connect-method-island__content {
  border-top: 1px solid color-mix(in srgb, var(--theme-fg) 14%, transparent);
}

.connect-method-island :deep([data-slot="list"]) {
  width: 100%;
}

.connect-method-island :deep([data-slot="trigger"]) {
  cursor: pointer;
}

.connect-method-island :deep([data-slot="indicator"]) {
  background: var(--app-surface-overlay);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--theme-fg) 12%, transparent);
}

.connect-method-island :deep([data-slot="trigger"][data-state="active"]) {
  color: var(--app-text-primary);
}

.connect-method-island :deep([data-slot="item"] [data-slot="label"]) {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.connect-method-island :deep([data-slot="item"] [data-slot="base"]) {
  background: transparent;
  box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--theme-fg) 40%, transparent);
}

.connect-method-island :deep([data-slot="item"] [data-slot="base"][data-state="checked"]) {
  background: transparent;
  box-shadow: inset 0 0 0 1.5px var(--theme-accent);
}

.connect-method-island :deep([data-slot="item"] [data-slot="indicator"]) {
  background: transparent;
}

.connect-method-island :deep([data-slot="item"] [data-slot="indicator"]::after) {
  display: block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--theme-accent);
}

.connect-method-island__empty {
  display: grid;
  justify-items: center;
  gap: 8px;
  min-height: 76px;
  padding: 16px 12px;
  text-align: center;
}

.island-method-enter-active,
.island-method-leave-active {
  transition:
    opacity 180ms ease,
    transform 180ms ease;
}

.island-method-enter-from {
  opacity: 0;
  transform: translateY(6px);
}

.island-method-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
