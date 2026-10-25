"use client";
// ③ 내 설정 — 6단계 → Settings (구현명세 §7-3)
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Helper, Settings } from "@/lib/engine/types";
import { PhoneFrame } from "@/components/PhoneFrame";
import { DemoBadge } from "@/components/DemoBadge";
import { LAYERS } from "@/components/layers";
import { useAppState } from "@/components/AppState";
import { ConsentStep } from "@/components/ConsentStep";
import { HelperEditor, ScopeStep, draftsToHelpers, type HelperDraft } from "@/components/HelperEditor";
import { PredelegateToggle } from "@/components/PredelegateToggle";
import { SettingsSummary } from "@/components/SettingsSummary";

type StepNo = 1 | 2 | 3 | 4 | 5 | 6;

const NAME_MAX = 6;
function validName(n: string): boolean {
  const s = n.trim();
  return s.length >= 1 && s.length <= NAME_MAX && s !== "나";
}

export default function StartPage() {
  const router = useRouter();
  const { setSettings, setSource, setAnalysis } = useAppState();
  const [step, setStep] = useState<StepNo>(1);
  const [name, setName] = useState("");
  const [drafts, setDrafts] = useState<HelperDraft[]>([{ alias: "", relation: null }]);
  const [helpers, setHelpers] = useState<Helper[]>([]);
  const [scopeIdx, setScopeIdx] = useState(0);
  const [pre, setPre] = useState<Settings["predelegate"]>({ enabled: false, helperId: null });

  const settings: Settings = {
    consent: true,
    displayName: name.trim(),
    helpers,
    predelegate: pre.enabled && pre.helperId && helpers.some((h) => h.id === pre.helperId) ? pre : { enabled: false, helperId: null },
  };

  const back = () => {
    if (step === 4 && scopeIdx > 0) setScopeIdx(scopeIdx - 1);
    else if (step === 5 && helpers.length === 0) setStep(3);
    else if (step > 1) setStep((step - 1) as StepNo);
  };

  return (
    <PhoneFrame side={LAYERS.settings} top={<DemoBadge />}>
      <main>
        {step > 1 ? (
          <button type="button" className="link text-[1rem]" onClick={back}>
            뒤로
          </button>
        ) : null}

        {step === 1 ? <ConsentStep onYes={() => setStep(2)} /> : null}

        {step === 2 ? (
          <section data-testid="name-step">
            <h1 className="h1 mt-2">뭐라고 부를까요?</h1>
            <input
              className="field mt-4"
              value={name}
              maxLength={NAME_MAX}
              placeholder="예: 민수"
              aria-label="부를 이름"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && validName(name)) setStep(3);
              }}
            />
            <button type="button" className="btn btn-primary mt-6" disabled={!validName(name)} onClick={() => setStep(3)}>
              다음
            </button>
          </section>
        ) : null}

        {step === 3 ? (
          <HelperEditor
            drafts={drafts}
            onChange={setDrafts}
            onNext={() => {
              const hs = draftsToHelpers(drafts, helpers);
              setHelpers(hs);
              setScopeIdx(0);
              if (pre.helperId && !hs.some((h) => h.id === pre.helperId)) setPre({ enabled: false, helperId: null });
              setStep(hs.length > 0 ? 4 : 5);
            }}
          />
        ) : null}

        {step === 4 && helpers[scopeIdx] ? (
          <ScopeStep
            key={helpers[scopeIdx].id}
            helper={helpers[scopeIdx]}
            onChange={(h) => setHelpers(helpers.map((x) => (x.id === h.id ? h : x)))}
            onNext={() => {
              if (scopeIdx + 1 < helpers.length) setScopeIdx(scopeIdx + 1);
              else setStep(5);
            }}
          />
        ) : null}

        {step === 5 ? <PredelegateToggle helpers={helpers} value={pre} onChange={setPre} onNext={() => setStep(6)} /> : null}

        {step === 6 ? (
          <section data-testid="confirm-step">
            <h1 className="h1 mt-2">이렇게 정했어요</h1>
            <SettingsSummary settings={settings} />
            <div className="mt-6 flex flex-col gap-3">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setSettings(settings);
                  setSource(null);
                  setAnalysis(null);
                  router.push("/check");
                }}
              >
                이대로 시작
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setStep(2)}>
                고치기
              </button>
            </div>
            <script type="application/json" data-testid="settings-json" dangerouslySetInnerHTML={{ __html: JSON.stringify(settings) }} />
          </section>
        ) : null}
      </main>
    </PhoneFrame>
  );
}
