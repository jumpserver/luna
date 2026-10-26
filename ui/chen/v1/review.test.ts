import { describe, expect, it } from "vitest";
import { reviewTicketUrl } from "./review";

describe("command-review ticket links", () => {
  it("opens absolute HTTP(S) links without using an Electron renderer origin as the base", () => {
    const ticket = "https://core.example/ui/#/tickets/tickets/one?type=command_confirm";
    for (const base of [undefined, "null", "jms-app://app", "http://localhost:5173"])
      expect(reviewTicketUrl(ticket, base)).toBe(ticket);
    expect(reviewTicketUrl("http://core.example/ticket/one")).toBe("http://core.example/ticket/one");
  });
  it("resolves relative Core tickets only with an explicit authenticated Core site", () => {
    const ticket = "/ui/#/tickets/tickets/one?type=command_confirm";
    expect(reviewTicketUrl(ticket, "https://core.example/base")).toBe(`https://core.example${ticket}`);
    for (const base of [undefined, "", "null", "jms-app://app", "file:///app", "/chen"])
      expect(reviewTicketUrl(ticket, base)).toBeUndefined();
  });
  it("rejects executable schemes, userinfo and origin-changing relative links", () => {
    for (const value of [
      "javascript:alert(1)",
      "data:text/html,hello",
      "file:///tmp/ticket",
      "jms-app://app/ui/",
      "https://user:secret@core.example/ticket",
      "//other.example/ticket",
      "/\\other.example/ticket",
      "/\n/other.example/ticket",
      "ticket/one"
    ])
      expect(reviewTicketUrl(value, "https://core.example")).toBeUndefined();
    expect(reviewTicketUrl("/ticket", "https://user:secret@core.example")).toBeUndefined();
  });
});
