import { describe, expect, it } from "vitest";
import {
  conflictingShortcut,
  defaultShortcut,
  isReservedShortcut,
  matchesShortcut,
  normalizeShortcutOverrides,
  shortcutAccelerator,
  shortcutBindings,
  shortcutFromEvent,
  shortcutKeyLabels
} from "./shortcuts";

const web = { mac: false, desktop: false };
const desktop = { mac: false, desktop: true };
const mac = { mac: true, desktop: true };
const event = (properties = {}) => ({
  code: "KeyK",
  ctrlKey: true,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...properties
});

describe("application shortcuts", () => {
  it("keeps runtime defaults and the desktop close alias", () => {
    expect(defaultShortcut("closeTab", web)).toBe("Alt+Shift+KeyW");
    expect(shortcutBindings("closeTab", {}, desktop)).toEqual(["Mod+KeyW", "Alt+Shift+KeyW"]);
    expect(shortcutBindings("localShell", {}, web)).toEqual([]);
  });

  it("replaces every old binding and releases disabled chords", () => {
    const overrides = { closeTab: "Mod+Shift+KeyE", terminalAi: null };
    expect(shortcutBindings("closeTab", overrides, desktop)).toEqual(["Mod+Shift+KeyE"]);
    expect(shortcutBindings("terminalAi", overrides, web)).toEqual([]);
    expect(shortcutAccelerator("closeTab", overrides, desktop)).toBe("CmdOrCtrl+Shift+E");
    expect(shortcutAccelerator("terminalAi", overrides, desktop)).toBeUndefined();
    expect(shortcutBindings("terminalAi", {}, web)).toEqual(["Mod+KeyK"]);
  });

  it("uses physical keys and exact platform modifiers without swallowing IME or AltGr", () => {
    expect(matchesShortcut(event(), "Mod+KeyK", false)).toBe(true);
    expect(matchesShortcut(event({ ctrlKey: false, metaKey: true }), "Mod+KeyK", true)).toBe(true);
    for (const properties of [
      { repeat: true },
      { isComposing: true },
      { altKey: true },
      { metaKey: true },
      { getModifierState: () => true }
    ]) {
      expect(matchesShortcut(event(properties), "Mod+KeyK", false)).toBe(false);
    }
    expect(matchesShortcut(event(), "Mod+KeyK", true)).toBe(false);
    expect(shortcutFromEvent(event({ code: "ArrowLeft", shiftKey: true, altKey: true, ctrlKey: false }), false)).toBe(
      "Alt+Shift+ArrowLeft"
    );
    expect(shortcutFromEvent(event({ ctrlKey: false, shiftKey: true }), false)).toBeNull();
  });

  it("detects collisions with defaults, overrides, aliases and Ctrl/Mod equivalents", () => {
    expect(conflictingShortcut("focus", "Alt+Shift+KeyW", {}, desktop)).toBe("closeTab");
    expect(conflictingShortcut("focus", "Ctrl+KeyK", {}, desktop)).toBe("terminalAi");
    expect(conflictingShortcut("focus", "Mod+Shift+KeyE", { terminalAi: "Mod+Shift+KeyE" }, mac)).toBe("terminalAi");
    expect(conflictingShortcut("focus", "Mod+KeyK", { terminalAi: null }, web)).toBeUndefined();
  });

  it("protects editing, browser/window actions, number groups and terminal interruption", () => {
    for (const binding of [
      "Mod+KeyC",
      "Ctrl+KeyC",
      "Mod+KeyS",
      "Mod+Enter",
      "Mod+Comma",
      "Alt+F4",
      "Ctrl+Tab",
      "Mod+Digit1",
      "Mod+Digit9",
      "Mod+KeyW",
      "Mod+KeyT"
    ]) {
      expect(isReservedShortcut(binding, "focus", web), binding).toBe(true);
    }
    expect(isReservedShortcut("Mod+KeyW", "closeTab", desktop)).toBe(false);
    expect(isReservedShortcut("Mod+KeyW", "closeTab", web)).toBe(true);
    expect(isReservedShortcut("Mod+Shift+KeyE", "focus", mac)).toBe(false);
    expect(shortcutBindings("focus", { focus: "Ctrl+KeyC" }, web)).toEqual(["Mod+Shift+KeyP"]);
  });

  it("loads only recognized, valid overrides and distinguishes disabled from default", () => {
    expect(
      normalizeShortcutOverrides({
        focus: null,
        terminalAi: "Mod+Shift+KeyE",
        nextTab: "Shift+KeyA",
        closeTab: "Mod+Mod+KeyW",
        previousTab: 12,
        localShell: "KeyT",
        unknown: "Mod+KeyQ"
      })
    ).toEqual({ focus: null, terminalAi: "Mod+Shift+KeyE" });
    expect(normalizeShortcutOverrides(null)).toEqual({});
    expect(normalizeShortcutOverrides([])).toEqual({});
  });

  it("formats the same custom key for UI and the native menu", () => {
    expect(shortcutKeyLabels("Mod+Alt+Shift+ArrowRight", true)).toEqual(["meta", "alt", "shift", "arrowright"]);
    expect(shortcutAccelerator("focus", { focus: "Mod+Alt+Shift+ArrowRight" }, mac)).toBe("CmdOrCtrl+Alt+Shift+Right");
    expect(shortcutAccelerator("focus", { focus: "Ctrl+Shift+KeyE" }, mac)).toBe("Ctrl+Shift+E");
  });
});
