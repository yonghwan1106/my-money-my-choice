// ⑫ 성적표 표 (구현명세 §7-8) — 값은 data/eval/*.json에서만. 값 없는 칸은 「—」.
import type { B2Eval, BlindEval, EvalRow, EvalV1, HelpernoteEval, UnderstandEval } from "./evalData";

export const DASH = "—";
export const num = (x: number | null | undefined, d = 2) => (x === null || x === undefined || Number.isNaN(x) ? DASH : x.toFixed(d));
export const pct = (x: number | null | undefined) => (x === null || x === undefined || Number.isNaN(x) ? DASH : `${Math.round(x * 100)}%`);
/** 일 수: 정수면 그대로, 아니면 소수 한 자리(JSON 값 그대로 — 반올림 방식 차이 없음) */
export const days = (x: number | null | undefined) => (x === null || x === undefined || Number.isNaN(x) ? DASH : Number.isInteger(x) ? String(x) : x.toFixed(1));
export const ciNum = (c: [number, number] | null | undefined, d = 2) => (c ? `[${c[0].toFixed(d)}, ${c[1].toFixed(d)}]` : "");
export const ciPct = (c: [number, number] | null | undefined) => (c ? `[${Math.round(c[0] * 100)}, ${Math.round(c[1] * 100)}]` : "");

const ROW_ORDER = ["B0", "B1", "B2", "B3", "B4", "GBM", "RANDOM"];
const ROW_NAME: Record<string, string> = {
  B0: "흔한 고정 금액 규칙(30만 원·하루 3번)",
  B1: "이상치 찾기(Isolation Forest)",
  B2: "언어모델만(200개 주, 따로 표시)",
  B3: "신호 규칙(켜진 신호 수)",
  B4: "로지스틱 회귀",
  GBM: "이 AI(부스팅)",
  RANDOM: "무작위로 고를 때(착취 주 비율)",
};
const COLS = ["PR-AUC [95% 구간]", "카드 기준 재현율 [95% 구간]", "착취가 없는 사람 한 달 카드 수", "'위험이 높아요' 정밀도", "첫 탐지까지(중앙값, 일)"];

interface Cells {
  id: string;
  name: string;
  cells: [string, string, string, string, string];
  sub: [string, string];
}

function rowCells(r: EvalRow | null, id: string): Cells {
  if (!r)
    return { id, name: ROW_NAME[id], cells: [DASH, DASH, DASH, DASH, DASH], sub: ["", ""] };
  return {
    id,
    name: ROW_NAME[id] ?? r.name,
    cells: [num(r.pr_auc), pct(r.recall_at_rule), num(r.cards_per_month_none), pct(r.high_precision), days(r.median_days_first)],
    sub: [ciNum(r.pr_auc_ci), ciPct(r.recall_ci)],
  };
}

function b2Cells(b2: B2Eval | null): Cells {
  const r = b2?.rows.find((x) => x.model.startsWith("claude-sonnet")) ?? b2?.rows.find((x) => x.model.startsWith("claude")) ?? null;
  return {
    id: "B2",
    name: ROW_NAME.B2,
    cells: [num(r?.pr_auc ?? null), pct(r?.recall_at_rule ?? null), DASH, DASH, DASH],
    sub: ["", ""],
  };
}

