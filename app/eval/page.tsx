// ⑫ AI 성적표 (구현명세 §7-8) — 값은 data/eval/*.json만, 손으로 적지 않음
import { WidePage } from "@/components/WidePage";
import { LAYERS } from "@/components/layers";
import { B2_V1, BLIND_V1, EVAL_V1, HELPERNOTE_V1, POLICY_V1, PROVENANCE, UNDERSTAND_V1 } from "@/components/evalData";
import { DiffBox, HardCases, HelpernoteTable, MethodsTable, UnderstandTable, DASH } from "@/components/EvalTables";
import { PRCurve } from "@/components/PRCurve";
import { PatternBars } from "@/components/PatternBars";

const LIMITS =
  "이 수치는 우리가 만든 가상 거래 기록으로 잰 것이라 실제 성능이 아닙니다. 데이터를 만든 사람과 모델을 만든 사람이 같은 팀이라 결과가 좋게 나올 수 있습니다. 그래서 생성 규칙을 먼저 고정해 해시를 남기고, 신호를 짜지 않은 작업자가 만든 수법 두 가지와, 처음부터 착취가 이어지던 경우를 따로 쟀습니다. 착취 수법별 비율은 공개 통계가 없어 같게 가정했고, 은행 적요 분류와 답 알아듣기 평가 문장도 개발팀이 만든 것입니다. 발달장애인 당사자와 함께한 사용성 시험은 아직 하지 않았습니다.";

const short = (s: string | undefined | null, n: number) => (s ? s.slice(0, n) : DASH);

export default function EvalPage() {
  const ev = EVAL_V1;
  const pv = PROVENANCE;
  return (
    <WidePage side={LAYERS.eval} bottom="이 판단은 참고용이에요. 돈을 쓸지 말지는 본인이 정해요.">
      <h1 className="h1 mt-3">AI 성적표</h1>
      <p className="mt-1 text-[1.1rem] font-bold">가상 데이터 기준이에요. 실제 성능이 아니에요.</p>

      {ev ? (
        <>
          <MethodsTable ev={ev} b2={B2_V1} />
          <DiffBox ev={ev} />
          <HardCases ev={ev} blind={BLIND_V1} />
          <PatternBars ev={ev} />
          <PRCurve ev={ev} />
        </>
      ) : (
        <p className="mt-6">{DASH}</p>
      )}
      <UnderstandTable u={UNDERSTAND_V1} />
      <HelpernoteTable h={HELPERNOTE_V1} />

      <p className="mt-6 text-[1.1rem] font-bold" data-testid="eval-policy">
        지원의사결정 규칙 시험 {POLICY_V1 ? `${POLICY_V1.passed}/${POLICY_V1.total}` : `${DASH}/${DASH}`} 통과
      </p>

      <section className="card mt-6" data-testid="eval-provenance">
        <h2 className="h3">출처</h2>
        <ul className="mt-2 flex flex-col gap-1 text-[1rem]">
          <li>
            생성 규칙 커밋 <code>{short(pv?.gen_commit, 7)}</code> · 신호 동결 <code>{short(pv?.signals_frozen, 7)}</code> · 모델 동결{" "}
            <code>{short(pv?.model_frozen, 7)}</code> · 블라인드 <code>{short(pv?.blind_commit, 7)}</code>
          </li>
          <li>
            데이터 sha256 <code>{short(pv?.truth_sha256, 12)}</code>
          </li>
          <li>보정·임계값은 검증셋으로 정하고, 위 수치는 시험셋에서 쟀어요.</li>
          <li>착취 기간·관계 비율: 보건복지부·중앙장애인권익옹호기관, 『2024 장애인학대 현황보고서』 151쪽</li>
          <li>수법 비율·금액은 가정값</li>
        </ul>
      </section>

      <section className="card mt-4 !border-2 !border-[#c98a00]" data-testid="eval-limits">
        <h2 className="h3">한계</h2>
        <p className="mt-2">{LIMITS}</p>
      </section>
    </WidePage>
  );
}
