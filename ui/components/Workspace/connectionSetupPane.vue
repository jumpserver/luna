<script setup lang="ts">
import type { WorkspaceSessionTab } from "~/composables/useWorkspaceTabs";
import type {
  AssetItem,
  AssetPageType,
  ConnectionInfo,
  ConnectionPreferenceInfo,
  PermedAccount,
  PermedProtocol
} from "~/types/index";

import ConnectForm from "~/components/ConnectForm/connectForm.vue";
import {
  isExternalClientConnectMethod,
  parseLocalApplicationConnectMethod,
  useConnectMethods
} from "~/composables/useConnectMethods";
import { useUserInfoStore } from "~/store/modules/userInfo";
import { sortPermedProtocols, sortProtocolNames } from "~/utils";

const props = withDefaults(
  defineProps<{
    tab: WorkspaceSessionTab
    assetType?: AssetPageType
  }>(),
  {
    assetType: "assets"
  }
);

const { t, locale } = useI18n();
const { getAssetDetail } = useAssetAction();
const { confirmConnection } = useAssetConnection();
const { getMethodsForProtocol } = useConnectMethods();
const { closePane, startSessionConnection } = useWorkspaceTabs();
const userInfoStore = useUserInfoStore();

const currentAsset = ref<AssetItem | null>(props.tab.setupAsset || null);
const loading = ref(false);
const connecting = ref(false);
const connectionError = ref("");
const launchedClientName = ref("");
const launchedProtocol = ref("");
const launchSuccessVisible = ref(false);
const externalClientLaunch = ref(false);

const draftProtocol = ref<string>("");
const draftAccount = ref<string>("");
const draftManualUsername = ref<string>("");
const draftManualPassword = ref<string>("");
const draftDynamicPassword = ref<string>("");
const draftRememberSecret = ref<boolean>(false);
const draftRememberSelection = ref<boolean>(false);
const draftConnectMethod = ref<string>("");
const draftConnectOptions = ref<Record<string, any>>({});

const assetName = computed(() => props.tab.assetName || currentAsset.value?.name || "");
const assetAddress = computed(
  () => currentAsset.value?.address || props.tab.address || assetName.value || t("ContextMenu.Connect")
);
const preferredConnectMethod = computed(
  () => userInfoStore.getConnectionPreferenceForProtocol(draftProtocol.value)?.connectMethod || ""
);
const launchSummary = computed(() => {
  if (locale.value === "zh") {
    return launchedClientName.value
      ? `已尝试使用 ${launchedClientName.value} 打开该连接。`
      : "已尝试使用本地客户端打开该连接。";
  }

  return launchedClientName.value
    ? `We tried opening this connection in ${launchedClientName.value}.`
    : "We tried opening this connection in a local client.";
});
const launchHint = computed(() => {
  if (locale.value === "zh") {
    return "如果客户端没有弹出，可以再次发起打开，或者返回修改连接方式。";
  }

  return "If the client did not appear, try launching again or go back to change the connection method.";
});

const getVisibleProtocols = (protocols: PermedProtocol[]) => {
  if (isTauriRuntime()) return protocols;
  return protocols.filter((protocol) => protocol?.public !== false);
};

const getManualInputLabel = () => (locale.value === "zh" ? "手动输入" : "Manual input");
const getAnonymousLabel = () => (locale.value === "zh" ? "匿名账号" : "Anonymous");
const getDynamicAccountLabel = (account?: PermedAccount) => {
  if (!account) return "";

  const base = t("Account.DynamicUser");
  const username = account.username || "";
  return username ? `${base}(${username})` : base;
};

const resolvePreferredProtocol = (
  source: ConnectionPreferenceInfo | ConnectionInfo | undefined,
  protocols: PermedProtocol[]
) => {
  const available = sortPermedProtocols(protocols).map((item) => item.name);
  const explicit = (props.tab.protocol || "").trim();
  const preferred = (source?.protocol || "").trim();
  const resolveAvailable = (candidate: string) =>
    available.find((protocol) => protocol.toLowerCase() === candidate.toLowerCase());

  if (explicit) {
    const resolved = resolveAvailable(explicit);
    if (resolved) return resolved;
  }
  if (preferred) {
    const resolved = resolveAvailable(preferred);
    if (resolved) return resolved;
  }
  return available[0] || "";
};

