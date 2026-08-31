import { chmod, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Unzip, UnzipInflate } from "fflate";

const categories = ["terminal", "remotedesktop", "filetransfer", "databases"];
const maxPluginArchiveBytes = 64 * 1024 * 1024;
const maxPluginExtractedBytes = 256 * 1024 * 1024;
const maxPluginFiles = 1024;

function platformKey() {
  if (process.platform === "darwin") return "macos";
  if (process.platform === "win32") return "windows";
  return "linux";
}

async function exists(candidate, kind) {
  try {
    const info = await stat(candidate);
    return kind === "directory" ? info.isDirectory() : info.isFile();
  } catch {
    return false;
  }
}

async function readJson(candidate) {
  try {
    return JSON.parse(await readFile(candidate, "utf8"));
  } catch (error) {
    throw new Error(`read ${candidate} failed: ${error instanceof Error ? error.message : error}`);
  }
}

async function writeJson(candidate, value) {
  const pending = `${candidate}.pending-${process.pid}-${Date.now()}`;
  await writeFile(pending, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(pending, candidate);
}

function normalizePluginId(raw) {
  const pluginId = String(raw || "").trim();
  if (!pluginId || pluginId === "." || pluginId === ".." || pluginId.includes("/") || pluginId.includes("\\")) {
    throw new Error(`invalid plugin id '${pluginId}'`);
  }
  return pluginId;
}

function resolvePlatformConnect(connect) {
  return connect?.platforms?.[platformKey()] || (connect?.executable ? connect : null);
}

function launchTemplate(launch: { type?: string; arg_template?: string; template?: string } = {}) {
  if (launch.type === "file") return launch.arg_template || "{file}";
  if (launch.type === "autoit") return "";
  return launch.template || "";
}

function configuredPathExists(connect, executablePath) {
  const type = connect?.executable?.type || "";
  if (!["user_path", "application_bundle"].includes(type)) return true;
  return Boolean(executablePath);
}

function safeArchiveName(raw) {
  const normalized = String(raw).replaceAll("\\", "/");
  if (!normalized || normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)) {
    throw new Error(`unsafe plugin archive entry '${raw}'`);
  }
  const parts = normalized.split("/").filter((part) => part && part !== ".");
  if (!parts.length || parts.some((part) => part === "..")) throw new Error(`unsafe plugin archive entry '${raw}'`);
  return parts;
}

