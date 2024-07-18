<template>
  <n-layout-header class="header-tab">
    <n-flex class="search-part" justify="center" align="middle">
      <n-input round placeholder="搜索" size="small" clearable autosize style="min-width: 50%">
        <template #prefix>
          <n-icon size="22px" :component="SearchOutline"></n-icon>
        </template>
      </n-input>
    </n-flex>
    <n-flex ref="el">
      <n-flex justify="center" align="center" v-for="item in list" :key="item.id" class="tab-item">
        {{ item.name }}
      </n-flex>
    </n-flex>
  </n-layout-header>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { SearchOutline } from '@vicons/ionicons5';
import { useDraggable, type UseDraggableReturn } from 'vue-draggable-plus';

const el = ref();

const list = reactive([
  {
    name: 'Joao',
    id: 1
  },
  {
    name: 'Jean',
    id: 2
  },
  {
    name: 'Johanna',
    id: 3
  },
  {
    name: 'Juan',
    id: 4
  }
]);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const draggable = useDraggable<UseDraggableReturn>(el, list, {
  animation: 150,
  onStart() {
    console.log('start');
  },
  onUpdate() {
    console.log('update');
  }
});
</script>

<style scoped lang="scss">
.header-tab {
  width: 100% !important;
  height: 80px;
  padding: 10px 0;
  background-color: var(--el-main-header-bg-color);
  .search-part {
    padding-left: 10px;
  }
  .tab-item {
    width: 60px;
    height: 40px;
  }
}
</style>
