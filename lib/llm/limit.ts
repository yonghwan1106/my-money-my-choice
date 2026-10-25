// server-only — 호출 상한 (구현명세 §6-5·§9-1). 인스턴스 메모리라 인스턴스마다 따로 센다.
// 진짜 상한은 Anthropic 콘솔 지출 한도다. 두 라우트가 같이 쓴다.
const perIp = new Map<string, number[]>();
let dayKey = "";
let dayCount = 0;

export const rpmPerIp = () => Number(process.env.AI_RPM_PER_IP) || 6;
export const dailyCap = () => Number(process.env.AI_DAILY_CAP) || 300;

/** 한국시간 날짜(자정 초기화 기준). */
export function kstDay(now: number): string {
  return new Date(now + 9 * 3600_000).toISOString().slice(0, 10);
}

export function clientIp(req: Request): string {
  const xf = req.headers.get("x-forwarded-for");
  return (xf ? xf.split(",")[0] : req.headers.get("x-real-ip") ?? "local").trim() || "local";
}

/** 언어모델 호출 1회를 쓸 수 있으면 세고 true. */
export function take(ip: string, now = Date.now()): { ok: true } | { ok: false; reason: "rpm" | "daily" } {
  const d = kstDay(now);
  if (d !== dayKey) { dayKey = d; dayCount = 0; }
  if (dayCount >= dailyCap()) return { ok: false, reason: "daily" };
  const list = (perIp.get(ip) ?? []).filter((t) => now - t < 60_000);
  if (list.length >= rpmPerIp()) { perIp.set(ip, list); return { ok: false, reason: "rpm" }; }
  list.push(now);
  perIp.set(ip, list);
  dayCount++;
  if (perIp.size > 5000) perIp.clear(); // 메모리 보호
  return { ok: true };
}

export function resetLimits(): void { perIp.clear(); dayKey = ""; dayCount = 0; }
