<script setup lang="ts">
import { createWebProxyBridge } from "@jumpserver/web-proxy/bridge";
import WebProxySurface from "@jumpserver/web-proxy/surface";
import { computed, watchEffect } from "vue";
import { useI18n } from "vue-i18n";
import { toIntlLocale } from "../../../../i18n/language";
import { getUiLocale } from "../../../../i18n/ui";
defineProps<{ request: Record<string, any> }>();
const { locale } = useI18n();
const uiLocale = computed(() => getUiLocale(locale.value));
watchEffect(() => {
  document.documentElement.lang = toIntlLocale(locale.value);
});
const host = (window as any).webApplet;
const bridge = createWebProxyBridge(host.invoke, async (name, handler) => host.listen(name, handler));
</script>

<template>
  <UApp class="h-full" :locale="uiLocale">
    <WebProxySurface :request="request" :bridge="bridge" active supported :browsable="request.standalone" />
  </UApp>
</template>
