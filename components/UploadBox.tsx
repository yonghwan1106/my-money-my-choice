"use client";
// ④ 올리기 (구현명세 §7-4 문구 그대로)
import { useRef, useState } from "react";
import { Download, FileSpreadsheet } from "lucide-react";
import { FileBanner } from "./SynthBanner";

export function UploadBox({ onFile, busy }: { onFile: (f: File) => void; busy?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <section data-testid="upload-box">
      <h1 className="h1 mt-2">통장 기록 올리기</h1>
      <div
        className={`mt-4 flex flex-col items-center gap-3 rounded-3xl border-[3px] border-dashed px-4 py-8 text-center transition-colors ${
          over ? "border-accent bg-[#eef3ff]" : "border-[#9aa1ab] bg-white"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) onFile(f);
        }}
      >
        <FileSpreadsheet size={56} strokeWidth={1.5} aria-hidden="true" className="text-accent" />
        <p className="font-semibold">은행 앱에서 내려받은 거래내역 파일(CSV·엑셀)을 여기에 놓아 주세요</p>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => input.current?.click()}>
          파일 고르기
        </button>
        <input
          ref={input}
          type="file"
          accept=".csv,.txt,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          data-testid="file-input"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = "";
          }}
        />
      </div>
      <div className="mt-4">
        <p className="font-semibold">연습용 예시 파일:</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <a className="btn btn-secondary !text-[1rem]" href="/samples/A_minsu_f1.csv" download>
            <Download size={20} aria-hidden="true" />
            형식 1 받기
          </a>
          <a className="btn btn-secondary !text-[1rem]" href="/samples/A_minsu_f2.csv" download>
            <Download size={20} aria-hidden="true" />
            형식 2 받기
          </a>
        </div>
      </div>
      <div className="mt-4">
        <FileBanner />
      </div>
    </section>
  );
}
