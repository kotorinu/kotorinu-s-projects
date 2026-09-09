import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Which build am I looking at? (2026-09-09)
  //
  // Debugging "the fix isn't live" is guesswork without this: the page looks
  // the same whether it is three commits behind or current. Vercel sets
  // VERCEL_GIT_COMMIT_SHA at build time; re-exporting it under a NEXT_PUBLIC_
  // name is what makes it readable from the rendered page. A commit SHA is
  // public information — this is not a place for anything secret.
  env: {
    NEXT_PUBLIC_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA ?? "",
    NEXT_PUBLIC_BUILT_AT: new Date().toISOString(),
  },
};

export default nextConfig;
