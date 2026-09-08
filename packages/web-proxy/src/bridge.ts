type Invoke = <T = unknown>(command: string, args?: Record<string, unknown>) => Promise<T>;
type Listen = <T>(name: string, handler: (event: { payload: T }) => void) => Promise<() => void>;
export function createWebProxyBridge(invoke: Invoke, listen: Listen) {
  return {
    create: (request: Record<string, unknown>) => invoke("create_web_proxy_view", request),
    setActive: (label: string, active: boolean) => invoke<void>("set_web_proxy_view_active", { label, active }),
    setBounds: (label: string, bounds: { x: number; y: number; width: number; height: number }) =>
      invoke<void>("set_web_proxy_view_bounds", { label, ...bounds }),
    navigate: (label: string, targetUrl: string) => invoke<void>("navigate_web_proxy_view", { label, targetUrl }),
    history: (label: string, direction: "back" | "forward") =>
      invoke<void>("history_web_proxy_view", { label, direction }),
    reload: (label: string) => invoke<void>("reload_web_proxy_view", { label }),
    completeVerification: (label: string) => invoke<boolean>("complete_web_proxy_verification", { label }),
    interactionInput: (label: string, input: Record<string, unknown>) =>
      invoke<boolean>("web_proxy_interaction_input", { label, input }),
    onInteraction: <T>(handler: (event: { payload: T }) => void) => listen<T>("web-proxy-interaction", handler),
    startRecording: (request: Record<string, unknown>) => invoke("start_web_proxy_recording", request),
    stopRecording: (label: string) => invoke("stop_web_proxy_recording", { label }),
    close: (label: string) => invoke<void>("close_web_proxy_view", { label }),
    onState: <T>(handler: (event: { payload: T }) => void) => listen<T>("web-proxy-state", handler),
    onAutofillState: <T>(handler: (event: { payload: T }) => void) => listen<T>("web-proxy-autofill-state", handler),
    onRecordingState: <T>(handler: (event: { payload: T }) => void) => listen<T>("web-proxy-recording-state", handler)
  };
}
export type WebProxyBridge = ReturnType<typeof createWebProxyBridge>;
