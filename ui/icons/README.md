# SidebarFlipIcon 组件

这是一个封装了 sidebar-flip SVG 图标的 Vue 组件，可以在 Nuxt 项目中直接使用。

## 使用方法

### 1. 导入组件

```vue
<script setup lang="ts">
import SidebarFlipIcon from "~/icons/SidebarFlipIcon.vue";
</script>
```

### 2. 在模板中使用

```vue
<template>
  <!-- 基本使用 -->
  <SidebarFlipIcon />

  <!-- 自定义尺寸 -->
  <SidebarFlipIcon size="32" />

  <!-- 自定义样式 -->
  <SidebarFlipIcon size="24" class="text-blue-500" />

  <!-- 不同尺寸示例 -->
  <SidebarFlipIcon size="16" class="text-gray-500" />
  <SidebarFlipIcon size="24" class="text-blue-500" />
  <SidebarFlipIcon size="32" class="text-green-500" />
  <SidebarFlipIcon size="48" class="text-purple-500" />
</template>
```

## Props

| 属性  | 类型             | 默认值 | 描述            |
| ----- | ---------------- | ------ | --------------- |
| size  | string \| number | '24'   | 图标尺寸        |
| class | string           | ''     | 自定义 CSS 类名 |

## 特性

- ✅ 支持自定义尺寸
- ✅ 支持自定义样式（通过 class 属性）
- ✅ 使用 `currentColor` 填充，继承父元素的文字颜色
- ✅ TypeScript 支持
- ✅ 响应式设计

## 测试页面

访问 `/test-icon` 页面可以查看图标的各种使用示例。
