const readCookie = (name: string) => {
  if (!import.meta.client) return "";
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]+)`));
  return match?.[1] ? decodeURIComponent(match[1]) : "";
};

const browserLang = import.meta.client
  ? navigator.language || (navigator.languages && navigator.languages[0]) || "en"
  : "en";

export const LanguageCode = readCookie("django_language") || readCookie("lang") || browserLang || "en";
