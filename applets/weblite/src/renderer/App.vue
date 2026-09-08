<script setup lang="ts">
import { createWebProxyBridge } from "@jumpserver/web-proxy/bridge";
import WebProxySurface from "@jumpserver/web-proxy/surface";
import { onMounted, ref } from "vue";
const host = (window as any).webApplet;
const bridge = createWebProxyBridge(host.invoke, async (name, handler) => host.listen(name, handler));
const request = ref();
onMounted(async () => {
  request.value = await host.invoke("bootstrap");
});
</script>

<template>
  <UApp class="h-full">
    <WebProxySurface
      v-if="request"
      :request="request"
      :bridge="bridge"
      active
      supported
      :recording-required="request.recordingEnabled"
      @fatal="host.invoke('fatal')"
    />
  </UApp>
</template>
