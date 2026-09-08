import assert from "node:assert/strict";
import { test } from "node:test";
import { ACTIVITY_THEME, AREA_THEME, themeFor } from "../lib/areaTheme";

// §41-F — 色は装飾ではなく識別なので、Google Calendar の色IDと一致していること
// を固定する。Week View で営業が青でない、読書が黄でない、という状態を二度と
// 出さないためのテスト。

test("F: Area colours match their Google Calendar colour ids", () => {
  assert.equal(AREA_THEME["営業代行"].calendarColorId, "9", "営業 = Blueberry(9)");
  assert.equal(AREA_THEME["営業代行"].primary, "#5484ED");
  assert.equal(AREA_THEME.RIALA.calendarColorId, "10", "RIALA = Basil(10)");
  assert.equal(AREA_THEME.RIALA.primary, "#51B749");
  assert.equal(AREA_THEME.GENESIS.calendarColorId, "3", "GENESIS = Grape(3)");
});

test("F: Activity colours match their Google Calendar colour ids", () => {
  assert.equal(ACTIVITY_THEME.READING.calendarColorId, "5", "読書 = Banana(5)");
  assert.equal(ACTIVITY_THEME.READING.primary, "#E3B93B");
  assert.equal(ACTIVITY_THEME.OS.calendarColorId, "7", "AI Work OS = Peacock(7)");
  assert.equal(ACTIVITY_THEME.PLANNING.calendarColorId, "8", "翌日計画 = Graphite(8)");
});

test("F: a GENESIS reading block is yellow on the surface, GENESIS on the chip", () => {
  const { surface, area } = themeFor("GENESIS", "READING");
  assert.equal(surface.calendarColorId, "5", "reading looks like reading");
  assert.equal(area.calendarColorId, "3", "…but it still belongs to GENESIS");
  assert.equal(area.label, "GENESIS");
});

test("F: deep work takes the Area's own colour, not a colour of its own", () => {
  const sales = themeFor("営業代行", "DEEP_WORK");
  assert.equal(sales.surface.primary, AREA_THEME["営業代行"].primary);
  const riala = themeFor("RIALA", "OPERATION");
  assert.equal(riala.surface.primary, AREA_THEME.RIALA.primary);
});

test("F: no theme uses the retired cream/orange palette", () => {
  const retired = ["#faf7f2", "#FAF7F2", "#ea5b0c", "#EA5B0C"];
  const all = [...Object.entries(AREA_THEME), ...Object.entries(ACTIVITY_THEME)];
  for (const [name, theme] of all) {
    for (const value of [theme.primary, theme.soft, theme.border, theme.text]) {
      assert.equal(retired.includes(value), false, name + " still uses " + value);
    }
  }
});

test("F: every theme colour is a full hex value", () => {
  const all = [...Object.entries(AREA_THEME), ...Object.entries(ACTIVITY_THEME)];
  for (const [name, theme] of all) {
    for (const key of ["primary", "soft", "border", "text", "calendarHex"] as const) {
      assert.match(theme[key], /^#[0-9A-Fa-f]{6}$/, name + "." + key + " is not a hex colour");
    }
  }
});
