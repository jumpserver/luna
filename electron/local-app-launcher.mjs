import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

function decodePayload(raw) {
  const value = String(raw || "");
  const encoded = value.startsWith("jms2://") ? value.slice(7) : value.startsWith("jms://") ? value.slice(6) : "";
  if (!encoded) throw new Error("invalid local client URL scheme");
  try {
    return JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
  } catch (error) {
    throw new Error(`decode local client payload failed: ${error instanceof Error ? error.message : error}`);
  }
}

function sanitizedName(raw) {
  let decoded = String(raw || "");
  try {
    decoded = decodeURIComponent(decoded);
  } catch {}
  return decoded.replaceAll(" ", "").replace(/[:-]/g, "_");
}

function username(payload) {
  return ["ssh", "sftp", "telnet"].includes(payload.protocol)
    ? `JMS-${payload.token?.id || ""}`
    : String(payload.token?.id || "");
}

function navicatUrl(payload) {
  const aliases = { oracle: "ora", sqlserver: "mssql", postgresql: "pgsql" };
  const protocol = aliases[payload.protocol] || payload.protocol;
  return `navicat://conn.${protocol}?Conn.Host=${payload.endpoint.host}&Conn.Name=${sanitizedName(payload.name)}&Conn.Port=${payload.endpoint.port}&Conn.Username=${username(payload)}`;
}

function valuesFor(payload) {
  return {
    name: sanitizedName(payload.name),
    protocol: payload.protocol,
    username: username(payload),
    value: String(payload.token?.value || ""),
    host: String(payload.endpoint?.host || ""),
    port: String(payload.endpoint?.port || ""),
    dbname: payload.protocol === "oracle" ? username(payload) : String(payload.asset?.info?.db_name || ""),
    dbeaver_protocol: payload.protocol === "sqlserver" ? "mssql_jdbc_ms_new" : payload.protocol,
    url: navicatUrl(payload)
  };
}

function render(template, values) {
  return String(template || "").replace(/\{([a-z_]+)\}/gi, (matched, key) =>
    Object.hasOwn(values, key) ? String(values[key]) : matched
  );
}

function splitArguments(input) {
  const args = [];
  let current = "";
  let quote = "";
  let escaped = false;
  for (const character of String(input)) {
    if (escaped) {
      current += character;
      escaped = false;
    } else if (character === "\\" && quote !== "'") {
      escaped = true;
    } else if (quote) {
      if (character === quote) quote = "";
      else current += character;
    } else if (character === "'" || character === '"') {
      quote = character;
    } else if (/\s/.test(character)) {
      if (current) {
        args.push(current);
        current = "";
      }
    } else {
      current += character;
    }
  }
  if (escaped) current += "\\";
  if (quote) throw new Error("application argument template contains an unclosed quote");
  if (current) args.push(current);
  return args.flatMap((argument) => argument.split("*"));
}

function spawnDetached(executable, args, options = {}) {
  const child = spawn(executable, args, { detached: true, stdio: "ignore", ...options });
  child.unref();
}

