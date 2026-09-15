const JMSErrorStatusCodes: Readonly<Record<number, string>> = {
  1000: "JMSErrNoSession",
  1001: "JMSErrAuthUser",
  1002: "JMSErrBadParams",
  1003: "JMSErrIdleTimeOut",
  1004: "JMSErrPermissionExpired",
  1005: "JMSErrTerminatedByAdmin",
  1006: "JMSErrAPIFailed",
  1007: "JMSErrGatewayFailed",
  1008: "JMSErrGuacamoleServer",
  1009: "JMSErrDisconnected",
  1010: "JMSErrMaxSession",
  1011: "JMSErrRemoveShareUser"
};

export const ErrorStatusCodes: Readonly<Record<number, string>> = {
  256: "GuaErrUnSupport",
  512: "GuaErrServerError",
  513: "GuaErrServerBusy",
  514: "GuaErrUpStreamTimeout",
  515: "GuacamoleErrUpstreamError",
  516: "GuaErrResourceNotFound",
  517: "GuaErrResourceConflict",
  518: "GuaErrResourceClosed",
  519: "GuaErrUpStreamNotFound",
  520: "GuaErrUpStreamUnavailable",
  521: "GuaErrSessionConflict",
  522: "GuacamoleErrIdleSessionTimeLimitExceeded",
  523: "GuacamoleErrForciblyDisconnected",
  768: "JMSErrBadParams",
  769: "GuaErrClientUnauthorized",
  771: "GuacamoleErrInsufficientPrivileges",
  776: "GuaErrClientTimeout",
  781: "GuaErrClientOverrun",
  783: "GuaErrClientBadType",
  797: "GuaErrClientTooMany",
  ...JMSErrorStatusCodes
};

export const APIErrorType: any = {
  "connect API core err": "JMSErrAPIFailed",
  "connect Panda API core err": "JMSErrAPIFailed",
  "unsupported type": "JMSErrBadParams",
  "unsupported protocol": "JMSErrBadParams",
  "permission deny": "JMSErrPermission"
};

export function ConvertAPIError(errMsg: string | any): string {
  if (typeof errMsg !== "string") {
    return errMsg;
  }
  const errArray = errMsg.split(":");
  const errorKey = errArray[0];
  if (errorKey) {
    return APIErrorType[errorKey] || errMsg;
  }
  return errMsg;
}

export const GuacamoleErrMsg: Readonly<Record<string, string>> = {
  "No permission": "JMSErrPermission",
  "Disconnected.": "GuacamoleErrDisconnected",
  "Credentials expired.": "GuacamoleErrCredentialsExpired",
  "Security negotiation failed (wrong security type?)": "GuacamoleErrSecurityNegotiationFailed",
  "Access denied by server (account locked/disabled?)": "GuacamoleErrAccessDenied",
  "Authentication failure (invalid credentials?)": "GuacamoleErrAuthenticationFailure",
  "SSL/TLS connection failed (untrusted/self-signed certificate?)": "GuacamoleErrSSLTLSConnectionFailed",
  "DNS lookup failed (incorrect hostname?)": "GuacamoleErrDNSLookupFailed",
  "Server refused connection (wrong security type?)": "GuacamoleErrServerRefusedConnectionBySecurityType",
  "Connection failed (server unreachable?)": "GuacamoleErrConnectionFailed",
  "Upstream error.": "GuacamoleErrUpstreamError",
  "Forcibly disconnected.": "GuacamoleErrForciblyDisconnected",
  "Logged off.": "GuacamoleErrLoggedOff",
  "Idle session time limit exceeded.": "GuacamoleErrIdleSessionTimeLimitExceeded",
  "Active session time limit exceeded.": "GuacamoleErrActiveSessionTimeLimitExceeded",
  "Disconnected by other connection.": "GuacamoleErrDisconnectedByOtherConnection",
  "Server refused connection.": "GuacamoleErrServerRefusedConnection",
  "Insufficient privileges.": "GuacamoleErrInsufficientPrivileges",
  "Manually disconnected.": "GuacamoleErrManuallyDisconnected",
  "Manually logged off.": "GuacamoleErrManuallyLoggedOff",

  "Unsupported credential type requested.": "GuacamoleErrUnsupportedCredentialTypeRequested",
  "Unable to connect to VNC server.": "GuacamoleErrUnableToConnectToVNCServer"
};

export function ConvertGuacamoleError(errMsg: unknown, code?: number): string {
  const statusCode = typeof code === "number" && Number.isInteger(code) ? code : undefined;
  if (statusCode !== undefined && JMSErrorStatusCodes[statusCode]) {
    return JMSErrorStatusCodes[statusCode];
  }

  const message = typeof errMsg === "string" ? errMsg.trim() : "";
  const messageKey = Object.hasOwn(GuacamoleErrMsg, message) ? GuacamoleErrMsg[message] : undefined;
  // Generic messages must not hide a more useful status code.
  if (messageKey && message !== "Disconnected." && message !== "Upstream error.") {
    return messageKey;
  }
  return (
    (statusCode === undefined ? undefined : ErrorStatusCodes[statusCode]) || messageKey || "GuaErrConnectionClosed"
  );
}

export interface GuacamoleConnectionErrorDetails {
  code?: number;
  message?: string;
  sessionId?: string;
}
