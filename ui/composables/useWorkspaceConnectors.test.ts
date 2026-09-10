import { afterEach, expect, it, vi } from "vitest";
import { useWorkspaceConnectors } from "./useWorkspaceConnectors";

const mocks = vi.hoisted(() => ({ desktop: false, invoke: vi.fn() }));
vi.mock("~/shared/desktop/bridge", () => ({ desktopInvoke: mocks.invoke }));
vi.mock("~/utils/runtime", () => ({ isDesktopRuntime: () => mocks.desktop }));

afterEach(() => {
  mocks.desktop = false;
  vi.clearAllMocks();
  useWorkspaceConnectors().registerKokoTicketProvider(null);
});

it("creates a desktop ticket without mounting the workspace layout", async () => {
  mocks.desktop = true;
  mocks.invoke.mockResolvedValue({ ticket: "desktop-ticket" });
  const request = { baseUrl: "https://endpoint.example", tokenId: "" };
  await expect(useWorkspaceConnectors().createKokoTicket(request)).resolves.toEqual({ ticket: "desktop-ticket" });
  expect(mocks.invoke).toHaveBeenCalledWith("create_koko_connect_ticket", request);
});

it("retains cookie authentication and explicit providers in the browser", async () => {
  const connectors = useWorkspaceConnectors();
  const request = { baseUrl: "https://endpoint.example", tokenId: "" };
  await expect(connectors.createKokoTicket(request)).resolves.toEqual({});
  connectors.registerKokoTicketProvider(async () => ({ ticket: "custom-ticket" }));
  await expect(connectors.createKokoTicket(request)).resolves.toEqual({ ticket: "custom-ticket" });
  expect(mocks.invoke).not.toHaveBeenCalled();
});
