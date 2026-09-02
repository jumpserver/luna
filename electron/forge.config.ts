import type { ForgeConfig } from "@electron-forge/shared-types";
import { existsSync } from "node:fs";
import { cp, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MakerDeb } from "@electron-forge/maker-deb";
import { MakerDMG } from "@electron-forge/maker-dmg";
import { MakerRpm } from "@electron-forge/maker-rpm";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { MakerWix } from "@electron-forge/maker-wix";
import { MakerZIP } from "@electron-forge/maker-zip";
import { AutoUnpackNativesPlugin } from "@electron-forge/plugin-auto-unpack-natives";
import { VitePlugin } from "@electron-forge/plugin-vite";

const electronRoot = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(electronRoot, "..");
const iconsRoot = path.join(electronRoot, "assets", "icons");
const stagedResources = path.join(repositoryRoot, ".electron-resources");
const appleId = process.env.APPLE_ID || "";
const appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD || "";
const appleTeamId = process.env.APPLE_TEAM_ID || "";
const macCredentialsAvailable = Boolean(appleId && appleIdPassword && appleTeamId);

async function copyRuntimeNativeModules(buildPath: string) {
  const destinationRoot = path.join(buildPath, "node_modules");
  const copied = new Set<string>();

  async function copyPackage(name: string) {
    if (copied.has(name) || name === "cpu-features") return;
    copied.add(name);
    const source = path.join(repositoryRoot, "node_modules", name);
    if (!existsSync(source)) throw new Error(`missing runtime dependency ${name}`);
    await cp(source, path.join(destinationRoot, name), { recursive: true, dereference: true });
    let manifest: { dependencies?: Record<string, string> };
    try {
      manifest = JSON.parse(await readFile(path.join(source, "package.json"), "utf8"));
    } catch (cause) {
      throw new Error(`unable to read package metadata for ${name}`, { cause });
    }
    for (const dependency of Object.keys(manifest.dependencies || {})) {
      await copyPackage(dependency);
    }
  }

  await mkdir(destinationRoot, { recursive: true });
  for (const name of ["node-pty", "ssh2"]) await copyPackage(name);
}

const config: ForgeConfig = {
  outDir: path.join(repositoryRoot, "release", "electron"),
  packagerConfig: {
    appBundleId: "com.jumpserver.client",
    appCategoryType: "public.app-category.developer-tools",
    asar: {
      unpack: "**/node_modules/{node-pty,ssh2}/**"
    },
    icon: path.join(iconsRoot, process.platform === "win32" ? "icon.ico" : "icon.icns"),
    extraResource: ["dist", "plugins", "icons"]
      .map((name) => path.join(stagedResources, name))
      .filter((candidate) => existsSync(candidate)),
    ignore: (file) => {
      if (!file) return false;
      return !(file === "/package.json" || file.startsWith("/.vite"));
    },
    protocols: [
      {
        name: "JumpServer URL",
        schemes: ["jms", "jms2"]
      }
    ],
    osxSign: process.platform === "darwin" && macCredentialsAvailable ? true : undefined,
    osxNotarize: macCredentialsAvailable
      ? {
          appleId,
          appleIdPassword,
          teamId: appleTeamId
        }
      : undefined
  },
  rebuildConfig: {},
  hooks: {
    async packageAfterCopy(_config, buildPath) {
      await copyRuntimeNativeModules(buildPath);
    }
  },
  makers: [
    new MakerDMG({ icon: path.join(iconsRoot, "icon.icns") }),
    new MakerZIP({}, ["darwin"]),
    new MakerSquirrel({
      name: "JumpServer",
      setupIcon: path.join(iconsRoot, "icon.ico")
    }),
    new MakerWix({
      language: 1033,
      manufacturer: "JumpServer"
    }),
    new MakerDeb({
      options: {
        categories: ["Development"],
        icon: path.join(iconsRoot, "icon.png")
      }
    }),
    new MakerRpm({
      options: {
        categories: ["Development"],
        icon: path.join(iconsRoot, "icon.png")
      }
    })
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      build: [
        {
          entry: path.join(electronRoot, "src", "bootstrap.ts"),
          config: path.join(electronRoot, "vite.main.config.ts"),
          target: "main"
        },
        {
          entry: path.join(electronRoot, "src", "preload.ts"),
          config: path.join(electronRoot, "vite.preload.config.ts"),
          target: "preload"
        }
      ],
      renderer: []
    })
  ]
};

export default config;
