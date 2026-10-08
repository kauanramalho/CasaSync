export function parseLocalDateTime(value) {
  if (!value) return null;
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/);
  if (!match) return null;
  const [, year, month, day, hour = "09", minute = "00"] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  if (date.getFullYear() !== Number(year) || date.getMonth() !== Number(month) - 1 || date.getDate() !== Number(day) || date.getHours() !== Number(hour) || date.getMinutes() !== Number(minute)) return null;
  return date;
}

export function withSelectedDay(day, selectedDate) {
  // Midnight (0) is a valid hour, not the absence of a selection.
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), selectedDate?.getHours() ?? 9, selectedDate?.getMinutes() ?? 0);
}
