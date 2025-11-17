<script setup lang="ts">
import type { AssetItem, PermedProtocol } from "~/types";
import type { TableColumn } from "@nuxt/ui";

import { h, resolveComponent } from "vue";
import { storeToRefs } from "pinia";
import { useUserInfoStore } from "~/store/modules/userInfo";

interface MenuItem {
  icon: string;
  label: string;
  value?: string;
  onClick: () => void;
  children?: MenuItem[];
}

const UButton = resolveComponent("UButton");
const UCheckbox = resolveComponent("UCheckbox");
const UFieldGroup = resolveComponent("UFieldGroup");
const UDropdownMenu = resolveComponent("UDropdownMenu");

const emits = defineEmits<{
  (e: "editTrigger", asset: AssetItem): void;
  (e: "connectAsset", asset: AssetItem): void;
  (e: "contextTrigger", asset: AssetItem): void;
  (e: "connectTrigger", asset: AssetItem): void;
}>();

const props = defineProps<{
  items: AssetItem[];
}>();

const { t } = useI18n();
const {
  displayUser,
  displayProtocol,
  handleAssetRename,
  handleAssetFavorite,
  handleAssetUnfavorite,
  handleAssetConnection
} = useAssetAction();
const userInfoStore = useUserInfoStore();
const { currentConnectionInfoMap } = storeToRefs(userInfoStore);

const renameValue = ref("");
const contextMenuVisible = ref(false);
const contextMenuPosition = ref({ x: 0, y: 0 });
const renamingId = ref<string | null>(null);
const contextMenuAsset = ref<AssetItem | null>(null);
const renameInputEl = ref<HTMLInputElement | null>(null);
const actionMenuOpen = reactive<Record<string, boolean>>({});

const resolveProtocols = (asset: AssetItem) => {
  const candidates: string[] = [];

  (asset.permedProtocols || []).forEach((p: PermedProtocol | undefined) => {
    if (p?.name) candidates.push(p.name);
  });

  const saved = currentConnectionInfoMap.value[asset.id];
  (saved?.availableProtocols || []).forEach((name) => {
    if (name) candidates.push(name);
  });

  if (saved?.protocol) {
    candidates.push(saved.protocol);
  }

  return Array.from(new Set(candidates.filter((name) => typeof name === "string" && name.length > 0)));
};

const buildMenuItems = computed(() => {
  return (asset: AssetItem): MenuItem[] => {
    const uniqueProtocols = resolveProtocols(asset);

    const items: MenuItem[] = [
      {
        value: "connect",
        label: t("ContextMenu.Connect"),
        icon: "i-lucide-plug",
        onClick: () => emits("connectTrigger", asset)
      },
      {
        label: t("ContextMenu.Edit"),
        icon: "solar:pen-new-square-linear",
        onClick: () => emits("editTrigger", asset)
      },
      {
        label: t("ContextMenu.Rename"),
        icon: "i-lucide-pencil",
        onClick: () => handleRenameTrigger(asset)
      },
      {
        label: asset.isFavorite ? t("ContextMenu.Unfavorite") : t("ContextMenu.Favorite"),
        icon: asset.isFavorite ? "lucide:star-off" : "lucide:star",
        onClick: () => (asset.isFavorite ? handleUnfavorite(asset) : handleFavorite(asset))
      }
    ];

    if (uniqueProtocols.length > 1) {
      const protocolItems: MenuItem[] = uniqueProtocols.map((name: string) => ({
        label: `${t("ContextMenu.Use")} ${name.toUpperCase()}`,
        icon: "i-lucide-plug",
        onClick: () =>
          handleAssetConnection(
            displayUser(asset.id, asset.permedAccounts!),
            asset.id,
            displayProtocol(asset.id, asset.permedProtocols!),
            asset.permedAccounts!,
            name
          )
      }));

      const moreConnect: MenuItem = {
        value: "moreConnect",
        label: t("ContextMenu.MoreConnect"),
        icon: "i-lucide-ellipsis",
        onClick: () => void 0,
        children: protocolItems
      };

      items.splice(1, 0, moreConnect);
    }

    return items;
  };
});

/**
 * @description 处理上下文事件
 */
const handleContextTrigger = (asset: AssetItem) => {
  emits("contextTrigger", asset);
};

const emitFavoriteChanged = (assetId: string, favorite: boolean) => {
  try {
    useEventBus().emit("favoriteChanged", { assetId, favorite });
  } catch {}
};

const handleFavorite = (asset: AssetItem) => {
  handleAssetFavorite(asset.id);
  emitFavoriteChanged(asset.id, true);
};

const handleUnfavorite = (asset: AssetItem) => {
  handleAssetUnfavorite(asset.id);
  emitFavoriteChanged(asset.id, false);
};

/**
 * @description 触发重命名
 */
const handleRenameTrigger = (asset: AssetItem) => {
  renamingId.value = asset.id;
  renameValue.value = asset.name || "";
  contextMenuVisible.value = false;
  actionMenuOpen[asset.id] = false;

  nextTick(() => {
    renameInputEl.value?.focus();
  });
};

function submitRename(id: string) {
  const name = (renameValue.value || "").trim();

  if (!renamingId.value) return;

  const oldName = props.items.find((a) => a.id === id)?.name || "";

  if (!name || name === oldName) {
    renamingId.value = null;
    return;
  }

  handleAssetRename(id, name);
  renamingId.value = null;
}

function cancelRename() {
  renamingId.value = null;
}

