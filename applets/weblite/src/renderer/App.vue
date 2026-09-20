<script setup lang="ts">
import { createWebProxyBridge } from "@jumpserver/web-proxy/bridge";
import WebProxySurface from "@jumpserver/web-proxy/surface";
import { computed, onMounted, ref, watchEffect } from "vue";
import { useI18n } from "vue-i18n";
import { toIntlLocale } from "../../../../i18n/language";
import { getUiLocale } from "../../../../i18n/ui";
const { locale } = useI18n();
const uiLocale = computed(() => getUiLocale(locale.value));
watchEffect(() => {
  document.documentElement.lang = toIntlLocale(locale.value);
});
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
      :bridge="bridge"
      active
      supported
      :browsable="request.standalone"
    />
  </UApp>
</template>
