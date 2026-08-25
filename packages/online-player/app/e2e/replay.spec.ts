import type { Page } from "playwright/test";

import { Buffer } from "node:buffer";
import { gzipSync, strToU8 } from "fflate";
import { expect, test } from "playwright/test";

const CAST_BODY = `{"version":2,"width":80,"height":24}\n[0.1,"o","root@host:~# ls\\r\\n"]\n`;
const GUACAMOLE_BODY = [
  "4.size,1.0,3.800,3.600;",
  "4.rect,1.0,3.100,3.100,3.200,3.200;",
  "5.cfill,2.15,1.0,3.255,1.0,1.0,3.255;",
  "4.sync,3.100;",
  "4.sync,4.1100;"
].join("");

interface ReplayFixture {
  type?: string;
  error?: string;
  src?: string;
  user?: string;
  asset?: string;
  account?: string;
  date_start?: string;
  download_url?: string;
}

async function seedAuthenticatedUser(page: Page) {
  await page.addInitScript(() => {
    const site = window.location.origin;
    const organization = { id: "org-1", name: "Demo Org" };
    const user = {
      accountId: site,
      siteName: "Replay E2E",
      name: "Replay Tester",
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

async function installReplayBackend(
  page: Page,
  replay: ReplayFixture,
  extra?: { parts?: boolean; manifestSrc?: string; guacamoleDelayMs?: number; guacamoleBody?: string }
) {
  await page.route("**/mock.cast", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/x-asciicast",
      headers: { "content-disposition": "attachment; filename=mock.cast" },
      body: CAST_BODY
    })
  );
  await page.route("**/mock.cast.gz", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/gzip",
      body: Buffer.from(gzipSync(strToU8(CAST_BODY)))
    })
  );
  await page.route("**/mock.part.gz", async (route) => {
    if (extra?.guacamoleDelayMs) {
      await new Promise((resolve) => setTimeout(resolve, extra.guacamoleDelayMs));
    }
    await route.fulfill({
      status: 200,
      contentType: "application/gzip",
      body: Buffer.from(gzipSync(strToU8(extra?.guacamoleBody || GUACAMOLE_BODY)))
    });
  });
  await page.route("**/mock.replay.gz", async (route) => {
    if (extra?.guacamoleDelayMs) {
      await new Promise((resolve) => setTimeout(resolve, extra.guacamoleDelayMs));
    }
    await route.fulfill({
      status: 200,
      contentType: "application/gzip",
      body: Buffer.from(gzipSync(strToU8(extra?.guacamoleBody || GUACAMOLE_BODY)))
    });
  });
  await page.route("**/mock.replay.json", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "sid-1",
        type: "asciicast",
        date_start: "2026-08-20T14:32:00.000Z",
        files: [{ name: "session.0.cast", size: 1280, duration: 8000, start: 0, end: 8000 }]
      })
    })
  );
  await page.route("**/mock.guacamole.replay.json", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "sid-1",
        type: "guacamole",
        date_start: "2026-08-20T14:32:00.000Z",
        files: [{ name: "session.0.part.gz", size: 1280, duration: 1000, start: 0, end: 1000 }]
      })
    })
  );

  await page.route("**/api/v1/**", async (route) => {
    const { pathname, searchParams } = new URL(route.request().url());
    let body: unknown = {};

    if (pathname.includes("/settings/public/")) {
      body = { SECURITY_WATERMARK_ENABLED: false };
    } else if (pathname.includes("/users/profile/")) {
      body = { name: "Replay Tester", username: "replay" };
    } else if (/\/terminal\/sessions\/[^/]+\/replay\/?$/.test(pathname)) {
      const partFilename = searchParams.get("part_filename");
      if (partFilename) {
        body = partFilename.endsWith(".part.gz")
          ? {
              id: "sid-1",
              type: "guacamole",
              src: "/mock.part.gz",
              user: "alice",
              asset: "windows-prod-01",
              account: "administrator",
              date_start: "2026-08-20T14:32:00.000Z"
            }
          : {
              id: "sid-1",
              type: "asciicast",
              src: "/mock.cast",
              user: "alice",
              asset: "web-prod-01",
              account: "root",
              date_start: "2026-08-20T14:32:00.000Z"
            };
      } else {
        body = extra?.parts
          ? {
              id: "sid-1",
              type: "parts",
              src: extra.manifestSrc || "/mock.replay.json",
              user: "alice",
              asset: "web-prod-01",
              account: "root",
              date_start: "2026-08-20T14:32:00.000Z"
            }
          : replay;
      }
    } else if (/\/terminal\/sessions\/[^/]+\/?$/.test(pathname)) {
      body = {
        asset: "web-prod-01",
        asset_id: "asset-1",
        user: "alice",
        user_id: "user-1",
        account: "root",
        date_start: "2026-08-20T14:32:00.000Z",
        protocol: "ssh"
      };
    } else if (pathname.includes("/terminal/commands/")) {
      body = {
        count: 1,
        results: [
          {
            id: "cmd-1",
            input: "ls -la /var/www",
            timestamp: Date.parse("2026-08-20T14:32:00.500Z") / 1000,
            risk_level: 5
          }
        ]
      };
    } else if (pathname.includes("/users/users/") || pathname.includes("/assets/assets/")) {
      body = { id: "id-1", name: "alice", username: "alice", address: "10.0.0.1" };
    }

    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
}

async function openReplay(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator("[data-replay-root]")).toBeVisible({ timeout: 20_000 });
}

