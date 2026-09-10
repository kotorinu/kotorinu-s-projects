import type { Ledger } from "./model";
import { sourceProblem } from "./planner";
import { authConfigured } from "./security";
import { redisCredentials } from "../server/redisClient";

/** Configuration is not proof of a successful read. No credentials in either object. */
export function configuration() {
  const e = process.env;
  const source = (name: string) => Boolean(e[`RIALA_${name}_SOURCE_URL`] && e[`RIALA_${name}_SOURCE_TOKEN`]);
  return { auth: authConfigured(), origin: Boolean(e.RIALA_APP_ORIGIN),
    store: Boolean(redisCredentials(e)),
    members: source("MEMBERS"), gmail: Boolean(e.RIALA_GMAIL_CLIENT_ID && e.RIALA_GMAIL_CLIENT_SECRET && e.RIALA_GMAIL_READ_REFRESH_TOKEN),
    events: source("EVENTS"), content: source("CONTENT") };
}
export function observedReadiness(ledger: Ledger | null = null, now = new Date().toISOString()) {
  const production = Boolean(process.env.VERCEL || process.env.NODE_ENV === "production");
  const latest = ledger?.runs.at(-1);
  const fresh = (name: string) => {
    const source = latest?.sourcesRead.find(s => s.name === name);
    return Boolean(source && !sourceProblem({ ...source, items: [] }, now, ledger!.settings.maxSourceAgeMinutes, production));
  };
  return { auth: authConfigured() && (!production || Boolean(process.env.RIALA_APP_ORIGIN)), store: ledger !== null,
    members: fresh("members"), gmail: fresh("gmail"), events: fresh("events"), content: fresh("content"),
    send: process.env.RIALA_SEND_ENABLED === "true" && Boolean(process.env.RIALA_GMAIL_SEND_REFRESH_TOKEN),
    mode: production ? "PRODUCTION" : "LOCAL", autoSendAllowed: false as const };
}
