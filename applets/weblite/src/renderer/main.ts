import { createApp } from "vue";
import { createI18n } from "vue-i18n";
import { normalizeLanguageCode } from "../../../../i18n/language";
import ui from "@nuxt/ui/vue-plugin";
import App from "./App.vue";
import "./style.css";

async function reportFailure(error: unknown) {
  // Never serialize error objects, component props or request data into diagnostics.
  const cause = error as { name?: string; message?: string };
  const message =
    cause?.name === "SyntaxError"
      ? "SyntaxError：界面数据或脚本格式无效，原始数据已隐藏。"
      : typeof cause?.message === "string"
        ? `${cause.name || "Error"}: ${cause.message}`
        : typeof error === "string"
          ? error
          : "浏览器界面发生未知错误";
  try {
    await (window as any).webApplet.invoke("report_error", { message: message.slice(0, 4096) });
  } catch {
    // IPC itself may be unavailable. textContent keeps the last-resort diagnostic inert.
    const root = document.getElementById("app");
    if (root) root.textContent = `WebLite 浏览器界面错误：${message}`;
  }
}

window.addEventListener("error", (event) => reportFailure(event.error || new Error(event.message)));
window.addEventListener("unhandledrejection", (event) => reportFailure(event.reason));

async function start() {
  // Resolve the launch language before mounting so no system-language frame flashes
  // when a client launches WebLite with a different language.
  const request = await (window as any).webApplet.invoke("bootstrap");
  const i18n = createI18n({
    legacy: false,
    locale: normalizeLanguageCode(request.language || navigator.language),
    fallbackLocale: "en"
  });
  const application = createApp(App, { request });
  application.config.errorHandler = reportFailure;
  application.use(i18n).use(ui).mount("#app");
}
void start().catch(reportFailure);
