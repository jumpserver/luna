import { MakerBase } from "@electron-forge/maker-base";
import type { MakerOptions } from "@electron-forge/maker-base";
import type { ForgePlatform } from "@electron-forge/shared-types";
import { archFromString, build, Platform } from "electron-builder";
import type { Configuration } from "electron-builder";
import path from "node:path";

// Forge prepares the application (including native modules); builder only creates the installer.
export class MakerNsis extends MakerBase<{ projectDir: string; options: Configuration }> {
  name = "nsis";
  defaultPlatforms: ForgePlatform[] = ["win32"];

  isSupportedOnCurrentPlatform() {
    return process.platform === "win32";
  }

  async make({ dir, makeDir, targetArch }: MakerOptions) {
    const output = path.resolve(makeDir, "nsis", targetArch);
    await this.ensureDirectory(output);
    return build({
      projectDir: this.config.projectDir,
      prepackaged: dir,
      targets: Platform.WINDOWS.createTarget("nsis", archFromString(targetArch)),
      publish: "never",
      config: {
        ...this.config.options,
        extends: null,
        directories: { output },
        publish: null
      }
    });
  }
}
