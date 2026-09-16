export function resolveAdvancedOptionFlags(input: {
  protocol?: string;
  component?: string;
  connectMethod?: string;
  hasXPack?: boolean;
  connectionTokenReusable?: boolean;
  appletConnectMethod?: string;
}) {
  const protocol = (input.protocol || "").trim().toLowerCase();
  const component = (input.component || "").trim().toLowerCase();
  const connectMethod = (input.connectMethod || "").trim().toLowerCase();
  const charset = protocol === "ssh" || protocol === "telnet";
  const backspace = !component || component === "koko";
  const disableAutoHash = protocol === "mysql" || protocol === "mariadb";
  const resolution = protocol === "rdp";
  const remoteMicrophone = resolution && input.hasXPack === true;
  const rdpConnectionSpeed = component === "razor";
  const reusable =
    input.connectionTokenReusable === true &&
    (component === "razor" || (component === "tinker" && input.appletConnectMethod === "client"));
  const tokenReusable =
    input.connectionTokenReusable === true && component === "magnus" && connectMethod === "db_client";
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
    tokenReusable,
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
      tokenReusable ||
      rdpConnectionSpeed
  };
}
