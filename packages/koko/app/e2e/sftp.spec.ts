import type { Page, WebSocketRoute } from "playwright/test";

import { Buffer } from "node:buffer";
import { expect, test } from "playwright/test";

interface SftpEntry {
  name: string;
  size: string;
  perm: string;
  mod_time: string;
  type: string;
  is_dir: boolean;
}

interface SftpRequest {
  id: string;
  type: "SFTP_DATA";
  cmd: string;
  data?: string;
  raw?: string;
}

interface MockSftpServer {
  commands: SftpRequest[];
  connectionTokenBodies: Record<string, unknown>[];
  websocketUrls: string[];
}

const rootEntries: SftpEntry[] = [
  {
    name: "docs",
    size: "",
    perm: "drwxr-xr-x",
    mod_time: "2026-08-17T08:00:00Z",
    type: "directory",
    is_dir: true
  },
  {
    name: ".env",
    size: "12",
    perm: "-rw-------",
    mod_time: "2026-08-17T08:01:00Z",
    type: "file",
    is_dir: false
  },
  {
    name: "release.txt",
    size: "7",
    perm: "-rw-r--r--",
    mod_time: "2026-08-17T08:02:00Z",
    type: "file",
    is_dir: false
  }
];

const docsEntries: SftpEntry[] = [
  {
    name: "guide.md",
    size: "24",
    perm: "-rw-r--r--",
    mod_time: "2026-08-17T08:03:00Z",
    type: "file",
    is_dir: false
  }
];

function cloneEntries(entries: SftpEntry[]) {
  return entries.map((entry) => ({ ...entry }));
}

function parentPath(path: string) {
  const normalized = path.replace(/\/+$/, "") || "/";
  const separator = normalized.lastIndexOf("/");
  return separator <= 0 ? "/" : normalized.slice(0, separator);
}

function baseName(path: string) {
  return path.replace(/\/+$/, "").split("/").at(-1) || "";
}

async function seedAuthenticatedUser(page: Page) {
  await page.addInitScript(() => {
    const site = window.location.origin;
    const organization = { id: "org-1", name: "Demo Org" };
    const user = {
      accountId: site,
      siteName: "SFTP E2E",
      name: "SFTP Tester",
      site,
      org: organization,
      availableOrgs: [organization],
      system_roles: [],
      connectionInfo: { protocol: "", username: "" }
    };

    localStorage.setItem(
      "userInfoV2",
      JSON.stringify({
        currentAccountId: site,
        currentSite: site,
        loggedIn: true,
        currentUser: user,
        currentOrganizations: [organization],
        userMap: { [site]: user },
        currentRdpClientOption: {},
        currentConnectionInfoMap: {},
        currentConnectionPreferenceMap: {}
      })
    );
  });
}

async function installSftpBackend(page: Page): Promise<MockSftpServer> {
  const server: MockSftpServer = {
    commands: [],
    connectionTokenBodies: [],
    websocketUrls: []
  };
  const directories = new Map<string, SftpEntry[]>([
    ["/home/tester", cloneEntries(rootEntries)],
    ["/home/tester/docs", cloneEntries(docsEntries)]
  ]);

  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    let body: unknown;

    if (pathname.includes("/nodes/children-with-assets/")) {
      body = [
        {
          id: "asset-1",
          name: "SFTP Host",
          isParent: false,
          meta: {
            data: {
              id: "asset-1",
              name: "SFTP Host",
              address: "10.0.0.10",
              permedProtocols: [{ name: "sftp" }],
              permedAccounts: [{ id: "account-1", name: "root", username: "root", alias: "root" }]
            }
          }
        }
      ];
    } else if (pathname === "/api/v1/assets/favorite-folders/") {
      body = [];
    } else if (pathname === "/api/v1/assets/favorite-assets/") {
      body = [];
    } else if (pathname === "/api/v1/terminal/components/connect-methods/") {
      body = {
        sftp: [
          {
            value: "web_sftp",
            label: "SFTP",
            type: "web",
            icon: "",
            disabled: false,
            listen: "",
            component: "koko"
          }
        ],
        originals: []
      };
    } else if (pathname === "/api/v1/authentication/connection-token/") {
      server.connectionTokenBodies.push((request.postDataJSON() || {}) as Record<string, unknown>);
      body = { id: "sftp-token" };
    } else {
      await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ detail: pathname }) });
      return;
    }

    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });

  await page.route("**/koko/api/connect-ticket/", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ticket: "sftp-ticket" })
    })
  );

  await page.routeWebSocket("**/koko/ws/sftp/**", (socket: WebSocketRoute) => {
    server.websocketUrls.push(socket.url());

    socket.onMessage((raw) => {
      const message = JSON.parse(String(raw)) as SftpRequest;
      if (message.type !== "SFTP_DATA") return;
      server.commands.push(message);
      const data = JSON.parse(message.data || "{}") as { path?: string; name?: string };

      if (message.cmd === "list") {
        const path = data.path || "/home/tester";
        socket.send(
          JSON.stringify({
            id: message.id,
            type: "SFTP_DATA",
            cmd: "list",
            data: JSON.stringify(directories.get(path) || []),
            current_path: path
          })
        );
        return;
      }

      if (message.cmd === "mkdir" && data.path) {
        const entries = directories.get(parentPath(data.path)) || [];
        entries.push({
          name: baseName(data.path),
          size: "",
          perm: "drwxr-xr-x",
          mod_time: "2026-08-17T08:04:00Z",
          type: "directory",
          is_dir: true
        });
        directories.set(data.path, []);
      }

      if (message.cmd === "rm" && data.path) {
        const targetPath = data.path;
        const parent = parentPath(targetPath);
        directories.set(
          parent,
          (directories.get(parent) || []).filter((entry) => entry.name !== baseName(targetPath))
        );
        directories.delete(targetPath);
      }

      socket.send(JSON.stringify({ id: message.id, type: "SFTP_DATA", cmd: message.cmd, data: "ok" }));
    });

    setTimeout(() => socket.send(JSON.stringify({ id: "connect-1", type: "CONNECT" })), 50);
  });

  return server;
}