const resolvePreferredAccount = (
  source: ConnectionPreferenceInfo | ConnectionInfo | undefined,
  accounts: PermedAccount[]
) => {
  const mode = source?.accountMode || "hosted";
  const username = (source?.username || "").trim();

  if (mode === "manual") {
    const manual = accounts.find((account) => account.alias === "@INPUT");
    if (manual) return getManualInputLabel();
  }

  if (mode === "dynamic") {
    const dynamic = accounts.find((account) => account.alias === "@USER");
    if (dynamic) return getDynamicAccountLabel(dynamic);
  }

  if (mode === "anonymous") {
    const anonymous = accounts.find((account) => account.alias === "@ANON");
    if (anonymous) return "@ANON";
  }

  if (mode === "hosted" && username) {
    const hosted = accounts.find((account) => {
      if (source?.accountId && account.id === source.accountId) return true;
      return account.name === username || account.username === username || account.alias === username;
    });

    if (hosted) return hosted.name;
  }

  const firstHosted = accounts.find((account) => account?.alias && !account.alias.startsWith("@"));
  if (firstHosted) return firstHosted.name;

  const dynamic = accounts.find((account) => account.alias === "@USER");
  if (dynamic) return getDynamicAccountLabel(dynamic);

  const manual = accounts.find((account) => account.alias === "@INPUT");
  if (manual) return getManualInputLabel();

  const anonymous = accounts.find((account) => account.alias === "@ANON");
  if (anonymous) return "@ANON";

  return "";
};

const initDraft = (asset: AssetItem) => {
  const saved: ConnectionInfo | undefined = asset.savedConnection;
  const preferred = userInfoStore.getConnectionPreferenceForAsset(asset.id) || undefined;
  const source = {
    ...(saved || {}),
    ...(preferred || {})
  } as ConnectionPreferenceInfo | ConnectionInfo;

  const protocols = sortPermedProtocols(getVisibleProtocols(asset.permedProtocols || ([] as PermedProtocol[])));
  const accounts = asset.permedAccounts || ([] as PermedAccount[]);

  draftProtocol.value = resolvePreferredProtocol(source, protocols);
  draftAccount.value = resolvePreferredAccount(source, accounts);
  draftManualUsername.value = source?.manualUsername || "";
  draftManualPassword.value = saved?.manualPassword || "";
  draftDynamicPassword.value = saved?.dynamicPassword || "";
  draftRememberSecret.value = saved?.rememberSecret || false;
  draftRememberSelection.value = !!saved;
  const sourceMatchesProtocol = source?.protocol?.toLowerCase() === draftProtocol.value.toLowerCase();
  draftConnectMethod.value = sourceMatchesProtocol ? (source?.connectMethod || "") : "";
  draftConnectOptions.value = sourceMatchesProtocol ? { ...(source?.connectOptions || {}) } : {};
};

const normalizeProtocols = () => {
  const protocols = getVisibleProtocols(currentAsset.value?.permedProtocols || [])
    .map((p) => (p?.name ? p.name.trim() : ""))
    .filter((name) => name.length > 0);

  return sortProtocolNames(protocols);
};

const updateExternalLaunchState = async () => {
  const protocol = draftProtocol.value.trim();
  const connectMethod = draftConnectMethod.value.trim();

  if (!protocol || !connectMethod) {
    externalClientLaunch.value = false;
    return;
  }

  try {
    const methods = await getMethodsForProtocol(protocol);
    if (protocol !== draftProtocol.value.trim() || connectMethod !== draftConnectMethod.value.trim()) return;
    externalClientLaunch.value = isExternalClientConnectMethod(connectMethod, methods);
  } catch {
    externalClientLaunch.value = Boolean(parseLocalApplicationConnectMethod(connectMethod).clientName);
  }
};

watch(
  () => [draftProtocol.value, draftConnectMethod.value] as const,
  () => {
    void updateExternalLaunchState();
  },
  { immediate: true }
);

const resetLaunchSuccessState = () => {
  launchSuccessVisible.value = false;
  launchedClientName.value = "";
  launchedProtocol.value = "";
};