export function MethodsTable({ ev, b2 }: { ev: EvalV1; b2: B2Eval | null }) {
  const rows: Cells[] = ROW_ORDER.map((id) => (id === "B2" ? b2Cells(b2) : rowCells(ev.rows.find((r) => r.id === id) ?? null, id)));
  return (
    <section className="mt-6" data-testid="eval-table1">
      <h2 className="h2">
        여러 방법 비교 (시험 {ev.split.test}명, 주 {ev.split.test_windows}개)
      </h2>
      {/* 넓은 화면: 표 */}
      <div className="mt-3 hidden overflow-hidden rounded-2xl border border-line bg-white md:block">
        <table className="w-full border-collapse text-[1rem]">
          <thead>
            <tr className="bg-soft text-left align-bottom">
              <th className="px-3 py-2">방법</th>
              {COLS.map((c) => (
                <th key={c} className="px-3 py-2 text-right">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={`border-t border-line ${r.id === "GBM" ? "bg-[#eef3ff] font-bold" : ""}`} data-row={r.id}>
                <td className="px-3 py-2">{r.name}</td>
                {r.cells.map((c, i) => (
                  <td key={i} className="px-3 py-2 text-right tabular-nums" data-col={i}>
                    {c}
                    {i < 2 && r.sub[i] ? <div className="text-[0.9rem] font-normal text-muted">{r.sub[i]}</div> : null}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* 좁은 화면: 방법마다 카드 */}
      <ul className="mt-3 flex flex-col gap-3 md:hidden">
        {rows.map((r) => (
          <li key={r.id} className={`card ${r.id === "GBM" ? "!border-accent !border-2" : ""}`} data-row-m={r.id}>
            <p className="font-bold">{r.name}</p>
            <dl className="mt-2 grid grid-cols-1 gap-1 text-[1rem]">
              {COLS.map((c, i) => (
                <div key={c} className="flex justify-between gap-3">
                  <dt className="text-muted">{c}</dt>
                  <dd className="shrink-0 text-right font-semibold tabular-nums">
                    {r.cells[i]}
                    {i < 2 && r.sub[i] ? <span className="block text-[0.9rem] font-normal text-muted">{r.sub[i]}</span> : null}
                  </dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
      {b2 ? <p className="small mt-2">{b2.note}</p> : null}
    </section>
  );
}

export function DiffBox({ ev }: { ev: EvalV1 }) {
  const d3 = ev.paired_diff.GBM_minus_B3.pr_auc;
  const d4 = ev.paired_diff.GBM_minus_B4.pr_auc;
  return (
    <section className="card mt-4" data-testid="eval-diff">
      <p className="font-semibold">
        이 AI − 신호 규칙: PR-AUC {num(d3[1])} [{num(d3[0])}, {num(d3[2])}]
      </p>
      <p className="font-semibold">
        이 AI − 로지스틱: PR-AUC {num(d4[1])} [{num(d4[0])}, {num(d4[2])}]
      </p>
      {ev.interpretations.diff ? <p className="mt-2">{ev.interpretations.diff}</p> : null}
    </section>
  );
}

export function HardCases({ ev, blind }: { ev: EvalV1; blind: BlindEval | null }) {
  const fam = ev.family_perp;
  const rows = [
    { name: "이미 진행 중(1주차부터)", recall: pct(ev.cohorts.ongoing.recall), missed: pct(ev.cohorts.ongoing.missed_rate) },
    { name: "가족이 행위자", recall: pct(fam.recall), missed: pct(fam.missed_rate ?? null) },
    { name: "블라인드 Q1 체크카드 대리 사용", recall: pct(blind?.recall.Q1.windows ?? null), missed: blind ? pct(1 - blind.recall.Q1.persons) : DASH },
    { name: "블라인드 Q2 현금 인출 반복", recall: pct(blind?.recall.Q2.windows ?? null), missed: blind ? pct(1 - blind.recall.Q2.persons) : DASH },
  ];
  return (
    <section className="mt-6" data-testid="eval-table2">
      <h2 className="h2">어려운 경우</h2>
      <div className="mt-3 overflow-hidden rounded-2xl border border-line bg-white">
        <table className="w-full border-collapse text-[1rem]">
          <thead>
            <tr className="bg-soft text-left">
              <th className="px-3 py-2">경우</th>
              <th className="px-3 py-2 text-right">재현율</th>
              <th className="px-3 py-2 text-right">놓친 사람 비율</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} className="border-t border-line">
                <td className="px-3 py-2">{r.name}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.recall}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.missed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small mt-2">블라인드 수법은 신호를 짜지 않은 작업자가 모델 동결 뒤 만들었어요. 같은 팀 안의 분리라 완전한 외부 시험은 아니에요.</p>
      {hardCasesText(ev, blind) ? <p className="mt-2" data-testid="hard-cases-text">{hardCasesText(ev, blind)}</p> : null}
    </section>
  );
}

/** 설계서 §11-3 미리 적은 문장(pipeline/evaluate.py INTERP_HARD와 같은 글자). evaluate.py는 블라인드 전에 돌아
 *  이미 진행 중 주 재현율만 봤다 → 같은 기준(주 재현율 < 0.5)을 블라인드 Q1·Q2에도 대어 문장을 고른다. JSON은 고치지 않는다. */
const INTERP_HARD = "이미 오래된 착취와 처음 보는 수법은 잘 못 찾습니다 — 지원센터 첫 상담과 함께 써야 하는 이유입니다.";
function hardCasesText(ev: EvalV1, blind: BlindEval | null): string {
  if (ev.interpretations.hard_cases) return ev.interpretations.hard_cases;
  if (blind && (blind.recall.Q1.windows < 0.5 || blind.recall.Q2.windows < 0.5)) return INTERP_HARD;
  return "";
}

const ULABEL: Record<string, string> = {
  my_choice: "내가 하고 싶어서",
  asked_by_someone: "누가 하라고",
  threatened: "무서움·위협",
  not_sure: "잘 모르겠어요",
  unclear: "알 수 없음",
};

function Confusion({ title, labels, m }: { title: string; labels: string[]; m: number[][] }) {
  return (
    <div className="min-w-0">
      <p className="font-semibold">{title}</p>
      <div className="mt-1 overflow-x-auto">
        <table className="border-collapse text-[0.95rem] tabular-nums">
          <thead>
            <tr>
              <th className="px-1 py-1 text-left text-muted">정답＼판단</th>
              {labels.map((l) => (
                <th key={l} className="px-1 py-1 text-muted">
                  {ULABEL[l] ?? l}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {m.map((row, i) => (
              <tr key={i}>
                <th className="px-1 py-1 text-left font-normal text-muted">{ULABEL[labels[i]] ?? labels[i]}</th>
                {row.map((v, j) => (
                  <td key={j} className={`px-2 py-1 text-center ${i === j ? "bg-[#eef3ff] font-bold" : v > 0 ? "bg-[#fff1e8]" : ""}`}>
                    {v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function UnderstandTable({ u }: { u: UnderstandEval | null }) {
  return (
    <section className="mt-6" data-testid="eval-table3">
      <h2 className="h2">말로 한 답 알아듣기</h2>
      {u ? (
        <>
          <p className="mt-1">시험 문장 {u.test_n}개</p>
          <div className="mt-3 overflow-hidden rounded-2xl border border-line bg-white">
            <table className="w-full border-collapse text-[1rem]">
              <thead>
                <tr className="bg-soft text-left">
                  <th className="px-3 py-2"> </th>
                  <th className="px-3 py-2 text-right">정확도</th>
                  <th className="px-3 py-2 text-right">매크로 F1</th>
                  <th className="px-3 py-2 text-right">위험한 오분류</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-line">
                  <td className="px-3 py-2">언어모델</td>
                  <td className="px-3 py-2 text-right tabular-nums">{pct(u.llm.accuracy)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{num(u.llm.macro_f1)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{u.llm.dangerous_misclass}</td>
                </tr>
                <tr className="border-t border-line">
                  <td className="px-3 py-2">낱말 규칙(K0)</td>
                  <td className="px-3 py-2 text-right tabular-nums">{pct(u.k0.accuracy)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{num(u.k0.macro_f1)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{u.k0.dangerous_misclass}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="small mt-1">위험한 오분류 = 하라고 한 일을 &apos;내가 하고 싶어서&apos;로 읽은 수</p>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <Confusion title="언어모델" labels={u.confusion.labels} m={u.confusion.llm} />
            <Confusion title="낱말 규칙(K0)" labels={u.confusion.labels} m={u.confusion.k0} />
          </div>
        </>
      ) : (
        <p className="mt-2">{DASH}</p>
      )}
      <p className="small mt-2">평가 문장은 개발팀이 쓴 가상 문장이에요(당사자 문장 아님).</p>
    </section>
  );
}

export function HelpernoteTable({ h }: { h: HelpernoteEval | null }) {
  const items: [string, string][] = h
    ? [
        ["1차 통과율", pct(h.pass_first)],
        ["다시 쓴 뒤 통과율", pct(h.pass_after_retry)],
        ["숫자 일치율", pct(h.numbers_match_rate)],
        ["금지어", `${h.banned_hits}건`],
        ["상대 의도 단정", `${h.intent_hits}건`],
        ["기본 문장으로 바뀐 수", `${h.template_fallbacks}건`],
      ]
    : [];
  return (
    <section className="mt-6" data-testid="eval-table4">
      <h2 className="h2">알림 요약 검사</h2>
      {h ? (
        <>
          <p className="mt-1">{h.n}건</p>
          <dl className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
            {items.map(([k, v]) => (
              <div key={k} className="card !p-3">
                <dt className="text-[1rem] text-muted">{k}</dt>
                <dd className="text-[1.3rem] font-extrabold tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
        </>
      ) : (
        <p className="mt-2">{DASH}</p>
      )}
    </section>
  );
}
