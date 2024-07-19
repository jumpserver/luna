<template>
  <n-layout-header class="header-tab">
    <n-flex justify="space-between" align="center">
      <n-flex ref="el">
        <n-flex
          justify="center"
          align="center"
          v-for="item in list"
          :key="item.id"
          class="tab-item"
        >
          {{ item.name }}
        </n-flex>
      </n-flex>
      <n-flex justify="space-between" align="center" class="operation-item">
        <n-popover>
          <template #trigger>
            <n-icon size="18px" :component="CopyOutline" />
          </template>
          拆分
        </n-popover>

        <n-popover>
          <template #trigger>
            <n-icon size="18px" :component="EllipsisHorizontal" />
          </template>
          操作
        </n-popover>
      </n-flex>
    </n-flex>
  </n-layout-header>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { CopyOutline, EllipsisHorizontal } from '@vicons/ionicons5';
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
  position: relative;
  width: 100% !important;
  height: 40px;
  background-color: var(--el-main-header-bg-color);
  .tab-item {
    width: 60px;
    height: 40px;
  }
  .operation-item {
    margin-right: 15px;
    .n-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 3px;
      cursor: pointer;
      transition: all 0.3s ease-in-out;
      &:hover {
        background-color: #363737;
        border-radius: 5px;
      }
    }
  }
}
</style>
