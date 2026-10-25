// 날짜·시각 해석 (구현명세 §5-1). 문자열을 new Date()에 넣지 않는다 — 정수 y·m·d·분으로 쪼갠 뒤 Date.UTC.

/** 일 번호 = Date.UTC(y, m - 1, d) / 86400000 */
export function dayNo(y: number, m: number, d: number): number {
  return Date.UTC(y, m - 1, d) / 86400000;
}

/** 요일: 월=0 … 일=6 */
export function weekday(day: number): number {
  return (((day + 3) % 7) + 7) % 7;
}

/** 일 번호 → { y, m, d } (UTC 기준 정수 계산) */
export function ymd(day: number): { y: number; m: number; d: number } {
  const dt = new Date(day * 86400000);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

/** 그 날이 든 주의 월요일 일 번호 */
export function mondayOf(day: number): number {
  return day - weekday(day);
}

/** 화면용 「2026.08.04」 */
export function fmtDay(day: number): string {
  const { y, m, d } = ymd(day);
  return `${y}.${String(m).padStart(2, "0")}.${String(d).padStart(2, "0")}`;
}

function validYmd(y: number, m: number, d: number): boolean {
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1) return false;
  const dim = [31, (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return d <= dim[m - 1];
}

function mkMinute(h: string | undefined, mi: string | undefined): number | null | undefined {
  if (h === undefined || mi === undefined) return null;
  const hh = Number(h), mm = Number(mi);
  if (!(hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59)) return undefined; // 잘못된 시각
  return hh * 60 + mm;
}

const RE_SEP = /^(\d{4})\s*[.\-\/]\s*(\d{1,2})\s*[.\-\/]\s*(\d{1,2})\.?(?:\s*(?:\([^)]*\))?\s*[T ]?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;
const RE_COMPACT = /^(\d{4})(\d{2})(\d{2})(?:\s*(\d{2}):?(\d{2})(?::?(\d{2}))?)?$/;

/** 엑셀 일련번호(20000~80000, 1899-12-30 기준) → { day, minute } */
export function fromExcelSerial(n: number): { day: number; minute: number | null } | null {
  if (!(n >= 20000 && n <= 80000)) return null;
  const whole = Math.floor(n);
  const frac = n - whole;
  const day = whole - 25569; // 1970-01-01 = 25569
  const minute = frac > 0 ? Math.min(1439, Math.round(frac * 1440)) : null;
  return { day, minute };
}

/** 날짜(+선택 시각) 문자열 → { day, minute } (못 읽으면 null) */
export function parseDateTime(raw: string): { day: number; minute: number | null } | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  let m = RE_SEP.exec(s) ?? RE_COMPACT.exec(s);
  if (m) {
    const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
    if (!validYmd(y, mo, d)) return null;
    const minute = mkMinute(m[4], m[5]);
    if (minute === undefined) return null;
    return { day: dayNo(y, mo, d), minute };
  }
  if (/^\d{5}(\.\d+)?$/.test(s)) return fromExcelSerial(Number(s));
  m = null;
  return null;
}

/** 시각 문자열 「HH:MM(:SS)」「HHMM(SS)」 → 분 (못 읽으면 null) */
export function parseTime(raw: string): number | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  let m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (!m) m = /^(\d{2})(\d{2})(\d{2})?$/.exec(s);
  if (m) {
    const v = mkMinute(m[1], m[2]);
    return v === undefined ? null : v;
  }
  // 엑셀 시각 소수(0~1)
  if (/^0?\.\d+$/.test(s)) {
    const f = Number(s);
    if (f >= 0 && f < 1) return Math.min(1439, Math.round(f * 1440));
  }
  return null;
}
