import { createHash } from "node:crypto";
import type { Action, Sender } from "./model";
import { GMAIL_API, gmailToken, header, recipients, type GmailMessage } from "./providers";
import { emailKey, validEmail } from "./planner";

export class GmailSender implements Sender {
  get enabled() { return process.env.RIALA_SEND_ENABLED === "true" && !!process.env.RIALA_GMAIL_SEND_REFRESH_TOKEN && !!process.env.RIALA_GMAIL_READ_REFRESH_TOKEN; }
  private messageId(a: Action) { return `<riala-${createHash("sha256").update(a.businessKey).digest("hex")}@planner.riala.invalid>`; }
  private async account(token: string) {
    const r = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error("Gmail account verification failed"); const b = await r.json() as { emailAddress: string }; return emailKey(b.emailAddress);
  }
  async send(a: Action) {
    if (!this.enabled || !a.identity.email || !validEmail(a.identity.email) || /[\r\n]/.test(a.subject)) throw new Error("Send disabled");
    const readToken = await gmailToken(); const sendToken = await gmailToken(true);
    const [reader, sender] = await Promise.all([this.account(readToken), this.account(sendToken)]);
    if (reader !== sender) throw new Error("Gmail read/send accounts differ");
    const raw = [`From: ${sender}`, `To: ${a.identity.email}`, `Subject: =?UTF-8?B?${Buffer.from(a.subject).toString("base64")}?=`,
      `Message-ID: ${this.messageId(a)}`, "MIME-Version: 1.0", "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "", Buffer.from(a.draft).toString("base64").match(/.{1,76}/g)!.join("\r\n")].join("\r\n");
    // No automatic retries: a timeout may have delivered the message.
    const res = await fetch(`${GMAIL_API}/send`, { method: "POST", headers: { Authorization: `Bearer ${sendToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ raw: Buffer.from(raw).toString("base64url") }), cache: "no-store", signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error("Gmail send result unconfirmed"); const body = await res.json() as { id?: string };
    if (!body.id) throw new Error("Gmail message ID missing"); return { id: body.id };
  }
  async readBack(a: Action) {
    const token = await gmailToken();
    let id = a.externalId;
    if (!id) {
      const url = new URL(GMAIL_API); url.searchParams.set("q", `in:sent rfc822msgid:${this.messageId(a)}`); url.searchParams.set("maxResults", "2");
      const list = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(10000) });
      if (!list.ok) return { confirmed: false, id: null };
      const body = await list.json() as { messages?: { id: string }[] };
      if (body.messages?.length !== 1) return { confirmed: false, id: null }; id = body.messages[0].id;
    }
    const res = await fetch(`${GMAIL_API}/${encodeURIComponent(id)}?format=full`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(10000) });
    if (!res.ok) return { confirmed: false, id };
    const m = await res.json() as GmailMessage;
    const encoded = m.payload?.body?.data ?? m.payload?.parts?.find(p => p.mimeType === "text/plain")?.body?.data;
    const text = encoded ? Buffer.from(encoded, "base64url").toString("utf8").replace(/\r\n/g, "\n").trimEnd() : null;
    const to = recipients(header(m, "To"));
    const confirmed = !!m.labelIds?.includes("SENT") && header(m, "Message-ID") === this.messageId(a) && to.length === 1 &&
      to[0] === a.identity.email && !header(m, "Cc") && !header(m, "Bcc") && text === a.draft.replace(/\r\n/g, "\n").trimEnd();
    return { confirmed, id };
  }
}

