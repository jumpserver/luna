import { createSharedComposable, useMediaQuery } from "@vueuse/core";

// Shared by body.mobile and UI behavior; resizing a mouse-driven desktop is not mobile mode.
export const useMobile = createSharedComposable(() =>
  useMediaQuery(
    "(pointer: coarse) and (hover: none) and (max-width: 767px), (pointer: coarse) and (hover: none) and (max-height: 600px)"
  )
);
