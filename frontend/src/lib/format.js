const DAYS = ['יום ראשון', 'יום שני', 'יום שלישי', 'יום רביעי', 'יום חמישי', 'יום שישי', 'שבת']
const pad = (n) => String(n).padStart(2, '0')

// ponytail: locale fixed to he-IL because the UI is Hebrew-only (CLAUDE.md i18n); pass a locale when English UI lands.
export function formatDateTime(value) {
  const d = new Date(value)
  if (isNaN(d)) return value
  try {
    return new Intl.DateTimeFormat('he-IL', {
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d)
  } catch {
    const yy = pad(d.getFullYear() % 100)
    return `${DAYS[d.getDay()]}, ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${yy} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
}

// Parts for the schedule date block and scoreboard tiles. null for an invalid date.
export function formatGameDate(value) {
  const d = new Date(value)
  if (isNaN(d)) return null
  const part = (opts) => new Intl.DateTimeFormat('he-IL', opts).format(d)
  return {
    day: part({ day: '2-digit' }),
    month: part({ month: 'short' }),
    weekday: part({ weekday: 'short' }),
    time: part({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }),
  }
}

export const signed = (n) => (n > 0 ? `+${n}` : `${n}`)
