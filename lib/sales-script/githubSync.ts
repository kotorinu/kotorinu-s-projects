import { createHash } from "node:crypto";

export type SalesScriptEdition = "mogi" | "sugiyama" | "nagashima";

const PATHS: Record<SalesScriptEdition, string> = {
  mogi: "scripts/mogi.md",
  sugiyama: "scripts/sugiyama.md",
  nagashima: "scripts/nagashima-reference.md",
};

type GitHubConfig = { token: string; repository: string; branch: string };
export type GitPublishResult =
  | { status: "SYNCED"; path: string; commitSha: string; contentSha: string }
  | { status: "NOT_CONFIGURED" | "FAILED"; path: string; error: string };

export function salesScriptPath(edition: SalesScriptEdition) { return PATHS[edition]; }

export function githubScriptConfig(env: Record<string, string | undefined> = process.env): GitHubConfig | null {
  const token = env.GITHUB_SCRIPT_TOKEN?.trim();
  const repository = env.GITHUB_SCRIPT_REPOSITORY?.trim();
  if (!token || !repository) return null;
  return {
    token,
    repository,
    branch: env.GITHUB_SCRIPT_BRANCH?.trim() || "main",
  };
}

function headers(config: GitHubConfig) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${config.token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "ai-work-os-sales-script-sync",
  };
}

export async function publishSalesScript(
  edition: SalesScriptEdition,
  content: string,
  fetcher: typeof fetch = fetch,
  env: Record<string, string | undefined> = process.env,
): Promise<GitPublishResult> {
  const path = salesScriptPath(edition);
  const config = githubScriptConfig(env);
  if (!config) return { status: "NOT_CONFIGURED", path, error: "GitHub同期が未接続です" };
  const endpoint = `https://api.github.com/repos/${config.repository}/contents/${path}`;
  try {
    const current = await fetcher(`${endpoint}?ref=${encodeURIComponent(config.branch)}`, { headers: headers(config), cache: "no-store" });
    if (!current.ok) throw new Error(`GitHub read ${current.status}`);
    const currentBody = await current.json() as { sha?: string };
    if (!currentBody.sha) throw new Error("GitHub content SHA missing");
    const update = await fetcher(endpoint, {
      method: "PUT",
      headers: { ...headers(config), "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `content(sales): update ${edition} script from Work OS`,
        content: Buffer.from(content, "utf8").toString("base64"),
        sha: currentBody.sha,
        branch: config.branch,
      }),
    });
    if (!update.ok) throw new Error(`GitHub update ${update.status}`);
    const body = await update.json() as { commit?: { sha?: string } };
    const commitSha = body.commit?.sha;
    if (!commitSha) throw new Error("GitHub commit SHA missing");
    return { status: "SYNCED", path, commitSha, contentSha: createHash("sha256").update(content).digest("hex") };
  } catch (error) {
    return { status: "FAILED", path, error: error instanceof Error ? error.message : "GitHub sync failed" };
  }
}
