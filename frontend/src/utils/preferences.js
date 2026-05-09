export const PREFERENCES_STORAGE_KEY = "casasync_preferences";

export const defaultPreferences = {
  language: "pt-BR",
  currency: "BRL",
  weekStart: "monday",
  timezone: "America/Sao_Paulo"
};

export const weekStartOptions = [
  { value: "monday", label: "Segunda-feira" },
  { value: "sunday", label: "Domingo" }
];

export const timezoneOptions = [
  { value: "America/Sao_Paulo", label: "Brasilia, Sao Paulo, Rio de Janeiro", helper: "America/Sao_Paulo" },
  { value: "America/Bahia", label: "Bahia", helper: "America/Bahia" },
  { value: "America/Fortaleza", label: "Fortaleza, Recife, Natal", helper: "America/Fortaleza" },
  { value: "America/Manaus", label: "Manaus", helper: "America/Manaus" },
  { value: "America/Cuiaba", label: "Cuiaba", helper: "America/Cuiaba" },
  { value: "America/Rio_Branco", label: "Rio Branco", helper: "America/Rio_Branco" },
  { value: "UTC", label: "UTC", helper: "Tempo universal" },
  { value: "America/New_York", label: "New York", helper: "America/New_York" },
  { value: "America/Chicago", label: "Chicago", helper: "America/Chicago" },
  { value: "America/Denver", label: "Denver", helper: "America/Denver" },
  { value: "America/Los_Angeles", label: "Los Angeles", helper: "America/Los_Angeles" },
  { value: "Europe/London", label: "London", helper: "Europe/London" },
  { value: "Europe/Lisbon", label: "Lisbon", helper: "Europe/Lisbon" },
  { value: "Europe/Madrid", label: "Madrid", helper: "Europe/Madrid" },
  { value: "Europe/Paris", label: "Paris", helper: "Europe/Paris" },
  { value: "Asia/Tokyo", label: "Tokyo", helper: "Asia/Tokyo" },
  { value: "Asia/Shanghai", label: "Shanghai", helper: "Asia/Shanghai" },
  { value: "Australia/Sydney", label: "Sydney", helper: "Australia/Sydney" }
];

const weekdayLabels = {
  monday: ["Seg", "Ter", "Qua", "Qui", "Sex", "Sab", "Dom"],
  sunday: ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"]
};

function isValidWeekStart(value) {
  return weekStartOptions.some((option) => option.value === value);
}

function isValidTimezone(value) {
  return timezoneOptions.some((option) => option.value === value);
}

export function getStoredPreferences() {
  if (typeof window === "undefined") return defaultPreferences;

  try {
    const stored = JSON.parse(window.localStorage.getItem(PREFERENCES_STORAGE_KEY) || "{}");
    return {
      ...defaultPreferences,
      ...stored,
      weekStart: isValidWeekStart(stored.weekStart) ? stored.weekStart : defaultPreferences.weekStart,
      timezone: isValidTimezone(stored.timezone) ? stored.timezone : defaultPreferences.timezone
    };
  } catch {
    return defaultPreferences;
  }
}

export function saveStoredPreferences(nextPreferences) {
  const next = {
    ...getStoredPreferences(),
    ...nextPreferences
  };

  if (!isValidWeekStart(next.weekStart)) next.weekStart = defaultPreferences.weekStart;
  if (!isValidTimezone(next.timezone)) next.timezone = defaultPreferences.timezone;

  if (typeof window !== "undefined") {
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent("casasync:preferences-changed", { detail: next }));
  }

  return next;
}

export function getWeekdayLabels(weekStart = getStoredPreferences().weekStart) {
  return weekdayLabels[weekStart] || weekdayLabels.monday;
}

export function startOfWeek(date, weekStart = getStoredPreferences().weekStart) {
  const base = new Date(date);
  const firstDay = weekStart === "sunday" ? 0 : 1;
  const offset = (base.getDay() - firstDay + 7) % 7;
  base.setDate(base.getDate() - offset);
  base.setHours(0, 0, 0, 0);
  return base;
}

export function buildMonthDays(baseDate, weekStart = getStoredPreferences().weekStart) {
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();
  const start = startOfWeek(new Date(year, month, 1), weekStart);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

