import type { Ref } from "vue";
import { computed } from "vue";
import type { AssetItem, PermedProtocol, ConnectionInfo } from "~/types/index";
import { useUserInfoStore } from "~/store/modules/userInfo";

export const useDisplayAssets = (assets: Ref<AssetItem[]>, platform?: Ref<string | undefined>) => {
  const userInfoStore = useUserInfoStore();

  const visibleAssets = computed<AssetItem[]>(() => {
    const platformVal = platform?.value;

    const list =
      !platformVal || platformVal === "all"
        ? assets.value
        : assets.value.filter((item: AssetItem) => item.platform === platformVal);

    const buildDisplayAddressLine = (asset: AssetItem, saved?: ConnectionInfo | null) => {
      const protocol = saved?.protocol;

      if (protocol) {
        const permed = (asset.permedProtocols || []).find((p: PermedProtocol | undefined) => p?.name === protocol);
        const port = permed?.port;
        const addr = asset.address || "";
        const selected = (saved?.username || "").trim();
        const mode = saved?.accountMode;

        let username = "";
        if (mode === "manual" || selected === "手动输入" || selected === "Manual input") {
          username = (saved?.manualUsername || "").trim();
        } else if (mode === "dynamic" || selected.includes("同名账号") || selected.includes("Dynamic user")) {
          username = ""; // dynamic has no fixed username in URI
        } else if (selected) {
          username = selected;
        }

        const userPart = username ? `${username}@` : "";
        return `${protocol}://${userPart}${addr}${port ? `:${port}` : ""}`;
      }

      return `${asset.address}`;
    };

    return list.map((a) => {
      const saved = userInfoStore.getConnectionInfoForAsset(a.id);

      return {
        ...a,
        displayAddressLine: buildDisplayAddressLine(a, saved),
        savedConnection: saved
      } as AssetItem;
    });
  });

  return { visibleAssets };
};
