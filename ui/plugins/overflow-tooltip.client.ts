const OVERFLOW_TOOLTIP_SELECTOR = '[data-overflow-tooltip], [data-slot="value"], [data-slot="itemLabel"]';

const OWNED_TITLE_ATTRIBUTE = "data-overflow-tooltip-title";

export default defineNuxtPlugin(() => {
  function updateOverflowTooltip(event: MouseEvent) {
    if (!(event.target instanceof Element)) return;

    const element = event.target.closest<HTMLElement>(OVERFLOW_TOOLTIP_SELECTOR);
    if (!element) return;

    const isOverflowing = element.scrollWidth > element.clientWidth || element.scrollHeight > element.clientHeight;
    const label = element.textContent?.trim();

    if (isOverflowing && label) {
      if (!element.hasAttribute("title") || element.hasAttribute(OWNED_TITLE_ATTRIBUTE)) {
        element.title = label;
        element.setAttribute(OWNED_TITLE_ATTRIBUTE, "");
      }
    } else if (element.hasAttribute(OWNED_TITLE_ATTRIBUTE)) {
      element.removeAttribute("title");
      element.removeAttribute(OWNED_TITLE_ATTRIBUTE);
    }
  }

  document.addEventListener("mouseover", updateOverflowTooltip, true);
});
