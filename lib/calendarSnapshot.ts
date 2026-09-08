// A real reading of the user's Google Calendar (2026-09-09, §21).
//
// This is DATA, not a claim of sync. It records what the calendar actually
// contained when it was read, so the OS can compare its own plan against it
// and say honestly where the two disagree.
//
// Two rules that keep it honest:
//   - `coverageStart`/`coverageEnd` bound what was actually read. Anything
//     outside that range is UNKNOWN, never "matched" and never "missing".
//   - `readAt` ages the snapshot. A stale snapshot is worth less than a fresh
//     one and the UI says so rather than pretending it is live.
//
// There is no Calendar write path in this app (see §27 in the round report),
// so this file is refreshed by an operator session with Calendar access.

export interface CalendarSnapshotEvent {
  id: string;
  summary: string;
  date: string; // YYYY-MM-DD (local start date)
  startTime: string | null; // HH:mm, null for all-day
  endTime: string | null;
  colorId: string | null;
  allDay: boolean;
}

export interface CalendarSnapshot {
  readAt: string; // ISO8601
  coverageStart: string; // YYYY-MM-DD inclusive
  coverageEnd: string; // YYYY-MM-DD inclusive
  calendarId: string;
  events: CalendarSnapshotEvent[];
}

export const calendarSnapshot: CalendarSnapshot = {
  readAt: "2026-09-09T00:00:00+09:00",
  coverageStart: "2026-09-09",
  coverageEnd: "2026-09-11",
  calendarId: "primary",
  events: [
    // --- 2026-09-09 (水) ---
    {
      id: "c19jsjfetp7b0p4a6265gkm1u4_20260909",
      summary: "【締切メモ】水曜22:30 営業実践クラス",
      date: "2026-09-09",
      startTime: null,
      endTime: null,
      colorId: null,
      allDay: true,
    },
    {
      id: "2mjoijfi74a4pjdrrvorqgcpv4",
      summary: "【朝｜構造化DAY】Calendar→OS→営業全工程→ボトルネック仮説",
      date: "2026-09-09",
      startTime: "05:30",
      endTime: "06:30",
      colorId: "3",
      allDay: false,
    },
    {
      id: "4qi2ktub37c8mpr2ndco5t59cs",
      summary: "【読書】全米トップ校｜p61-120",
      date: "2026-09-09",
      startTime: "06:30",
      endTime: "07:45",
      colorId: "5",
      allDay: false,
    },
    {
      id: "o0lpnnop5l184eplr2tbp73670",
      summary: "【昼スマホ】営業v1の詰まりを口頭修正→夜の完成点を確定",
      date: "2026-09-09",
      startTime: "11:30",
      endTime: "12:30",
      colorId: "9",
      allDay: false,
    },
    {
      id: "p0nh30q6j3join6m3ue5ehb830",
      summary: "【営業】PDF p2-18｜17フェーズ口頭説明→v1完成",
      date: "2026-09-09",
      startTime: "19:00",
      endTime: "21:10",
      colorId: "9",
      allDay: false,
    },
    {
      id: "m5067e4pf7nrbs1nsn9svdbae0_20260909T123000Z",
      summary: "【RIALA】移行ステータスを管理更新",
      date: "2026-09-09",
      startTime: "21:30",
      endTime: "22:00",
      colorId: "10",
      allDay: false,
    },
    {
      id: "fhq3o43u5p6i51b4kh50gar0d4_20260909T130000Z",
      summary: "【夜｜翌日計画】Fact→優先順位→Calendar確定",
      date: "2026-09-09",
      startTime: "22:00",
      endTime: "22:20",
      colorId: "8",
      allDay: false,
    },
    {
      id: "n6junh2nm14156ogrv518pqh68",
      summary: "【参加】営業実践クラス",
      date: "2026-09-09",
      startTime: "22:30",
      endTime: "23:30",
      colorId: "9",
      allDay: false,
    },
    // --- 2026-09-10 (木) ---
    {
      id: "big254t3917a4shg78mbvm9l5o",
      summary: "19:30高山さん解約手続き30分割か一括かここで選べる",
      date: "2026-09-10",
      startTime: null,
      endTime: null,
      colorId: null,
      allDay: true,
    },
    {
      id: "ppa8qvsvujr27bjaei1auip18g",
      summary: "【読書】全米トップ校｜p121-180",
      date: "2026-09-10",
      startTime: "07:00",
      endTime: "08:00",
      colorId: "5",
      allDay: false,
    },
    {
      id: "s5j41i2sl1itmv40j92ievqo1c",
      summary: "【昼スマホ】Skill Plus営業コンテンツ最終回収",
      date: "2026-09-10",
      startTime: "11:30",
      endTime: "12:30",
      colorId: "9",
      allDay: false,
    },
    {
      id: "fiu380ldn1pnok2j7tiepsv7j0",
      summary: "【契約】高山さん｜解約手続き・支払い方法確認",
      date: "2026-09-10",
      startTime: "19:30",
      endTime: "20:00",
      colorId: null,
      allDay: false,
    },
    {
      id: "a4tvjpi8eblamtluap6k4ip4n8",
      summary: "【AI Work OS】TASK MAP/TODAYの実行管理バグを直す→3ケース確認",
      date: "2026-09-10",
      startTime: "20:00",
      endTime: "21:00",
      colorId: "7",
      allDay: false,
    },
    {
      id: "m5067e4pf7nrbs1nsn9svdbae0_20260910T123000Z",
      summary: "【RIALA】新アプリ照合＋移行返信対応",
      date: "2026-09-10",
      startTime: "21:30",
      endTime: "22:00",
      colorId: "10",
      allDay: false,
    },
    {
      id: "fhq3o43u5p6i51b4kh50gar0d4_20260910T130000Z",
      summary: "【夜｜翌日計画】Fact→優先順位→Calendar確定",
      date: "2026-09-10",
      startTime: "22:00",
      endTime: "22:20",
      colorId: "8",
      allDay: false,
    },
    // --- 2026-09-11 (金) ---
    {
      id: "3uuj3g1oe8tmnm6aebutpbrd5c",
      summary: "【読了期限】全米トップ校｜240p",
      date: "2026-09-11",
      startTime: null,
      endTime: null,
      colorId: null,
      allDay: true,
    },
    {
      id: "n1a3ssr7qliajvk592ke7a2lu8",
      summary: "【朝｜具体⇄抽象DAY】Calendar→OS→失敗1件→原則→次の具体",
      date: "2026-09-11",
      startTime: "05:30",
      endTime: "06:30",
      colorId: "3",
      allDay: false,
    },
    {
      id: "0t1jc05frrta62mube2spm6hh0",
      summary: "【読書】全米トップ校｜p181-240 読了",
      date: "2026-09-11",
      startTime: "06:30",
      endTime: "07:45",
      colorId: "5",
      allDay: false,
    },
    {
      id: "ovi8383in8281bjoj6v8mjt1mk",
      summary: "【昼スマホ】全米トップ校｜読了バッファ→学び候補メモ",
      date: "2026-09-11",
      startTime: "11:30",
      endTime: "12:30",
      colorId: null,
      allDay: false,
    },
    {
      id: "u99pritphukdkrum595lsspks0",
      summary: "【読書OUT】全米トップ校｜学び3つ→自分の行動1つ",
      date: "2026-09-11",
      startTime: "19:00",
      endTime: "20:00",
      colorId: "5",
      allDay: false,
    },
    {
      id: "v42t8d1laei6pg24t23e7bf7ig",
      summary: "【営業 1h】商談設計書の弱点1つだけ補強",
      date: "2026-09-11",
      startTime: "20:00",
      endTime: "21:00",
      colorId: "9",
      allDay: false,
    },
    {
      id: "m5067e4pf7nrbs1nsn9svdbae0_20260911T123000Z",
      summary: "【RIALA】移行最終確認→未完了/連絡不能/対象外を確定",
      date: "2026-09-11",
      startTime: "21:30",
      endTime: "22:00",
      colorId: "10",
      allDay: false,
    },
    {
      id: "fhq3o43u5p6i51b4kh50gar0d4_20260911T130000Z",
      summary: "【夜｜翌日計画】Fact→優先順位→Calendar確定",
      date: "2026-09-11",
      startTime: "22:00",
      endTime: "22:20",
      colorId: "8",
      allDay: false,
    },
  ],
};
