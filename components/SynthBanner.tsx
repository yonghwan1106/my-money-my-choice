// 시연 화면 머리띠 · 본인 파일 머리띠 (구현명세 §7-0 문구 그대로)
import { Info } from "lucide-react";

export const SYNTH_BANNER_TEXT =
  "가상 인물·가상 거래(연습용)예요. 사람·금액·가게는 실제가 아니에요. 착취가 이어진 기간과 관계 비율은 『2024 장애인학대 현황보고서』를 따랐어요.";
export const FILE_BANNER_TEXT =
  "올린 파일은 이 기기 안에서만 분석하고 저장하지 않아요. 이 AI는 가상 거래로 배운 시험판이라 실제와 다를 수 있어요.";

export function SynthBanner() {
  return (
    <div role="note" data-testid="synth-banner" className="flex gap-2 border-b border-[#e7d9a8] bg-[#fff7dc] px-4 py-3 text-[1rem] leading-snug">
      <Info size={22} aria-hidden="true" className="mt-0.5 shrink-0" />
      <p>{SYNTH_BANNER_TEXT}</p>
    </div>
  );
}

export function FileBanner() {
  return (
    <div role="note" data-testid="file-banner" className="flex gap-2 rounded-2xl border border-[#c9d6f5] bg-[#eef3ff] px-3 py-3 text-[1rem] leading-snug">
      <Info size={22} aria-hidden="true" className="mt-0.5 shrink-0" />
      <p>{FILE_BANNER_TEXT}</p>
    </div>
  );
}
