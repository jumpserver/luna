import { spawn } from "node:child_process";
import type { ChildProcess, ChildProcessWithoutNullStreams } from "node:child_process";
import { access, readFile, stat } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { homedir } from "node:os";
import type { AgentProfile } from "./types";

function terminate(child: ChildProcess, force = false) {
  if (!child.pid) return;
  if (process.platform === "win32") {
    const killer = spawn(
      path.join(process.env.SystemRoot || "C:\\Windows", "System32", "taskkill.exe"),
      ["/PID", String(child.pid), "/T", ...(force ? ["/F"] : [])],
      { shell: false, windowsHide: true, stdio: "ignore" }
    );
    killer.on("error", () => {
      child.kill();
    });
    killer.unref();
  } else {
    try {
      process.kill(-child.pid, force ? "SIGKILL" : "SIGTERM");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") child.kill(force ? "SIGKILL" : "SIGTERM");
    }
  }
}

export async function agentCommand(profile: AgentProfile, platform = process.platform) {
  const windows = platform === "win32";
  const executable = profile.executable.trim() || profile.engine;
  if (/[\0\r\n]/.test(executable)) throw new Error("Invalid agent executable");
  const candidates =
    path.isAbsolute(executable) || /[/\\]/.test(executable)
      ? [path.resolve(executable)]
      : (process.env.PATH || "")
          .split(path.delimiter)
          .filter(Boolean)
          .flatMap((directory) =>
            (windows ? ["", ".exe", ".cmd"] : [""]).map((suffix) => path.join(directory, executable + suffix))
          );
  let command: string | undefined;
  for (const candidate of candidates) {
    try {
      await access(candidate, windows ? constants.F_OK : constants.X_OK);
      if ((await stat(candidate)).isFile()) {
        command = candidate;
        break;
      }
    } catch {
      /* Try the next PATH entry. */
    }
  }
  if (!command) throw new Error(`Agent executable not found: ${executable}`);
  if (!windows || !/\.(cmd|bat)$/i.test(command)) return { command, args: [] as string[] };

  // npm's Windows shims cannot be spawned without cmd.exe. Resolve the package's
  // declared Node entry instead; never execute profile text through a shell.
  const packages =
    profile.engine === "codex"
      ? ["@openai/codex"]
      : profile.engine === "claude"
        ? ["@anthropic-ai/claude-code"]
        : ["@earendil-works/pi-coding-agent", "@mariozechner/pi-coding-agent"];
  for (const packageName of packages) {
    const root = path.join(path.dirname(command), "node_modules", packageName);
    try {
      const manifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
      const entry = typeof manifest.bin === "string" ? manifest.bin : manifest.bin?.[profile.engine];
      if (typeof entry !== "string") continue;
      const script = path.resolve(root, entry);
      if (!script.startsWith(root + path.sep) || !(await stat(script)).isFile()) continue;
      if (/\.exe$/i.test(script)) return { command: script, args: [] as string[] };
      let node = path.join(path.dirname(command), "node.exe");
      try {
        await access(node);
      } catch {
        node = (await agentCommand({ ...profile, executable: "node.exe" }, platform)).command;
      }
      return { command: node, args: [script] };
    } catch {
      /* Not an npm installation of this agent. */
    }
  }
  throw new Error("Unsupported Windows command shim; select the agent executable or its npm installation");
}

export async function probeAgent(profile: AgentProfile): Promise<{ version: string }> {
  const plan = await agentCommand(profile);
  return new Promise((resolve, reject) => {
    const child = spawn(plan.command, [...plan.args, "--version"], {
      cwd: profile.cwd || homedir(),
      shell: false,
      windowsHide: true,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"]
    });
    let output = "";
    const timer = setTimeout(() => {
      terminate(child, true);
      reject(new Error("Agent version check timed out"));
    }, 10_000);
    child.stdout.setEncoding("utf8").on("data", (chunk) => {
      output = (output + chunk).slice(0, 4096);
    });
    child.stderr.resume();
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (code !== 0 || !output.trim()) reject(new Error("Agent version check failed"));
      else resolve({ version: output.trim().slice(0, 512) });
    });
  });
}

/** A bounded JSON-lines transport shared by the three native CLI protocols. */
export class AgentProcess {
  private child: ChildProcessWithoutNullStreams;
  private closed = false;
  private buffer = "";
  private stderr = "";
  private ended = false;
  private killTimer?: ReturnType<typeof setTimeout>;

  constructor(
    command: string,
    args: string[],
    cwd: string,
    env: NodeJS.ProcessEnv,
    onMessage: (message: any) => void,
    private onExit: (error: Error | null) => void
  ) {
    this.child = spawn(command, args, {
      cwd: cwd || homedir(),
      env,
      shell: false,
      windowsHide: true,
      detached: process.platform !== "win32",
      stdio: "pipe"
    });
    this.child.stdout.setEncoding("utf8");
    this.child.stderr.setEncoding("utf8");
    this.child.stderr.on("data", (chunk) => {
      this.stderr = (this.stderr + chunk).slice(-4096);
    });
    this.child.stdin.on("error", (error) => this.fail(error));
    this.child.stdout.on("data", (chunk: string) => {
      this.buffer += chunk;
      if (this.buffer.length > 8 * 1024 * 1024) return this.fail(new Error("Agent protocol output exceeded 8 MB"));
      for (let newline = this.buffer.indexOf("\n"); newline >= 0; newline = this.buffer.indexOf("\n")) {
        const line = this.buffer.slice(0, newline).trim();
        this.buffer = this.buffer.slice(newline + 1);
        if (!line) continue;
        try {
          onMessage(JSON.parse(line));
        } catch {
          this.fail(new Error("Invalid agent protocol message"));
          break;
        }
      }
    });
    this.child.once("error", (error) => this.fail(error));
    this.child.once("exit", (code, signal) => {
      if (!this.ended) {
        this.ended = true;
        this.onExit(
          this.closed
            ? null
            : new Error(`Agent exited (${signal || code})${this.stderr.trim() ? `: ${this.stderr.trim()}` : ""}`)
        );
      }
      // A child may ignore SIGTERM or keep inherited stdio open after its parent
      // exits. Finish the group rather than waiting indefinitely for "close".
      if (this.closed) terminate(this.child, true);
    });
    this.child.once("close", () => {
      clearTimeout(this.killTimer);
      if (this.closed) terminate(this.child, true);
    });
  }

  write(value: unknown) {
    if (this.closed || this.ended) return Promise.reject(new Error("Agent process is closed"));
    return new Promise<void>((resolve, reject) => {
      this.child.stdin.write(`${JSON.stringify(value)}\n`, (error) => (error ? reject(error) : resolve()));
    });
  }

  private fail(error: Error) {
    if (this.ended) return;
    this.ended = true;
    this.onExit(new Error(error.message));
    this.close();
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.child.stdin.end();
    terminate(this.child);
    this.killTimer = setTimeout(() => terminate(this.child, true), 1500);
    this.killTimer.unref();
  }
}
