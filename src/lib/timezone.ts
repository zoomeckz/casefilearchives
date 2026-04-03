export const SWEDISH_TIME_ZONE = 'Europe/Stockholm';

const swedishDateTimeFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: SWEDISH_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

interface DateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function getSwedishDateTimeParts(date: Date): DateTimeParts {
  const parts = swedishDateTimeFormatter.formatToParts(date).reduce<Record<string, string>>((acc, part) => {
    if (part.type !== 'literal') {
      acc[part.type] = part.value;
    }
    return acc;
  }, {});

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second ?? '0'),
  };
}

function pad(value: number, length = 2) {
  return String(value).padStart(length, '0');
}

export function swedishToUTC(localStr: string): string {
  const match = localStr.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);

  if (!match) {
    const fallback = new Date(localStr);
    if (Number.isNaN(fallback.getTime())) {
      throw new Error('Invalid Swedish datetime');
    }
    return fallback.toISOString();
  }

  const [, year, month, day, hour, minute] = match;
  const targetMs = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), 0);
  let utcMs = targetMs;

  for (let i = 0; i < 2; i += 1) {
    const parts = getSwedishDateTimeParts(new Date(utcMs));
    const observedMs = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    utcMs += targetMs - observedMs;
  }

  return new Date(utcMs).toISOString();
}

export function utcToSwedishDateTimeLocal(isoString?: string | null): string {
  if (!isoString) return '';

  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';

  const parts = getSwedishDateTimeParts(date);
  return `${pad(parts.year, 4)}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}