const columns: TableColumn<AssetItem>[] = [
  {
    id: "select",
    header: ({ table }) =>
      h(UCheckbox, {
        modelValue: table.getIsSomePageRowsSelected() ? "indeterminate" : table.getIsAllPageRowsSelected(),
        "onUpdate:modelValue": (value: boolean | "indeterminate") => table.toggleAllPageRowsSelected(!!value),
        "aria-label": "Select all"
      }),
    cell: ({ row }) =>
      h(UCheckbox, {
        modelValue: row.getIsSelected(),
        "onUpdate:modelValue": (value: boolean | "indeterminate") => row.toggleSelected(!!value),
        "aria-label": "Select row"
      }),
    meta: { class: { th: "w-[50px]", td: "w-[50px]" } }
  },
  {
    accessorKey: "assetName",
    header: () => t("AssetCard.AssetName"),
    cell: ({ row }) => {
      if (renamingId.value === row.original.id) {
        return h("input", {
          ref: (el: any) => (renameInputEl.value = el as HTMLInputElement),
          value: renameValue.value,
          class: "sm:text-sm font-medium truncate whitespace-nowrap  border-b border-primary focus:outline-none w-full",
          autocapitalize: "off",
          autocorrect: "off",
          spellcheck: false,
          style: { textTransform: "none" },
          onInput: (e: InputEvent) => (renameValue.value = (e.target as HTMLInputElement).value || ""),
          onKeyup: (e: KeyboardEvent) => {
            if (e.key === "Enter") submitRename(row.original.id);
            if (e.key === "Escape") cancelRename();
          },
          onBlur: () => submitRename(row.original.id)
        });
      }

      return h(
        "div",
        {
          class: "truncate",
          title: row.original.name
        },
        row.original.name
      );
    },
    meta: { class: { th: "max-w-[300px]", td: "max-w-[300px]" } }
  },
  {
    accessorKey: "address",
    header: () => t("AssetCard.Address"),
    cell: ({ row }) =>
      h(
        "div",
        {
          class: "truncate",
          title: row.original.address
        },
        row.original.address
      ),
    meta: { class: { th: "max-w-[300px]", td: "max-w-[300px]" } }
  },
  {
    id: "user",
    header: () => t("AssetCard.User"),
    cell: ({ row }) => {
      const userText = displayUser(row.original.id, row.original.permedAccounts!);
      return h(
        "div",
        {
          class: "truncate",
          title: userText
        },
        userText
      );
    },
    meta: { class: { th: "w-[250px]", td: "w-[250px]" } }
  },
  {
    id: "protocol",
    header: () => t("AssetCard.Protocol"),
    cell: ({ row }) => {
      const protocolText = displayProtocol(row.original.id, row.original.permedProtocols!);
      if (!protocolText || protocolText === "-") {
        return h("div", { class: "truncate" }, "-");
      }
      const color = {
        paid: "success" as const,
        failed: "error" as const,
        refunded: "neutral" as const
      }[row.getValue("status") as string];

      return h(UButton, { size: "xs", class: "rounded-sm", variant: "subtle", color: "primary" }, () => protocolText);
    },
    meta: { class: { th: "w-[150px]", td: "w-[150px]" } }
  },
  {
    id: "actions",
    header: () => t("AssetCard.Actions"),
    cell: ({ row }) => {
      const menuItems = buildMenuItems.value(row.original);

      return h(
        UFieldGroup,
        {
          size: "xs",
          class: "inline-flex rounded-sm text-right"
        },
        {
          default: () => [
            h(UButton, {
              color: "primary",
              variant: "outline",
              class: "rounded-sm",
              label: t("Common.Connect"),
              onClick: () => emits("connectAsset", row.original)
            }),
            h(
              UDropdownMenu,
              {
                items: menuItems,
                size: "sm",
                ui: { content: "w-48 p-1" },
                content: { onCloseAutoFocus: (e: Event) => e.preventDefault() },
                open: actionMenuOpen[row.original.id] || false,
                "onUpdate:open": (v: boolean) => (actionMenuOpen[row.original.id] = v)
              },
              {
                default: () =>
                  h(UButton, {
                    icon: "i-lucide-ellipsis",
                    color: "primary",
                    variant: "outline",
                    class: "rounded-sm",
                    "data-table-context-button": true
                  })
              }
            )
          ]
        }
      );
    },
    meta: { class: { th: "w-[260px] text-center", td: "w-[260px] text-center" } }
  }
];
</script>

<template>
  <UCard
    variant="outline"
    class="w-full overflow-hidden min-h-full flex flex-col"
    :ui="{
      body: 'p-1 sm:p-1 flex-1 min-h-0'
    }"
  >
    <div class="overflow-x-auto flex-1 min-h-0">
      <UTable
        sticky
        :data="props.items"
        :columns="columns"
        :empty="t('Common.NoData')"
        class="w-full table-auto"
        :ui="{
          tr: 'hover:bg-muted/50 ',
          th: 'whitespace-nowrap text-xs sm:text-sm',
          td: 'whitespace-nowrap text-xs sm:text-sm py-2'
        }"
      ></UTable>
    </div>
  </UCard>

  <AssetContextMenu
    v-if="contextMenuAsset"
    :asset="contextMenuAsset"
    :visible="contextMenuVisible"
    :x="contextMenuPosition.x"
    :y="contextMenuPosition.y"
    @update:visible="contextMenuVisible = $event"
    @context-trigger="handleContextTrigger"
    @edit-trigger="emits('editTrigger', contextMenuAsset as AssetItem)"
    @connect-trigger="emits('connectTrigger', contextMenuAsset as AssetItem)"
    @rename-trigger="handleRenameTrigger"
  />
</template>
