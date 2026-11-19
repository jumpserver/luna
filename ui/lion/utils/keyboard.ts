import type Guacamole from "@jumpserver/guacamole";
import german from "@/lion/assets/layouts/de-de-qwertz.json";
import english from "@/lion/assets/layouts/en-us-qwerty.json";
import spanish from "@/lion/assets/layouts/es-es-qwerty.json";
import french from "@/lion/assets/layouts/fr-fr-azerty.json";
import italian from "@/lion/assets/layouts/it-it-qwerty.json";

// These layouts have both a guacd server keymap and a bundled on-screen keyboard.
export const keyboardLayoutOptions = [
  { label: "KeyboardGermanQwertz", value: "de-de-qwertz" },
  { label: "KeyboardUsEnglishQwerty", value: "en-us-qwerty" },
  { label: "KeyboardSpanishQwerty", value: "es-es-qwerty" },
  { label: "KeyboardFrenchAzerty", value: "fr-fr-azerty" },
  { label: "KeyboardItalianQwerty", value: "it-it-qwerty" }
] as const;

const layouts: Record<string, Guacamole.OnScreenKeyboard.LayoutTemplate> = {
  "de-de-qwertz": german,
  "en-us-qwerty": english,
  "es-es-qwerty": spanish,
  "fr-fr-azerty": french,
  "it-it-qwerty": italian
};

export function resolveKeyboardLayout(name?: string) {
  return name || "en-us-qwerty";
}

function getLayout(name: string) {
  return layouts[Object.hasOwn(layouts, name) ? name : "en-us-qwerty"]!;
}

export function getKeyboardCharacterRows(name: string): string[] {
  const findRows = (node: Guacamole.OnScreenKeyboard.LayoutNode): string[] => {
    if (Array.isArray(node)) return node.flatMap(findRows);
    if (typeof node !== "object") return [];
    if (Array.isArray(node.alpha)) {
      return node.alpha.map((row) =>
        Array.isArray(row) ? row.filter((key) => typeof key === "string" && key.length === 1).join("") : ""
      );
    }
    return Object.values(node).flatMap((child) => (child === undefined ? [] : findRows(child)));
  };
  return findRows(getLayout(name).layout);
}

export function getKeyboardCharacter(name: string, value: string, modifiers: Record<string, boolean>) {
  const definitions = getLayout(name).keys[value];
  if (!Array.isArray(definitions)) return;
  const key = definitions.reduce<Guacamole.OnScreenKeyboard.KeyTemplate | undefined>((active, candidate) => {
    const required = candidate.requires || [];
    return required.every((modifier) => modifiers[modifier]) && required.length >= (active?.requires?.length || 0)
      ? candidate
      : active;
  }, undefined);
  if (!key) return;
  const title = key.title || value;
  const codepoint = title.codePointAt(0)!;
  return { title, keysym: key.keysym ?? (codepoint > 0xff ? 0x01000000 | codepoint : codepoint) };
}
