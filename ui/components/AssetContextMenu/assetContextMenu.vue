<script setup lang="ts">
import type { AssetItem, PermedProtocol } from "~/types/index";

interface Props {
  asset: AssetItem;
  visible: boolean;
  x?: number;
  y?: number;
}

const props = defineProps<Props>();

const emits = defineEmits<{
  (e: "update:visible", visible: boolean): void;
  (e: "edit", asset: AssetItem): void;
}>();

const { t } = useI18n();
const { handleAssetConnection, displayUser, displayProtocol, handleAssetFavorite } = useAssetAction();

const contextMenuRef = ref<HTMLElement | null>(null);

// 计算上下文菜单项
const contextMenuItems = computed(() => {
  const protocols = (props.asset.permedProtocols || []).map((p: PermedProtocol) => p.name);
  const uniqueProtocols = Array.from(new Set(protocols));

  const items = [
    {
      label: t("ContextMenu.Connect"),
      icon: "i-lucide-plug",
      onClick: () => handleConnect()
    },
    {
      label: t("ContextMenu.Edit"),
      icon: "solar:pen-new-square-linear",
      onClick: () => handleEdit()
    },
    {
      label: t("ContextMenu.Rename"),
      icon: "i-lucide-pencil",
      onClick: () => handleRename()
    },
    {
      label: t("ContextMenu.Favorite"),
      icon: "i-lucide-star",
      onClick: () => handleFavorite()
    }
  ];

  // 如果有多个协议，添加协议子菜单
  if (uniqueProtocols.length > 1) {
    const protocolItems = uniqueProtocols.map((name: string) => ({
      label: `${t("ContextMenu.Use")} ${name.toUpperCase()}`,
      icon: "i-lucide-plug",
      onClick: () => handleConnect(name)
    }));

    // 在连接项后插入协议子菜单
    const connectIndex = items.findIndex(item => item.label === t("ContextMenu.Connect"));
    if (connectIndex !== -1) {
      items.splice(connectIndex + 1, 0, ...protocolItems);
    }
  }

  return items;
});

// 处理连接
const handleConnect = (protocol?: string) => {
  if (protocol) {
    // 如果有指定协议，直接连接
    handleAssetConnection(
      displayUser(props.asset.id, props.asset.permedAccounts!),
      props.asset.id,
      protocol,
      props.asset.permedAccounts!,
      undefined,
      {
        accountMode: "hosted",
        manualUsername: "",
        manualPassword: "",
        dynamicPassword: ""
      }
    );
  } else {
    // 否则触发编辑事件
    emits("edit", props.asset);
  }
  emits("update:visible", false);
};

// 处理编辑
const handleEdit = () => {
  emits("edit", props.asset);
  emits("update:visible", false);
};

// 处理重命名
const handleRename = () => {
  // TODO: 实现重命名功能
  console.log("Rename asset:", props.asset);
  emits("update:visible", false);
};

// 处理收藏
const handleFavorite = () => {
  handleAssetFavorite(props.asset.id);
  emits("update:visible", false);
};

// 点击外部关闭菜单
const handleClickOutside = (event: MouseEvent) => {
  if (contextMenuRef.value && !contextMenuRef.value.contains(event.target as Node)) {
    emits("update:visible", false);
  }
};

// 键盘事件处理
const handleKeyDown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    emits("update:visible", false);
  }
};

// 监听可见性变化
watch(() => props.visible, (visible) => {
  if (visible) {
    nextTick(() => {
      // 延迟添加事件监听器，避免立即触发
      setTimeout(() => {
        document.addEventListener("click", handleClickOutside);
      }, 100);
    });
  } else {
    document.removeEventListener("click", handleClickOutside);
  }
});

// 组件挂载时添加事件监听器
onMounted(() => {
  document.addEventListener("click", handleClickOutside);
  document.addEventListener("keydown", handleKeyDown);
});

// 组件卸载时清理事件监听
onUnmounted(() => {
  document.removeEventListener("click", handleClickOutside);
  document.removeEventListener("keydown", handleKeyDown);
});
</script>

<template>
  <div
    v-if="visible"
    ref="contextMenuRef"
    class="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 min-w-48"
    :style="{
      left: `${x || 0}px`,
      top: `${y || 0}px`
    }"
  >
    <!-- 资产信息头部 -->
    <div class="px-3 py-2 border-b border-gray-200 dark:border-gray-700">
      <div class="text-sm font-small text-gray-900 dark:text-gray-100 truncate">
        {{ asset.name }}
      </div>
    </div>

    <!-- 菜单项 -->
    <div class="py-1">
      <template v-for="item in contextMenuItems" :key="item.label">
        <button
          class="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
          @click="item.onClick"
        >
          <UIcon v-if="item.icon" :name="item.icon" class="w-4 h-4" />
          {{ item.label }}
        </button>
      </template>
    </div>
  </div>
</template>
