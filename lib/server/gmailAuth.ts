import { readerAuthenticated, readerCookie, readerSession, readerSessionToken, READER_SESSION_MS } from "./readerSession";

// Gmail's read-only device session. Separate cookie, separate path, and a
// separate signed purpose, so a Calendar reader cookie cannot authenticate a
// Gmail request and vice versa.

export const GMAIL_COOKIE = "gmail_reader";
export const GMAIL_SESSION_MS = READER_SESSION_MS;
const PURPOSE = "gmail-reader";
const PATH = "/api/gmail";

export function gmailSession(secret: string, now = Date.now()) { return readerSession(PURPOSE, secret, now); }
export function gmailSessionToken(request: Request) { return readerSessionToken(request, GMAIL_COOKIE); }
export function gmailAuthenticated(request: Request, secret = process.env.RIALA_OPERATOR_SECRET ?? "", now = Date.now()) {
  return readerAuthenticated(request, GMAIL_COOKIE, PURPOSE, secret, now);
}
export function gmailCookie(request: Request, clear = false) {
  return readerCookie(request, GMAIL_COOKIE, PURPOSE, PATH, clear);
}