test.describe("online session replay", () => {
  test.beforeEach(async ({ page }) => {
    await seedAuthenticatedUser(page);
  });

  test("shows a converting overlay while the recording is not ready", async ({ page }) => {
    await installReplayBackend(page, {});
    await openReplay(page, "/replay/sid-converting");
    await expect(page.locator("[data-replay-overlay][data-kind=converting]")).toBeVisible();
  });

  test("shows a not-found overlay when Core returns an error", async ({ page }) => {
    await installReplayBackend(page, { error: "missing" });
    await openReplay(page, "/replay/sid-missing");
    await expect(page.locator("[data-replay-overlay][data-kind=not-found]")).toBeVisible();
    await expect(page.getByRole("button", { name: /Reload|重新加载/ })).toBeVisible();
  });

  test("renders session chrome, commands, and the player for asciicast", async ({ page }) => {
    await installReplayBackend(page, {
      type: "asciicast",
      src: "/mock.cast",
      user: "alice",
      asset: "web-prod-01",
      account: "root",
      date_start: "2026-08-20T14:32:00.000Z",
      download_url: "/mock.cast"
    });
    await openReplay(page, "/replay/sid-cast");
    await expect(page.getByText("web-prod-01")).toBeVisible();
    await expect(page.locator("[data-replay-rail]")).toBeHidden();
    await page.locator("[data-replay-command-rail]").click();
    await expect(page.locator("[data-replay-rail]")).toBeVisible();
    await expect(page.getByText("ls -la /var/www")).toBeVisible();
    await expect(page.locator("[data-replay-download]")).toBeVisible();
    await expect(page.locator("[data-replay-download]")).toHaveAttribute("href", "/mock.cast");
    await expect(page.locator(".replay-infobar").getByRole("link")).toHaveCount(0);

    const replayUrl = page.url();
    await page.locator("[data-replay-download]").click();
    await expect(page.locator("[data-replay-root]")).toBeVisible();
    expect(page.url()).toBe(replayUrl);

    const playButton = page.locator(".replay-play-button");
    const restartButton = page.locator(".replay-restart-button");
    const playIcon = playButton.locator("[data-slot=leadingIcon]");
    const restartIcon = restartButton.locator("[data-slot=leadingIcon]");
    const [playBox, playIconBox, restartBox, restartIconBox] = await Promise.all([
      playButton.boundingBox(),
      playIcon.boundingBox(),
      restartButton.boundingBox(),
      restartIcon.boundingBox()
    ]);
    expect(playBox && playIconBox && restartBox && restartIconBox).toBeTruthy();
    expect(playIconBox!.x + playIconBox!.width / 2).toBeCloseTo(playBox!.x + playBox!.width / 2, 1);
    expect(playIconBox!.y + playIconBox!.height / 2).toBeCloseTo(playBox!.y + playBox!.height / 2, 1);
    expect(restartIconBox!.x + restartIconBox!.width / 2).toBeCloseTo(restartBox!.x + restartBox!.width / 2, 1);
    expect(restartIconBox!.y + restartIconBox!.height / 2).toBeCloseTo(restartBox!.y + restartBox!.height / 2, 1);

    const [speedBox, downloadBox, railToggleBox] = await Promise.all([
      page.locator("[data-replay-speed]").boundingBox(),
      page.locator("[data-replay-download]").boundingBox(),
      page.locator("[data-replay-command-rail]").boundingBox()
    ]);
    expect(speedBox && downloadBox && railToggleBox).toBeTruthy();
    expect(speedBox!.height).toBe(32);
    expect(downloadBox!.height).toBe(32);
    expect(railToggleBox!.height).toBe(32);
    expect(downloadBox!.y + downloadBox!.height / 2).toBeCloseTo(speedBox!.y + speedBox!.height / 2, 1);
    expect(railToggleBox!.y + railToggleBox!.height / 2).toBeCloseTo(speedBox!.y + speedBox!.height / 2, 1);
  });

  test("fits asciicast without stretching the player host", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 700 });
    await installReplayBackend(page, {
      type: "asciicast",
      src: "/mock.cast",
      user: "alice",
      asset: "web-prod-01",
      account: "root",
      date_start: "2026-08-20T14:32:00.000Z"
    });
    await openReplay(page, "/replay/sid-cast-fit");

    const root = page.locator("[data-asciicast-root]");
    const host = page.locator("[data-asciicast-host]");
    const player = root.locator(".ap-player");
    await expect(player).toBeVisible();

    const initial = await root.evaluate((element) => {
      const hostElement = element.querySelector<HTMLElement>("[data-asciicast-host]");
      const playerElement = element.querySelector<HTMLElement>(".ap-player");
      const rootBox = element.getBoundingClientRect();
      const playerBox = playerElement?.getBoundingClientRect();
      return {
        hostTransform: hostElement ? getComputedStyle(hostElement).transform : "",
        rootWidth: rootBox.width,
        rootHeight: rootBox.height,
        playerWidth: playerBox?.width || 0,
        playerHeight: playerBox?.height || 0
      };
    });

    expect(initial.hostTransform).toBe("none");
    expect(initial.playerWidth).toBeLessThanOrEqual(initial.rootWidth + 1);
    expect(initial.playerHeight).toBeLessThanOrEqual(initial.rootHeight + 1);

    await page.setViewportSize({ width: 700, height: 700 });
    await expect.poll(async () => (await player.boundingBox())?.width || 0).toBeLessThan(initial.playerWidth);

    const resized = await player.boundingBox();
    const resizedRoot = await root.boundingBox();
    expect(resized && resizedRoot).toBeTruthy();
    expect(resized!.width).toBeLessThanOrEqual(resizedRoot!.width + 1);
    expect(resized!.height).toBeLessThanOrEqual(resizedRoot!.height + 1);
    await expect(host).toHaveCSS("transform", "none");
  });

  test("plays gzip-compressed asciicast recordings", async ({ page }) => {
    await installReplayBackend(page, {
      type: "asciicast",
      src: "/mock.cast.gz",
      user: "alice",
      asset: "web-prod-01",
      account: "root",
      date_start: "2026-08-20T14:32:00.000Z"
    });
    await openReplay(page, "/replay/sid-cast-gzip");

    await expect(page.locator(".ap-player")).toBeVisible();
    await expect(page.locator("[data-asciicast-root]")).toContainText("root@host");
  });

  test("loads legacy gzip-compressed guacamole recordings", async ({ page }) => {
    await installReplayBackend(page, {
      type: "guacamole",
      src: "/mock.replay.gz",
      user: "alice",
      asset: "windows-prod-01",
      account: "administrator",
      date_start: "2026-08-20T14:32:00.000Z"
    });
    await openReplay(page, "/replay/sid-guacamole-gzip");

    await expect(page.locator("[data-guacamole-root]")).toBeVisible();
    await expect(page.locator("[data-replay-stage]")).toContainText("00:01");
    await expect(page.locator("[data-replay-speed]")).toBeEnabled();
  });

  test("changes guacamole playback speed without remounting the player", async ({ page }) => {
    const frames = Array.from({ length: 21 }, (_, index) => {
      const timestamp = String(100 + index * 1000);
      return `4.sync,${timestamp.length}.${timestamp};`;
    }).join("");
    const longRecording = [
      "4.size,1.0,3.800,3.600;",
      "4.rect,1.0,3.100,3.100,3.200,3.200;",
      "5.cfill,2.15,1.0,3.255,1.0,1.0,3.255;",
      frames
    ].join("");
    await installReplayBackend(
      page,
      {
        type: "guacamole",
        src: "/mock.replay.gz",
        user: "alice",
        asset: "windows-prod-01",
        account: "administrator",
        date_start: "2026-08-20T14:32:00.000Z"
      },
      { guacamoleBody: longRecording }
    );
    await openReplay(page, "/replay/sid-guacamole-speed");

    const root = page.locator("[data-guacamole-root]");
    const speed = page.locator("[data-replay-speed]");
    await expect(root).toBeVisible();
    await expect(speed).toBeEnabled();
    await expect(speed).toHaveText("1.0×");

    await speed.click();
    await page.getByRole("menuitem", { name: "2.0×" }).click();
    await expect(speed).toHaveText("2.0×");
    await expect(root).toBeVisible();
  });

  test("queues early guacamole command seeks and keeps play controls in sync", async ({ page }) => {
    const frames = Array.from({ length: 21 }, (_, index) => {
      const timestamp = String(100 + index * 1000);
      return `4.sync,${timestamp.length}.${timestamp};`;
    }).join("");
    const longRecording = [
      "4.size,1.0,3.800,3.600;",
      "4.rect,1.0,3.100,3.100,3.200,3.200;",
      "5.cfill,2.15,1.0,3.255,1.0,1.0,3.255;",
      frames
    ].join("");
    await installReplayBackend(
      page,
      {
        type: "guacamole",
        src: "/mock.replay.gz",
        user: "alice",
        asset: "windows-prod-01",
        account: "administrator",
        date_start: "2026-08-20T14:32:00.000Z"
      },
      { guacamoleDelayMs: 1000, guacamoleBody: longRecording }
    );
    await openReplay(page, "/replay/sid-guacamole-controls");

    const rail = page.locator("[data-replay-rail]");
    const railToggle = page.locator("[data-replay-command-rail]");
    const playButton = page.locator(".replay-play-button");
    await expect(rail).toBeHidden();
    await railToggle.click();
    await rail.getByText("ls -la /var/www").click();
    await expect(page.locator(".replay-seek")).toBeVisible();
    await expect(page.locator(".replay-seek")).toBeHidden({ timeout: 5000 });

    await expect(playButton).toHaveAttribute("aria-label", /Pause|暂停/);
    await playButton.click();
    await expect(playButton).toHaveAttribute("aria-label", /Play|播放/);
    await playButton.click();
    await expect(playButton).toHaveAttribute("aria-label", /Pause|暂停/);
  });

  test("fills the stage with an aspect-ratio-safe guacamole viewport", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await installReplayBackend(page, {
      type: "guacamole",
      src: "/mock.replay.gz",
      user: "alice",
      asset: "windows-prod-01",
      account: "administrator",
      date_start: "2026-08-20T14:32:00.000Z"
    });
    await openReplay(page, "/replay/sid-guacamole-fit");

    const frame = page.locator(".replay-frame");
    const root = page.locator("[data-guacamole-root]");
    const viewport = page.locator("[data-guacamole-viewport]");
    const controls = page.locator("[data-replay-controls]");
    const progress = page.locator("[data-replay-progress]");
    const progressTrack = progress.locator('[data-slot="track"]');
    const progressRange = progress.locator('[data-slot="range"]');
    const commandMarker = progress.locator(".replay-command-marker");
    const commandRail = page.locator("[data-replay-rail]");
    const commandRailToggle = page.locator("[data-replay-command-rail]");
    await expect(viewport).toBeVisible();
    await expect(controls).toBeVisible();
    await expect(commandMarker).toBeVisible();
    await expect(commandRail).toBeHidden();
    await expect(commandRailToggle).toBeVisible();
    await commandRailToggle.click();
    await expect(commandRail).toBeVisible();
    await page.waitForTimeout(700);

    const measure = async () => {
      const [frameBox, rootBox, viewportBox] = await Promise.all([
        frame.boundingBox(),
        root.boundingBox(),
        viewport.boundingBox()
      ]);
      expect(frameBox && rootBox && viewportBox).toBeTruthy();
      return { frame: frameBox!, root: rootBox!, viewport: viewportBox! };
    };

    const initial = await measure();
    expect(initial.root.width).toBeCloseTo(initial.frame.width, 0);
    expect(initial.root.height).toBeCloseTo(initial.frame.height, 0);
    expect(initial.viewport.width).toBeLessThanOrEqual(initial.root.width + 1);
    expect(initial.viewport.height).toBeLessThanOrEqual(initial.root.height + 1);
    expect(initial.viewport.width / initial.viewport.height).toBeCloseTo(4 / 3, 2);
    expect(
      Math.min(
        Math.abs(initial.viewport.width - initial.root.width),
        Math.abs(initial.viewport.height - initial.root.height)
      )
    ).toBeLessThanOrEqual(1);

    const controlsBox = await controls.boundingBox();
    const progressBox = await progress.boundingBox();
    const progressTrackBox = await progressTrack.boundingBox();
    const progressRangeBox = await progressRange.boundingBox();
    expect(controlsBox).toBeTruthy();
    expect(progressBox).toBeTruthy();
    expect(progressTrackBox).toBeTruthy();
    expect(progressRangeBox).toBeTruthy();
    expect(initial.root.y + initial.root.height).toBeLessThanOrEqual(controlsBox!.y + 1);
    expect(controlsBox!.height).toBeGreaterThanOrEqual(69);
    expect(controlsBox!.height).toBeLessThanOrEqual(71);
    expect(progressBox!.height).toBe(6);
    expect(progressTrackBox!.height).toBe(6);
    expect(progressRangeBox!.y).toBeCloseTo(progressTrackBox!.y, 1);
    expect(progressRangeBox!.height).toBeCloseTo(progressTrackBox!.height, 1);
    await expect(progressTrack).toHaveCSS("border-radius", "0px");
    await expect(progressRange).toHaveCSS("border-radius", "0px");
    await expect(controls).toHaveCSS("border-top-width", "0px");
    await expect(progress).toHaveCSS("border-bottom-width", "0px");
    expect((await commandRailToggle.boundingBox())?.height).toBe(32);

    await commandMarker.hover();
    await expect(commandMarker.locator(".replay-command-marker-label")).toHaveCSS("opacity", "1");
    await commandMarker.click();
    await expect(commandMarker).toHaveClass(/is-active/);

    await commandRailToggle.click();
    await expect(commandRail).toBeHidden();
    await commandRailToggle.click();
    await expect(commandRail).toBeVisible();

    await page.setViewportSize({ width: 900, height: 700 });
    await expect.poll(async () => (await root.boundingBox())?.width || 0).toBeLessThan(initial.root.width);

    const resized = await measure();
    expect(resized.viewport.width).toBeLessThanOrEqual(resized.root.width + 1);
    expect(resized.viewport.height).toBeLessThanOrEqual(resized.root.height + 1);
    expect(resized.viewport.width / resized.viewport.height).toBeCloseTo(4 / 3, 2);
    expect(
      Math.min(
        Math.abs(resized.viewport.width - resized.root.width),
        Math.abs(resized.viewport.height - resized.root.height)
      )
    ).toBeLessThanOrEqual(1);
  });

  test("loads segmented gzip-compressed guacamole recordings", async ({ page }) => {
    await installReplayBackend(
      page,
      {
        type: "parts",
        src: "/mock.guacamole.replay.json"
      },
      { parts: true, manifestSrc: "/mock.guacamole.replay.json" }
    );
    await openReplay(page, "/replay/sid-guacamole-parts-gzip");

    await expect(page.locator("[data-replay-parts]")).toBeVisible();
    await expect(page.locator("[data-rail-tab=parts]")).toHaveCount(0);
    await expect(page.locator("[data-guacamole-root]")).toBeVisible();
    await expect(page.locator("[data-replay-stage]")).toContainText("00:01");
  });

  test("inherits the application theme tokens", async ({ page }) => {
    await installReplayBackend(page, {
      type: "asciicast",
      src: "/mock.cast",
      user: "alice",
      asset: "web-prod-01",
      account: "root",
      date_start: "2026-08-20T14:32:00.000Z"
    });
    await openReplay(page, "/replay/sid-theme");

    const colors = await page.locator("[data-replay-root]").evaluate((shell) => {
      const resolveColor = (token: string) => {
        const probe = document.createElement("span");
        probe.style.color = `var(${token})`;
        document.body.appendChild(probe);
        const color = getComputedStyle(probe).color;
        probe.remove();
        return color;
      };
      const stage = shell.querySelector<HTMLElement>("[data-replay-stage]");
      const rail = shell.querySelector<HTMLElement>("[data-replay-rail]");
      const controls = shell.querySelector<HTMLElement>("[data-replay-controls]");

      return {
        shellForeground: getComputedStyle(shell).color,
        appForeground: resolveColor("--app-text-primary"),
        stageBackground: stage ? getComputedStyle(stage).backgroundColor : "",
        workspaceBackground: resolveColor("--workspace-surface-background"),
        railBackground: rail ? getComputedStyle(rail).backgroundColor : "",
        workspaceSidebar: resolveColor("--workspace-surface-sidebar"),
        controlsBackground: controls ? getComputedStyle(controls).backgroundColor : "",
        replayControl: resolveColor("--replay-control")
      };
    });

    expect(colors.shellForeground).toBe(colors.appForeground);
    expect(colors.stageBackground).toBe(colors.workspaceBackground);
    expect(colors.railBackground).toBe(colors.workspaceSidebar);
    expect(colors.controlsBackground).toBe(colors.replayControl);
  });

  test("moves the parts playlist into the bottom controls", async ({ page }) => {
    await installReplayBackend(
      page,
      {
        type: "parts",
        src: "/mock.replay.json"
      },
      { parts: true }
    );
    await openReplay(page, "/replay/sid-parts");
    const partsButton = page.locator("[data-replay-parts]");
    const controls = page.locator("[data-replay-controls]");
    await expect(partsButton).toBeVisible();
    await expect(page.locator("[data-rail-tab=parts]")).toHaveCount(0);
    await partsButton.click();
    await expect(page.locator("[data-replay-part]")).toHaveCount(1);
    await expect(page.locator("[data-replay-part]")).toContainText("session.0.cast");
    await page.locator("[data-replay-command-rail]").click();
    await expect(page.getByText("ls -la /var/www")).toBeVisible();

    const [partsBox, controlsBox] = await Promise.all([partsButton.boundingBox(), controls.boundingBox()]);
    expect(partsBox && controlsBox).toBeTruthy();
    expect(partsBox!.height).toBe(32);
    expect(partsBox!.x).toBeGreaterThan(controlsBox!.x + controlsBox!.width / 2);
  });

  test("stacks the command rail under the stage on a narrow viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installReplayBackend(page, {
      type: "asciicast",
      src: "/mock.cast",
      user: "alice",
      asset: "web-prod-01",
      account: "root",
      date_start: "2026-08-20T14:32:00.000Z"
    });
    await page.goto("/replay/sid-mobile");
    const stage = page.locator("[data-replay-stage]");
    const rail = page.locator("[data-replay-rail]");
    await expect(stage).toBeVisible();
    await expect(rail).toBeHidden();
    await page.locator("[data-replay-command-rail]").click();
    await expect(rail).toBeVisible();
    const stageBox = await stage.boundingBox();
    const railBox = await rail.boundingBox();
    expect(stageBox && railBox).toBeTruthy();
    expect(railBox!.y).toBeGreaterThan(stageBox!.y);
  });
});
