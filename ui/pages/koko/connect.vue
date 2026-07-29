<script setup lang="ts">
import type { ConnectorSessionContext } from "@jumpserver/connectors-core";
import { connectorSessionKey } from "@jumpserver/connectors-core";
import { KokoConnectView } from "@jumpserver/koko";

definePageMeta({ layout: "connect" });

const route = useRoute();
const colorMode = useColorMode();
const { t } = useI18n();
const sessionContext = ref<ConnectorSessionContext | null>(null);

provide(connectorSessionKey, sessionContext);

const tokenId = computed(() => String(route.query.token || ""));

onMounted(() => {
  if (!tokenId.value) return;

  sessionContext.value = {
    component: "koko",
    tokenId: tokenId.value,
    ticket: String(route.query.ticket || ""),
    endpointUrl: window.location.origin,
    terminalThemeName: colorMode.value === "dark" ? "OneHalfDark" : "OneHalfLight",
    colorMode: colorMode.value,
    themeType: colorMode.value === "dark" ? "darkGary" : "default",
    disableAutoHash: String(route.query.disableautohash || "false")
  };
});
</script>

<template>
  <KokoConnectView v-if="sessionContext" />
  <div v-else class="grid h-full place-items-center text-sm text-muted">
    {{ t("koko.workspace.missingToken") }}
  </div>
</template>
