import { describe, expect, it } from "vitest";
import type { AppConfigType, ConfigItem } from "~/types";
import { applicationSettingsGroups, matchesApplicationSearch } from "./applicationSettings";

const application = (overrides: Partial<ConfigItem>): ConfigItem => ({
  name: "dbx",
  display_name: "DBX",
  plugin_id: "macos.dbx",
  type: "databases",
  protocol: ["mysql", "mariadb", "postgresql"],
  path: "/Applications/DBX.app/Contents/MacOS/dbx",
  comment: { zh: "", en: "" },
  download_url: "",
  arg_format: "",
  match_first: ["mysql"],
  enabled_protocols: ["mysql", "postgresql"],
  is_internal: false,
  is_default: false,
  is_set: true,
  ...overrides
});

const config = (overrides: Partial<AppConfigType> = {}): AppConfigType => ({
  terminal: [],
  remotedesktop: [],
  filetransfer: [],
  databases: [],
  ...overrides
});

describe("application management", () => {
  it.each(["dbx", " DBX ", "mysql", "/applications/dbx.app", "dbx POSTGRESQL", "   "])(
    "finds applications by name, path or protocol: %s",
    (query) => expect(matchesApplicationSearch(application({}), query)).toBe(true)
  );

  it("requires all search terms to match the same application", () => {
    expect(matchesApplicationSearch(application({}), "DBX ssh")).toBe(false);
    expect(matchesApplicationSearch(application({}), "SecureCRT")).toBe(false);
  });

  it("shows one DBX configuration while preserving its independent protocol selections", () => {
    const dbx = application({});
    const result = applicationSettingsGroups(config({ databases: [dbx, dbx] }));
    expect(result).toHaveLength(1);
    expect(result[0]!.items).toEqual([dbx]);
    expect(result[0]!.items[0]).toBe(dbx);
    expect(dbx.enabled_protocols).toEqual(["mysql", "postgresql"]);
    expect(dbx.match_first).toEqual(["mysql"]);
  });

  it("keeps separate plugins with the same display name independently configurable", () => {
    const builtin = application({ builtin: true });
    const custom = application({ plugin_id: "custom.dbx", builtin: false, path: "/custom/dbx" });
    expect(applicationSettingsGroups(config({ databases: [builtin, custom] }))[0]!.items).toEqual([builtin, custom]);
  });

  it("configures the terminal host instead of exposing generated terminal entries as applications", () => {
    const terminal = application({
      name: "terminal",
      plugin_id: "macos.terminal",
      type: "terminal",
      use_ssh_helper: true
    });
    const result = applicationSettingsGroups(
      config({
        terminal: [terminal, application({ name: "builtin_client" })],
        databases: [application({ name: "terminal", plugin_id: "macos.terminal-db", uses_terminal_host: true })]
      })
    );
    expect(result).toEqual([{ category: "terminal", items: [terminal] }]);
  });

  it("handles configuration loading without exposing empty groups", () => {
    expect(applicationSettingsGroups(null)).toEqual([]);
    expect(applicationSettingsGroups(config())).toEqual([]);
  });
});
