"use client";
// 읽어 주기 (구현명세 §7-5) — speechSynthesis + lang="ko-KR", 한국어 목소리가 없으면 숨김
import { useEffect, useState } from "react";
import { Volume2 } from "lucide-react";

export function SpeakButton({ text }: { text: string }) {
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null);
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const pick = () => {
      const v = window.speechSynthesis.getVoices().find((x) => x.lang?.toLowerCase().startsWith("ko"));
      setVoice(v ?? null);
    };
    pick();
    window.speechSynthesis.addEventListener("voiceschanged", pick);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", pick);
      window.speechSynthesis.cancel();
    };
  }, []);
  if (!voice) return null;
  return (
    <button
      type="button"
      className="chip gap-1.5"
      data-testid="speak"
      onClick={() => {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = "ko-KR";
        u.voice = voice;
        u.rate = 0.9;
        window.speechSynthesis.speak(u);
      }}
    >
      <Volume2 size={22} aria-hidden="true" />
      읽어 주기
    </button>
  );
}
