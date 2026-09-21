import { describe, expect, it } from "vitest";

import { findDeclaredCapability, WEB_CLI_NATIVE_VALUE, WEB_DB_NATIVE_VALUE } from "./capabilities";

describe("Dameng workspace capabilities", () => {
  it("offers both USQL WebCLI and Chen database workbench", () => {
    expect(findDeclaredCapability("dameng", WEB_CLI_NATIVE_VALUE)?.component).toBe("koko");
    expect(findDeclaredCapability("dameng", WEB_DB_NATIVE_VALUE)?.component).toBe("chen");
  });
});
