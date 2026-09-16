import { DOMParser, XMLSerializer, onErrorStopParsing } from "@xmldom/xmldom";
import path from "node:path";

// electron-wix-msi 5.x always adds a launcher and app-<version> directory.
// Customize its public WiX output so Tinker launches Electron with stdin intact.
export function flattenWebLiteMsi(wxsContent, appDirectory, version) {
  const document = new DOMParser({ onError: onErrorStopParsing }).parseFromString(wxsContent, "text/xml");
  const elements = (name) => Array.from(document.getElementsByTagName(name));
  const single = (items, label) => {
    if (items.length !== 1) throw new Error(`Unexpected WebLite MSI layout: ${label}`);
    return items[0];
  };
  const root = single(
    elements("Directory").filter((node) => node.getAttribute("Id") === "APPLICATIONROOTDIRECTORY"),
    "installation directory"
  );
  const versionDirectory = single(
    elements("Directory").filter((node) => node.parentNode === root && node.getAttribute("Name") === `app-${version}`),
    "version directory"
  );
  const executables = elements("File").filter((node) => node.getAttribute("Name") === "weblite.exe");
  const launcher = single(
    executables.filter((node) => node.parentNode?.parentNode === root),
    "launcher"
  );
  const executable = single(
    executables.filter((node) => node.parentNode?.parentNode === versionDirectory),
    "Electron executable"
  );
  if (executables.length !== 2 || executable.getAttribute("Source") !== path.join(appDirectory, "weblite.exe")) {
    throw new Error("Unexpected WebLite MSI executable source");
  }
  const launcherComponent = launcher.parentNode;
  const launcherRef = single(
    elements("ComponentRef").filter((node) => node.getAttribute("Id") === launcherComponent.getAttribute("Id")),
    "launcher component reference"
  );
  launcherRef.parentNode.removeChild(launcherRef);
  root.removeChild(launcherComponent);
  while (versionDirectory.firstChild) root.insertBefore(versionDirectory.firstChild, versionDirectory);
  root.removeChild(versionDirectory);
  return new XMLSerializer().serializeToString(document);
}
