import { useUserInfoStore } from "~/store/modules/userInfo";
import { isDesktopRuntime, withWebSitePrefix } from "~/utils/runtime";

export function useShareLink() {
  const userInfo = useUserInfoStore();
  const siteUrl = computed(() =>
    isDesktopRuntime() ? userInfo.currentSite : globalThis.window?.location.origin || ""
  );

  function shareURL(id: string, code: string, component: "koko" | "lion") {
    if (!id || !siteUrl.value) return "";
    const path = `/luna/share/${encodeURIComponent(id)}/?code=${encodeURIComponent(code)}&component=${component}`;
    return isDesktopRuntime()
      ? new URL(path.slice(1), `${siteUrl.value.replace(/\/+$/, "")}/`).toString()
      : new URL(withWebSitePrefix(path), siteUrl.value).toString();
  }

  return { siteUrl, shareURL };
}