const buildConnectionInfo = () => {
  let accountMode: "hosted" | "dynamic" | "manual" | "anonymous" = "hosted";
  let normalizedAccount = draftAccount.value || "";
  let accountId: string | undefined;

  const v = draftAccount.value || "";

  if (v === getManualInputLabel()) accountMode = "manual";
  if (v.includes("@ANON") || v === getAnonymousLabel()) {
    accountMode = "anonymous";
    normalizedAccount = "@ANON";
  }
  if (v.startsWith(t("Account.DynamicUser"))) {
    accountMode = "dynamic";

    const accs = currentAsset.value?.permedAccounts || [];
    const dynamicAcc = accs.find((a) => a.alias === "@USER");

    if (dynamicAcc) normalizedAccount = dynamicAcc.name;
    else normalizedAccount = v.replace(/\(.+\)/, "");
  }

  if (accountMode === "hosted") {
    const accs = currentAsset.value?.permedAccounts || [];
    const matched = accs.find(
      (a) => a.name === normalizedAccount || a.username === normalizedAccount || a.alias === normalizedAccount
    );
    accountId = matched?.id;
  }

  return {
    protocol: draftProtocol.value || "",
    account: normalizedAccount,
    accountId,
    accountMode,
    manualUsername: draftManualUsername.value || "",
    manualPassword: draftManualPassword.value || "",
    dynamicPassword: draftDynamicPassword.value || "",
    rememberSecret: !!draftRememberSecret.value,
    rememberSelection: !!draftRememberSelection.value,
    connectMethod: draftConnectMethod.value || "",
    connectOptions: { ...draftConnectOptions.value },
    availableProtocols: normalizeProtocols()
  };
};

async function ensureDetails(asset: AssetItem) {
  const noAccounts = !asset.permedAccounts || asset.permedAccounts.length === 0;
  const noProtocols = !asset.permedProtocols || asset.permedProtocols.length === 0;

  if (!noAccounts && !noProtocols) return asset;

  let unsubscribe = () => {};
  const detailsReady = new Promise<AssetItem>((resolve) => {
    unsubscribe = useEventBus().on(
      "assetDetailUpdated",
      (payload: { assetId: string, permedAccounts: PermedAccount[], permedProtocols: PermedProtocol[] }) => {
        if (payload.assetId !== asset.id) return;

        currentAsset.value = {
          ...(currentAsset.value || asset),
          permedAccounts: payload.permedAccounts || [],
          permedProtocols: payload.permedProtocols || []
        } as AssetItem;

        resolve(currentAsset.value!);
      },
      false
    );
  });
  const fallback = new Promise<AssetItem>((resolve) => {
    setTimeout(resolve, 2500, currentAsset.value || asset);
  });

  await getAssetDetail(asset.id);
  const updated = await Promise.race([detailsReady, fallback]);
  unsubscribe();
  return updated;
}

async function loadAsset() {
  const asset = currentAsset.value || props.tab.setupAsset;
  if (!asset) return;

  loading.value = true;
  try {
    currentAsset.value = await ensureDetails(asset);
    initDraft(currentAsset.value);
  } finally {
    loading.value = false;
  }
}

async function submit() {
  if (!currentAsset.value || connecting.value) return;

  const info = buildConnectionInfo();
  const localApplication = parseLocalApplicationConnectMethod(info.connectMethod);
  const showLaunchSuccessState = externalClientLaunch.value;
  connecting.value = true;
  connectionError.value = "";
  if (!showLaunchSuccessState) {
    startSessionConnection(props.tab.id, {
      protocol: info.protocol,
      account: info.account
    });
  } else {
    resetLaunchSuccessState();
  }
  try {
    await confirmConnection(currentAsset.value, {
      ...info,
      tabId: props.tab.id,
      onSessionReady: showLaunchSuccessState
        ? () => {
            connecting.value = false;
            launchSuccessVisible.value = true;
            launchedClientName.value = localApplication.clientName || "";
            launchedProtocol.value = info.protocol;
          }
        : undefined,
      onSessionError: (error) => {
        connecting.value = false;
        connectionError.value
          = error instanceof Error ? error.message : String(error || t("ConnectError.ConnectFailed"));
      }
    });
    if (showLaunchSuccessState) {
      connecting.value = false;
      launchSuccessVisible.value = true;
      launchedClientName.value = localApplication.clientName || "";
      launchedProtocol.value = info.protocol;
    }
  } catch (error) {
    connecting.value = false;
    connectionError.value = error instanceof Error ? error.message : String(error || t("ConnectError.ConnectFailed"));
  }
}

