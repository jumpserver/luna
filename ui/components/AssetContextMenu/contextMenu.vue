<script setup lang="ts">
import type { AssetItem, PermedProtocol } from "~/types/index";
import { useUserInfoStore } from "~/store/modules/userInfo";

interface Props {
  asset: AssetItem;
  visible: boolean;
  x?: number;
  y?: number;
}

const props = defineProps<Props>();

const emits = defineEmits<{
  (e: "update:visible", visible: boolean): void;
  (e: "contextTrigger", asset: AssetItem): void;
  (e: "editTrigger", asset: AssetItem): void;
  (e: "connectTrigger", asset: AssetItem): void;
  (e: "renameTrigger", asset: AssetItem): void;
}>();

const userInfoStore = useUserInfoStore();

const { t } = useI18n();
const { currentSite, currentUser } = storeToRefs(userInfoStore);
const { handleAssetConnection, displayUser, displayProtocol, handleAssetFavorite } =
  useAssetAction();

// 定义菜单项类型
interface MenuItem {
  value?: string;
  label: string;
  icon: string;
  onClick: () => void;
  children?: MenuItem[];
}

// 计算菜单项
const menuItems = computed((): MenuItem[] => {
  const protocols = (props.asset.permedProtocols || []).map((p: PermedProtocol) => p.name);
  const uniqueProtocols = Array.from(new Set(protocols));

  const baseItems: MenuItem[] = [
    {
      value: "connect",
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

  // 如果有多个协议，为连接项添加子菜单
  if (uniqueProtocols.length > 1) {
    const protocolItems: MenuItem[] = uniqueProtocols.map((name: string) => ({
      label: `${t("ContextMenu.Use")} ${name.toUpperCase()}`,
      icon: "i-lucide-plug",
      onClick: () => handleConnect(name)
    }));

    const item = {
      value: "moreConnect",
      label: t("ContextMenu.MoreConnect"),
      icon: "i-lucide-ellipsis",
      onClick: () => void 0,
      children: protocolItems
    };
    baseItems.splice(1, 0, item);
  }

  return baseItems;
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
    emits("connectTrigger", props.asset);
  }
  emits("update:visible", false);
};

// 处理编辑
const handleEdit = () => {
  emits("editTrigger", props.asset);

  nextTick(() => {
    emits("update:visible", false);
  });
};

// 处理重命名
const handleRename = () => {
  emits("renameTrigger", props.asset);

  nextTick(() => {
    emits("update:visible", false);
  });
};

// 处理收藏
const handleFavorite = () => {
  handleAssetFavorite(props.asset.id);
  emits("update:visible", false);
};
</script>

<template>
  <UDropdownMenu
    :open="visible"
    :items="menuItems"
    size="sm"
    :ui="{
      content: 'w-48 p-1'
    }"
    @update:open="emits('update:visible', $event)"
  >
    <!-- 使用一个隐藏的触发器 -->
    <div
      class="fixed pointer-events-none"
      :style="{
        left: `${x || 0}px`,
        top: `${y || 0}px`,
        width: '1px',
        height: '1px'
      }"
    />
  </UDropdownMenu>
</template>
