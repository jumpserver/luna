import { spawn } from "node:child_process";
import { copyFile, mkdtemp, rename, rm, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

type RunPowerShell = (args: string[], env: NodeJS.ProcessEnv) => Promise<void>;

const signingScript = fileURLToPath(new URL("./sign-ci.ps1", import.meta.url));
// Resolve the signing dependency from the Electron workspace that declares it.
const electronRequire = createRequire(new URL("../electron/package.json", import.meta.url));
const verifySignature =
  "$ErrorActionPreference = 'Stop'; " +
  "$signature = Get-AuthenticodeSignature -LiteralPath $env:JMS_WINDOWS_SIGN_FILE; " +
  "if ($signature.Status -ne 'Valid') { throw \"Invalid Authenticode signature: $($signature.Status)\" }";

const runPowerShell: RunPowerShell = (args, env) =>
  new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", ...args], {
      env,
      stdio: "inherit",
      windowsHide: true,
      timeout: 65 * 60 * 1000
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`Windows signing PowerShell exited with ${signal || code}`));
    });
  });

export function createWindowsSigner({
  env = process.env,
  platform = process.platform,
  run = runPowerShell
}: {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  run?: RunPowerShell;
} = {}) {
  const mode = env.GITHUB_ACTIONS === "true" ? env.WINDOWS_SIGN_MODE?.trim().toLowerCase() || "optional" : "off";
  if (!["optional", "required", "off"].includes(mode)) {
    throw new Error("WINDOWS_SIGN_MODE must be optional, required, or off");
  }
  const enabled = platform === "win32" && mode !== "off";
  const useSignPanel = Boolean(env.SIGNPANEL_URL || env.SIGNPANEL_API_TOKEN);
  let unavailable = false;

  return {
    mode,
    enabled,
    async signFile(file: string) {
      if (!enabled) return;
      const input = await stat(file);
      if (!input.isFile() || input.size === 0) throw new Error(`Missing or empty Windows signing input: ${file}`);
      // SignPanel accepts .exe/.msi/.dll; native .node modules still use local signing when configured.
      if (useSignPanel && path.extname(file).toLowerCase() === ".node") return;
      if (unavailable) return;

      let temporaryDirectory: string | undefined;
      try {
        if (useSignPanel) {
          if (!env.SIGNPANEL_URL || !env.SIGNPANEL_API_TOKEN) {
            throw new Error("SIGNPANEL_URL and SIGNPANEL_API_TOKEN must both be configured");
          }
        } else if (!env.WINDOWS_CERTIFICATE_FILE && !env.WINDOWS_SIGN_WITH_PARAMS) {
          throw new Error("Configure SIGNPANEL_URL and SIGNPANEL_API_TOKEN, or local Windows signing credentials");
        }

        temporaryDirectory = await mkdtemp(path.join(path.dirname(file), ".windows-sign-"));
        const signedFile = path.join(temporaryDirectory, path.basename(file));
        if (useSignPanel) {
          await run(["-File", signingScript, "-InputFile", file, "-OutputFile", signedFile], env);
        } else {
          await copyFile(file, signedFile);
          const { sign } = electronRequire("@electron/windows-sign");
          await sign({
            files: [signedFile],
            certificateFile: env.WINDOWS_CERTIFICATE_FILE || undefined,
            certificatePassword: env.WINDOWS_CERTIFICATE_PASSWORD || undefined,
            signWithParams: env.WINDOWS_SIGN_WITH_PARAMS || undefined
          });
        }
        await run(["-Command", verifySignature], { ...env, JMS_WINDOWS_SIGN_FILE: signedFile });
        await rename(signedFile, file);
      } catch (error) {
        if (mode === "required") throw error;
        unavailable = true;
        console.warn(
          `[electron] WARNING: Windows signing failed for ${path.basename(file)}: ${error instanceof Error ? error.message : String(error)}. Keeping the original file and skipping remaining signing attempts.`
        );
      } finally {
        if (temporaryDirectory) {
          await rm(temporaryDirectory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
        }
      }
    }
  };
}
