import type { Area, ActivityType } from "./types";

// Single source of truth for colour (2026-09-08 第5ラウンド, §4/§6/§7/§53).
//
// Colour is navigation here, not decoration: the same work must look the same
// on TASK MAP, Area Home, TODAY and — once the API exists — in Google
// Calendar. So every colour lives here with its Calendar colour id, and no
// component hardcodes `bg-sky-50` again.
//
// Two axes, deliberately kept apart (§7):
//   Area     = 何系の仕事か        (営業=青 / RIALA=緑 / GENESIS=紫)
//   Activity = 何をしている時間か  (読書=黄 / OS=水色 / 翌日計画=グレー)
//
// A GENESIS reading block is therefore yellow on the surface with a purple
// GENESIS chip — "何のための時間か" and "何をしている時間か" both survive.
// Status colour (進行中/待ち/…) and danger are separate again; danger is only
// ever a real deadline problem.

export interface Theme {
  /** Strong colour: left borders, chips, icons. Never a large fill. */
  primary: string;
  /** Very light tint for card backgrounds. */
  soft: string;
  /** Hairline border matching the tint. */
  border: string;
  /** Readable text colour on white or on `soft`. */
  text: string;
  label: string;
  /** Google Calendar event colour id (§53). */
  calendarColorId: string;
  calendarHex: string;
}

export const AREA_THEME: Record<Area, Theme> = {
  営業代行: {
    primary: "#5484ED",
    soft: "#EEF3FE",
    border: "#D3E0FB",
    text: "#2C55B8",
    label: "営業",
    calendarColorId: "9",
    calendarHex: "#5484ED",
  },
  RIALA: {
    primary: "#51B749",
    soft: "#EEF8ED",
    border: "#D2EBCF",
    text: "#357F2F",
    label: "RIALA",
    calendarColorId: "10",
    calendarHex: "#51B749",
  },
  GENESIS: {
    primary: "#A96BE0",
    soft: "#F6EFFD",
    border: "#E6D4F7",
    text: "#7A3EB5",
    label: "GENESIS",
    calendarColorId: "3",
    calendarHex: "#DBADFF",
  },
  "Skill Plus": {
    // Learning source for 営業代行, so it borrows the sales hue, muted.
    primary: "#8AA6E8",
    soft: "#F2F5FD",
    border: "#DEE7FA",
    text: "#4A6BB5",
    label: "Skill Plus",
    calendarColorId: "9",
    calendarHex: "#5484ED",
  },
  その他: {
    primary: "#A8A29E",
    soft: "#F7F6F5",
    border: "#E7E5E4",
    text: "#78716C",
    label: "その他",
    calendarColorId: "8",
    calendarHex: "#E1E1E1",
  },
};

export const ACTIVITY_THEME: Record<ActivityType, Theme> = {
  READING: {
    primary: "#E3B93B",
    soft: "#FDF7E6",
    border: "#F5E7BC",
    text: "#8A6A0B",
    label: "読書",
    calendarColorId: "5",
    calendarHex: "#FBD75B",
  },
  OS: {
    primary: "#2CB8BE",
    soft: "#E9F9FA",
    border: "#C3ECEE",
    text: "#127479",
    label: "AI Work OS",
    calendarColorId: "7",
    calendarHex: "#46D6DB",
  },
  PLANNING: {
    primary: "#9C9894",
    soft: "#F5F4F3",
    border: "#E4E2E0",
    text: "#6B6560",
    label: "翌日計画",
    calendarColorId: "8",
    calendarHex: "#E1E1E1",
  },
  DEEP_WORK: {
    // No colour of its own — deep work takes the Area's colour.
    primary: "#57534E",
    soft: "#F7F6F5",
    border: "#E7E5E4",
    text: "#44403C",
    label: "集中作業",
    calendarColorId: "8",
    calendarHex: "#E1E1E1",
  },
  OPERATION: {
    primary: "#57534E",
    soft: "#F7F6F5",
    border: "#E7E5E4",
    text: "#44403C",
    label: "運用",
    calendarColorId: "8",
    calendarHex: "#E1E1E1",
  },
};

/**
 * What a block or card should actually look like. Activity wins the surface
 * when it has its own identity (reading, OS work, planning); otherwise the
 * Area does. The Area is still returned so a chip can carry it.
 */
export function themeFor(area: Area, activity: ActivityType | null): { surface: Theme; area: Theme } {
  const areaTheme = AREA_THEME[area];
  if (activity && (activity === "READING" || activity === "OS" || activity === "PLANNING")) {
    return { surface: ACTIVITY_THEME[activity], area: areaTheme };
  }
  return { surface: areaTheme, area: areaTheme };
}

/** Inline style for a card: tinted background, matching hairline, left rule. */
export function cardStyle(theme: Theme): React.CSSProperties {
  // 3辺ずつ指定する。borderColor(shorthand) と borderLeftColor(longhand)
  // を同時に置くと、再レンダリング時にReactが警告を出す。
  return {
    backgroundColor: theme.soft,
    borderTopColor: theme.border,
    borderRightColor: theme.border,
    borderBottomColor: theme.border,
    borderLeftColor: theme.primary,
  };
}

export function chipStyle(theme: Theme): React.CSSProperties {
  return { backgroundColor: theme.soft, color: theme.text };
}
