import { expect, it, vi } from "vitest";
import { formatLocalAiError } from "./errors";
import { localAiMessages } from "./messages";
import { LocalAiError, withLocalAiErrors } from "./errorProtocol";

const reasoningError = JSON.stringify({
  error: {
    code: "invalid_request",
    message:
      "invalid request: DeepSeek V4.1 reasoning_effort must be low, high, xhigh, max, or an integer within [1, 100] in chat_template_kwargs"
  }
});

it.each(["zh", "en"] as const)("formats configuration errors in %s using codes before text", (locale) => {
  const messages = localAiMessages[locale].errors;
  const cases = [
    [new LocalAiError("LOCAL_AI_EXECUTABLE_NOT_FOUND", "Future wording"), messages.executableNotFound],
    [new LocalAiError("LOCAL_AI_ENGINE_NOT_INSTALLED", "Future wording"), messages.engineNotInstalled],
    [new LocalAiError("LOCAL_AI_API_KEY_REQUIRED", "Future wording"), messages.apiKeyRequired],
    [new LocalAiError("LOCAL_AI_MODEL_REQUIRED", "Future wording"), messages.modelRequired],
    [new LocalAiError("LOCAL_AI_BASE_URL_INVALID", "Future wording"), messages.baseUrlInvalid],
    [new LocalAiError("LOCAL_AI_BASE_URL_UNSUPPORTED", "Future wording"), messages.baseUrlUnsupported],
    [{ status: 401, message: "the requested model is unavailable" }, messages.authenticationFailed],
    [{ codexErrorInfo: "modelNotFound", message: "Future wording" }, messages.modelUnavailable],
    [{ error: { code: "invalid_api_key", message: "Future wording" } }, messages.authenticationFailed],
    [
      { codexErrorInfo: "badRequest", message: reasoningError },
      messages.reasoningAllowed.replace("{levels}", "low / high / xhigh / max")
    ],
    [
      new Error("Error invoking remote method 'jms:invoke': Error: the requested model is unavailable"),
      messages.modelUnavailable
    ]
  ] as const;
  for (const [error, expected] of cases) expect(formatLocalAiError(error, locale)).toBe(expected);
});

it("retains outer HTTP status and independently parses additional provider details", () => {
  expect(
    formatLocalAiError(
      `unexpected status 401 Unauthorized: {"error":{"code":"invalid_request","message":"Access denied"}}`,
      "zh"
    )
  ).toBe(localAiMessages.zh.errors.authenticationFailed);
  expect(
    formatLocalAiError(
      {
        message: "Request failed for {model}",
        additionalDetails: '{"error":{"code":"model_not_found","message":"No matching model"}}'
      },
      "zh"
    )
  ).toBe(localAiMessages.zh.errors.modelUnavailable);
  expect(
    formatLocalAiError(
      {
        message: "Request failed",
        codexErrorInfo: "other",
        additionalDetails: 'HTTP 401: {"error":{"code":"invalid_request_error","message":"Access denied"}}'
      },
      "zh"
    )
  ).toBe(localAiMessages.zh.errors.authenticationFailed);
});

it("passes configuration error fields over IPC while leaving conversation commands unchanged", async () => {
  const { desktopInvoke } = await import("../desktop/bridge");
  const key = 'private-"provider-key';
  const failure = LocalAiError.from(
    {
      code: -32602,
      message: JSON.stringify({ error: { code: "model_not_found", message: `Rejected ${key}` } }),
      codexErrorInfo: { httpConnectionFailed: { httpStatusCode: 404 } }
    },
    "LOCAL_AI_PROVIDER_ERROR",
    key
  );
  const response = structuredClone(
    await withLocalAiErrors(async () => {
      throw failure;
    })
  );
  const invoke = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("__JMS_DESKTOP__", { invoke });
  try {
    for (const command of ["local_codex_configure", "local_codex_probe", "local_codex_models", "local_codex_test"]) {
      await expect(desktopInvoke(command)).rejects.toMatchObject({
        code: "LOCAL_AI_PROVIDER_ERROR",
        message: "Rejected [redacted]",
        details: { status: 404, rpcCode: -32602, providerCode: "model_not_found", codexCode: "httpConnectionFailed" }
      });
    }
    await expect(desktopInvoke("local_codex_send")).resolves.toBe(response);
    invoke.mockResolvedValue({ version: "codex-cli 0.167.2" });
    await expect(desktopInvoke("local_codex_probe")).resolves.toEqual({ version: "codex-cli 0.167.2" });
  } finally {
    vi.unstubAllGlobals();
  }
});
