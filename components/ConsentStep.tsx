"use client";
// ③-1 동의 (구현명세 §7-3 문구 그대로)
import Link from "next/link";
import { useState } from "react";

export function ConsentStep({ onYes }: { onYes: () => void }) {
  const [declined, setDeclined] = useState(false);
  if (declined) {
    return (
      <section data-testid="consent-declined">
        <p className="h2 mt-6">괜찮아요. 언제든 다시 시작할 수 있어요.</p>
        <Link href="/" className="btn btn-primary mt-8">
          처음으로
        </Link>
      </section>
    );
  }
  return (
    <section data-testid="consent-step">
      <h1 className="h1 mt-2">시작하기 전에</h1>
      <ul className="mt-4 flex flex-col gap-3 text-[1.05rem]">
        <li className="card">
          이 앱은 내 <strong>통장 기록</strong>을 보고, 평소와 다르면 <strong>나에게 먼저</strong> 물어봐요.
        </li>
        <li className="card">
          돈 보내기는 <strong>막지 않아요</strong>.
        </li>
        <li className="card">
          기록은 <strong>이 기기 안에서만</strong> 봐요.
        </li>
        <li className="card">
          옆에서 도와줘도, <strong>누르는 건 본인</strong>이에요.
        </li>
      </ul>
      <p className="h2 mt-6">괜찮아요?</p>
      <div className="mt-3 flex flex-col gap-3">
        <button type="button" className="btn btn-primary" onClick={onYes}>
          네
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => setDeclined(true)}>
          아니요
        </button>
      </div>
    </section>
  );
}
