<script setup lang="ts">
import type { WorkspaceSessionTab } from "~/composables/useWorkspaceTabs";
import type { AssetDetail, TokenResponse } from "~/types";

import { writeText } from "clipboard-polyfill";
import {
  getAssetDetailRequest,
  getPublicSettings,
  getUserProfile,
  setConnectionTokenReusable
} from "~/composables/useApiRequest";
import { getDirectGuideCommand } from "./directGuide";
import { getGuideClientProtocol, getGuideConnectCommand } from "./guideCommand";
import {
  applyConnectionTokenReuse,
  DATABASE_GUIDE_PROTOCOLS,
  isDatabaseGuideProtocol,
  resolveConnectionTokenReuseError,
  shouldShowConnectionTokenReuse
} from "./tokenReuse";

const props = defineProps<{ tab: WorkspaceSessionTab }>();

const defaultPorts: Record<string, number> = {
  ssh: 22,
  vnc: 5900,
  mysql: 3306,
  mariadb: 3306,
  postgresql: 5432,
  redis: 6379,
  oracle: 1521,
  dameng: 5236,
  sqlserver: 1433,
  mongodb: 27017
};
const databaseProtocols = DATABASE_GUIDE_PROTOCOLS;

const { t } = useI18n();
const toast = useToast();
const token = computed(() => (props.tab.payload?.token || props.tab.payload) as TokenResponse);
const endpoint = ref<Record<string, any>>({});
const assetDetail = ref<AssetDetail>();
const loading = ref(true);
const passwordVisible = ref(false);
const copiedKey = ref("");
let copyResetTimer: ReturnType<typeof setTimeout> | undefined;
const loginUsername = ref("");
const connectionTokenReusable = ref(false);
const reusable = ref(false);
const reusableUpdating = ref(false);

const protocol = computed(() => (token.value?.protocol || props.tab.protocol || "").toLowerCase());
const clientProtocol = computed(() => getGuideClientProtocol(protocol.value));
const showDirectCommand = computed(() => {
  const method = props.tab.payload?.connectMethod;
  return (
    protocol.value === "ssh" ||
    (protocol.value === "vnc" &&
      token.value.account !== "@INPUT" &&
      method?.component !== "panda" &&
      method?.type !== "virtual_app")
  );
});
const showReusable = computed(() => shouldShowConnectionTokenReuse(connectionTokenReusable.value, token.value?.id));
const showDatabaseHelp = computed(() => isDatabaseGuideProtocol(protocol.value));
const host = computed(() => String(endpoint.value.host || ""));
const port = computed(() =>
  String(
    endpoint.value[databaseProtocols.has(protocol.value) ? "magnus_port" : `${protocol.value}_port`] ||
      endpoint.value.port ||
      defaultPorts[protocol.value] ||
      ""
  )
);
const asset = computed(() => token.value?.asset as any);
const assetName = computed(() => {
  const name = asset.value?.name || props.tab.assetName;
  const address = asset.value?.address || props.tab.address;
  return address ? `${name}(${address})` : name;
});
const database = computed(() => {
  if (protocol.value === "oracle") return token.value.id;
  return (
    assetDetail.value?.spec_info?.db_name ?? (asset.value?.spec_info?.db_name || asset.value?.specInfo?.dbName || "")
  );
});
const username = computed(() => {
  if (protocol.value === "ssh") return `JMS-${token.value.id}`;
  if (protocol.value === "redis") return "";
  return token.value.id;
});
const password = computed(() =>
  protocol.value === "redis" ? `${token.value.id}@${token.value.value}` : token.value.value
);

const rows = computed(() => {
  const values = [
    { name: "name", label: t("ConnectionGuide.Name"), value: assetName.value },
    { name: "host", label: t("ConnectionGuide.Host"), value: host.value },
    { name: "port", label: t("ConnectionGuide.Port"), value: port.value },
    { name: "username", label: t("ConnectionGuide.Username"), value: username.value },
    { name: "password", label: t("ConnectionGuide.Password"), value: password.value },
    ...(databaseProtocols.has(protocol.value)
      ? [{ name: "database", label: t("ConnectionGuide.Database"), value: database.value }]
      : []),
    { name: "protocol", label: t("ConnectionGuide.Protocol"), value: clientProtocol.value },
    { name: "date_expired", label: t("ConnectionGuide.ExpireTime"), value: token.value.date_expired }
  ];

  return values.filter((item) => item.value !== undefined && item.value !== null);
});

