export default defineNuxtPlugin((nuxtApp) => {
  const root = document.documentElement;
  const controller = new AbortController();
  const options = { capture: true, passive: true, signal: controller.signal };

  document.addEventListener("pointerdown", () => (root.dataset.focusInput = "pointer"), options);
  document.addEventListener(
    "keydown",
    (event) => {
      // Escape closes a pointer-opened dialog without switching to keyboard navigation.
      if (event.key !== "Escape") root.dataset.focusInput = "keyboard";
    },
    options
  );

  const dispose = () => {
    controller.abort();
    delete root.dataset.focusInput;
  };
  nuxtApp.vueApp.onUnmount(dispose);
  import.meta.hot?.dispose(dispose);
});
