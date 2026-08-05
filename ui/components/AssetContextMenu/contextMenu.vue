<script setup lang="ts">
import type { AssetItem } from "~/types/index";

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
const { handleAssetConnection, displayUser, handleAssetUnfavorite } = useAssetAction();
const { folders: favoriteFolders, load: loadFavoriteFolders, favoriteToFolder } = useFavoriteFolders();
interface MenuItem {
  value?: string;
  label: string;
  icon: string;
  onClick: () => void;
  children?: MenuItem[];
}

const isFavorited = computed(() => !!props.asset.isFavorite);
const flatFavoriteFolders = computed(() => {
  const flatten = (folders = favoriteFolders.value): Array<{ id: string; name: string }> =>
    folders.flatMap((folder) => [{ id: folder.id, name: folder.name }, ...flatten(folder.children)]);
  return flatten();
});
const hasReusableSavedConnection = computed(() => {
  const saved = props.asset.savedConnection;
  if (!saved?.protocol || !saved.username) return false;

  const mode = saved.accountMode || "hosted";
  if (mode === "manual") {
    return !!(saved.rememberSecret && saved.manualUsername && saved.manualPassword);
  }
  if (mode === "dynamic") {
    return !!(saved.rememberSecret && saved.dynamicPassword);
  }

  return true;
});

const menuItems = computed((): MenuItem[] => {
  const baseItems: MenuItem[] = [
    {
      value: "connect",
      label: t("ContextMenu.Connect"),
      icon: "i-lucide-plug",
      onClick: () => handleEdit()
    },
    {
      label: t("ContextMenu.Rename"),
      icon: "i-lucide-pencil",
      onClick: () => handleRename()
    },
    {
      label: t("Favorite.AddToFolder"),
      icon: "lucide:star",
      onClick: () => void 0,
      children:
        flatFavoriteFolders.value.length > 0
          ? flatFavoriteFolders.value.map((folder) => ({
              label: folder.name,
              icon: "i-lucide-folder",
              onClick: () => addToFolder(folder.id)
            }))
          : [{ label: t("Favorite.CreateFolderFirst"), icon: "i-lucide-folder-plus", onClick: () => void 0 }]
    },
    ...(isFavorited.value
      ? [
          {
            label: t("ContextMenu.Unfavorite"),
            icon: "lucide:star-off",
            onClick: () => handleUnfavorite()
          }
        ]
      : [])
  ];

  if (hasReusableSavedConnection.value) {
    baseItems.unshift({
      value: "quickConnect",
      label: t("ContextMenu.QuickConnect"),
      icon: "i-lucide-zap",
      onClick: () => handleConnect()
    });
  }

  return baseItems;
});

/**
 * @description 连接
 * @param protocol
 */
function handleConnect(protocol?: string) {
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
        dynamicPassword: "",
        asset: props.asset
      }
    );
  } else {
    emits("connectTrigger", props.asset);
  }
  emits("update:visible", false);
}

/**
 * @description 编辑
 */
function handleEdit() {
  emits("editTrigger", props.asset);

  nextTick(() => {
    emits("update:visible", false);
  });
}

/**
 * @description 重命名
 */
function handleRename() {
  emits("renameTrigger", props.asset);

  nextTick(() => {
    emits("update:visible", false);
  });
}

async function addToFolder(folderId: string) {
  await favoriteToFolder(props.asset.id, folderId);
  emits("update:visible", false);
}

watch(
  () => props.visible,
  (visible) => {
    if (visible) loadFavoriteFolders();
  }
);

/**
 * @description 取消搜藏
 */
function handleUnfavorite() {
  handleAssetUnfavorite(props.asset.id);
  try {
    useEventBus().emit("favoriteChanged", { assetId: props.asset.id, favorite: false });
  } catch {}
  emits("update:visible", false);
}
</script>

<template>
  <UDropdownMenu
    :open="visible"
    :items="menuItems"
    size="sm"
    :ui="{
      content:
        'w-52 rounded-xl border border-black/6 bg-white/92 p-1.5 shadow-xl shadow-black/5 backdrop-blur dark:border-white/10 dark:bg-zinc-950/92 dark:shadow-none',
      item: 'min-h-8 rounded-lg px-2 py-1.5 text-[12px] font-medium',
      itemLeadingIcon: 'size-3.5 text-gray-500 dark:text-gray-400',
      label: 'truncate',
      separator: 'my-1 border-black/6 dark:border-white/10'
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