function shellQuote(value) {
  if (process.platform === "win32") return `"${String(value).replaceAll('"', '\\"')}"`;
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function appleScriptString(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

async function isFile(candidate) {
  try {
    return (await stat(candidate)).isFile();
  } catch {
    return false;
  }
}

async function isDirectory(candidate) {
  try {
    return (await stat(candidate)).isDirectory();
  } catch {
    return false;
  }
}

export class LocalApplicationLauncher {
  constructor(app, projectRoot, configService, electronShell) {
    this.app = app;
    this.projectRoot = projectRoot;
    this.configService = configService;
    this.electronShell = electronShell;
  }

  async helperPath() {
    const platform =
      process.platform === "darwin"
        ? process.arch === "arm64"
          ? "darwin-arm64"
          : "darwin-amd64"
        : process.platform === "linux"
          ? process.arch === "arm64"
            ? "linux-arm64"
            : "linux-amd64"
          : "windows";
    const name = process.platform === "win32" ? "client.exe" : "client";
    const candidates = [
      path.join(this.projectRoot, "resources", "bin", platform, name),
      path.join(this.projectRoot, "src-tauri", "resources", "bin", platform, name)
    ];
    if (process.resourcesPath) {
      candidates.push(
        path.join(process.resourcesPath, "resources", "bin", platform, name),
        path.join(process.resourcesPath, "bin", platform, name)
      );
    }
    for (const candidate of candidates) if (await isFile(candidate)) return candidate;
    throw new Error("bundled SSH helper not found");
  }

  async resolveApplication(payload) {
    const config = await this.configService.getConfig();
    for (const category of ["terminal", "filetransfer", "remotedesktop", "databases"]) {
      for (const item of config[category] || []) {
        if (!item.protocol.includes(payload.protocol) || !item.is_set) continue;
        if (payload.client && item.name === payload.client) return item;
        if (!payload.client && item.match_first.includes(payload.protocol)) return item;
      }
    }
    throw new Error(
      `no configured application selected for protocol '${payload.protocol}'${payload.client ? ` and client '${payload.client}'` : ""}`
    );
  }

  async resolveExecutable(application) {
    const configured = String(application.path || "").trim();
    if (await isFile(configured)) return configured;
    if (application.executable_type === "application_bundle" && (await isDirectory(configured))) return configured;
    if (application.is_internal) {
      const bundled = path.join(application.plugin_dir || "", configured);
      if (await isFile(bundled)) return bundled;
      if (configured) return configured;
    }
    if (application.executable_type === "system" && configured) return configured;
    throw new Error(`configured application '${application.display_name}' not found at '${configured}'`);
  }

  async launchTerminal(application, argumentString, useHelper) {
    const command = useHelper ? `${shellQuote(await this.helperPath())} ${argumentString}` : argumentString;
    if (process.platform === "darwin") {
      const applicationId = appleScriptString(application.application_id);
      const escapedCommand = appleScriptString(command);
      const script =
        application.launch_driver === "iterm2"
          ? `tell application id "${applicationId}"\nactivate\nset targetWindow to (create window with default profile)\ntell current session of targetWindow to write text "${escapedCommand}"\nend tell`
          : `tell application id "${applicationId}"\nactivate\ndo script "${escapedCommand}"\nend tell`;
      spawnDetached("osascript", ["-s", "h", "-e", script]);
      return;
    }
    if (process.platform === "linux") {
      spawnDetached(application.path || "x-terminal-emulator", ["-e", "bash", "-lc", command]);
      return;
    }
    const executable = await this.resolveExecutable(application);
    const args = splitArguments(argumentString);
    spawnDetached(executable, application.launch_driver === "windows-terminal" ? ["new-tab", ...args] : args);
  }

  async launchExecutable(application, argumentString, values) {
    const executable = await this.resolveExecutable(application);
    const env = { ...process.env };
    for (const [key, template] of Object.entries(application.env || {})) env[key] = render(template, values);
    spawnDetached(executable, splitArguments(argumentString), { env });
  }

  async launchFile(application, payload) {
    const extension = payload.protocol === "rdp" ? "rdp" : "vnc";
    const base = sanitizedName(payload.file?.name || payload.name) || "connection";
    const connectionPath = path.join(this.configService.configDir, `${base}.${extension}`);
    await mkdir(this.configService.configDir, { recursive: true });
    await writeFile(connectionPath, String(payload.file?.content || ""), { mode: 0o600 });
    if (process.platform === "darwin") {
      spawnDetached("open", ["-a", application.path, connectionPath]);
      return;
    }
    await this.launchExecutable(application, render(application.arg_format, { file: connectionPath }), {});
  }

  async launchScript(application, payload, values) {
    const scriptPath = path.resolve(application.plugin_dir, application.script_path || "");
    if (!scriptPath.startsWith(`${path.resolve(application.plugin_dir)}${path.sep}`) || !(await isFile(scriptPath))) {
      throw new Error(`plugin script not found for '${application.display_name}'`);
    }
    const env = {
      ...process.env,
      JMS_CONNECT_JSON: JSON.stringify({
        name: sanitizedName(payload.name),
        protocol: payload.protocol,
        username: username(payload),
        value: payload.token?.value || "",
        host: payload.endpoint.host,
        port: payload.endpoint.port,
        asset: { info: { db_name: payload.asset?.info?.db_name || "" } },
        file: { name: payload.file?.name || "", content: payload.file?.content || "" }
      })
    };
    for (const [key, template] of Object.entries(application.env || {})) env[key] = render(template, values);
    const interpreter = String(application.script_interpreter || "").trim();
    spawnDetached(interpreter || scriptPath, interpreter ? [scriptPath] : [], { env });
  }

  async launch(raw) {
    const payload = decodePayload(raw);
    if (!payload.protocol || !payload.endpoint?.host || !payload.endpoint?.port || !payload.token?.id) {
      throw new Error("local client payload is missing required connection fields");
    }
    const application = await this.resolveApplication(payload);
    const values = valuesFor(payload);
    if (application.use_ssh_helper) values.helper = await this.helperPath();
    if (application.protocol_aliases?.[payload.protocol]) values.protocol = application.protocol_aliases[payload.protocol];
    if (String(payload.command || "").trim()) {
      if (!["terminal", "iterm2", "linux-terminal", "windows-terminal"].includes(application.launch_driver)) {
        throw new Error("selected application cannot open command payloads");
      }
      return this.launchTerminal(application, payload.command, false);
    }
    const template = application.protocol_templates?.[payload.protocol] || application.arg_format;
    const argumentString = render(template, values);
    if (application.launch_type === "file") return this.launchFile(application, payload);
    if (application.launch_type === "script") return this.launchScript(application, payload, values);
    if (application.launch_type === "url") return this.electronShell.openExternal(argumentString);
    if (["terminal", "iterm2", "linux-terminal", "windows-terminal"].includes(application.launch_driver)) {
      return this.launchTerminal(application, argumentString, application.use_ssh_helper);
    }
    if (application.launch_type === "args") return this.launchExecutable(application, argumentString, values);
    throw new Error(`unsupported application launch type: ${application.launch_type}`);
  }
}

export const localAppLauncherInternals = { decodePayload, render, splitArguments, valuesFor };
