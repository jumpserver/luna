import { Tunnel } from "./Tunnel.js";

/**
 * Guacamole Tunnel implemented over WebSocket via XMLHttpRequest.
 */
export class WebSocketTunnel extends Tunnel {
    /**
     * @param tunnelURL The URL of the WebSocket tunneling service.
     */
    constructor(tunnelURL: string);
}
