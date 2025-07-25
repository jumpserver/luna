<script setup lang="ts">
import mittBus from '@renderer/eventBus';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useUserStore } from '@renderer/store/module/userStore';
import MainSection from '@renderer/components/MainSection/index.vue';
import { useHistoryStore } from '@renderer/store/module/historyStore';

defineProps<{
  active: boolean;
}>();

const userStore = useUserStore();
const historyStore = useHistoryStore();

const listData = ref([]);
const loadingStatus = ref(true);

// 检查登录状态
const isAuthenticated = computed(() => {
  return userStore.session && userStore.userInfo && userStore.userInfo.length > 0;
});

const getHistoriesFromCache = async (searchInput?: string) => {
  if (!isAuthenticated.value) {
    loadingStatus.value = false;
    return;
  }

  if (searchInput !== undefined) {
    listData.value = [];
  }
  loadingStatus.value = true;
  listData.value = historyStore.getHistorySession(searchInput);
  loadingStatus.value = false;
};

onMounted(async () => {
  mittBus.on('search', getHistoriesFromCache);
  await getHistoriesFromCache();
});

onBeforeUnmount(() => {
  mittBus.off('search', getHistoriesFromCache);
});
</script>

<template>
  <n-spin :show="loadingStatus" class="w-full h-[80%]">
    <MainSection v-if="isAuthenticated" :list-data="listData" class="" />
  </n-spin>
</template>

<style scoped lang="scss">
:deep(.n-dropdown-option) {
  height: 40px;
}

.show-drawer {
  width: calc(100% - 340px);
}
</style>
