<script setup lang="ts">
import mittBus from '@renderer/eventBus';
// import RenderList from '@renderer/components/RenderList/index.vue';
import { onBeforeUnmount, onMounted } from 'vue';
import { useAssetList } from '@renderer/hooks/useAssetList';
import MainSection from '@renderer/components/MainSection/index.vue';

defineProps<{
  active: boolean;
}>();

const { listData, handleScroll, getAssetsFromServer } = useAssetList('favorite');

onMounted(() => {
  mittBus.on('search', getAssetsFromServer);
});

onBeforeUnmount(() => {
  mittBus.off('search', getAssetsFromServer);
});
</script>

<template>
  <!-- <RenderList type="favorite" /> -->
  <MainSection
    :list-data="listData"
    :class="active ? 'show-drawer' : ''"
    @load-more="handleScroll"
  />
</template>

<style scoped lang="scss">
:deep(.n-dropdown-option) {
  height: 40px;
}

.show-drawer {
  width: calc(100% - 340px);
}
</style>
