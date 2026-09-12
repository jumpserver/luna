<script setup lang="ts">
import { getPublicSettings } from "~/composables/useApiRequest";
import { useUserInfoStore } from "~/store/modules/userInfo";
import { isDefaultInterfaceLogo } from "~/utils/interfaceLogo";

const userInfo = useUserInfoStore();
const customLogo = ref("");
watch(
  () => userInfo.currentSite,
  async (site, _previous, onCleanup) => {
    let active = true;
    onCleanup(() => {
      active = false;
    });
    customLogo.value = "";
    if (isDesktopRuntime() && !site) return;
    try {
      const settings = await getPublicSettings();
      const logo = settings.INTERFACE?.logo_logout?.trim();
      if (!active || !logo || isDefaultInterfaceLogo(logo)) return;
      if (isDesktopRuntime()) {
        const siteUrl = new URL(site);
        customLogo.value = new URL(withWebSitePrefix(logo, siteUrl.pathname), siteUrl.origin).href;
      } else {
        customLogo.value = withWebSitePrefix(logo);
      }
    } catch {
      // Keep local branding when the site settings are unavailable.
    }
  },
  { immediate: true }
);

// Shared across header remounts, but reset when the app reloads.
const introPlayed = useState("brand-logo-intro-played", () => false);
const animate = !introPlayed.value;
introPlayed.value = true;
</script>