const commands = computed(() => {
  const value = getGuideConnectCommand({
    protocol: protocol.value,
    id: token.value.id,
    secret: token.value.value,
    host: host.value,
    port: port.value,
    database: database.value,
    redisAuth: password.value
  });
  const tokenPassword = protocol.value === "ssh" || protocol.value === "vnc";
  const items = [];
  if (value) {
    items.push({
      value,
      title: t(tokenPassword ? "ConnectionGuide.TokenCommand" : "ConnectionGuide.ConnectCommand"),
      help: tokenPassword ? t("ConnectionGuide.TokenPasswordHelp") : ""
    });
  }
  if (showDirectCommand.value) {
    const value = getDirectGuideCommand({
      protocol: protocol.value,
      username: loginUsername.value,
      account: token.value.account,
      inputUsername: token.value.input_username,
      accounts: props.tab.permedAccounts || [],
      assetId: props.tab.assetId,
      host: host.value,
      port: port.value
    });
    items.push({
      value,
      title: t("ConnectionGuide.DirectCommand"),
      help: t(value ? "ConnectionGuide.DirectPasswordHelp" : "ConnectionGuide.DirectUnavailable")
    });
  }
  return items;
});

async function copy(value: unknown, key: string) {
  await writeText(String(value ?? ""));
  if (copyResetTimer) clearTimeout(copyResetTimer);
  copiedKey.value = key;
  copyResetTimer = setTimeout(() => {
    copiedKey.value = "";
  }, 2000);
}

onBeforeUnmount(() => {
  if (copyResetTimer) clearTimeout(copyResetTimer);
});

watch(
  () => token.value?.is_reusable,
  (value) => {
    if (!reusableUpdating.value && value !== undefined) reusable.value = Boolean(value);
  },
  { immediate: true }
);

async function setReusable(nextValue: boolean) {
  const current = token.value;
  if (reusableUpdating.value || !current?.id || nextValue === reusable.value) return;

  reusable.value = nextValue;
  reusableUpdating.value = true;
  try {
    const result = await setConnectionTokenReusable(current.id, nextValue);
    applyConnectionTokenReuse(current, result);
    reusable.value = Boolean(current.is_reusable);
  } catch (error) {
    reusable.value = !nextValue;
    current.is_reusable = !nextValue;
    toast.add({
      title: resolveConnectionTokenReuseError(error, (key) => t(key)),
      color: "error",
      duration: 2000
    });
  } finally {
    reusableUpdating.value = false;
  }
}

