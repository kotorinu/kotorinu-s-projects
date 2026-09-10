import { readerAuthenticated, readerCookie, readerSession, readerSessionToken, READER_SESSION_MS } from "./readerSession";

// Calendar's read-only device session. The mechanics are shared with Gmail in
// readerSession; the purpose string below is what keeps the two apart, since
// it is signed into the token.

export const CALENDAR_COOKIE = "calendar_reader";
export const CALENDAR_SESSION_MS = READER_SESSION_MS;
const PURPOSE = "calendar-reader";
const PATH = "/api/calendar";

/** Read-only device authorization. Never accepted by RIALA mutation/send endpoints. */
export function calendarSession(secret: string, now = Date.now()) { return readerSession(PURPOSE, secret, now); }
/** The raw session token, used to bind an OAuth state to this browser. Never logged or returned. */
export function calendarSessionToken(request: Request) { return readerSessionToken(request, CALENDAR_COOKIE); }
export function calendarAuthenticated(request: Request, secret = process.env.RIALA_OPERATOR_SECRET ?? "", now = Date.now()) {
  return readerAuthenticated(request, CALENDAR_COOKIE, PURPOSE, secret, now);
}
export function calendarCookie(request: Request, clear = false) {
  return readerCookie(request, CALENDAR_COOKIE, PURPOSE, PATH, clear);
}
export { cronAuthenticated } from "./readerSession";
