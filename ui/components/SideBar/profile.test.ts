import ts from "typescript";
import { afterEach, expect, it, vi } from "vitest";
import { ref } from "vue";
import { useClientCompatibility } from "~/composables/useClientCompatibility";
import source from "~/composables/useDesktopLogin.ts?raw";
import messages from "../../../i18n/locales/zh.json";

const file = ts.createSourceFile("useDesktopLogin.ts", source, ts.ScriptTarget.Latest, true);
const findHandler = (node: ts.Node): ts.VariableDeclaration | undefined => {
  if (ts.isVariableDeclaration(node) && node.name.getText(file) === "handleConfirm") return node;
  return ts.forEachChild(node, findHandler);
};
const declaration = findHandler(file);
if (!declaration) throw new Error("Desktop login submit handler was not found");
// Run the real submit handler inside createSharedComposable without mounting either login panel.
const { outputText } = ts.transpileModule(`const ${declaration.getText(file)};`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS }
});

afterEach(() => useClientCompatibility().dismiss());

function createLogin(desktop = true) {
  const desktopInvoke = vi.fn();
  const compatibility = useClientCompatibility();
  const scope = {
    loginBtn: ref(false),
    errorMessage: ref(""),
    hasValidationError: ref(false),
    validationField: ref<string | null>(null),
    normalizedInputSite: ref("http://localhost:8888"),
    normalizedInputSiteName: ref("Local"),
    appConfig: { componentsConfig: { urlRegExp: /^https?:\/\// } },
    userMap: ref({}),
    editingAccountId: ref(""),
    currentAccountId: ref(""),
    loggedIn: ref(false),
    openModal: ref(true),
    inlineVisible: ref(false),
    browserAuthUrl: ref(""),
    focusInput: vi.fn(),
    t: (key: string) => (key === "Login.InvalidSiteError" ? messages.Login.InvalidSiteError : key),
    isDesktopRuntime: () => desktop,
    redirectToWebLogin: vi.fn(),
    listenForLogin: vi.fn(async () => true),
    stopLoginListeners: vi.fn(),
    useClientCompatibility: () => compatibility,
    desktopInvoke,
    applyLoginPayload: vi.fn(async () => true),
    closeCurrentSiteWorkspace: vi.fn(),
    confirmLeaveCurrentSiteSessions: vi.fn(async () => true),
    saveRecentSite: vi.fn(),
    addErrorToast: vi.fn(),
    loginFailureToastId: "login-failed"
  };
  const handleConfirm = new Function(
    ...Object.keys(scope),
    `let loginRequestGeneration = 0, loginInFlight = false; ${outputText}; return handleConfirm;`
  )(...Object.values(scope)) as () => Promise<void>;
  return { ...scope, compatibility, handleConfirm };
}

it.each(["network", "timeout"])("keeps an unreachable site visible and allows retry after %s", async (reason) => {
  const login = createLogin();
  login.desktopInvoke.mockResolvedValue({
    status: "confirmation-required",
    compatibility: { status: "unknown", reason }
  });
  await login.handleConfirm();
  expect(login.openModal.value).toBe(true);
  expect(login.validationField.value).toBe("site");
  expect(login.hasValidationError.value).toBe(true);
  expect(login.errorMessage.value).toBe("无法访问此站点，请手动打开测试");
  expect(login.compatibility.pending.value).toBeNull();
  expect(login.loginBtn.value).toBe(false);
  expect(login.applyLoginPayload).not.toHaveBeenCalled();
  await login.handleConfirm();
  expect(login.desktopInvoke).toHaveBeenCalledTimes(2);
});

it("releases the confirm button after an OAuth configuration request fails", async () => {
  const login = createLogin();
  login.desktopInvoke.mockRejectedValue(new Error("Failed to fetch OAuth config: net::ERR_CONNECTION_REFUSED"));
  await login.handleConfirm();
  expect(login.openModal.value).toBe(true);
  expect(login.errorMessage.value).toBe("无法访问此站点，请手动打开测试");
  expect(login.loginBtn.value).toBe(false);
  await login.handleConfirm();
  expect(login.desktopInvoke).toHaveBeenCalledTimes(2);
});

it.each(["failure", "success"])("shows an error if the login cannot be applied (%s)", async (status) => {
  const login = createLogin();
  login.desktopInvoke.mockResolvedValue({ status });
  login.applyLoginPayload.mockResolvedValue(false);
  await login.handleConfirm();
  expect(login.hasValidationError.value).toBe(true);
  expect(login.errorMessage.value).toBe("Login.LoginFailed");
  expect(login.addErrorToast).toHaveBeenCalled();
  expect(login.loginBtn.value).toBe(false);
  expect(login.saveRecentSite).toHaveBeenCalledExactlyOnceWith("http://localhost:8888");
});

it.each([null, { status: "stale" }])("keeps cancelled or obsolete requests quiet: %j", async (payload) => {
  const login = createLogin();
  login.desktopInvoke.mockResolvedValue(payload);
  await login.handleConfirm();
  expect(login.hasValidationError.value).toBe(false);
  expect(login.addErrorToast).not.toHaveBeenCalled();
  expect(login.loginBtn.value).toBe(false);
});

it.each([
  { status: "unknown", reason: "endpoint-missing" },
  { status: "incompatible", failures: ["client-too-old"] }
])("preserves compatibility confirmation for reachable sites: %j", async (compatibility) => {
  const login = createLogin();
  login.desktopInvoke.mockResolvedValue({ status: "confirmation-required", compatibility });
  await login.handleConfirm();
  expect(login.openModal.value).toBe(false);
  expect(login.compatibility.pending.value).toEqual(compatibility);
  expect(login.hasValidationError.value).toBe(false);
});

it("keeps the web login redirect", async () => {
  const login = createLogin(false);
  await login.handleConfirm();
  expect(login.redirectToWebLogin).toHaveBeenCalledOnce();
  expect(login.desktopInvoke).not.toHaveBeenCalled();
});
