export const PHILIPPINES_TIME_ZONE = "Asia/Manila";

const formatOptions = {
  timeZone: PHILIPPINES_TIME_ZONE,
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
};

export function formatPhilippineDateTime(value, fallback = "-") {
  if (!value) return fallback;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toLocaleString("en-PH", formatOptions);
}

export function formatPhilippineDate(value, fallback = "-") {
  if (!value) return fallback;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime())
    ? fallback
    : date.toLocaleDateString("en-PH", { timeZone: PHILIPPINES_TIME_ZONE, year: "numeric", month: "short", day: "numeric" });
}
