import "asciinema-player";

declare module "asciinema-player" {
  interface Player {
    // Added by patches/asciinema-player@3.17.0.patch.
    setPlaybackRate(rate: number): Promise<boolean | void>;
  }
}
