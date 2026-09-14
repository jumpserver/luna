export function resolveAdvancedOptionFlags(input: {
  protocol?: string;
  component?: string;
  hasXPack?: boolean;
  connectionTokenReusable?: boolean;
  appletConnectMethod?: string;
}) {
  const protocol = (input.protocol || "").trim().toLowerCase();
  const component = (input.component || "").trim().toLowerCase();
  const charset = protocol === "ssh" || protocol === "telnet";
  const backspace = !component || component === "koko";
  const disableAutoHash = protocol === "mysql" || protocol === "mariadb";
  const resolution = protocol === "rdp";
  const remoteMicrophone = resolution && input.hasXPack === true;
  const rdpConnectionSpeed = component === "razor";
  const reusable =
    input.connectionTokenReusable === true &&
    (component === "razor" || (component === "tinker" && input.appletConnectMethod === "client"));
  const sysdba = protocol === "oracle";
  const applet = input.hasXPack === true && component === "tinker";
  const virtualapp = input.hasXPack === true && component === "panda";

  return {
    charset,
    backspace,
    disableAutoHash,
    resolution,
    remoteMicrophone,
    rdpConnectionSpeed,
    reusable,
    sysdba,
    applet,
    virtualapp,
    show:
      charset ||
      backspace ||
      disableAutoHash ||
      resolution ||
      sysdba ||
      applet ||
      virtualapp ||
      reusable ||
      rdpConnectionSpeed
  };
}
