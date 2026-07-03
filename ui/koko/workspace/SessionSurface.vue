<script setup lang="ts">
import type { WorkspaceSessionTab } from "~/composables/useWorkspaceTabs";
import type { ConnectorSessionContext } from "~/shared/connectors/types/session";

import { connectorSessionKey } from "~/koko/composables/wsUrl";
import KokoConnectView from "~/koko/pages/ConnectView.vue";
import { resolveDevHost } from "~/shared/connectors/useConnectorEndpoint";

const props = defineProps<{ tab: WorkspaceSessionTab }>();

const colorMode = useColorMode();
const { createKokoTicket } = useWorkspaceConnectors();
const { markSessionConnected, markSessionFailed } = useWorkspaceTabs();

const loading = ref(true);
const error = ref("");
const sessionContext = ref<ConnectorSessionContext | null>(null);

provide(connectorSessionKey, sessionContext);

const token = computed(() => props.tab.payload?.token || props.tab.payload || {});
const tokenId = computed(() => props.tab.payload?.id || token.value?.id || "");

const terminalThemeName = computed(() => (colorMode.value === "dark" ? "OneHalfDark" : "OneHalfLight"));
const themeType = computed(() => (colorMode.value === "dark" ? "darkGary" : "default"));

async function fetchEndpointUrl() {
  // dev 环境不查 smart endpoint，直接用 VITE_KOKO_HOST（未配置则当前 origin，经 dev proxy）
  if (import.meta.dev) {
    return resolveDevHost("koko") || window.location.origin;
  }

  if (isTauriRuntime()) {
    const endpoint = await useTauriCoreInvoke<{ host?: string, port?: number, https_port?: number }>("get_smart_endpoint", {
      query: {
        protocol: props.tab.protocol || "ssh",
        assetId: props.tab.assetId,
        token: tokenId.value
      }
    });

    const host = endpoint?.host;
    if (!host) throw new Error("smart endpoint missing host");

    const port = endpoint.https_port || endpoint.port;
    const scheme = endpoint.https_port ? "https" : "http";
    return port ? `${scheme}://${host}:${port}` : `${scheme}://${host}`;
  }

  const url = new URL("/api/v1/terminal/endpoints/smart/", window.location.origin);
  url.searchParams.set("protocol", props.tab.protocol || "ssh");
  url.searchParams.set("asset_id", props.tab.assetId);
  url.searchParams.set("token", tokenId.value);

  const response = await fetch(url.toString(), { credentials: "include" });
  if (!response.ok) throw new Error(`endpoint request failed (${response.status})`);

  const data = await response.json() as { value?: string, host?: string, https_port?: number, port?: number };
  const host = data.host;
  const port = data.https_port || data.port;
  const scheme = data.https_port ? "https" : "http";
  const resolved = data.value || (host ? (port ? `${scheme}://${host}:${port}` : `${scheme}://${host}`) : "");

  if (!resolved) return window.location.origin;

  // dev/同源部署时 smart endpoint 常返回裸 localhost（无 dev 端口），
  // 强行使用会绕过 dev proxy，直接回退到当前 origin（/koko/ 由 proxy 转发）
  const resolvedUrl = new URL(resolved);
  const isLoopback = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(resolvedUrl.hostname);
  const samePort = (resolvedUrl.port || "") === window.location.port;

  if (isLoopback && !samePort) return window.location.origin;

  return resolved;
}

async function prepareSession() {
  if (!tokenId.value) {
    error.value = "Missing connection token";
    loading.value = false;
    return;
  }

  loading.value = true;
  error.value = "";

  try {
    const endpointUrl = await fetchEndpointUrl();

    // web 同源场景 cookie 即可鉴权，ticket 失败不阻断；Tauri 无 cookie，必须拿到 ticket
    let ticket = "";
    try {
      const ticketResult = await createKokoTicket({ baseUrl: endpointUrl, tokenId: tokenId.value });
      ticket = String(ticketResult.ticket || "");
    } catch (ticketError) {
      if (isTauriRuntime()) throw ticketError;
      console.warn("[koko] connect ticket failed, fallback to cookie auth:", ticketError);
    }

    sessionContext.value = {
      component: "koko",
      tokenId: tokenId.value,
      ticket,
      endpointUrl,
      tabId: props.tab.id,
      terminalThemeName: terminalThemeName.value,
      colorMode: colorMode.value,
      themeType: themeType.value,
      disableAutoHash: "false"
    };

    markSessionConnected(props.tab.id);
  } catch (err) {
    error.value = String(err);
    markSessionFailed({
      tabId: props.tab.id,
      assetId: props.tab.assetId,
      protocol: props.tab.protocol,
      account: props.tab.account
    });
  } finally {
    loading.value = false;
  }
}

watch(() => props.tab.payload, () => void prepareSession(), { deep: true });
watch([terminalThemeName, themeType], () => {
  if (sessionContext.value) {
    sessionContext.value.terminalThemeName = terminalThemeName.value;
    sessionContext.value.themeType = themeType.value;
    sessionContext.value.colorMode = colorMode.value;
  }
});

onMounted(() => void prepareSession());
</script>

<template>
  <div class="relative h-full w-full min-h-0">
    <KokoConnectView v-if="sessionContext && !loading && !error" />
    <div v-else class="grid h-full min-h-0 place-items-center text-sm text-muted">
      <div class="flex flex-col items-center gap-2">
        <UIcon
          :name="error ? 'i-lucide-circle-alert' : 'i-lucide-loader-circle'"
          class="size-5"
          :class="error ? 'text-amber-500' : 'animate-spin'"
        />
        <div>{{ loading ? "正在准备 Koko 连接..." : error || "正在准备 Koko 连接..." }}</div>
      </div>
    </div>
  </div>
</template>