onMounted(async () => {
  const assetId = token.value?.asset?.id || props.tab.assetId;
  try {
    await Promise.all([
      getSmartEndpoint({
        protocol: protocol.value,
        assetId: props.tab.assetId,
        token: token.value.id
      }).then((value) => {
        endpoint.value = value;
      }),
      // Connection tokens normally include only asset id/name, not the default database.
      showDatabaseHelp.value && protocol.value !== "oracle" && !database.value && assetId
        ? getAssetDetailRequest(assetId, token.value.org_id || props.tab.orgId)
            .then((value) => {
              assetDetail.value = value;
            })
            .catch(() => {
              toast.add({ title: t("Asset.GetAssetFailed"), color: "error", duration: 4000 });
            })
        : Promise.resolve(),
      getPublicSettings()
        .then((settings) => {
          connectionTokenReusable.value = settings.CONNECTION_TOKEN_REUSABLE === true;
        })
        .catch(() => {
          connectionTokenReusable.value = false;
        }),
      showDirectCommand.value
        ? getUserProfile()
            .then((profile) => {
              loginUsername.value = profile.username;
            })
            .catch(() => {
              loginUsername.value = "";
            })
        : Promise.resolve()
    ]);
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div
    class="flex h-full min-h-0 flex-col overflow-auto bg-[var(--workspace-surface-background)] px-4 py-3 sm:px-5 sm:py-4"
  >
    <div class="m-auto w-full max-w-4xl shrink-0">
      <div v-if="loading" class="grid min-h-64 place-items-center text-[var(--app-muted)]">
        <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" />
      </div>

      <template v-else>
        <section
          class="overflow-hidden rounded-lg bg-[var(--workspace-surface-panel)] border border-[var(--workspace-surface-border)]"
        >
          <header
            class="flex items-center gap-3 border-b border-[var(--workspace-surface-border)] bg-[var(--workspace-surface-header)] px-4 py-2.5"
          >
            <div class="grid size-8 shrink-0 place-items-center text-[var(--app-muted)]">
              <UIcon name="i-lucide-key-round" class="size-5" />
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <h2 class="truncate text-base font-semibold text-[var(--app-fg)]">
                  {{ t("ConnectionGuide.Title") }}
                </h2>
                <UBadge :label="clientProtocol.toUpperCase()" color="neutral" variant="outline" size="sm" />
              </div>
              <p class="mt-0.5 truncate text-xs text-[var(--app-muted)]">
                {{ assetName }}
              </p>
            </div>
          </header>

          <div class="bg-[var(--workspace-surface-panel)] p-3 pb-6">
            <div class="overflow-hidden rounded-lg border border-[var(--workspace-surface-border)]">
              <table class="w-full border-collapse text-sm">
                <tbody>
                  <tr
                    v-for="row in rows"
                    :key="row.name"
                    class="group/guide-row cursor-pointer border-b border-[var(--workspace-surface-border)] transition-colors hover:bg-[var(--app-hover-soft)] focus-within:bg-[var(--app-hover-soft)]"
                    @dblclick.prevent="copy(row.value, `row:${row.name}`)"
                  >
                    <th
                      class="w-24 bg-[var(--workspace-surface-sub-header)] px-3 py-1 text-left text-xs font-medium tracking-wide text-[var(--app-muted)] sm:w-32"
                    >
                      {{ row.label }}
                    </th>
                    <td class="min-w-0 bg-[var(--app-surface-panel-strong)] px-3 py-0.5 text-[var(--app-fg)]">
                      <div class="flex min-h-7 items-center gap-1">
                        <UTooltip
                          :text="t('ConnectionGuide.DoubleClickToCopy')"
                          :delay-duration="600"
                          :content="{ side: 'top' }"
                          :disabled="copiedKey === `row:${row.name}`"
                        >
                          <span class="min-w-0 flex-1 break-all font-ui-mono text-[13px] leading-5">
                            {{ row.name === "password" && !passwordVisible ? "••••••••" : row.value }}
                          </span>
                        </UTooltip>
                        <UButton
                          v-if="row.name === 'password'"
                          color="neutral"
                          variant="ghost"
                          size="xs"
                          :icon="passwordVisible ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                          :aria-label="t('ConnectionGuide.ShowPassword')"
                          class="shrink-0 text-[var(--app-muted)]"
                          @click="passwordVisible = !passwordVisible"
                          @dblclick.stop
                        />
                        <UButton
                          color="neutral"
                          variant="ghost"
                          size="xs"
                          :icon="copiedKey === `row:${row.name}` ? 'i-lucide-check' : 'i-lucide-copy'"
                          :label="copiedKey === `row:${row.name}` ? t('Common.CopySuccess') : undefined"
                          :aria-label="t(copiedKey === `row:${row.name}` ? 'Common.CopySuccess' : 'Common.Copy')"
                          class="guide-copy-button shrink-0 text-[var(--app-muted)] transition-opacity group-hover/guide-row:opacity-100 group-focus-within/guide-row:opacity-100"
                          :class="copiedKey === `row:${row.name}` ? 'opacity-100' : 'opacity-0'"
                          aria-live="polite"
                          @click="copy(row.value, `row:${row.name}`)"
                          @dblclick.stop
                        />
                      </div>
                    </td>
                  </tr>
                  <tr
                    v-if="showReusable"
                    class="border-[var(--workspace-surface-border)] transition-colors hover:bg-[var(--app-hover-soft)] focus-within:bg-[var(--app-hover-soft)]"
                    :class="showDatabaseHelp ? 'border-b' : ''"
                  >
                    <th
                      class="w-24 bg-[var(--workspace-surface-sub-header)] px-3 py-1 text-left text-xs font-medium tracking-wide text-[var(--app-muted)] sm:w-32"
                    >
                      {{ t("ConnectionGuide.SetReusable") }}
                    </th>
                    <td class="min-w-0 bg-[var(--app-surface-panel-strong)] px-3 py-0.5 text-[var(--app-fg)]">
                      <div class="flex min-h-7 items-center gap-3">
                        <USwitch
                          :model-value="reusable"
                          :disabled="reusableUpdating"
                          :aria-label="t('ConnectionGuide.SetReusable')"
                          @update:model-value="setReusable"
                        />
                        <span class="text-xs leading-5 text-[var(--app-muted)]">
                          {{ t("ConnectionGuide.ReusableHint") }}
                        </span>
                      </div>
                    </td>
                  </tr>
                  <tr v-if="showDatabaseHelp">
                    <th
                      class="w-24 bg-[var(--workspace-surface-sub-header)] px-3 py-1 text-left text-xs font-medium tracking-wide text-[var(--app-muted)] sm:w-32"
                    >
                      {{ t("ConnectionGuide.HelpText") }}
                    </th>
                    <td class="min-w-0 bg-[var(--app-surface-panel-strong)] px-3 py-0.5 text-[var(--app-fg)]">
                      <p class="text-xs leading-5 text-[var(--app-muted)]">
                        {{ t("ConnectionGuide.DatabaseTokenHelp") }}
                      </p>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div v-for="(command, index) in commands" :key="index" class="mt-3">
              <div class="mb-1.5 flex items-center gap-2 px-1">
                <UIcon name="i-lucide-terminal" class="size-4 text-[var(--app-muted)]" />
                <h3 class="text-xs font-medium tracking-wide text-[var(--app-muted)]">
                  {{ command.title }}
                </h3>
              </div>

              <div
                v-if="command.value"
                class="group/guide-command flex cursor-pointer items-center gap-3 rounded-lg border border-[var(--workspace-surface-border)] bg-[var(--app-surface-input)] px-3 py-2 transition-colors hover:bg-[var(--app-hover-soft)] focus-within:bg-[var(--app-hover-soft)]"
                @dblclick.prevent="copy(command.value, `command:${index}`)"
              >
                <span class="select-none font-ui-mono text-xs text-[var(--app-muted)]">$</span>
                <UTooltip
                  :text="t('ConnectionGuide.DoubleClickToCopy')"
                  :delay-duration="600"
                  :content="{ side: 'top' }"
                  :disabled="copiedKey === `command:${index}`"
                >
                  <code class="min-w-0 flex-1 break-all font-ui-mono text-xs leading-5 text-[var(--app-fg)]">
                    {{ token.value ? command.value.replace(token.value, "••••••••") : command.value }}
                  </code>
                </UTooltip>
                <UButton
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  :icon="copiedKey === `command:${index}` ? 'i-lucide-check' : 'i-lucide-copy'"
                  :label="copiedKey === `command:${index}` ? t('Common.CopySuccess') : undefined"
                  :aria-label="
                    t(copiedKey === `command:${index}` ? 'Common.CopySuccess' : 'ConnectionGuide.CopyCommand')
                  "
                  class="guide-copy-button shrink-0 text-[var(--app-muted)] transition-opacity group-hover/guide-command:opacity-100 group-focus-within/guide-command:opacity-100"
                  :class="copiedKey === `command:${index}` ? 'opacity-100' : 'opacity-0'"
                  aria-live="polite"
                  @click="copy(command.value, `command:${index}`)"
                  @dblclick.stop
                />
              </div>
              <p v-if="command.help" class="mt-1.5 px-1 text-xs text-[var(--app-muted)]">{{ command.help }}</p>
            </div>
          </div>
        </section>
      </template>
    </div>
  </div>
</template>

<style scoped>
@media (hover: none) {
  .guide-copy-button {
    opacity: 1;
  }
}
</style>
