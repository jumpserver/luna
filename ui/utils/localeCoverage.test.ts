import { describe, expect, it } from "vitest";

import en from "../../i18n/locales/en.json";
import es from "../../i18n/locales/es.json";
import ja from "../../i18n/locales/ja.json";
import ko from "../../i18n/locales/ko.json";
import ptBr from "../../i18n/locales/pt_br.json";
import ru from "../../i18n/locales/ru.json";
import vi from "../../i18n/locales/vi.json";
import zhHant from "../../i18n/locales/zh_hant.json";
import lionEn from "../lion/locales/modules/en.json";
import lionEs from "../lion/locales/modules/es.json";
import lionJa from "../lion/locales/modules/ja.json";
import lionKo from "../lion/locales/modules/ko.json";
import lionPtBr from "../lion/locales/modules/pt_br.json";
import lionRu from "../lion/locales/modules/ru.json";
import lionVi from "../lion/locales/modules/vi.json";
import lionZhHant from "../lion/locales/modules/zh_Hant.json";

type Messages = Record<string, unknown>;

const translatedLocales = { zh_hant: zhHant, ja, pt_br: ptBr, es, ru, ko, vi };
const translatedLionLocales = {
  zh_hant: lionZhHant,
  ja: lionJa,
  pt_br: lionPtBr,
  es: lionEs,
  ru: lionRu,
  ko: lionKo,
  vi: lionVi
};

function flattenMessages(messages: Messages, prefix = "", result: Record<string, unknown> = {}) {
  for (const [key, value] of Object.entries(messages)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      flattenMessages(value as Messages, path, result);
    } else {
      result[path] = value;
    }
  }
  return result;
}

function placeholders(value: unknown) {
  return [...String(value).matchAll(/\{[^{}]+\}/g)].map(([match]) => match).sort();
}

function htmlTags(value: unknown) {
  return [...String(value).matchAll(/<\/?[a-z][^>]*>/gi)].map(([match]) => match.replace(/\s+/g, " ")).sort();
}

function expectLocaleCoverage(referenceMessages: Messages, messages: Messages) {
  const reference = flattenMessages(referenceMessages);
  const translated = flattenMessages(messages);

  expect(Object.keys(translated).sort()).toEqual(Object.keys(reference).sort());
  for (const key of Object.keys(reference)) {
    expect(placeholders(translated[key]), `${key} placeholders`).toEqual(placeholders(reference[key]));
    expect(htmlTags(translated[key]), `${key} HTML tags`).toEqual(htmlTags(reference[key]));
  }
}

describe("translated locale coverage", () => {
  it.each(Object.entries(translatedLocales))(
    "keeps every English key, placeholder and HTML tag in %s",
    (_, messages) => {
      expectLocaleCoverage(en, messages);
    }
  );

  it.each(Object.entries(translatedLionLocales))("keeps every Lion key and placeholder in %s", (_, messages) => {
    expectLocaleCoverage(lionEn, messages);
  });
});
