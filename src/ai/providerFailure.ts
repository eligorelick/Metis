import { z } from "zod";

/** Safe provider diagnostics only: never response bodies, prompts or credentials. */
export const ProviderFailureSchema = z.object({
  disposition: z.enum(["terminal", "transient"]),
  httpStatus: z.number().int().min(100).max(599).optional(),
  code: z.string().regex(/^[\w.-]{1,60}$/).optional(),
  param: z.string().regex(/^[\w.[\]-]{1,60}$/).optional(),
  requestId: z.string().regex(/^[\w.-]{1,128}$/).optional(),
  bodyShape: z.enum(["error", "detail", "other", "stream-error", "transport"]),
}).strict();
export type ProviderFailure = z.infer<typeof ProviderFailureSchema>;

const TERMINAL_CODES = new Set([
  "subscription_sharing_user_not_eligible", "subscription_sharing_usage_limit_exceeded",
  "subscription_sharing_invalid_user", "subscription_sharing_route_not_supported",
  "subscription_sharing_unsupported_capability", "chatpass_v2_scope_not_authorized",
  "chatpass_v2_invalid_authorization_context", "model_not_found", "invalid_request_error",
]);
const TEMPORARY_CODES = new Set(["subscription_sharing_usage_unavailable", "subscription_sharing_user_unavailable"]);

/** https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery */
export function chatGptFailureContext(error: unknown, httpStatus: number | undefined,
  requestId: string | null, bodyShape: ProviderFailure["bodyShape"]): ProviderFailure {
  const object = error !== null && typeof error === "object" ? error as Record<string, unknown> : {};
  const code = typeof object.code === "string" && /^[\w.-]{1,60}$/.test(object.code) ? object.code : undefined;
  const param = typeof object.param === "string" && /^[\w.[\]-]{1,60}$/.test(object.param) ? object.param : undefined;
  const terminal = code !== undefined && TERMINAL_CODES.has(code) ||
    !(code !== undefined && TEMPORARY_CODES.has(code)) &&
      ([400, 401, 403, 404, 422].includes(httpStatus ?? 0) || ["model", "service_tier", "reasoning.effort"].includes(param ?? ""));
  return { disposition: terminal ? "terminal" : "transient", bodyShape,
    ...(httpStatus === undefined ? {} : { httpStatus }), ...(code === undefined ? {} : { code }),
    ...(param === undefined ? {} : { param }),
    ...(requestId !== null && /^[\w.-]{1,128}$/.test(requestId) ? { requestId } : {}),
  };
}
