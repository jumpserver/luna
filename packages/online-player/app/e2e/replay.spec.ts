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
  extra?: {
    parts?: boolean;
    manifestSrc?: string;
    guacamoleDelayMs?: number;
    guacamoleBody?: string;
    castBody?: string;
    index?: unknown;
    indexStatus?: number;
    mp4Parts?: boolean;
  }
) {
  await page.route("**/mock.cast", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/x-asciicast",
      headers: { "content-disposition": "attachment; filename=mock.cast" },
      body: extra?.castBody || CAST_BODY
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
  await page.route("**/mock.mp4*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "video/mp4",
      body: Buffer.alloc(0)
    })
  );
  await page.route("**/mock.replay", async (route) => {
    if (extra?.guacamoleDelayMs) {
      await new Promise((resolve) => setTimeout(resolve, extra.guacamoleDelayMs));
    }
    await route.fulfill({
      status: 200,
      contentType: "text/plain",
      body: extra?.guacamoleBody || GUACAMOLE_BODY
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
  await page.route("**/mock.mp4.replay.json", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "sid-1",
        type: "mp4",
        files: [
          { name: "session.0.part.mp4", size: 1280, duration: 80_000, start: 0, end: 80_000 },
          { name: "session.1.part.mp4", size: 1280, duration: 40_000, start: 80_000, end: 120_000 }
        ]
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
    } else if (/\/terminal\/sessions\/[^/]+\/replay-index\/?$/.test(pathname)) {
      await route.fulfill({
        status: extra?.indexStatus || (extra?.index ? 200 : 404),
        contentType: "application/json",
        body: JSON.stringify(extra?.index || { detail: "No recording index" })
      });
      return;
    } else if (/\/terminal\/sessions\/[^/]+\/replay\/?$/.test(pathname)) {
      const partFilename = searchParams.get("part_filename");
      if (partFilename) {
        body =
          extra?.mp4Parts && partFilename.endsWith(".part.mp4")
            ? {
                id: "sid-1",
                type: "mp4",
                src: `/mock.mp4?part=${partFilename}`,
                user: "alice",
                asset: "windows-prod-01",
                account: "administrator"
              }
            : partFilename.endsWith(".part.gz")
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

async function mockMp4Seekability(page: Page, duration: number, position: number, seekableEnd: number) {
  const video = page.locator(".replay-frame video");
  await video.evaluate(
    (element, options) => {
      const mock = element as HTMLVideoElement & { mockSeekableEnd: number; mockReloads: number };
      mock.mockSeekableEnd = options.seekableEnd;
      mock.mockReloads = 0;
      Object.defineProperty(mock, "duration", { configurable: true, value: options.duration });
      Object.defineProperty(mock, "currentTime", { configurable: true, writable: true, value: options.position });
      Object.defineProperty(mock, "readyState", { configurable: true, value: 4 });
      Object.defineProperty(mock, "buffered", {
        configurable: true,
        get: () => ({ length: 1, start: () => 0, end: () => options.duration })
      });
      Object.defineProperty(mock, "seekable", {
        configurable: true,
        get: () => ({ length: 1, start: () => 0, end: () => mock.mockSeekableEnd })
      });
      Object.defineProperty(mock, "load", {
        configurable: true,
        value: () => {
          mock.mockReloads += 1;
        }
      });
      mock.dispatchEvent(new Event("loadedmetadata"));
      mock.dispatchEvent(new Event("timeupdate"));
    },
    { duration, position, seekableEnd }
  );
  return video;
}

function indexWithTimes(sessionId: string, times: number[]) {
  return {
    schema: "jumpserver.recording-index",
    version: 1,
    session: { id: sessionId },
    source: { duration_ms: 59_938, part_count: 1 },
    event_count: times.length,
    events: times.map((replayMs, ordinal) => ({
      ordinal,
      kind: "screen_text",
      replay_ms: replayMs,
      part_index: 0,
      local_ms: replayMs,
      ocr: { text: `Event at ${replayMs}`, delta_text: `Event at ${replayMs}`, confidence: 95 }
    }))
  };
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

  test("fills the asciicast player to the stage", async ({ page }) => {
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
    expect(initial.playerWidth).toBeCloseTo(initial.rootWidth, 0);
    expect(initial.playerHeight).toBeCloseTo(initial.rootHeight, 0);

    await page.setViewportSize({ width: 700, height: 700 });
    await expect.poll(async () => (await player.boundingBox())?.width || 0).toBeLessThan(initial.playerWidth);

    const resized = await player.boundingBox();
    const resizedRoot = await root.boundingBox();
    expect(resized && resizedRoot).toBeTruthy();
    expect(resized!.width).toBeCloseTo(resizedRoot!.width, 0);
    expect(resized!.height).toBeCloseTo(resizedRoot!.height, 0);
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

  test("streams uncompressed guacamole recordings over HTTP", async ({ page }) => {
    await installReplayBackend(page, {
      type: "guacamole",
      src: "/mock.replay",
      user: "alice",
      asset: "windows-prod-01",
      account: "administrator",
      date_start: "2026-08-20T14:32:00.000Z"
    });
    await openReplay(page, "/replay/sid-guacamole-stream");

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

  test("changes asciicast playback speed without remounting or resizing the player", async ({ page }) => {
    const longCast = [
      '{"version":2,"width":80,"height":24}',
      ...Array.from({ length: 21 }, (_, index) => `[${index},"o","line ${index}\\r\\n"]`)
    ].join("\n");
    await installReplayBackend(
      page,
      {
        type: "asciicast",
        src: "/mock.cast",
        user: "alice",
        asset: "web-prod-01",
        account: "root",
        date_start: "2026-08-20T14:32:00.000Z"
      },
      { castBody: longCast }
    );
    await openReplay(page, "/replay/sid-asciicast-speed");

    const root = page.locator("[data-asciicast-root]");
    const speed = page.locator("[data-replay-speed]");
    const player = root.locator(".ap-player");
    await expect(player).toBeVisible();
    await player.evaluate((element) => element.setAttribute("data-speed-instance", "original"));
    const before = await player.boundingBox();

    await speed.click();
    await page.getByRole("menuitem", { name: "2.0×" }).click();
    await expect(speed).toHaveText("2.0×");
    await page.waitForTimeout(100);

    const originalPlayer = root.locator('.ap-player[data-speed-instance="original"]');
    await expect(originalPlayer).toBeVisible();
    const after = await originalPlayer.boundingBox();
    expect(before && after).toBeTruthy();
    expect(after!.width).toBeCloseTo(before!.width, 1);
    expect(after!.height).toBeCloseTo(before!.height, 1);
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

  test("stretches the guacamole display to fill the stage", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
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
      {
        guacamoleBody: [
          "4.size,1.0,3.800,3.600;",
          "4.rect,1.0,1.0,1.0,3.800,3.600;",
          "5.cfill,2.15,1.0,3.255,1.0,1.0,3.255;",
          "4.sync,3.100;",
          "4.sync,4.1100;"
        ].join("")
      }
    );
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
      const displayBox = await viewport.evaluate((element) => {
        const display = element.firstElementChild?.firstElementChild as HTMLElement | null;
        return display?.getBoundingClientRect().toJSON() ?? null;
      });
      expect(frameBox && rootBox && viewportBox && displayBox).toBeTruthy();
      return { frame: frameBox!, root: rootBox!, viewport: viewportBox!, display: displayBox! };
    };

    const initial = await measure();
    expect(initial.root.width).toBeCloseTo(initial.frame.width, 0);
    expect(initial.root.height).toBeCloseTo(initial.frame.height, 0);
    expect(initial.viewport.width).toBeCloseTo(initial.root.width, 0);
    expect(initial.viewport.height).toBeCloseTo(initial.root.height, 0);
    expect(initial.display.width).toBeCloseTo(initial.viewport.width, 0);
    expect(initial.display.height).toBeCloseTo(initial.viewport.height, 0);

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
    expect(resized.viewport.width).toBeCloseTo(resized.root.width, 0);
    expect(resized.viewport.height).toBeCloseTo(resized.root.height, 0);
    expect(resized.display.width).toBeCloseTo(resized.viewport.width, 0);
    expect(resized.display.height).toBeCloseTo(resized.viewport.height, 0);
  });

  test("fills the stage with mp4 instead of a cinema card", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await installReplayBackend(page, {
      type: "mp4",
      src: "/mock.mp4",
      user: "alice",
      asset: "windows-prod-01",
      account: "administrator",
      date_start: "2026-08-20T14:32:00.000Z"
    });
    await openReplay(page, "/replay/sid-mp4-fit");

    const frame = page.locator(".replay-frame");
    const controls = page.locator("[data-replay-controls]");
    await expect(frame).toBeVisible();
    await expect(controls).toBeVisible();

    const sizes = await frame.evaluate((element) => {
      const inner = element.firstElementChild as HTMLElement | null;
      const frameBox = element.getBoundingClientRect();
      const innerBox = inner?.getBoundingClientRect();
      const innerStyle = inner ? getComputedStyle(inner) : null;
      return {
        frameWidth: frameBox.width,
        frameHeight: frameBox.height,
        innerWidth: innerBox?.width || 0,
        innerHeight: innerBox?.height || 0,
        innerMaxHeight: innerStyle?.maxHeight || "",
        innerMaxWidth: innerStyle?.maxWidth || ""
      };
    });

    expect(sizes.innerWidth).toBeCloseTo(sizes.frameWidth, 0);
    expect(sizes.innerHeight).toBeCloseTo(sizes.frameHeight, 0);
    expect(sizes.innerMaxHeight).toBe("none");
    expect(sizes.innerMaxWidth).toBe("none");
    expect(sizes.innerHeight).toBeGreaterThan(680);

    const frameBox = await frame.boundingBox();
    const controlsBox = await controls.boundingBox();
    expect(frameBox && controlsBox).toBeTruthy();
    expect(frameBox!.y + frameBox!.height).toBeLessThanOrEqual(controlsBox!.y + 1);
  });

  test("searches OCR evidence and seeks to exact indexed time", async ({ page }) => {
    await installReplayBackend(
      page,
      { type: "mp4", src: "/mock.mp4", asset: "windows-prod-01" },
      {
        index: {
          schema: "jumpserver.recording-index",
          version: 1,
          session: { id: "sid-mp4-index" },
          source: { duration_ms: 121_965, part_count: 1 },
          event_count: 2,
          events: [
            {
              ordinal: 0,
              kind: "screen_text",
              replay_ms: 1842,
              part_index: 0,
              local_ms: 1842,
              timeline_marker: false,
              timeline_reason: "dense_browser_text",
              ocr: { text: "Edge | Example article content", delta_text: "Example article content", confidence: 95 }
            },
            {
              ordinal: 1,
              kind: "screen_text",
              replay_ms: 84_900,
              part_index: 0,
              local_ms: 84_900,
              ocr: { text: "RDP recording and index validation", delta_text: "index validation", confidence: 96 }
            }
          ]
        }
      }
    );
    await openReplay(page, "/replay/sid-mp4-index");

    await expect(page.locator("[data-replay-rail]")).toBeVisible();
    await expect(page.locator("[data-rail-tab=index]")).toBeVisible();
    await expect(page.locator("[data-replay-index-events] .replay-index-event")).toHaveCount(2);
    await expect(page.locator("[data-replay-rail]")).toContainText(/OCR observations|OCR 观察/);

    const video = await mockMp4Seekability(page, 122, 0, 122);
    await expect(page.locator(".replay-index-marker")).toHaveCount(1);

    await page.locator("[data-replay-index-search]").fill("Example article");
    await expect(page.locator("[data-replay-index-events] .replay-index-event")).toHaveCount(1);
    await page.locator(".replay-index-event").click();
    expect(await video.evaluate((element) => (element as HTMLVideoElement).currentTime)).toBe(1.842);
    await video.dispatchEvent("seeked");

    await page.locator("[data-replay-index-search]").fill("RDP recording");
    await expect(page.locator("[data-replay-index-events] .replay-index-event")).toHaveCount(1);
    const indexedEvent = page.locator(".replay-index-event[data-replay-ms='84900']");
    await expect(indexedEvent).toContainText("RDP recording");
    await indexedEvent.click();
    expect(await video.evaluate((element) => (element as HTMLVideoElement).currentTime)).toBe(84.9);
    await video.dispatchEvent("seeked");

    await page.locator("[data-replay-index-search]").fill("missing phrase");
    await expect(page.locator("[data-replay-index-empty]")).toBeVisible();
    await page.locator("[data-replay-index-search]").fill("");
    await page.locator(".replay-index-marker").last().click();
    expect(await video.evaluate((element) => (element as HTMLVideoElement).currentTime)).toBe(84.9);
    await video.dispatchEvent("seeked");
  });

  test("waits for a real seekable range and honors the latest index selection", async ({ page }) => {
    await installReplayBackend(
      page,
      { type: "mp4", src: "/mock.mp4" },
      {
        index: indexWithTimes("sid-seek-range", [20_000, 52_845])
      }
    );
    await openReplay(page, "/replay/sid-seek-range");
    const video = await mockMp4Seekability(page, 59.938, 10, 0);
    const events = page.locator(".replay-index-event");
    await expect(events).toHaveCount(2);

    await events.first().click();
    await expect(page.locator(".replay-seek")).toContainText(/Waiting for the recording|正在等待录像/);
    await events.last().click();
    await expect(page.locator(".replay-seek")).toBeVisible();
    expect(await video.evaluate((element) => (element as HTMLVideoElement).currentTime)).toBe(10);
    await expect(page.locator(".replay-index-event.is-active")).toHaveCount(0);

    await video.evaluate((element) => {
      (element as HTMLVideoElement & { mockSeekableEnd: number }).mockSeekableEnd = 59.938;
      element.dispatchEvent(new Event("progress"));
    });
    await expect.poll(() => video.evaluate((element) => (element as HTMLVideoElement).currentTime)).toBe(52.845);
    await expect(page.locator(".replay-index-event.is-active")).toHaveCount(0);
    await video.dispatchEvent("seeked");
    await expect(page.locator(".replay-seek")).toBeHidden();
    await expect(events.last()).toHaveClass(/is-active/);
    expect(await video.evaluate((element) => (element as HTMLVideoElement & { mockReloads: number }).mockReloads)).toBe(
      0
    );
  });

  test("does not accept a seeked event that bounced to zero and allows cancellation", async ({ page }) => {
    await installReplayBackend(
      page,
      { type: "mp4", src: "/mock.mp4" },
      {
        index: indexWithTimes("sid-seek-bounce", [52_845])
      }
    );
    await openReplay(page, "/replay/sid-seek-bounce");
    const video = await mockMp4Seekability(page, 59.938, 10, 59.938);
    await page.locator(".replay-index-event").click();
    await expect.poll(() => video.evaluate((element) => (element as HTMLVideoElement).currentTime)).toBe(52.845);
    await video.evaluate((element) => {
      (element as HTMLVideoElement).currentTime = 0;
      element.dispatchEvent(new Event("seeked"));
    });
    await expect(page.locator(".replay-seek")).toBeVisible();
    await expect(page.locator(".replay-index-event.is-active")).toHaveCount(0);
    await page
      .locator(".replay-seek")
      .getByRole("button", { name: /Cancel|取消/ })
      .click();
    await expect(page.locator(".replay-seek")).toBeHidden();
    await expect(page.locator(".replay-index-event.is-active")).toHaveCount(0);
  });

  test("reports an unavailable range instead of pretending the index jump succeeded", async ({ page }) => {
    await installReplayBackend(
      page,
      { type: "mp4", src: "/mock.mp4" },
      {
        index: indexWithTimes("sid-seek-timeout", [52_845])
      }
    );
    await openReplay(page, "/replay/sid-seek-timeout");
    const video = await mockMp4Seekability(page, 59.938, 10, 0);
    await page.locator(".replay-index-event").click();
    await expect(page.locator(".replay-seek")).toBeVisible();
    await expect(page.locator(".replay-stage")).toContainText(/not seekable yet|尚无法跳转/, { timeout: 16_000 });
    await expect(page.locator(".replay-seek")).toBeHidden();
    await expect(page.locator(".replay-index-event.is-active")).toHaveCount(0);
    expect(await video.evaluate((element) => (element as HTMLVideoElement).currentTime)).toBe(10);
    expect(await video.evaluate((element) => (element as HTMLVideoElement & { mockReloads: number }).mockReloads)).toBe(
      1
    );
  });

  test("discards a deferred seek when the player is replaced", async ({ page }) => {
    await installReplayBackend(
      page,
      { type: "mp4", src: "/mock.mp4" },
      {
        index: indexWithTimes("sid-seek-unmount", [52_845])
      }
    );
    await openReplay(page, "/replay/sid-seek-unmount");
    await mockMp4Seekability(page, 59.938, 10, 0);
    await page.locator(".replay-index-event").click();
    await expect(page.locator(".replay-seek")).toBeVisible();
    await page.goto("/replay/sid-after-unmount");
    await expect(page.locator(".replay-frame video")).toBeVisible();
    const nextVideo = await mockMp4Seekability(page, 59.938, 0, 59.938);
    await expect(page.locator(".replay-seek")).toBeHidden();
    expect(await nextVideo.evaluate((element) => (element as HTMLVideoElement).currentTime)).toBe(0);
  });

  test("leaves command replay working when no OCR index exists", async ({ page }) => {
    await installReplayBackend(page, { type: "mp4", src: "/mock.mp4" });
    await openReplay(page, "/replay/sid-no-index");
    await expect(page.locator("[data-rail-tab=index]")).toHaveCount(0);
    await page.locator("[data-replay-command-rail]").click();
    await expect(page.locator("[data-replay-rail]")).toContainText("ls -la /var/www");
  });

  test("plays an old parts manifest when CE has no replay-index route", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await installReplayBackend(
      page,
      { type: "parts", src: "/mock.guacamole.replay.json" },
      { parts: true, manifestSrc: "/mock.guacamole.replay.json" }
    );
    // A CE deployment without this API route may return an HTML 404 rather
    // than the JSON 404 produced when a modern Core has no index object.
    await page.route(/\/terminal\/sessions\/[^/]+\/replay-index\/?$/, (route) =>
      route.fulfill({ status: 404, contentType: "text/html", body: "<html><body>Not Found</body></html>" })
    );
    const indexResponse = page.waitForResponse((response) => response.url().includes("/replay-index/"));
    await openReplay(page, "/replay/sid-legacy-parts-no-index");
    expect((await indexResponse).status()).toBe(404);

    await expect(page.locator("[data-guacamole-root]")).toBeVisible();
    await expect(page.locator("[data-replay-parts]")).toBeVisible();
    await expect(page.locator("[data-replay-controls]")).toBeVisible();
    await expect(page.locator("[data-replay-overlay]")).toHaveCount(0);
    await expect(page.locator("[data-rail-tab=index]")).toHaveCount(0);
    await expect(page.locator("[data-replay-index-error]")).toHaveCount(0);

    await page.locator("[data-replay-command-rail]").click();
    await expect(page.locator("[data-replay-rail]")).toContainText("ls -la /var/www");
    expect(pageErrors).toEqual([]);
  });

  test("shows an empty index and a retryable index error", async ({ page }) => {
    await installReplayBackend(
      page,
      { type: "mp4", src: "/mock.mp4" },
      {
        index: {
          schema: "jumpserver.recording-index",
          version: 1,
          session: { id: "sid-empty-index" },
          source: { duration_ms: 120_000, part_count: 1 },
          event_count: 0,
          events: []
        }
      }
    );
    await openReplay(page, "/replay/sid-empty-index");
    await expect(page.locator("[data-replay-index-empty]")).toBeVisible();

    await installReplayBackend(page, { type: "mp4", src: "/mock.mp4" }, { indexStatus: 503 });
    await openReplay(page, "/replay/sid-index-error");
    await expect(page.locator("[data-replay-index-error]")).toBeVisible();
    await expect(
      page.locator("[data-replay-index-error]").getByRole("button", { name: /Reload|重新加载/ })
    ).toBeVisible();
  });

  test("maps a cross-segment index event to its part-local timestamp", async ({ page }) => {
    await installReplayBackend(
      page,
      { type: "parts", src: "/mock.mp4.replay.json" },
      {
        parts: true,
        mp4Parts: true,
        manifestSrc: "/mock.mp4.replay.json",
        index: {
          schema: "jumpserver.recording-index",
          version: 1,
          session: { id: "sid-mp4-parts-index" },
          source: { duration_ms: 120_000, part_count: 2 },
          event_count: 1,
          events: [
            {
              ordinal: 0,
              kind: "screen_text",
              replay_ms: 84_900,
              part_index: 1,
              local_ms: 4_900,
              ocr: { text: "Second segment event", delta_text: "Second segment event", confidence: 92 }
            }
          ]
        }
      }
    );
    await openReplay(page, "/replay/sid-mp4-parts-index");
    await expect(page.locator("[data-replay-index-events] .replay-index-event")).toHaveCount(1);
    await expect(page.locator(".replay-frame video")).toHaveAttribute("src", /session\.0\.part\.mp4/);
    await page.locator(".replay-index-event").click();
    const targetVideo = page.locator(".replay-frame video");
    await expect(targetVideo).toHaveAttribute("src", /session\.1\.part\.mp4/);
    await mockMp4Seekability(page, 40, 0, 40);
    expect(await targetVideo.evaluate((element) => (element as HTMLVideoElement).currentTime)).toBe(4.9);
    await targetVideo.dispatchEvent("seeked");
  });

  test("clears mp4 seeking state after seeked or media error", async ({ page }) => {
    await installReplayBackend(page, { type: "mp4", src: "/mock.mp4" });
    await openReplay(page, "/replay/sid-mp4-seeking");

    const video = page.locator(".replay-frame video");
    const seeking = page.locator(".replay-seek");
    await expect(video).toBeVisible();

    await video.dispatchEvent("seeking");
    await expect(seeking).toBeVisible();
    await video.dispatchEvent("seeked");
    await expect(seeking).toBeHidden();

    await video.dispatchEvent("seeking");
    await expect(seeking).toBeVisible();
    await video.evaluate((element) => element.dispatchEvent(new Event("error", { bubbles: false })));
    await expect(seeking).toBeHidden();
    const stage = page.locator(".replay-stage");
    await expect(stage).toContainText(/Playback failed|播放失败/);
    await expect(stage).not.toContainText("[object Event]");
  });

  test("reflects actual mp4 playback after waiting or a deep-link seek", async ({ page }) => {
    await installReplayBackend(page, { type: "mp4", src: "/mock.mp4" });
    await openReplay(page, "/replay/sid-mp4-playback?timestamp=85");

    const video = page.locator(".replay-frame video");
    const playButton = page.locator(".replay-play-button");
    await expect(video).toBeVisible();
    await expect(playButton).toHaveAttribute("aria-label", /Play|播放/);

    await video.dispatchEvent("play");
    await expect(playButton).toHaveAttribute("aria-label", /Play|播放/);
    await video.dispatchEvent("playing");
    await expect(playButton).toHaveAttribute("aria-label", /Pause|暂停/);
    await video.dispatchEvent("pause");
    await expect(playButton).toHaveAttribute("aria-label", /Play|播放/);
    await video.dispatchEvent("playing");
    await video.dispatchEvent("seeking");
    await expect(playButton).toHaveAttribute("aria-label", /Play|播放/);
    await video.dispatchEvent("seeked");
    await video.dispatchEvent("waiting");
    await expect(playButton).toHaveAttribute("aria-label", /Play|播放/);
    await video.dispatchEvent("playing");
    await expect(playButton).toHaveAttribute("aria-label", /Pause|暂停/);
    await video.dispatchEvent("ended");
    await expect(playButton).toHaveAttribute("aria-label", /Play|播放/);
  });

  test("keeps play available when the initial mp4 seek cannot autoplay", async ({ page }) => {
    await page.addInitScript(() => {
      HTMLMediaElement.prototype.play = function () {
        const element = this as HTMLMediaElement & { rejectedPlayCount?: number };
        element.rejectedPlayCount = (element.rejectedPlayCount || 0) + 1;
        return Promise.reject(new DOMException("Autoplay blocked", "NotAllowedError"));
      };
    });
    await installReplayBackend(page, { type: "mp4", src: "/mock.mp4" });
    await openReplay(page, "/replay/sid-mp4-autoplay?timestamp=85");

    const video = page.locator(".replay-frame video");
    const playButton = page.locator(".replay-play-button");
    await mockMp4Seekability(page, 122, 0, 122);
    expect(await video.evaluate((element) => (element as HTMLVideoElement).currentTime)).toBe(80);
    const playCallsBeforeSeeked = await video.evaluate(
      (element) => (element as HTMLVideoElement & { rejectedPlayCount?: number }).rejectedPlayCount || 0
    );
    await video.dispatchEvent("seeked");
    await expect
      .poll(() =>
        video.evaluate(
          (element) => (element as HTMLVideoElement & { rejectedPlayCount?: number }).rejectedPlayCount || 0
        )
      )
      .toBeGreaterThan(playCallsBeforeSeeked);
    await expect(playButton).toHaveAttribute("aria-label", /Play|播放/);
    await expect(playButton).toBeEnabled();
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
