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

/** "3ea783d・9/9 08:12" — small enough to sit in a footer. */
export function buildLabel(): string {
  if (BUILT_AT === "") return COMMIT_SHA_SHORT;
  const d = new Date(BUILT_AT);
  if (Number.isNaN(d.getTime())) return COMMIT_SHA_SHORT;
  const when = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
  return `${COMMIT_SHA_SHORT}・${when}`;
}
