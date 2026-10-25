// ② 시연 고르기 (구현명세 §7-2 문구 그대로)
import Link from "next/link";
import { Play } from "lucide-react";
import { PhoneFrame } from "@/components/PhoneFrame";
import { SynthBanner } from "@/components/SynthBanner";
import { DemoBadge } from "@/components/DemoBadge";
import { LAYERS } from "@/components/layers";

const CARDS = [
  {
    id: "A",
    title: "민수 씨(27)",
    line: "처음 돈을 보낸 사람에게 3주 동안 여러 번 보냈어요",
    setting: "믿는 사람: 누나, 이수진 선생님 — 위험이 높을 때만",
  },
  {
    id: "B",
    title: "서연 씨(31)",
    line: "믿고 등록한 활동지원사에게 수당이 넘어갔어요",
    setting: "믿는 사람: 김도현 선생님, 언니(다른 지역) — 위험이 높을 때만",
  },
  {
    id: "C",
    title: "영호 씨(35)",
    line: "대출금이 바로 다른 사람에게 갔어요, 몇 주째",
    setting: "믿는 사람: 오지현 선생님 — 위험이 높을 때만",
  },
  {
    id: "D",
    title: "하늘 씨(24)",
    line: "냉장고를 샀어요",
    setting: "믿는 사람: 엄마 — 위험이 높을 때만",
  },
] as const;

export default function DemoPage() {
  return (
    <PhoneFrame
      side={LAYERS.demo}
      top={
        <>
          <SynthBanner />
          <DemoBadge />
        </>
      }
    >
      <main>
        <Link href="/" className="link text-[1rem]">
          처음으로
        </Link>
        <h1 className="h1 mt-3">가상 인물로 해 보기</h1>
        <p className="mt-1">사람과 거래는 모두 가상이에요.</p>
        <ul className="mt-5 flex flex-col gap-4">
          {CARDS.map((c) => (
            <li key={c.id} className="card" data-testid={`demo-card-${c.id}`}>
              <h2 className="h2">{c.title}</h2>
              <p className="mt-1 font-semibold">{c.line}</p>
              <div className="mt-3 rounded-xl bg-soft px-3 py-2">
                <p className="text-[1rem] font-bold text-muted">본인이 이렇게 정했어요</p>
                <p className="text-[1rem]">{c.setting}</p>
              </div>
              <Link href={`/check?scenario=${c.id}`} className="btn btn-primary mt-3">
                <Play size={22} aria-hidden="true" />
                재생해 보기
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </PhoneFrame>
  );
}
