// What build the viewer is actually looking at (2026-09-09, §P5).
//
// Populated by next.config.ts from Vercel's VERCEL_GIT_COMMIT_SHA. Locally
// there is no such variable, so it reads "local" — which is itself the right
// answer for a dev server.

const RAW_SHA = process.env.NEXT_PUBLIC_COMMIT_SHA ?? "";
const RAW_BUILT_AT = process.env.NEXT_PUBLIC_BUILT_AT ?? "";

export const COMMIT_SHA: string = RAW_SHA === "" ? "local" : RAW_SHA;
export const COMMIT_SHA_SHORT: string = COMMIT_SHA === "local" ? "local" : COMMIT_SHA.slice(0, 7);
export const BUILT_AT: string = RAW_BUILT_AT;

/**
 * "3ea783d・9/9 08:12 UTC" — small enough to sit in a footer.
 *
 * Read straight out of the ISO string rather than through Date's local-time
 * getters. This label renders inside a statically prerendered page, so a
 * UTC build machine and a JST browser would otherwise print different times
 * and React would report a hydration mismatch (#418). The zone is stated
 * instead of converted, which is also the more useful thing to show for a
 * build timestamp.
 */
export function buildLabel(): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(BUILT_AT);
  if (!m) return COMMIT_SHA_SHORT;
  const [, , mo, d, h, mi] = m;
  return `${COMMIT_SHA_SHORT}・${Number(mo)}/${Number(d)} ${h}:${mi} UTC`;
}
