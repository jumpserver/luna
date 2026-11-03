import { afterEach, expect, it, vi } from "vitest";
import { effectScope, ref } from "vue";
import { useAppWatermark } from "./useAppWatermark";

vi.mock("~/composables/useApiRequest", () => ({
  getPublicSettings: async () => ({
    SECURITY_WATERMARK_ENABLED: true,
    SECURITY_WATERMARK_CONSOLE_CONTENT: `\${userName}(\${name})`,
    SECURITY_WATERMARK_SESSION_CONTENT: `\${name}(\${userName})(\${assetAddress})\n\${assetName}`
  }),
  getUserProfile: async () => ({ id: "user-1", name: "张三", username: "zhangsan" })
}));
vi.mock("~/store/modules/userInfo", () => ({ useUserInfoStore: () => ({}) }));
vi.mock("vue", async (importOriginal) => ({
  ...(await importOriginal<typeof import("vue")>()),
  onBeforeUnmount: vi.fn()
}));

afterEach(() => vi.unstubAllGlobals());

it("updates the session watermark when switching assets and restores console content outside asset sessions", async () => {
  const activeTab = ref<{ assetId: string; assetName: string; address: string; protocol: string } | null>(null);
  vi.stubGlobal("useRoute", () => ({ path: "/" }));
  vi.stubGlobal("useAuthSession", () => ({ authReady: ref(true) }));
  vi.stubGlobal("useWorkspaceTabs", () => ({ activeTab }));
  vi.stubGlobal("storeToRefs", () => ({ loggedIn: ref(true), currentUser: ref(null) }));
  vi.stubGlobal("window", {});
  vi.stubGlobal("useEventListener", vi.fn());
  const scope = effectScope();

  try {
    const watermark = scope.run(useAppWatermark)!;
    await vi.waitFor(() => expect(watermark.options.value.content).toBe("zhangsan(张三)"));

    activeTab.value = { assetId: "asset-1", assetName: "服务器01", address: "192.168.1.1", protocol: "ssh" };
    expect(watermark.options.value.content).toBe("张三(zhangsan)(192.168.1.1)\n服务器01");

    activeTab.value = { assetId: "asset-2", assetName: "服务器02", address: "192.168.1.2", protocol: "rdp" };
    expect(watermark.options.value.content).toBe("张三(zhangsan)(192.168.1.2)\n服务器02");

    activeTab.value = { assetId: "local", assetName: "Local Shell", address: "", protocol: "local-shell" };
    expect(watermark.options.value.content).toBe("zhangsan(张三)");

    activeTab.value = { assetId: "script-1", assetName: "Script", address: "", protocol: "script-editor" };
    expect(watermark.options.value.content).toBe("zhangsan(张三)");

    activeTab.value = { assetId: "", assetName: "", address: "", protocol: "" };
    expect(watermark.options.value.content).toBe("zhangsan(张三)");

    activeTab.value = null;
    expect(watermark.options.value.content).toBe("zhangsan(张三)");
  } finally {
    scope.stop();
  }
});