<template>
  <img v-if="customLogo" :src="customLogo" alt="JumpServer" class="object-contain" @error="customLogo = ''" />
  <svg
    v-else
    class="brand-logo"
    :class="{ 'is-animating': animate }"
    viewBox="0 0 34.1008291 38.5574504"
    fill="currentColor"
    role="img"
    aria-label="JumpServer"
    focusable="false"
  >
    <!-- Original symbol paths, revealed in S → arrows → outline order. -->
    <path
      class="logo-symbol-s"
      d="M17.3686486 3.89751507C21.5954482 6.26387077 25.8385673 8.59758654 30.0816867 10.9313023C30.7671136 11.3229742 30.9139909 12.1552787 30.3754411 12.7264674C28.9882675 14.2278786 28.9719477 14.2441995 27.1931016 13.2486972C24.5329922 11.7799259 21.8728828 10.2948337 19.2454128 8.76078438C18.6252646 8.40175061 18.1683133 8.41806966 17.6460833 8.85870234C17.2544107 9.18509617 16.8137791 9.46253101 16.2752293 9.83788382C19.3922901 11.8452039 22.4277523 13.7872478 25.5774523 15.8108888C24.8757056 16.2515215 24.3045165 16.6431933 23.7170078 17.0022271C22.1067984 17.9705274 20.4965891 18.9333898 18.8863797 19.8908125C17.1564926 20.935272 15.5245236 20.984231 13.7456775 19.7765737C10.8897318 17.8182107 7.90322866 16.0556856 4.98200423 14.1952406C4.4271348 13.8579674 3.87226535 13.5152527 3.3173959 13.1671001C2.19133733 12.4490326 2.27293578 11.55145 3.36635498 10.7844254C4.49241355 10.0010798 5.37367678 10.1479567 6.49973535 10.8660243C9.14352505 12.5632714 11.9015526 14.0973226 14.5943013 15.7292917C15.1165314 16.0556856 15.5245236 16.0556856 16.0141143 15.7129708C16.4873853 15.386577 17.0259351 15.1091422 17.662403 14.7174703C14.3005469 12.5632714 11.1182075 10.5233096 7.80531051 8.40175061C9.35568101 7.5204871 10.7591743 6.7208225 12.1626676 5.95379599C13.3866443 5.26837025 14.6432604 4.63190165 15.8509174 3.91383597C16.3894672 3.62008208 16.8137791 3.58744214 17.3686486 3.89751507Z"
    />
    <g class="logo-symbol-arrows">
      <path
        d="M30.7997529 15.6313719C30.7997529 17.1001451 30.8323923 18.4873193 30.7834333 19.8581726C30.7671136 20.0703276 30.4896789 20.3477624 30.2612032 20.4783203C29.1930054 21.1014355 27.1638341 22.3348534 25.0411709 23.6114921L24.1891757 24.1231085C21.9148585 25.4863968 19.6657685 26.8128324 18.4947071 27.4141877C17.2544107 28.0343373 15.8509174 27.9853783 14.610621 27.2673108C10.8407728 25.1294328 7.10356386 22.942594 3.35003528 20.7883951C2.77884614 20.4456804 2.51773112 20.0540085 2.56669019 19.3522619C2.63196894 18.1935635 2.58300989 17.0185461 2.58300989 15.6803309C3.07260057 15.9577657 3.41531405 16.1536035 3.75802753 16.3494394C7.23412139 18.4546793 10.7265349 20.5435983 14.2189485 22.6325192C15.7040402 23.5464227 17.2544107 23.4811428 18.7231828 22.7141181C20.8773817 21.5880597 27.6337332 17.4265389 29.7552929 16.2352006C30.0816867 16.0393647 30.4244001 15.8598478 30.7997529 15.6313719Z"
      />
      <path
        d="M31.060868 21.9307726C31.060868 23.3669058 31.0771878 24.7214401 31.0282286 26.0922934C31.0282286 26.2881293 30.7671136 26.5166052 30.5549577 26.6471631C28.2538815 27.9690574 21.0079393 32.2937761 18.6742237 33.5830305C17.3196895 34.3337361 15.8835568 34.2847771 14.5779816 33.5503924C10.6938956 31.3145946 6.84244883 28.9808788 2.99100211 26.679803C2.81148553 26.5655642 2.61564925 26.2881293 2.61564925 26.0759743C2.58300989 24.75408 2.59932958 23.4158648 2.59932958 21.9307726C3.90490473 22.6977991 5.09624205 23.3832248 6.28757938 24.1012923C8.03378617 25.1620709 9.77999293 26.2554912 11.5261997 27.3162698C12.5053811 27.9037794 13.5172018 28.4423282 14.4963832 29.0298378C15.6714008 29.7152654 16.8790579 29.7152654 18.0867149 29.1930338C19.1638144 28.703444 20.2082745 28.1322553 21.2527347 27.5610665C22.7215068 26.745081 29.118825 22.893635 30.5712773 22.0613305C30.7344742 21.9797315 30.9139909 21.9634125 31.060868 21.9307726Z"
      />
    </g>
    <path
      class="logo-symbol-outline"
      d="M 17.042 0.578 L 33.601 10.17 L 33.601 27.858 L 17.042 37.971 L 0.5 27.858 L 0.5 10.17 Z"
      fill="none"
      stroke="currentColor"
      stroke-width="1"
      stroke-linejoin="round"
      pathLength="1"
    />
  </svg>
</template>

<style scoped>
.brand-logo {
  color: var(--ui-primary);
}

.logo-symbol-outline {
  fill: none;
  stroke-dasharray: 1;
}

.is-animating .logo-symbol-s {
  animation: logo-reveal-s 300ms ease-out both;
}

.is-animating .logo-symbol-arrows {
  animation: logo-reveal-arrows 300ms 300ms ease-out both;
}

.is-animating .logo-symbol-outline {
  animation: logo-draw-outline 600ms 600ms ease-in-out both;
}

@keyframes logo-reveal-s {
  from {
    opacity: 0;
    clip-path: inset(0 100% 0 0);
  }
  to {
    opacity: 1;
    clip-path: inset(0);
  }
}

@keyframes logo-reveal-arrows {
  from {
    opacity: 0;
    clip-path: inset(0 0 100% 0);
  }
  to {
    opacity: 1;
    clip-path: inset(0);
  }
}

@keyframes logo-draw-outline {
  from {
    stroke-dashoffset: 1;
  }
  to {
    stroke-dashoffset: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .is-animating .logo-symbol-s,
  .is-animating .logo-symbol-arrows,
  .is-animating .logo-symbol-outline {
    animation: none;
  }
}
</style>
