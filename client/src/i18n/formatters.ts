import { t } from "./index";

export const UI_LOCALE = "he-IL";
export const EVENT_TIME_ZONE = "Asia/Jerusalem";
type Instant = string | number | Date | null | undefined;

function instant(value: Instant): Date | null {
  if (value == null || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

const dateFormat = new Intl.DateTimeFormat(UI_LOCALE, { timeZone: EVENT_TIME_ZONE, day: "numeric", month: "numeric", year: "numeric" });
const timeFormat = new Intl.DateTimeFormat(UI_LOCALE, { timeZone: EVENT_TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const dayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: EVENT_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
const numberFormat = new Intl.NumberFormat(UI_LOCALE);

export function formatDate(value: Instant): string {
  const date = instant(value);
  return date ? dateFormat.format(date) : t("common.unknownDate");
}

export function formatTime(value: Instant): string {
  const date = instant(value);
  return date ? timeFormat.format(date) : t("common.unknownDate");
}

export function formatDateTime(value: Instant): string {
  return instant(value) ? t("common.dateAtTime", { date: formatDate(value), time: formatTime(value) }) : t("common.unknownDate");
}

export function jerusalemDay(value: Instant): string | null {
  const date = instant(value);
  if (!date) return null;
  const parts = dayFormat.formatToParts(date);
  return ["year", "month", "day"].map((type) => parts.find((part) => part.type === type)?.value).join("-");
}

export function formatRelativeDate(value: Instant, now: Instant = new Date()): string {
  const day = jerusalemDay(value);
  const today = jerusalemDay(now);
  if (!day || !today) return t("common.unknownDate");
  if (day === today) return t("common.today");
  // Subtract a calendar day after extracting Jerusalem's date, including DST days.
  const yesterday = new Date(`${today}T12:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  if (day === yesterday.toISOString().slice(0, 10)) return t("common.yesterday");
  return formatDate(value);
}

export function formatNumber(value: number): string {
  return Number.isFinite(value) ? numberFormat.format(value) : t("common.unknownValue");
}

export function periodLabel(value: string | null | undefined): string {
  switch (value) {
    case "morning": return t("common.periods.morning");
    case "noon": return t("common.periods.noon");
    case "evening": return t("common.periods.evening");
    default: return t("common.unknownValue");
  }
}

export function statusLabel(value: string | null | undefined): string {
  switch (value) {
    case "new": return t("common.statuses.new");
    case "in-progress": return t("common.statuses.in-progress");
    case "resolved": return t("common.statuses.resolved");
    default: return t("common.unknownValue");
  }
}

export function reportTypeLabel(value: string | null | undefined): string {
  switch (value) {
    case "general": return t("common.reportTypes.general");
    case "food": return t("common.reportTypes.food");
    case "emergency": return t("common.reportTypes.emergency");
    default: return t("common.unknownValue");
  }
}