watch(
  () => props.tab.status,
  (status) => {
    if (status === "failed") {
      connecting.value = false;
      if (!connectionError.value) connectionError.value = t("ConnectError.ConnectFailed");
    }
  }
);

onMounted(loadAsset);
</script>

<template>
  <div class="h-full min-h-0 w-full overflow-auto bg-[var(--workspace-surface-background)] px-4 py-4 sm:px-10">
    <div class="mx-auto flex min-h-full w-full items-center justify-center">
      <div v-if="loading" class="grid h-full min-h-64 w-full place-items-center text-sm text-[var(--app-muted)]">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-loader-2" class="size-4 animate-spin" />
          <span>{{ t("Loading.Loading") }}</span>
        </div>
      </div>

      <template v-else-if="currentAsset">
        <section
          class="connection-setup-shell w-[min(640px,100%)] overflow-hidden rounded-lg border border-[var(--app-border)] bg-[var(--workspace-surface-panel)] shadow-[var(--theme-shadow-soft)]"
        >
          <div
            class="flex h-11 items-center justify-between gap-3 border-b border-[var(--app-border)] bg-[var(--workspace-surface-header)] px-4"
          >
            <div class="flex min-w-0 items-center gap-2">
              <span class="truncate text-sm font-semibold text-[var(--app-fg)]">
                {{ t("ContextMenu.Connect") }} -
                <span class="font-ui-mono">{{ assetAddress }}</span>
              </span>
              <UBadge
                v-if="assetName && assetName !== assetAddress"
                :label="assetName"
                color="neutral"
                variant="soft"
                size="sm"
                class="max-w-48 shrink truncate"
              />
            </div>
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-x"
              size="sm"
              :aria-label="t('Common.Cancel')"
              @click="closePane(props.tab.id)"
            />
          </div>

          <div class="flex min-h-[300px] flex-col bg-[var(--app-surface-panel-strong)]">
            <div class="min-h-0 flex-1 overflow-auto px-6 py-4">
              <div v-if="launchSuccessVisible" class="flex min-h-full items-center justify-center py-6">
                <section
                  class="launch-success-card w-full rounded-xl border border-[var(--app-border)] bg-[var(--workspace-surface-panel)] px-5 py-6 sm:px-6"
                >
                  <div class="flex items-start gap-3">
                    <div class="grid size-11 shrink-0 place-items-center rounded-full bg-primary/12 text-primary">
                      <UIcon name="i-lucide-app-window" class="size-5" />
                    </div>
                    <div class="min-w-0 flex-1">
                      <div class="flex items-center gap-2">
                        <h3 class="text-sm font-semibold text-[var(--app-fg)]">
                          {{ locale === "zh" ? "已发起客户端打开" : "Client launch started" }}
                        </h3>
                        <UBadge
                          v-if="launchedProtocol"
                          :label="launchedProtocol.toUpperCase()"
                          color="primary"
                          variant="soft"
                          size="sm"
                        />
                      </div>
                      <p class="mt-2 text-sm leading-6 text-[var(--app-fg)]">
                        {{ launchSummary }}
                      </p>
                      <p class="mt-1 text-xs leading-5 text-[var(--app-muted)]">
                        {{ launchHint }}
                      </p>
                    </div>
                  </div>

                  <div class="mt-5 rounded-lg border border-[var(--app-border)] bg-[var(--workspace-surface-header)] px-4 py-3">
                    <div class="text-xs text-[var(--app-muted)]">
                      {{ locale === "zh" ? "连接目标" : "Connection target" }}
                    </div>
                    <div class="mt-1 break-all font-ui-mono text-sm text-[var(--app-fg)]">
                      {{ assetAddress }}
                    </div>
                    <div v-if="launchedClientName" class="mt-2 text-xs text-[var(--app-muted)]">
                      {{ locale === "zh" ? "客户端" : "Client" }}: {{ launchedClientName }}
                    </div>
                  </div>
                </section>
              </div>

              <template v-else>
                <ConnectForm
                  v-model:protocol="draftProtocol"
                  v-model:account="draftAccount"
                  v-model:manual-username="draftManualUsername"
                  v-model:manual-password="draftManualPassword"
                  v-model:dynamic-password="draftDynamicPassword"
                  v-model:remember-secret="draftRememberSecret"
                  v-model:connect-method="draftConnectMethod"
                  v-model:connect-options="draftConnectOptions"
                  :preferred-connect-method="preferredConnectMethod"
                  :accounts="currentAsset.permedAccounts || []"
                  :protocols="currentAsset.permedProtocols || []"
                  :asset-type="props.assetType"
                  @keydown.enter="submit"
                />
                <UTooltip :text="t('EditModal.Description')" :delay-duration="150">
                  <UCheckbox
                    v-model="draftRememberSelection"
                    icon="i-lucide-check"
                    :label="t('EditModal.RememberSelection')"
                    class="mt-4"
                  />
                </UTooltip>
              </template>
            </div>

            <div
              v-if="connecting || connectionError"
              class="border-t border-[var(--app-border)] bg-[var(--workspace-surface-footer)] px-5 py-3"
            >
              <div v-if="connecting" class="space-y-2">
                <div class="flex items-center gap-2 text-xs text-[var(--app-muted)]">
                  <UIcon name="i-lucide-loader-circle" class="size-3.5 animate-spin" />
                  <span>{{ locale === "zh" ? "正在建立连接..." : "Establishing connection..." }}</span>
                </div>
                <div class="connection-activity-track">
                  <span class="connection-activity-bar" />
                </div>
              </div>

              <div
                v-if="connectionError"
                class="mt-2 flex items-start gap-2 rounded-md border border-error/25 bg-error/10 px-3 py-2 text-xs text-error"
              >
                <UIcon name="i-lucide-circle-alert" class="mt-0.5 size-3.5 shrink-0" />
                <span class="min-w-0 break-words">{{ connectionError }}</span>
              </div>
            </div>

            <div class="border-t border-[var(--app-border)] bg-[var(--workspace-surface-footer)] px-5 pt-3 pb-5">
              <div v-if="launchSuccessVisible" class="flex flex-col gap-3 sm:flex-row">
                <UButton
                  :label="locale === 'zh' ? '再次打开' : 'Open again'"
                  color="primary"
                  :loading="connecting"
                  block
                  @click="submit"
                />
                <UButton
                  :label="locale === 'zh' ? '返回修改' : 'Back to form'"
                  color="neutral"
                  variant="outline"
                  block
                  @click="resetLaunchSuccessState"
                />
              </div>
              <UButton
                v-else
                :label="externalClientLaunch
                  ? (locale === 'zh' ? '客户端打开' : 'Open in client')
                  : t('Common.Connect')"
                color="primary"
                :loading="connecting"
                block
                @click="submit"
              />
            </div>
          </div>
        </section>
      </template>
    </div>
  </div>
</template>

<style scoped>
.connection-setup-shell {
  box-shadow:
    0 1px 0 color-mix(in srgb, var(--app-surface-panel-strong) 82%, transparent) inset,
    var(--theme-shadow-soft);
}

.launch-success-card {
  box-shadow:
    0 1px 0 color-mix(in srgb, var(--app-surface-panel-strong) 78%, transparent) inset,
    0 16px 36px color-mix(in srgb, var(--app-fg) 5%, transparent);
}

.connection-activity-track {
  position: relative;
  height: 0.1875rem;
  overflow: hidden;
  border-radius: 999px;
  background: color-mix(in srgb, var(--app-border) 70%, transparent);
}

.connection-activity-bar {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 38%;
  border-radius: inherit;
  background: var(--ui-primary);
  animation: connection-activity-slide 1.05s ease-in-out infinite alternate;
}

@keyframes connection-activity-slide {
  from {
    transform: translateX(-20%);
  }

  to {
    transform: translateX(185%);
  }
}
</style>
