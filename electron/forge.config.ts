import type { ForgeConfig } from "@electron-forge/shared-types";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, readdir, readFile } from "node:fs/promises";
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
import { buildSshHelper } from "../scripts/build-ssh-helper.mjs";

const electronRoot = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(electronRoot, "..");
const iconsRoot = path.join(electronRoot, "assets", "icons");
const stagedResources = path.join(repositoryRoot, ".electron-resources");
const executableName = "jumpserver";
const helperEntitlements = path.join(electronRoot, "assets", "entitlements", "ssh-helper.plist");
const appleId = process.env.APPLE_ID || "";
const appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD || "";
const appleTeamId = process.env.APPLE_TEAM_ID || "";
const macSigningIdentity = process.env.CSC_NAME || "";
const macSigningAvailable = process.platform === "darwin" && Boolean(macSigningIdentity);
const macNotarizationAvailable = macSigningAvailable && Boolean(appleId && appleIdPassword && appleTeamId);
const windowsCertificateFile = process.env.WINDOWS_CERTIFICATE_FILE || "";
const windowsCertificatePassword = process.env.WINDOWS_CERTIFICATE_PASSWORD || "";
const windowsSignWithParams = process.env.WINDOWS_SIGN_WITH_PARAMS || "";
const windowsSigningAvailable =
  process.platform === "win32" && Boolean(windowsCertificateFile || windowsSignWithParams);
const windowsSignOptions = windowsSigningAvailable
  ? {
      certificateFile: windowsCertificateFile || undefined,
      certificatePassword: windowsCertificatePassword || undefined,
      signWithParams: windowsSignWithParams || undefined
    }
  : undefined;

function commandOutput(command: string, args: string[]) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    execFile(command, args, { encoding: "utf8" }, (error, stdout, stderr) => {
      if (error) reject(error);
      else resolve({ stdout, stderr });
    });
  });
}

async function verifyMacPackageSignatures(outputPaths: string[]) {
  if (!macSigningAvailable) return;
  for (const outputPath of outputPaths) {
    const appEntry = (await readdir(outputPath, { withFileTypes: true })).find(
      (entry) => entry.isDirectory() && entry.name.endsWith(".app")
    );
    if (!appEntry) throw new Error(`packaged macOS application not found in ${outputPath}`);
    const appPath = path.join(outputPath, appEntry.name);
    const helperPath = path.join(appPath, "Contents", "Resources", "bin", "jms-ssh");
    await commandOutput("codesign", ["--verify", "--strict", "--verbose=2", helperPath]);
    const details = await commandOutput("codesign", ["--display", "--verbose=2", helperPath]);
    if (details.stderr.includes("Signature=adhoc") || !details.stderr.includes("Authority=")) {
      throw new Error("packaged jms-ssh helper is not signed with an Apple signing identity");
    }
    if (appleTeamId && !details.stderr.includes(`TeamIdentifier=${appleTeamId}`)) {
      throw new Error("packaged jms-ssh helper was signed by an unexpected Apple team");
    }
    await commandOutput("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath]);
  }
}

async function verifyWindowsHelperSignatures(outputPaths: string[]) {
  if (!windowsSigningAvailable) return;
  for (const outputPath of outputPaths) {
    const helperPath = path.join(outputPath, "resources", "bin", "jms-ssh.exe");
    const result = await commandOutput("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "(Get-AuthenticodeSignature -LiteralPath $args[0]).Status.ToString()",
      helperPath
    ]);
    if (result.stdout.trim() !== "Valid") {
      throw new Error(`packaged jms-ssh helper has invalid Authenticode status: ${result.stdout.trim()}`);
    }
  }
}

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
  await copyPackage("node-pty");
}

const config: ForgeConfig = {
  outDir: path.join(repositoryRoot, "release", "electron"),
  packagerConfig: {
    appBundleId: "com.jumpserver.client",
    appCategoryType: "public.app-category.developer-tools",
    executableName,
    asar: {
      unpack: "**/node_modules/node-pty/**"
    },
    icon: path.join(iconsRoot, process.platform === "win32" ? "icon.ico" : "icon.icns"),
    extraResource: [
      ...["dist", "plugins", "icons"]
        .map((name) => path.join(stagedResources, name))
        .filter((candidate) => existsSync(candidate)),
      path.join(stagedResources, "bin")
    ],
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
    osxSign: macSigningAvailable
      ? {
          identity: macSigningIdentity,
          optionsForFile: (filePath) =>
            filePath.endsWith(`${path.sep}Resources${path.sep}bin${path.sep}jms-ssh`)
              ? { entitlements: helperEntitlements, hardenedRuntime: true }
              : {}
        }
      : undefined,
    osxNotarize: macNotarizationAvailable
      ? {
          appleId,
          appleIdPassword,
          teamId: appleTeamId
        }
      : undefined,
    windowsSign: windowsSignOptions
  },
  rebuildConfig: {},
  hooks: {
    async generateAssets(_config, platform, arch) {
      await buildSshHelper({ platform, architecture: arch });
    },
    async packageAfterCopy(_config, buildPath) {
      await copyRuntimeNativeModules(buildPath);
    },
    async postPackage(_config, { platform, outputPaths }) {
      if (platform === "darwin") await verifyMacPackageSignatures(outputPaths);
      if (platform === "win32") await verifyWindowsHelperSignatures(outputPaths);
    }
  },
  makers: [
    new MakerDMG({ icon: path.join(iconsRoot, "icon.icns") }),
    new MakerZIP({}, ["darwin"]),
    new MakerSquirrel({
      name: "JumpServer",
      setupIcon: path.join(iconsRoot, "icon.ico"),
      windowsSign: windowsSignOptions
    }),
    new MakerWix({
      exe: `${executableName}.exe`,
      icon: path.join(iconsRoot, "icon.ico"),
      language: 1033,
      manufacturer: "JumpServer",
      windowsSign: windowsSignOptions
    }),
    new MakerDeb({
      options: {
        bin: executableName,
        categories: ["Development"],
        icon: path.join(iconsRoot, "icon.png")
      }
    }),
    new MakerRpm({
      options: {
        bin: executableName,
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
