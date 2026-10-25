// ① 첫 화면 (구현명세 §7-1 문구 그대로)
import Link from "next/link";
import { FileX, LockOpen, MessageCircleQuestion, UserCheck } from "lucide-react";
import { PhoneFrame } from "@/components/PhoneFrame";
import { DemoBadge } from "@/components/DemoBadge";
import { LAYERS } from "@/components/layers";
import { HomeCardExample } from "@/components/HomeCardExample";

const PROMISES = [
  { icon: LockOpen, text: "돈 보내기를 막지 않아요" },
  { icon: MessageCircleQuestion, text: "나에게 먼저 물어요" },
  { icon: UserCheck, text: "알릴 사람은 내가 정해요" },
  { icon: FileX, text: "파일은 저장하지 않아요" },
];

export default function Home() {
  return (
    <PhoneFrame side={LAYERS.intro} top={<DemoBadge />} sideExtra={<HomeCardExample />}>
      <main>
        <h1 className="h1 mt-4">내 돈, 내가 정해요</h1>
        <p className="mt-2 text-[1.1rem] font-bold leading-snug text-accent">
          아는 사람이 돈을 가져갈 때, 발달장애인 본인에게 먼저 묻는 AI
        </p>
        <p className="mt-4">
          발달장애인의 돈을 아는 사람이 조금씩 가져갈 때, AI가 통장의 달라진 흐름을 찾아 본인에게 먼저 묻고, 본인이 고른
          사람에게만 알려요.
        </p>

        <ul className="mt-6 grid grid-cols-2 gap-3" aria-label="약속">
          {PROMISES.map(({ icon: I, text }) => (
            <li key={text} className="card flex flex-col items-center gap-2 px-2 py-4 text-center">
              <I size={48} strokeWidth={1.75} aria-hidden="true" className="text-accent" />
              <strong className="text-[1rem] leading-snug">{text}</strong>
            </li>
          ))}
        </ul>

        <div className="mt-6 flex flex-col gap-3">
          <Link href="/demo" className="btn btn-primary">
            예시로 해 보기
          </Link>
          <Link href="/start" className="btn btn-secondary">
            내 파일로 해 보기
          </Link>
        </div>

        <nav className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-2 text-[1rem]" aria-label="더 보기">
          <Link href="/how" className="link">
            AI가 하는 일
          </Link>
          <Link href="/eval" className="link">
            AI 성적표
          </Link>
          <Link href="/compare" className="link">
            흔한 경고와 비교
          </Link>
        </nav>

        <footer className="mt-8 space-y-1 text-center small">
          <p>새로고침하면 설정과 결과가 모두 지워져요.</p>
          <p>2026 AI 라이프 아이디어 챌린지 후보작 11번을 구현한 시제품이에요.</p>
          <p>
            <a className="link" href="https://github.com/yonghwan1106/my-money-my-choice" rel="noopener noreferrer" target="_blank">
              GitHub
            </a>
          </p>
        </footer>
      </main>
    </PhoneFrame>
  );
}
