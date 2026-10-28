import { describe, expect, it } from "vitest";
import { createI18n } from "vue-i18n";
import en from "../../../i18n/locales/en.json";
import zh from "../../../i18n/locales/zh.json";
import { chenErrorCatalog } from "./errorCatalog";
import { chenErrorText } from "./errorMessages";

const i18n = createI18n<[typeof en], "zh" | "en", false>({
  legacy: false,
  locale: "zh",
  fallbackLocale: "en",
  messages: { zh, en }
});
const t = (key: string, values: Record<string, string | number> = {}) => i18n.global.t(key, values);

describe("Chen error localization", () => {
  it("has readable Chinese and English translations for every registered diagnostic", () => {
    for (const code of Object.keys(chenErrorCatalog)) {
      expect(zh.Chen.Errors, code).toHaveProperty(code);
      expect(en.Chen.Errors, code).toHaveProperty(code);
      expect(zh.Chen.Errors[code as keyof typeof zh.Chen.Errors], code).toMatch(/[\u3400-\u9fff]/u);
    }
  });

  it("translates all registered plain-text compatibility messages", () => {
    for (const [code, aliases] of Object.entries(chenErrorCatalog)) {
      for (const message of aliases) {
        if (message.includes("{")) continue; // Interpolation templates are covered below.
        const rendered = chenErrorText({ code, message, status: 503 }, t);
        expect(rendered, message).toMatch(/[\u3400-\u9fff]/u);
        expect(rendered, message).not.toContain("Chen.Errors.");
        expect(rendered, message).not.toContain("\n原始诊断信息");
      }
    }
  });

  it.each([
    "idle_disconnect",
    "max_session_timeout",
    "admin_terminate",
    "permission_revoked",
    "session_control_unavailable",
    "command_review_required",
    "export_cell_limit"
  ])("translates the %s protocol reason", (code) => {
    const expected = t(`Chen.Errors.${code}`);
    expect(chenErrorText(code, t)).toBe(expected);
    expect(chenErrorText({ code, message: code }, t)).toBe(expected);
    expect(chenErrorText(Object.assign(new Error(code), { code }), t)).toBe(expected);
  });

  it("formats the actual idle SSE reason for the workspace disconnect overlay", () => {
    expect(chenErrorText("idle_disconnect", t, "session_closed")).toBe("会话因长时间无操作而断开，请重新连接。");
    expect(chenErrorText(undefined, t, "session_closed")).toBe("会话已关闭，请重新连接。");
  });

  it("localizes HTTP, native network and empty error responses without exposing object dumps", () => {
    expect(chenErrorText({ code: "http_error", status: 502 }, t)).toContain("HTTP 502");
    expect(chenErrorText(new TypeError("Failed to fetch"), t)).toBe(t("Chen.Errors.network_error"));
    expect(chenErrorText({ unexpected: true }, t)).toBe(t("Chen.Errors.unexpected_error"));
    expect(chenErrorText({ code: "future_error" }, t)).toBe(
      `${t("Chen.Errors.unexpected_error")}\n错误代码: future_error`
    );
  });

  it.each([
    "42601",
    "MYSQL_1064",
    "OCEANBASE_1064",
    "MSSQL_102",
    "ORA_00933",
    "DM_-2007",
    "CLICKHOUSE_62",
    "DB2_SQL_ERROR"
  ])("retains original %s database diagnostics and identifiers", (code) => {
    const message = `syntax near "idle_disconnect.中文表" at position 17`;
    const result = chenErrorText({ code, message }, t);
    expect(result).toContain("原始诊断信息");
    expect(result.endsWith(`(${code}): ${message}`)).toBe(true);
    expect(result).not.toContain("长时间无操作");
  });

  it("does not expose diagnostics hidden by the server masking policy", () => {
    expect(
      chenErrorText({ code: "22P02", message: "Database diagnostic details are hidden by the data masking policy" }, t)
    ).toBe(t("Chen.Errors.diagnostic_hidden"));
  });

  it("preserves partial execution and unknown transaction outcome warnings", () => {
    const result = chenErrorText(
      {
        code: "script_partial_cancel",
        message:
          "2 earlier statement(s) completed and may already have taken effect. Do not automatically repeat the whole script. Query cancellation requested"
      },
      t
    );
    expect(result).toBe("前 2 条语句已完成且可能已生效，勿直接重复执行整个脚本。\n查询已取消。");
    expect(chenErrorText({ code: "edit_commit_unknown", message: "Query cancellation requested" }, t)).toMatch(
      /^提交请求已发送，但结果尚未确认/
    );
    expect(
      chenErrorText({ code: "edit_canceled", message: "Save was canceled and its changes were rolled back" }, t)
    ).toBe("保存已取消，本次修改已回滚。");
    expect(chenErrorText({ code: "edit_canceled", message: "Save was canceled before execution" }, t)).toBe(
      "保存已取消，尚未执行修改。"
    );
  });

  it("translates structured edit failures and interpolates field names without changing them", () => {
    expect(chenErrorText({ code: "invalid_changes", message: "Column user:name: Enter valid JSON" }, t)).toBe(
      "字段“user:name”：请输入有效的 JSON。"
    );
    expect(chenErrorText("Column 3 name is required", t)).toBe("请填写第 3 个字段的名称。");
    expect(chenErrorText("Column name “订单{内容}<name>” is duplicated", t)).toBe("字段名称“订单{内容}<name>”重复。");
    expect(chenErrorText("query result is not editable: complex SELECT source", t)).toBe(
      t("Chen.Errors.edit_source_complex")
    );
    expect(chenErrorText("DDL requires table-level column access", t)).toBe(t("Chen.Errors.ddl_column_access"));
  });

  it("uses the selected locale and preserves already localized UI validation", () => {
    const english = createI18n<[typeof en], "en", false>({ legacy: false, locale: "en", messages: { en } }).global.t;
    expect(chenErrorText("idle_disconnect", english)).toBe(en.Chen.Errors.idle_disconnect);
    expect(chenErrorText(new Error(en.Chen.GoWriteSqlFileInvalid), english)).toBe(en.Chen.GoWriteSqlFileInvalid);
    expect(chenErrorText(new Error(zh.Chen.GoWriteSqlFileInvalid), t)).toBe(zh.Chen.GoWriteSqlFileInvalid);
  });
});
