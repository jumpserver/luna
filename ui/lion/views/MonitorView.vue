<script lang="ts" setup>
import { useWindowSize } from '@vueuse/core';
import { onMounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { useGuacamoleClient } from '@/lion/hooks/useGuacamoleClient';
import { withLionWsUrl } from '@/lion/utils/base';

const route = useRoute();
const { t } = useI18n();
const { width, height } = useWindowSize();
const sessionId = route.query.session as string;
const wsUrl = withLionWsUrl('/ws/monitor/');
const params = {
  type: 'monitor',
  SESSION_ID: sessionId
};
const { connectToGuacamole, guaDisplay, loading, resizeGuaScale } = useGuacamoleClient(t);

watch(
  [width, height],
  ([newWidth, newHeight]) => {
    if (guaDisplay.value) {
      resizeGuaScale(newWidth, newHeight);
    }
  },
  { immediate: true }
);

onMounted(() => {
  connectToGuacamole(wsUrl, params, window.innerWidth, window.innerHeight);
  const displayEl = document.getElementById('display');
  if (displayEl) {
    displayEl.appendChild(guaDisplay.value.getElement());
  }
});
</script>

<template>
  <div class="w-full h-full justify-center flex flex-col">
    <div v-if="loading" class="flex justify-center items-center w-screen h-screen">
      <n-spin :show="loading" size="large" :description="`${t('Connecting')}`" />
    </div>
    <div
      v-show="!loading"
      id="display"
      class="w-screen h-screen flex justify-center relative"
    />
  </div>
</template>

<style scoped></style>
