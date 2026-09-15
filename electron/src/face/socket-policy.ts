export function isFaceLiveWebSocket(socketUrl: string, siteOrigin: string) {
  try {
    const socket = new URL(socketUrl);
    const site = new URL(siteOrigin);
    const expectedProtocol = site.protocol === "https:" ? "wss:" : site.protocol === "http:" ? "ws:" : "";
    return (
      Boolean(expectedProtocol) &&
      socket.protocol === expectedProtocol &&
      socket.host === site.host &&
      /(?:^|\/)ws\/facelive(?:\/|$)/.test(socket.pathname)
    );
  } catch {
    return false;
  }
}
