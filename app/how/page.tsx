// ⑪ AI가 하는 일 (구현명세 §7-7 문구 그대로)
import { Check, X } from "lucide-react";
import { WidePage } from "@/components/WidePage";
import { LAYERS } from "@/components/layers";

const STEPS = [
  { t: "평소와 다른 점 찾기", d: "통장 기록 → 신호 10개 + 평소와 상관없는 기준 4개(통계)" },
  { t: "위험 판단하기", d: "신호 → 위험 점수 → 보통·살펴보기·위험이 높아요(가상 거래로 직접 학습한 모델)" },
  { t: "본인에게 묻고 답 알아듣기", d: "검수한 고정 문장 카드 / 말로 답하면 AI가 알아듣고 본인이 확인" },
  { t: "본인 뜻대로 알리기", d: "본인 답 × 본인 설정 → 누구에게 알릴지(지원의사결정 규칙)" },
];
const DO = [
  "본인이 말로 한 답을 다섯 가지 중 하나로 알아듣기(본인이 '맞아요'를 눌러야 반영)",
  "믿는 사람에게 가는 알림의 '무슨 일이 있었는지' 요약 쓰기(숫자 검사를 통과한 것만)",
];
const DONT = ["위험 판단", "확인 카드 문장 쓰기", "알릴 사람 정하기", "거래 기록 읽기", "숫자 계산"];

export default function HowPage() {
  return (
    <WidePage side={LAYERS.how}>
      <h1 className="h1 mt-3">AI가 하는 일</h1>
      <ol className="mt-5 grid gap-3 md:grid-cols-4" data-testid="how-steps">
        {STEPS.map((s, i) => (
          <li key={s.t} className="card flex flex-col gap-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-[1.2rem] font-extrabold text-white" aria-hidden="true">
              {i + 1}
            </span>
            <p className="h3">
              {["①", "②", "③", "④"][i]} {s.t}
            </p>
            <p className="text-[1rem]">{s.d}</p>
          </li>
        ))}
      </ol>

      <section className="mt-8" data-testid="how-llm">
        <h2 className="h2">언어모델이 하는 일 / 하지 않는 일</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="card">
            <p className="h3">하는 일</p>
            <ul className="mt-2 flex flex-col gap-2">
              {DO.map((x) => (
                <li key={x} className="flex gap-2">
                  <Check size={24} aria-hidden="true" className="mt-0.5 shrink-0 text-accent" />
                  <span>{x}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="card">
            <p className="h3">하지 않는 일</p>
            <ul className="mt-2 flex flex-col gap-2">
              {DONT.map((x) => (
                <li key={x} className="flex gap-2">
                  <X size={24} aria-hidden="true" className="mt-0.5 shrink-0 text-high" />
                  <span>{x}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="mt-8" data-testid="how-privacy">
        <h2 className="h2">개인정보 흐름</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <div className="card">
            <p className="h3">이 기기 안에만</p>
            <p className="mt-1">거래 기록, 이름, 계좌, 믿는 사람 연결, 설정</p>
          </div>
          <div className="card">
            <p className="h3">서버로 가는 것</p>
            <p className="mt-1">이름을 지운 답 문장(200자 이하), 이름 없는 요약 숫자</p>
          </div>
          <div className="card">
            <p className="h3">저장</p>
            <p className="mt-1">없음</p>
          </div>
        </div>
      </section>

      <details className="card mt-8" data-testid="how-why">
        <summary className="h3 cursor-pointer">왜 카드 문장을 AI가 쓰지 않나요?</summary>
        <p className="mt-2">
          언어모델에게 쉬운 말 문장을 맡겼더니 거래 기록에 없는 상대의 마음을 지어내는 경우가 있었어요. 확인 질문이 한쪽으로 기울지 않게, 카드는 미리 검수한 고정 문장에 숫자만 채워요.
        </p>
      </details>

      <p className="small mt-6">카드 문장은 『발달장애인용 읽기 쉬운 책 개발 지침』(국립장애인도서관 게시)의 짧은 문장·낱말과 그림 함께 원칙을 따랐어요.</p>
    </WidePage>
  );
}
