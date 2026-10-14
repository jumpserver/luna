import type { SiteCompatibility } from "~/types/clientCompatibility";
import ts from "typescript";
import { afterEach, expect, it, vi } from "vitest";
import { computed } from "vue";
import { useClientCompatibility } from "~/composables/useClientCompatibility";
import messages from "../../i18n/locales/en.json";
import source from "./ClientCompatibilityDialog.vue?raw";

const script = source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)![1]!;
const { outputText } = ts.transpileModule(script, { compilerOptions: { module: ts.ModuleKind.CommonJS } });

afterEach(() => useClientCompatibility().dismiss());

function createDialog(site = "https://site.test", version = "5.1.0") {
  const dialog = useClientCompatibility();
  dialog.show({
    status: "incompatible",
    site,
    clientVersion: version,
    minClientVersion: version,
    coreVersion: version,
    minCoreVersion: version,
    failures: ["client-too-old", "core-too-old"]
  });
  const openUrl = vi.fn();
  const addToast = vi.fn();
  const scope = {
    computed,
    require: () => ({ desktopOpener: { openUrl } }),
    useToast: () => ({ add: addToast }),
    useI18n: () => ({
      t: (key: string, values: Record<string, string> = {}) => {
        const message =
          key === "Common.OperationFailed"
            ? messages.Common.OperationFailed
            : messages.ClientCompatibility[key.split(".")[1] as keyof typeof messages.ClientCompatibility];
        return message.replace(/\{(\w+)\}/g, (_match, name) => values[name] || "");
      }
    }),
    useClientCompatibility: () => dialog
  };
  const state = new Function(
    ...Object.keys(scope),
    `const exports = {}; ${outputText}; return { description, openDownload };`
  )(...Object.values(scope));
  return { ...state, dialog, openUrl, addToast };
}

it.each([
  ["5.1.0", "v5.1.0"],
  [" v5.1.0 ", "v5.1.0"],
  ["5.1.1-rc1+build.9", "v5.1.1-rc1+build.9"]
])("displays a single v prefix for %s without changing release suffixes", (version, expected) => {
  const { description } = createDialog("https://site.test", version);
  expect(description.value).toBe(
    `Client ${expected} is too old. This site requires ${expected} or later. ` +
      `Core ${expected} is too old. Contact your administrator to upgrade to ${expected} or later. ` +
      `Continue connecting to https://site.test?`
  );
});

it.each([
  ["https://download.test", "https://download.test/core/download/"],
  ["https://download.test/team/jumpserver/", "https://download.test/team/jumpserver/core/download/"]
])("opens the selected site's download page without confirming the connection: %s", async (site, expected) => {
  const { openDownload, openUrl, dialog } = createDialog(site);
  await openDownload();
  expect(openUrl).toHaveBeenCalledWith(expected);
  expect(dialog.pending.value?.site).toBe(site);
});

it("reports an error when the download page cannot be opened", async () => {
  const { openDownload, openUrl, addToast } = createDialog();
  openUrl.mockRejectedValueOnce(new Error("open failed"));
  await openDownload();
  expect(addToast).toHaveBeenCalledWith({ title: messages.Common.OperationFailed, color: "error" });
});

it.each(["confirm", "cancel", "replace"] as const)(
  "settles once and runs only the confirmed action (%s)",
  async (action) => {
    const dialog = useClientCompatibility();
    const continueConnection = vi.fn(async () => {});
    const compatibility: SiteCompatibility = {
      status: "unknown",
      site: "https://site.test",
      clientVersion: "5.1.0",
      minCoreVersion: "5.1.0",
      failures: [],
      reason: "invalid-response"
    };
    const decision = dialog.show(compatibility, continueConnection);
    if (action === "cancel") dialog.dismiss();
    if (action === "replace") dialog.show(compatibility);
    await dialog.confirm();
    await dialog.confirm();
    await expect(decision).resolves.toBe(action === "confirm");
    expect(continueConnection).toHaveBeenCalledTimes(action === "confirm" ? 1 : 0);
    expect(dialog.pending.value).toBeNull();
  }
);
