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