async function openSftpWorkbench(page: Page) {
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.goto("files?tool_window=1", { waitUntil: "domcontentloaded" });
      const workspace = page.locator('[data-sftp-tour="workspace"]');
      await workspace.waitFor({ state: "visible", timeout: 10_000 });
      return workspace;
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(500);
    }
  }

  throw lastError;
}

async function connectRemoteSftp(page: Page) {
  await openSftpWorkbench(page);
  await page.getByRole("button", { name: "Connect remote SFTP" }).click();
  const dialog = page.getByRole("dialog", { name: "Connect remote SFTP" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Demo Org", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "SFTP Host" }).click();

  const table = page.locator('[data-sftp-tour="file-table"]');
  await expect(table.getByText("release.txt", { exact: true })).toBeVisible();
  return table;
}

test.describe("koko SFTP workbench", () => {
  test.beforeEach(async ({ page }) => {
    await seedAuthenticatedUser(page);
  });

  test("blocks browser uploads until a remote SFTP target is connected", async ({ page }) => {
    const server = await installSftpBackend(page);
    const workspace = await openSftpWorkbench(page);
    await expect(workspace.getByText("Local upload", { exact: true })).toBeVisible();
    await expect(workspace.getByText("Connect remote asset", { exact: true })).toBeVisible();

    await workspace.locator('input[type="file"]').setInputFiles({
      name: "release.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("release")
    });

    await expect(page.getByText("Connect a target SFTP server on the right first").first()).toBeVisible();
    expect(server.commands).toHaveLength(0);
  });

  test("connects through the SFTP API and navigates remote directories over WebSocket", async ({ page }) => {
    const server = await installSftpBackend(page);
    const table = await connectRemoteSftp(page);

    expect(server.connectionTokenBodies).toHaveLength(1);
    expect(server.connectionTokenBodies[0]).toMatchObject({
      asset: "asset-1",
      protocol: "sftp",
      account: "account-1",
      connect_method: "web_sftp"
    });
    expect(server.websocketUrls).toHaveLength(1);
    expect(server.websocketUrls[0]).toContain("/koko/ws/sftp/?token=sftp-token&ticket=sftp-ticket");

    await expect(table.getByText(".env", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Show hidden files" }).click();
    await expect(table.getByText(".env", { exact: true })).toBeVisible();

    await table.getByRole("button", { name: "docs" }).dblclick();
    await expect(page.getByRole("navigation", { name: "/home/tester/docs" })).toBeVisible();
    await expect(table.getByText("guide.md", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Back" }).click();
    await expect(page.getByRole("navigation", { name: "/home/tester" })).toBeVisible();
    await expect(table.getByText("release.txt", { exact: true })).toBeVisible();

    const listedPaths = server.commands
      .filter((message) => message.cmd === "list")
      .map((message) => (JSON.parse(message.data || "{}") as { path?: string }).path);
    expect(listedPaths).toEqual(["", "/home/tester/docs", "/home/tester"]);
  });

  test("creates and deletes entries through the SFTP mutation workflow", async ({ page }) => {
    const server = await installSftpBackend(page);
    const table = await connectRemoteSftp(page);

    await page.getByRole("button", { name: "New folder" }).click();
    const createDialog = page.getByRole("dialog", { name: "New folder" });
    await createDialog.getByRole("textbox", { name: "New folder" }).fill("artifacts");
    await createDialog.getByRole("button", { name: "Confirm" }).click();
    await expect(table.getByText("artifacts", { exact: true })).toBeVisible();

    await page.getByRole("checkbox", { name: "Select file release.txt" }).check();
    await page.getByRole("toolbar", { name: "1 selected" }).getByRole("button", { name: "Delete" }).click();
    const deleteDialog = page.getByRole("dialog", { name: "Delete" });
    await expect(deleteDialog.getByText("Delete release.txt?")).toBeVisible();
    await deleteDialog.getByRole("button", { name: "Delete" }).click();
    await expect(table.getByText("release.txt", { exact: true })).toHaveCount(0);

    const mutations = server.commands
      .filter((message) => message.cmd === "mkdir" || message.cmd === "rm")
      .map((message) => ({
        command: message.cmd,
        data: JSON.parse(message.data || "{}")
      }));
    expect(mutations).toEqual([
      { command: "mkdir", data: { path: "/home/tester/artifacts" } },
      { command: "rm", data: { path: "/home/tester/release.txt" } }
    ]);
  });
});
