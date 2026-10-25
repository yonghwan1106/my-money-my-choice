"use client";
// ⑨ 다시 묻기 (구현명세 §7-5 문구 그대로)

export function ReaskCard({ onPick }: { onPick: (notify: boolean) => void }) {
  return (
    <section data-testid="reask-card">
      <h2 className="h2">한 번 더 물어볼게요</h2>
      <p className="mt-3">어제는 &apos;이번엔 알리지 마요&apos;를 골랐어요.</p>
      <p className="mt-1 font-semibold">지금 혼자 있다면 다시 골라 주세요.</p>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <button type="button" className="btn btn-primary" onClick={() => onPick(true)}>
          알려 주세요
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => onPick(false)}>
          이번엔 알리지 마요
        </button>
      </div>
    </section>
  );
}
