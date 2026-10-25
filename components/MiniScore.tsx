// ④ 성적표 미니 카드 (구현명세 §7-4·§8-3) — 숫자는 data/eval/eval_v1.json narration에서만
import Link from "next/link";
import { EVAL_V1 } from "./evalData";

export function MiniScore() {
  const n = EVAL_V1?.narration ?? null;
  return (
    <section className="card mt-3" data-testid="mini-score">
      <h3 className="h3">이 AI의 성적표(가상 데이터 기준)</h3>
      {n ? (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-soft px-3 py-2">
            <p className="text-[1.4rem] font-extrabold" data-testid="mini-s">
              {n.S}명 중 {n.s}명
            </p>
            <p className="text-[1rem]">시험 속 착취를 한 번 이상 찾았어요</p>
          </div>
          <div className="rounded-xl bg-soft px-3 py-2">
            <p className="text-[1.4rem] font-extrabold" data-testid="mini-f">
              {n.F_text}
            </p>
            <p className="text-[1rem]">착취가 없는 사람에게 카드가 가는 횟수</p>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-muted" data-testid="mini-pending">
          성적표를 만드는 중이에요.
        </p>
      )}
      <Link href="/eval" className="btn btn-secondary mt-3">
        자세히
      </Link>
    </section>
  );
}