function slugify(raw) {
  return String(raw)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function extractPluginArchive(source, pendingDir) {
  return new Promise<void>((resolve, reject) => {
    let fileCount = 0;
    let extractedBytes = 0;
    let failure;
    const writes = [];
    const fail = (error) => {
      failure ||= error instanceof Error ? error : new Error(String(error));
    };
    const unzip = new Unzip((file) => {
      try {
        fileCount += 1;
        if (fileCount > maxPluginFiles) throw new Error(`plugin archive exceeds ${maxPluginFiles} file limit`);
        const parts = safeArchiveName(file.name);
        const destination = path.join(pendingDir, ...parts);
        if (file.name.endsWith("/")) {
          writes.push(mkdir(destination, { recursive: true }));
          return;
        }
        if (file.originalSize && extractedBytes + file.originalSize > maxPluginExtractedBytes) {
          throw new Error("plugin expands beyond 256 MiB limit");
        }
        const chunks = [];
        let fileBytes = 0;
        file.ondata = (error, data, final) => {
          if (error) {
            fail(error);
            return;
          }
          if (failure) return;
          fileBytes += data.byteLength;
          extractedBytes += data.byteLength;
          if (extractedBytes > maxPluginExtractedBytes) {
            file.terminate();
            fail(new Error("plugin expands beyond 256 MiB limit"));
            return;
          }
          chunks.push(Buffer.from(data));
          if (final) {
            writes.push(
              mkdir(path.dirname(destination), { recursive: true })
                .then(() => writeFile(destination, Buffer.concat(chunks, fileBytes)))
                .then(() => (parts.includes("scripts") ? chmod(destination, 0o700) : undefined))
            );
          }
        };
        file.start();
      } catch (error) {
        file.terminate();
        fail(error);
      }
    });
    unzip.register(UnzipInflate);
    try {
      unzip.push(source, true);
    } catch (error) {
      fail(error);
    }
    Promise.all(writes).then(() => (failure ? reject(failure) : resolve()), reject);
  });
}

export class ApplicationConfigService {
  // ponytail: migration keeps legacy dynamic state; replace with explicit service field types when strict mode is enabled.
  [key: string]: any;

  constructor(app, projectRoot) {
    this.app = app;
    this.projectRoot = projectRoot;
    this.configDir = path.join(app.getPath("appData"), "jumpserver-client");
    this.statePath = path.join(this.configDir, "plugins-state.json");
    this.userPluginsDir = path.join(this.configDir, "plugins");
  }

  async initialize() {
    await mkdir(this.userPluginsDir, { recursive: true });
    await this.loadState();
  }

  async builtInDir() {
    const platform = platformKey();
    const candidates = [path.join(this.projectRoot, "plugins", platform)];
    if (process.resourcesPath) {
      candidates.push(
        path.join(process.resourcesPath, "plugins", platform),
        path.join(process.resourcesPath, "resources", "plugins", platform)
      );
    }
    for (const candidate of candidates) {
      if (await exists(path.join(candidate, "index.json"), "file")) return candidate;
    }
    throw new Error(`platform plugins directory not found for ${platform}`);
  }

  async loadState() {
    if (await exists(this.statePath, "file")) return readJson(this.statePath);
    const defaultsPath = path.join(await this.builtInDir(), "plugins-state.defaults.json");
    const state = (await exists(defaultsPath, "file"))
      ? await readJson(defaultsPath)
      : { version: 1, selections: {}, plugins: {} };
    await writeJson(this.statePath, state);
    return state;
  }

  async saveState(state) {
    await writeJson(this.statePath, state);
  }

  async builtInEntries() {
    const root = await this.builtInDir();
    const index = await readJson(path.join(root, "index.json"));
    if (!Array.isArray(index.plugins)) throw new Error("invalid platform plugins index.json");
    const entries = [];
    for (const item of index.plugins) {
      const id = normalizePluginId(item.id);
      const pluginDir = path.join(root, id);
      if (!(await exists(pluginDir, "directory"))) continue;
      entries.push({ id, category: item.category || "", pluginDir, builtin: true });
    }
    return entries;
  }

  async installedEntries(builtinIds) {
    const entries = [];
    for (const directory of await readdir(this.userPluginsDir, { withFileTypes: true })) {
      if (!directory.isDirectory() || directory.name.startsWith(".")) continue;
      const pluginDir = path.join(this.userPluginsDir, directory.name);
      try {
        const manifest = await readJson(path.join(pluginDir, "manifest.json"));
        const id = normalizePluginId(manifest.id);
        if (builtinIds.has(id)) continue;
        entries.push({ id, category: manifest.category || "", pluginDir, builtin: false });
      } catch (error) {
        console.warn(`[electron] skipping invalid plugin ${pluginDir}:`, error);
      }
    }
    return entries.sort((left, right) => left.id.localeCompare(right.id));
  }

  async entries() {
    const builtin = await this.builtInEntries();
    return [...builtin, ...(await this.installedEntries(new Set(builtin.map((entry) => entry.id))))];
  }

  async pluginData(entry) {
    const manifest = await readJson(path.join(entry.pluginDir, "manifest.json"));
    const connect = await readJson(path.join(entry.pluginDir, "connect.json"));
    const platformConnect = resolvePlatformConnect(connect);
    return { manifest, platformConnect };
  }

  resolvePath(entry, platformConnect, state) {
    const override = String(state.plugins?.[entry.id]?.path || "").trim();
    return override || String(platformConnect?.executable?.default || "");
  }

  async pathExists(platformConnect, executablePath) {
    const type = platformConnect?.executable?.type || "";
    if (type === "user_path") return exists(executablePath, "file");
    if (type === "application_bundle") return exists(executablePath, "directory");
    return configuredPathExists(platformConnect, executablePath);
  }

  async buildItem(entry, state) {
    const { manifest, platformConnect } = await this.pluginData(entry);
    if (!platformConnect) return null;
    const protocols = Array.isArray(manifest.protocols) ? manifest.protocols : [];
    const executablePath = this.resolvePath(entry, platformConnect, state);
    const selected = protocols.filter((protocol) => state.selections?.[`${entry.category}:${protocol}`] === entry.id);
    const enabled = protocols.filter((protocol) => {
      const key = `${entry.category}:${protocol}`;
      const explicit = state.enabled_selections?.[key];
      return Array.isArray(explicit) ? explicit.includes(entry.id) : state.selections?.[key] === entry.id;
    });
    const launch = platformConnect.launch || {};
    const pathExists = await this.pathExists(platformConnect, executablePath);
    const isInternal = Boolean(platformConnect.is_internal);
    const pluginEnabled = state.plugins?.[entry.id]?.enabled !== false;
    const defaultIsSet = Boolean(platformConnect.is_set);
    return {
      name: manifest.name || "",
      display_name: platformConnect.display_name || manifest.display_name || entry.id,
      protocol: protocols,
      comment: manifest.comment || {},
      download_url: manifest.download_url || "",
      type: entry.category,
      path: executablePath,
      arg_format: launchTemplate(launch),
      launch_type: launch.type || "args",
      open_with: launch.open_with || "",
      launch_driver: launch.driver || "",
      application_id: launch.application_id || "",
      script_path: launch.script || "",
      script_interpreter: launch.interpreter || "",
      use_ssh_helper: Boolean(launch.use_ssh_helper),
      protocol_aliases: launch.protocol_aliases || {},
      protocol_templates: launch.protocol_templates || {},
      env: platformConnect.env || {},
      match_first: selected,
      enabled_protocols: enabled,
      is_internal: isInternal,
      is_default: Boolean(platformConnect.is_default),
      is_set: pluginEnabled && (defaultIsSet || Boolean(state.plugins?.[entry.id]) || enabled.length > 0),
      executable_type: platformConnect.executable?.type || "",
      path_exists: pathExists,
      plugin_id: entry.id,
      plugin_dir: entry.pluginDir,
      builtin: entry.builtin,
      icon_path: (await exists(path.join(entry.pluginDir, "icon.png"), "file"))
        ? path.join(entry.pluginDir, "icon.png")
        : ""
    };
  }

  async getConfig() {
    const state = await this.loadState();
    const config = Object.fromEntries(categories.map((category) => [category, []]));
    for (const entry of await this.entries()) {
      const item = await this.buildItem(entry, state);
      if (item && config[entry.category]) config[entry.category].push(item);
    }
    return config;
  }

  async listPlugins() {
    const state = await this.loadState();
    const plugins = [];
    for (const entry of await this.entries()) {
      const { manifest, platformConnect } = await this.pluginData(entry);
      const executablePath = platformConnect ? this.resolvePath(entry, platformConnect, state) : "";
      plugins.push({
        id: entry.id,
        name: manifest.name || "",
        display_name: platformConnect?.display_name || manifest.display_name || entry.id,
        version: manifest.version || "",
        category: entry.category,
        protocols: Array.isArray(manifest.protocols) ? manifest.protocols : [],
        builtin: entry.builtin,
        enabled: state.plugins?.[entry.id]?.enabled !== false,
        path: executablePath,
        path_exists: platformConnect ? await this.pathExists(platformConnect, executablePath) : false,
        executable_type: platformConnect?.executable?.type || "",
        icon_path: (await exists(path.join(entry.pluginDir, "icon.png"), "file"))
          ? path.join(entry.pluginDir, "icon.png")
          : "",
        plugin_dir: entry.pluginDir,
        download_url: manifest.download_url || "",
        comment: manifest.comment || {}
      });
    }
    return plugins;
  }

  async findEntry({ category, name, pluginId }: { category?: string; name?: string; pluginId?: string }) {
    const normalizedId = pluginId ? normalizePluginId(pluginId) : "";
    for (const entry of await this.entries()) {
      if (normalizedId && entry.id === normalizedId) return entry;
      if (!normalizedId && entry.category === category) {
        const manifest = await readJson(path.join(entry.pluginDir, "manifest.json"));
        if (manifest.name === name) return entry;
      }
    }
    throw new Error(
      normalizedId ? `plugin '${normalizedId}' not found` : `plugin '${name}' not found in '${category}'`
    );
  }

  async updateSelection({ category, protocol, name, pluginId, path: newPath, enabled = true }) {
    if (!categories.includes(category)) throw new Error(`invalid application category '${category}'`);
    const entry = await this.findEntry({ category, name, pluginId });
    const state = await this.loadState();
    state.selections ||= {};
    state.enabled_selections ||= {};
    state.plugins ||= {};
    if (String(newPath || "").trim()) {
      state.plugins[entry.id] = { ...state.plugins[entry.id], path: String(newPath).trim(), enabled: true };
      await this.saveState(state);
      return this.getConfig();
    }

    const { platformConnect } = await this.pluginData(entry);
    const executablePath = this.resolvePath(entry, platformConnect, state);
    if (enabled && !(await this.pathExists(platformConnect, executablePath))) {
      throw new Error(`executable not found: ${executablePath || "(empty path)"}`);
    }
    const key = `${category}:${protocol}`;
    const previous = state.selections[key];
    const enabledIds = Array.isArray(state.enabled_selections[key])
      ? [...state.enabled_selections[key]]
      : previous
        ? [previous]
        : [];
    state.enabled_selections[key] = enabled ? [entry.id] : enabledIds.filter((id) => id !== entry.id);
    if (enabled) {
      state.selections[key] = entry.id;
      state.plugins[entry.id] = { ...state.plugins[entry.id], enabled: true };
    } else if (state.selections[key] === entry.id) {
      state.selections[key] = state.enabled_selections[key][0] || "";
    }
    await this.saveState(state);
    return this.getConfig();
  }

  async createCustomTerminal({ name, path: executablePath, template }) {
    const displayName = String(name || "").trim();
    const targetPath = String(executablePath || "").trim();
    const launchTemplateValue = String(template || "").trim();
    if (!displayName) throw new Error("custom terminal name is required");
    if (!targetPath) throw new Error("custom terminal path is required");
    if (!launchTemplateValue) throw new Error("custom terminal launch template is required");
    const slug = slugify(displayName);
    if (!slug) throw new Error("custom terminal name must contain letters or numbers");
    const pluginId = `custom.terminal.${slug}`;
    const targetDir = path.join(this.userPluginsDir, pluginId);
    if (await exists(targetDir, "directory")) throw new Error(`custom terminal '${displayName}' already exists`);
    const manifest = {
      id: pluginId,
      name: slug.replaceAll("-", "_"),
      display_name: displayName,
      version: "1.0.0",
      min_client_version: "4.0.0",
      author: "User",
      category: "terminal",
      protocols: ["ssh", "telnet"],
      builtin: false,
      comment: { zh: "用户自定义终端", en: "User-defined terminal" }
    };
    const connect = {
      platforms: {
        [platformKey()]: {
          is_default: false,
          is_set: false,
          is_internal: false,
          executable: { type: "user_path", default: targetPath, required: false },
          launch: { type: "args", use_ssh_helper: true, template: launchTemplateValue },
          display_name: displayName
        }
      }
    };
    await mkdir(targetDir);
    try {
      await Promise.all([
        writeJson(path.join(targetDir, "manifest.json"), manifest),
        writeJson(path.join(targetDir, "connect.json"), connect)
      ]);
      return this.listPlugins();
    } catch (error) {
      await rm(targetDir, { recursive: true, force: true });
      throw error;
    }
  }

  async installPlugin({ path: archivePath }) {
    const source = String(archivePath || "").trim();
    const info = await stat(source).catch(() => null);
    if (!info?.isFile()) throw new Error(`plugin archive not found: ${source}`);
    if (info.size > maxPluginArchiveBytes) throw new Error("plugin archive exceeds 64 MiB limit");
    const pendingDir = path.join(this.configDir, `.plugin-install-${process.pid}-${Date.now()}`);
    await mkdir(pendingDir);
    try {
      await extractPluginArchive(new Uint8Array(await readFile(source)), pendingDir);
      const manifest = await readJson(path.join(pendingDir, "manifest.json"));
      const connect = await readJson(path.join(pendingDir, "connect.json"));
      const pluginId = normalizePluginId(manifest.id);
      if (!resolvePlatformConnect(connect)) throw new Error(`plugin '${pluginId}' does not support ${platformKey()}`);
      if ((await this.builtInEntries()).some((entry) => entry.id === pluginId)) {
        throw new Error(`plugin '${pluginId}' conflicts with a builtin plugin`);
      }
      const targetDir = path.join(this.userPluginsDir, pluginId);
      const backupDir = path.join(this.configDir, `.plugin-backup-${pluginId}-${Date.now()}`);
      const replacing = await exists(targetDir, "directory");
      if (replacing) await rename(targetDir, backupDir);
      try {
        await rename(pendingDir, targetDir);
        if (replacing) await rm(backupDir, { recursive: true, force: true });
      } catch (error) {
        if (replacing && !(await exists(targetDir, "directory")) && (await exists(backupDir, "directory"))) {
          await rename(backupDir, targetDir);
        }
        throw error;
      }
      return this.listPlugins();
    } finally {
      await rm(pendingDir, { recursive: true, force: true });
    }
  }

  async uninstallPlugin({ pluginId }) {
    const entry = await this.findEntry({ pluginId });
    if (entry.builtin) throw new Error(`builtin plugin '${entry.id}' cannot be uninstalled`);
    await rm(entry.pluginDir, { recursive: true });
    const state = await this.loadState();
    delete state.plugins?.[entry.id];
    for (const [key, value] of Object.entries(state.selections || {})) {
      if (value === entry.id) state.selections[key] = "";
    }
    for (const [key, value] of Object.entries(state.enabled_selections || {})) {
      if (Array.isArray(value)) state.enabled_selections[key] = value.filter((id) => id !== entry.id);
    }
    await this.saveState(state);
    return this.listPlugins();
  }
}
