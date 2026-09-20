import fr from "./fr.json";

// ponytail: the bridge still sends Chinese status text. Use stable message codes when
// adding further locales; unknown remote errors retain their original diagnostic details.
export function translateWebProxy(message: string, language?: string): string {
  if (!/^fr(?:[-_]|$)/i.test(language || "")) return message;
  if (message.startsWith("Error: ")) return `Error: ${translateWebProxy(message.slice(7), language)}`;
  const messages: Record<string, string> = fr;
  if (Object.hasOwn(messages, message)) return messages[message]!;
  for (const prefix of ["无法打开页面：", "登录页面加载失败：", "页面加载失败："]) {
    if (message.startsWith(prefix))
      return `${messages[prefix]}${translateWebProxy(message.slice(prefix.length), language)}`;
  }
  return message;
}
