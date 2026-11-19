import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { app, session } from "electron";
import type { Certificate } from "electron";

const WORKER_ARGUMENT = "--jms-certificate-inspection=";

export interface CertificateInspection {
  certificate: Pick<Certificate, "data" | "subjectName" | "issuerName" | "validStart" | "validExpiry">;
  error: string;
}

type WorkerMessage = { type: "ready" } | { type: "result"; result: CertificateInspection | null };

export function isCertificateInspectionWorker() {
  return typeof process.send === "function" && process.argv.some((arg) => arg.startsWith(WORKER_ARGUMENT));
}

// A short-lived process owns its verifier and profile. Electron does not expose
// a server-certificate cache reset or a way to destroy individual Sessions.
export async function inspectSiteCertificate(origin: string): Promise<CertificateInspection | null> {
  const directory = await mkdtemp(path.join(tmpdir(), "jumpserver-certificate-inspection-"));
  try {
    return await new Promise<CertificateInspection | null>((resolve) => {
      const env = { ...process.env };
      delete env.ELECTRON_RUN_AS_NODE;
      const child = spawn(
        process.execPath,
        [
          ...(app.isPackaged ? [] : [app.getAppPath()]),
          `${WORKER_ARGUMENT}${directory}`,
          `--user-data-dir=${directory}`
        ],
        { env, stdio: ["ignore", "ignore", "ignore", "ipc"], windowsHide: true }
      );
      let result: CertificateInspection | null = null;
      const timeout = setTimeout(() => child.kill("SIGKILL"), 10_000);
      child.on("message", (message: WorkerMessage) => {
        if (message?.type === "ready") {
          child.send({ origin }, (error) => {
            if (error) child.kill();
          });
        } else if (message?.type === "result") {
          result = message.result;
        }
      });
      child.once("error", () => {
        result = null;
      });
      child.once("close", (code) => {
        clearTimeout(timeout);
        resolve(code === 0 ? result : null);
      });
    });
  } finally {
    await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}

export async function runCertificateInspectionWorker() {
  const directory = process.argv.find((arg) => arg.startsWith(WORKER_ARGUMENT))!.slice(WORKER_ARGUMENT.length);
  app.setPath("userData", directory);
  app.setPath("sessionData", directory);
  app.disableHardwareAcceleration();
  if (process.platform === "darwin") app.setActivationPolicy("prohibited");
  app.on("select-client-certificate", (event, _webContents, _url, _certificates, callback) => {
    event.preventDefault();
    callback();
  });
  app.on("login", (event, _webContents, _details, _authInfo, callback) => {
    event.preventDefault();
    callback();
  });

  let finished = false;
  const finish = (result: CertificateInspection | null) => {
    if (finished) return;
    finished = true;
    process.send!({ type: "result", result } satisfies WorkerMessage, () => app.exit(0));
  };
  // Covers startup as well as the request; the parent also has a hard deadline.
  setTimeout(() => finish(null), 8_000);
  process.once("disconnect", () => app.exit(0));
  process.once("message", async (message: { origin?: unknown }) => {
    let result: CertificateInspection | null = null;
    try {
      if (typeof message?.origin !== "string") throw new Error("Missing inspection origin");
      const target = new URL(message.origin);
      if (target.protocol !== "https:" || target.origin !== message.origin || target.username || target.password)
        throw new Error("Invalid inspection origin");
      await app.whenReady();
      const inspection = session.fromPartition("certificate-inspection", { cache: false });
      inspection.setCertificateVerifyProc((request, callback) => {
        if (request.hostname.replace(/^\[|\]$/g, "") === target.hostname.replace(/^\[|\]$/g, "")) {
          const { data, subjectName, issuerName, validStart, validExpiry } = request.certificate;
          result = {
            certificate: { data, subjectName, issuerName, validStart, validExpiry },
            error: request.verificationResult
          };
        }
        callback(-3);
      });
      const response = await inspection.fetch(target.origin, {
        method: "HEAD",
        credentials: "omit",
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(5000)
      });
      await response.body?.cancel();
    } catch {
      // Verification failures still provide the certificate and Chromium result.
    }
    finish(result);
  });
  await app.whenReady();
  process.send!({ type: "ready" } satisfies WorkerMessage);
}
