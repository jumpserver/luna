import { describe, expect, it } from "vitest";
import {
  applyConnectionTokenReuse,
  isDatabaseGuideProtocol,
  resolveConnectionTokenReuseError,
  shouldShowConnectionTokenReuse
} from "./tokenReuse";

const translate = (key: string) => (key === "ConnectionGuide.TokenExpired" ? "Token has expired" : key);

describe("connection token reuse helpers", () => {
  it("shows the switch only when the public setting is on and a token id exists", () => {
    expect(shouldShowConnectionTokenReuse(true, "token-1")).toBe(true);
    expect(shouldShowConnectionTokenReuse(true, "")).toBe(false);
    expect(shouldShowConnectionTokenReuse(false, "token-1")).toBe(false);
    expect(shouldShowConnectionTokenReuse(undefined, "token-1")).toBe(false);
  });

  it("treats database guide protocols as the Magnus help-text surface", () => {
    expect(isDatabaseGuideProtocol("MySQL")).toBe(true);
    expect(isDatabaseGuideProtocol("mongodb")).toBe(true);
    expect(isDatabaseGuideProtocol("ssh")).toBe(false);
  });

  it("updates the current token from the reuse API payload including date_expired", () => {
    const token = {
      id: "token-1",
      date_expired: "2026-01-01T00:00:00Z",
      is_reusable: false
    };

    expect(
      applyConnectionTokenReuse(token, {
        id: "token-1",
        date_expired: "2026-12-31T00:00:00Z",
        is_reusable: true
      })
    ).toEqual({
      id: "token-1",
      date_expired: "2026-12-31T00:00:00Z",
      is_reusable: true
    });
    expect(token.date_expired).toBe("2026-12-31T00:00:00Z");
    expect(token.is_reusable).toBe(true);
  });

  it("maps expired tokens and field errors to user-facing messages", () => {
    expect(resolveConnectionTokenReuseError({ status: 404, data: { detail: "Not found" } }, translate)).toBe(
      "Token has expired"
    );
    expect(resolveConnectionTokenReuseError({ status: 400, data: { error: "Token expired" } }, translate)).toBe(
      "Token has expired"
    );
    expect(
      resolveConnectionTokenReuseError(
        { status: 400, data: { is_reusable: ["Personal credential connection tokens cannot be reusable"] } },
        translate
      )
    ).toBe("Personal credential connection tokens cannot be reusable");
    expect(
      resolveConnectionTokenReuseError(
        {
          status: 400,
          data: { detail: "Reusable connection token is not allowed, global setting not enabled" }
        },
        translate
      )
    ).toBe("Reusable connection token is not allowed, global setting not enabled");
  });
});
