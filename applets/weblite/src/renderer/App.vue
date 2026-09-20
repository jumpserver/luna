<script setup lang="ts">
import { createWebProxyBridge } from "@jumpserver/web-proxy/bridge";
import WebProxySurface from "@jumpserver/web-proxy/surface";
import { fr, zh_cn } from "@nuxt/ui/locale";
import { onMounted, ref } from "vue";
const language = navigator.language;
document.documentElement.lang = language;
const uiLocale = /^fr(?:-|$)/i.test(language) ? fr : zh_cn;
const host = (window as any).webApplet;
const bridge = createWebProxyBridge(host.invoke, async (name, handler) => host.listen(name, handler));
const request = ref();
onMounted(async () => {
  request.value = await host.invoke("bootstrap");
});
</script>

<template>
  <UApp class="h-full" :locale="uiLocale">
    <WebProxySurface
      v-if="request"
      :request="request"
      :language="language"
      :bridge="bridge"
      active
      supported
      :browsable="request.standalone"
    />
  </UApp>
</template>
