import { describe, expect, it } from "vitest";
import {
  isTerminalSnippetModule,
  normalizeSnippetVariableFields,
  renderSnippetCommand
} from "~/utils/snippetVariables";

describe("snippet variables", () => {
  it.each(["shell", "raw", "win_shell", "python"])("allows terminal-compatible module: %s", (module) => {
    expect(isTerminalSnippetModule(module)).toBe(true);
  });

  it("keeps database scripts out of terminal batch commands", () => {
    expect(isTerminalSnippetModule("mysql")).toBe(false);
  });

  it("normalizes Luna-compatible form metadata", () => {
    expect(
      normalizeSnippetVariableFields({
        actions: {
          GET: {
            name: { type: "string", label: "Name", required: true, default: "root" },
            environment: {
              type: "labeled_choice",
              label: "Environment",
              required: false,
              choices: [{ value: "prod", label: "Production" }]
            }
          }
        }
      })
    ).toEqual([
      {
        key: "name",
        type: "string",
        label: "Name",
        helpText: "",
        required: true,
        defaultValue: "root",
        choices: []
      },
      {
        key: "environment",
        type: "labeled_choice",
        label: "Environment",
        helpText: "",
        required: false,
        defaultValue: "",
        choices: [{ value: "prod", label: "Production" }]
      }
    ]);
  });

  it("replaces only known jms variables without interpreting replacement characters", () => {
    expect(
      renderSnippetCommand("echo {{ jms_name }} {{jms_environment}} {{ untouched }}", {
        name: "$&",
        environment: "prod"
      })
    ).toBe("echo $& prod {{ untouched }}");
  });
});
