import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { assertAllowedHost, assertHeavyGetMetadata } from "@/app/requestSecurity";

const COMPANY_LANDING_PATH = /^\/company\/[^/]+\/?$/;

/**
 * No Metis page is meant to render inside a frame, its own included: the print
 * view opens in a new window. Without these headers a hostile page could frame
 * Settings and steer clicks into same-origin mutations (clickjacking), which the
 * same-origin guard accepts because the framed page's own fetches are same-origin.
 * The CSP directive is the standard; X-Frame-Options covers older browsers.
 */
const FRAME_DENY_HEADERS: Readonly<Record<string, string>> = {
  "content-security-policy": "frame-ancestors 'none'",
  "x-frame-options": "DENY",
};

function denyFraming(response: Response): Response {
  for (const [name, value] of Object.entries(FRAME_DENY_HEADERS)) response.headers.set(name, value);
  return response;
}

/** Request-wide local trust boundary. Next invokes this for every request. */
export function proxy(request: NextRequest): Response {
  const rejectedHost = assertAllowedHost(request);
  if (rejectedHost !== null) return denyFraming(rejectedHost);

  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD") {
    const pathname = new URL(request.url).pathname;
    if (COMPANY_LANDING_PATH.test(pathname)) {
      const rejectedMetadata = assertHeavyGetMetadata(request);
      if (rejectedMetadata !== null) return denyFraming(rejectedMetadata);
    }
  }

  return denyFraming(NextResponse.next());
}
