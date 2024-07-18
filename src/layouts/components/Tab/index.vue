<template>
  <n-layout-header class="header-tab" style="width: 100%; height: 40px">
    <n-flex ref="el">
      <n-flex justify="center" align="center" v-for="item in list" :key="item.id" class="tab-item">
        {{ item.name }}
      </n-flex>
    </n-flex>
  </n-layout-header>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
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
  width: 100%;
  height: 40px;
  background-color: var(--el-main-header-bg-color);
  border-bottom: 1px solid #000000;
  .tab-item {
    width: 60px;
    height: 40px;
  }
}
</style>
