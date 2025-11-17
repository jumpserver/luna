<script setup lang="ts">
import type { AssetItem, PermedProtocol } from "~/types/index";
import { storeToRefs } from "pinia";
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

const { t } = useI18n();
const { handleAssetConnection, displayUser, handleAssetFavorite, handleAssetUnfavorite } = useAssetAction();
const userInfoStore = useUserInfoStore();
const { currentConnectionInfoMap } = storeToRefs(userInfoStore);

interface MenuItem {
  value?: string;
  label: string;
  icon: string;
  onClick: () => void;
  children?: MenuItem[];
}

const isFavorited = computed(() => !!props.asset.isFavorite);

const resolveProtocols = (asset: AssetItem) => {
  const candidateProtocols: string[] = [];

  (asset.permedProtocols || []).forEach((p: PermedProtocol | undefined) => {
    if (p?.name) candidateProtocols.push(p.name);
  });

  const saved = currentConnectionInfoMap.value[asset.id];

  (saved?.availableProtocols || []).forEach((name) => {
    if (name) candidateProtocols.push(name);
  });

  if (saved?.protocol) {
    candidateProtocols.push(saved.protocol);
  }

  return Array.from(new Set(candidateProtocols.filter((name) => typeof name === "string" && name.length > 0)));
};

const menuItems = computed((): MenuItem[] => {
  const uniqueProtocols = resolveProtocols(props.asset);

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
      label: isFavorited.value ? t("ContextMenu.Unfavorite") : t("ContextMenu.Favorite"),
      icon: isFavorited.value ? "lucide:star-off" : "lucide:star",
      onClick: () => (isFavorited.value ? handleUnfavorite() : handleFavorite())
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
  try {
    useEventBus().emit("favoriteChanged", { assetId: props.asset.id, favorite: true });
  } catch {}
  emits("update:visible", false);
};

const handleUnfavorite = () => {
  handleAssetUnfavorite(props.asset.id);
  try {
    useEventBus().emit("favoriteChanged", { assetId: props.asset.id, favorite: false });
  } catch {}
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
