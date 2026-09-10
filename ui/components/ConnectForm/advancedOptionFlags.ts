export function resolveAdvancedOptionFlags(input: { protocol?: string; component?: string; hasXPack?: boolean }) {
  const protocol = (input.protocol || "").trim().toLowerCase();
  const component = (input.component || "").trim().toLowerCase();
  const charset = protocol === "ssh" || protocol === "telnet";
  const backspace = !component || component === "koko";
  const disableAutoHash = protocol === "mysql" || protocol === "mariadb";
  const resolution = protocol === "rdp";
  const sysdba = protocol === "oracle";
  const applet = input.hasXPack === true && component === "tinker";
  const virtualapp = input.hasXPack === true && component === "panda";

  return {
    charset,
    backspace,
    disableAutoHash,
    resolution,
    sysdba,
    applet,
    virtualapp,
    show: charset || backspace || disableAutoHash || resolution || sysdba || applet || virtualapp
  };
}
