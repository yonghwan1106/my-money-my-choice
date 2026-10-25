"use client";
// ⑤-1 말로 답하기 (구현명세 §7-5) — 받아쓰기는 webkitSpeechRecognition 한 곳만(lang="ko-KR", 없으면 숨김)
import { useEffect, useRef, useState } from "react";
import { Mic, Send } from "lucide-react";

type Recognizer = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

export const FREE_MAX = 200;

export function FreeAnswer({
  chips,
  busy,
  onSend,
  onChip,
  onCancel,
}: {
  chips: string[];
  busy: boolean;
  onSend: (text: string) => void;
  onChip: (text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState("");
  const [canListen, setCanListen] = useState(false);
  const [listening, setListening] = useState(false);
  const rec = useRef<Recognizer | null>(null);
  useEffect(() => {
    const W = window as unknown as { webkitSpeechRecognition?: new () => Recognizer };
    setCanListen(typeof W.webkitSpeechRecognition === "function");
    return () => rec.current?.stop();
  }, []);
  const listen = () => {
    const W = window as unknown as { webkitSpeechRecognition?: new () => Recognizer };
    if (!W.webkitSpeechRecognition) return;
    const r = new W.webkitSpeechRecognition();
    r.lang = "ko-KR";
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.onresult = (e) => {
      const t = e.results?.[0]?.[0]?.transcript ?? "";
      if (t) setText((prev) => (prev ? prev + " " : "") + t);
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    rec.current = r;
    setListening(true);
    r.start();
  };
  return (
    <section data-testid="free-answer">
      <h2 className="h2">말로 해도 돼요</h2>
      <textarea
        className="field mt-3 min-h-[120px] resize-none"
        maxLength={FREE_MAX}
        placeholder="왜 그랬는지 말해 줄래요? 안 해도 돼요."
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, FREE_MAX))}
        aria-label="말로 한 답"
      />
      {chips.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2" data-testid="chips">
          {chips.map((c) => (
            <button key={c} type="button" className="chip text-left" disabled={busy} onClick={() => onChip(c)} data-chip>
              {c}
            </button>
          ))}
        </div>
      ) : null}
      <div className="mt-3 flex flex-col gap-3">
        {canListen ? (
          <button type="button" className="btn btn-secondary" onClick={listen} disabled={listening || busy}>
            <Mic size={22} aria-hidden="true" />
            말하기
          </button>
        ) : null}
        <button type="button" className="btn btn-primary" disabled={busy || text.trim().length === 0} onClick={() => onSend(text.trim())}>
          <Send size={22} aria-hidden="true" />
          보내기
        </button>
      </div>
      <p className="small mt-3">이름은 지우고 AI가 읽어요. 저장하지 않아요.</p>
      <p className="mt-2 text-center">
        <button type="button" className="link text-[1rem]" onClick={onCancel}>
          버튼으로 고를게요
        </button>
      </p>
    </section>
  );
}
