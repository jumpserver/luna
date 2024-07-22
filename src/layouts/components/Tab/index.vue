<template>
  <n-layout-header class="header-tab">
    <n-flex justify="space-between" align="center">
      <n-flex ref="el" style="gap: 0">
        <n-flex
          justify="center"
          align="center"
          v-for="item in list"
          class="tab-item"
          :key="item.id"
          style="padding: 0 5px"
          :class="{
            'active-tab': item.isActive,
            'first-click': item.clickCount === 1,
            'second-click': item.clickCount === 2
          }"
          @click="handleTabClick(item)"
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
    id: 1,
    clickCount: 0,
    isActive: false
  },
  {
    name: 'Jean',
    id: 2,
    clickCount: 0,
    isActive: false
  },
  {
    name: 'Johanna',
    id: 3,
    clickCount: 0,
    isActive: false
  },
  {
    name: 'Juan',
    id: 4,
    clickCount: 0,
    isActive: false
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

const handleTabClick = (item: { id: number }) => {
  list.forEach(tab => {
    if (tab.id === item.id) {
      tab.clickCount = tab.clickCount < 2 ? tab.clickCount + 1 : 1; // 重置为1时保证重新点击
      tab.isActive = true;
    } else {
      tab.clickCount = 0;
      tab.isActive = false;
    }
  });
};
</script>

<style scoped lang="scss">
.header-tab {
  position: relative;
  width: 100% !important;
  height: 35px;
  background-color: var(--el-main-header-bg-color);
  .tab-item {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 60px;
    height: 35px;
    cursor: pointer;
    transition: all 0.3s ease-in-out;
    &.first-click {
      font-style: italic;
      color: #ffffff;
    }
    &.second-click {
      font-style: normal;
      color: rgb(255 255 255 / 50%);
    }
    &.active-tab {
      color: #ffffff;
      background-color: var(--el-main-bg-color);
    }
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
