<script setup lang="ts">
import type { WorkspaceSessionTab } from "~/composables/useWorkspaceTabs";
import type { ConnectorSessionContext } from "~/shared/connectors/types/session";
import { SFTP_FILE_MANAGER_VALUE } from "~/composables/useConnectMethods";
import KokoFileManagement from "~/koko/components/Drawer/FileManagement/index.vue";
import KokoSftpIde from "~/koko/components/SftpIde/index.vue";
import { connectorSessionKey } from "~/koko/composables/wsUrl";
import { resolveDevHost } from "~/shared/connectors/useConnectorEndpoint";

const props = defineProps<{ tab: WorkspaceSessionTab }>();
const { createKokoTicket } = useWorkspaceConnectors();
const { markSessionConnected, markSessionFailed } = useWorkspaceTabs();
const context = ref<ConnectorSessionContext | null>(null);
const error = ref("");
provide(connectorSessionKey, context);
const tokenId = computed(() => String(props.tab.payload?.id || props.tab.payload?.token?.id || ""));
const useFileManager = computed(() => props.tab.payload?.connectMethod?.value === SFTP_FILE_MANAGER_VALUE);

async function prepare() {
  if (!tokenId.value) return;
  try {
    let endpointUrl = resolveDevHost("koko") || window.location.origin;
    if (isTauriRuntime() && !import.meta.dev) {
      const endpoint = await useTauriCoreInvoke<{ host?: string, port?: number, https_port?: number }>("get_smart_endpoint", { query: { protocol: "sftp", assetId: props.tab.assetId, token: tokenId.value } });
      if (!endpoint.host) throw new Error("smart endpoint missing host");
      const secure = Boolean(endpoint.https_port);
      endpointUrl = `${secure ? "https" : "http"}://${endpoint.host}${endpoint.https_port || endpoint.port ? `:${endpoint.https_port || endpoint.port}` : ""}`;
    }
    let ticket = "";
    try {
 ticket = String((await createKokoTicket({ baseUrl: endpointUrl, tokenId: tokenId.value })).ticket || "");
} catch (cause) {
 if (isTauriRuntime()) throw cause;
}
    context.value = { component: "koko", tokenId: tokenId.value, ticket, endpointUrl, tabId: props.tab.id };
    markSessionConnected(props.tab.id);
  } catch (cause) {
    error.value = String(cause);
    markSessionFailed({ tabId: props.tab.id, assetId: props.tab.assetId, protocol: props.tab.protocol, account: props.tab.account });
  }
}

watch(() => props.tab.payload, prepare, { immediate: true, deep: true });
</script>

<template>
  <div class="h-full min-h-0 bg-default">
    <KokoFileManagement v-if="context && useFileManager" :sftp-token="tokenId" class="h-full" />
    <KokoSftpIde v-else-if="context" :sftp-token="tokenId" class="h-full" />
    <div v-else class="grid h-full place-items-center text-sm text-muted">
      <span>{{ error || "正在准备 SFTP 连接..." }}</span>
    </div>
  </div>
</template>
