<script setup lang="ts">
import { HOST_MESSAGE_TYPE } from "@jumpserver/connectors-core";
import KokoDrawerGeneral from "#koko/components/Drawer/General/index.vue";
import { useKokoTerminalEvents } from "#koko/composables/terminal/useTerminalEvents";
import { useKokoConnectionStore } from "#koko/stores/connection";
import mittBus from "#koko/utils/mittBus";

const { t } = useI18n();
const connectionStore = useKokoConnectionStore();
const { hostBridge } = useKokoTerminalEvents();

const drawerOpen = ref(false);

const closeDrawer = () => {
  drawerOpen.value = false;
};

onMounted(() => {
  hostBridge.onHost(HOST_MESSAGE_TYPE.OPEN, () => {
    drawerOpen.value = true;
  });

  mittBus.on("open-setting", () => {
    drawerOpen.value = !drawerOpen.value;
  });
  mittBus.on("close-drawer", () => {
    drawerOpen.value = false;
  });
});

onUnmounted(() => {
  mittBus.off("open-setting");
  mittBus.off("close-drawer");
});
</script>

<template>
  <USlideover
    id="drawer-inner-target"
    v-model:open="drawerOpen"
    :ui="{ content: 'w-full max-w-[min(800px,90vw)] min-w-[600px]' }"
  >
    <template #header>
      <div class="flex w-full items-center justify-between gap-3">
        <span class="font-medium">{{ connectionStore.assetName || t("koko.terminal.title") }}</span>
        <UButton color="neutral" variant="ghost" icon="i-lucide-x" @click="closeDrawer" />
      </div>
    </template>

    <template #body>
      <KokoDrawerGeneral />
    </template>
  </USlideover>
</template>
