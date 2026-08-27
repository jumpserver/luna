import { stat } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

async function isFile(candidate) {
  try {
    return (await stat(candidate)).isFile();
  } catch {
    return false;
  }
}

export class ReplayTranscoder {
  constructor(projectRoot, emitProgress) {
    this.projectRoot = projectRoot;
    this.emitProgress = emitProgress;
  }

  async command() {
    const executable = process.platform === "win32" ? "jms-transcode.exe" : "jms-transcode";
    const candidates = [path.join(this.projectRoot, "native", "target", "debug", executable)];
    if (process.resourcesPath) {
      candidates.push(
        path.join(process.resourcesPath, executable),
        path.join(process.resourcesPath, "bin", executable),
        path.join(process.resourcesPath, "resources", "bin", executable)
      );
    }
    for (const candidate of candidates) if (await isFile(candidate)) return { executable: candidate, args: [] };
    if (!process.resourcesPath || this.projectRoot.includes(`${path.sep}luna`)) {
      return {
        executable: "cargo",
        args: [
          "run",
          "--quiet",
          "--manifest-path",
          path.join(this.projectRoot, "native", "Cargo.toml"),
          "--bin",
          "jms-transcode",
          "--"
        ]
      };
    }
    throw new Error("bundled replay transcoder not found");
  }

  async transcode(request, targetLabel) {
    const command = await this.command();
    return new Promise((resolve, reject) => {
      const child = spawn(command.executable, command.args, {
        cwd: this.projectRoot,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true
      });
      let outputBuffer = "";
      let errorOutput = "";
      let result;
      let helperError;
      const handleLine = (line) => {
        if (!line.trim()) return;
        let message;
        try {
          message = JSON.parse(line);
        } catch {
          errorOutput += `${line}\n`;
          return;
        }
        if (message.type === "progress") this.emitProgress(message.payload, targetLabel);
        else if (message.type === "result") result = message.payload;
        else if (message.type === "error") helperError = String(message.message || "replay transcoder failed");
      };
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        outputBuffer += chunk;
        const lines = outputBuffer.split("\n");
        outputBuffer = lines.pop() || "";
        lines.forEach(handleLine);
      });
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk) => {
        errorOutput += chunk;
      });
      child.once("error", reject);
      child.once("close", (code) => {
        handleLine(outputBuffer);
        if (code === 0 && Array.isArray(result)) resolve(result);
        else reject(new Error(helperError || errorOutput.trim() || `replay transcoder exited with code ${code}`));
      });
      child.stdin.end(JSON.stringify(request));
    });
  }
}
