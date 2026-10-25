"use client";
// ④~⑨ 파일·분석·연결·카드 흐름 (구현명세 §7-4·§7-5)
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { AnalyzeResult, ColumnRole, Helper, HelperId, Settings, WeekResult } from "@/lib/engine/types";
import { applyMapping } from "@/lib/engine/parse";
import { askCard } from "@/lib/engine/templates";
import { PhoneFrame } from "@/components/PhoneFrame";
import { FileBanner, SynthBanner } from "@/components/SynthBanner";
import { DemoBadge } from "@/components/DemoBadge";
import { LAYERS, type LayerInfo } from "@/components/layers";
import { useAppState, type ScenarioId } from "@/components/AppState";
import { analyzeParsed, readFile, readUrl, type Parsed } from "@/components/engine";
import { SCENARIO_META, isScenarioId, resolveSettings } from "@/components/scenarios";
import { SCENARIO_PRE, SCENARIO_CHIP } from "@/components/scenarioData";
import { UploadBox } from "@/components/UploadBox";
import { MappingTable } from "@/components/MappingTable";
import { LinkStep } from "@/components/LinkStep";
import { Timeline, LEVEL_TEXT } from "@/components/Timeline";
import { SignalList } from "@/components/SignalList";
import { WhyBars } from "@/components/WhyBars";
import { MiniScore } from "@/components/MiniScore";
import { TxList } from "@/components/TxList";
import { ReplayBar, Tray } from "@/components/ReplayBar";
import { useReplay } from "@/components/useReplay";
import { FlowSheet } from "@/components/FlowSheet";
import { Bubble, type PreviewBubble } from "@/components/MessagePreview";
import { RelationIcon } from "@/components/Icon";

type Phase = "need_settings" | "loading" | "upload" | "mapping" | "analyzing" | "link" | "result";

const ANALYZE_MSGS = ["평소 돈 흐름을 배우는 중이에요", "평소와 달라진 점을 찾는 중이에요"];
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function CheckPage() {
  return (
    <Suspense fallback={null}>
      <Check />
    </Suspense>
  );
}

function Check() {
  const params = useSearchParams();
  const router = useRouter();
  const scenarioParam = params.get("scenario");
  const scenario: ScenarioId | null = isScenarioId(scenarioParam) ? scenarioParam : null;
  const app = useAppState();
  const { settings, setSettings, analysis, setAnalysis, setSource, setLastMode } = app;

  const [phase, setPhase] = useState<Phase>(scenario ? "loading" : app.settings ? "upload" : "need_settings");
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [failures, setFailures] = useState(0);
  const [msgIdx, setMsgIdx] = useState(0);
  const [tab, setTab] = useState<"overview" | "txs">("overview");
  const [picked, setPicked] = useState<number | null>(null);
  const [layer, setLayer] = useState<LayerInfo>(scenario ? LAYERS.signals : LAYERS.parse);
  const [bubbles, setBubbles] = useState<PreviewBubble[] | null>(null);
  const loadedFor = useRef<string | null>(null);

  // 시연: meta + 예시 파일을 같은 엔진으로 분석하고 설정·연결을 채운다(재생 대기)
  useEffect(() => {
    if (!scenario) return;
    if (loadedFor.current === scenario) return;
    loadedFor.current = scenario;
    const meta = SCENARIO_META[scenario];
    (async () => {
      setPhase("analyzing");
      setMsgIdx(0);
      const p = await readUrl(meta.sample.f1);
      await wait(500);
      setMsgIdx(1);
      const { result } = analyzeParsed(p);
      await wait(500);
      setSource({ kind: "demo", id: scenario });
      setSettings(resolveSettings(meta, result));
      setAnalysis(result);
      setPicked(null);
      setPhase("result");
    })();
  }, [scenario, setAnalysis, setSettings, setSource]);

  // 시연 주소가 아닌데 설정이 없으면 안내
  useEffect(() => {
    if (!scenario && !settings && phase !== "need_settings") setPhase("need_settings");
    if (!scenario && settings && phase === "need_settings") setPhase("upload");
  }, [scenario, settings, phase]);

  const mode: "demo" | "file" = scenario ? "demo" : "file";
  const weeks = phase === "result" ? (analysis?.weeks ?? null) : null;
  const replay = useReplay(weeks, settings, mode);
  const { st } = replay;
  const name = settings?.displayName ?? "";

  useEffect(() => {
    if (phase === "upload" || phase === "mapping") setLayer(LAYERS.parse);
    else if (phase === "link") setLayer(LAYERS.link);
    else if (phase === "analyzing") setLayer(LAYERS.signals);
    else if (phase === "result" && !st.active) setLayer(LAYERS.risk);
  }, [phase, st.active]);

  const onFile = useCallback(async (f: File) => {
    const p = await readFile(f);
    setParsed(p);
    if (p.rows.length === 0) setFailures((n) => n + 1);
    setPhase("mapping");
  }, []);

  const runAnalysis = useCallback(async () => {
    if (!parsed || !settings) return;
    setPhase("analyzing");
    setMsgIdx(0);
    await wait(600);
    setMsgIdx(1);
    const { result, txs } = analyzeParsed(parsed);
    await wait(600);
    if (txs.length === 0) {
      setFailures((n) => n + 1);
      setPhase("mapping");
      return;
    }
    setSource({ kind: "file", name: parsed.fileName });
    setAnalysis(result);
    setPicked(null);
    setPhase(settings.helpers.length > 0 ? "link" : "result");
  }, [parsed, settings, setAnalysis, setSource]);

  const cpLabels = useMemo(
    () => (analysis?.counterparties ?? []).filter((c) => c.type === "person").sort((a, b) => a.cpKey.localeCompare(b.cpKey)).map((c) => c.label),
    [analysis],
  );

  // 결과 화면에서 보이는 주와 고른 주
  const shownUpTo = mode === "demo" ? st.cursor : st.cursor;
  const shownWeeks = useMemo(() => (analysis?.weeks ?? []).filter((w) => w.week <= shownUpTo), [analysis, shownUpTo]);
  const latestCard = [...shownWeeks].reverse().find((w) => w.level === "watch" || w.level === "high") ?? null;
  const selectedWeek: WeekResult | null =
    (st.active ? st.active.week : null) ??
    (picked !== null ? (analysis?.weeks.find((w) => w.week === picked) ?? null) : null) ??
    latestCard ??
    shownWeeks[shownWeeks.length - 1] ??
    null;

  const overallLevel = latestCard
    ? latestCard.level
    : shownWeeks.length > 0 && shownWeeks.every((w) => w.level === "insufficient")
      ? "insufficient"
      : shownWeeks.length > 0
        ? "normal"
        : null;

  const second =
    st.active?.step.kind === "preview" && bubbles && bubbles.length > 0
      ? {
          title: `${bubbles.map((b) => b.alias).filter((v, i, a) => a.indexOf(v) === i).join(", ")}의 휴대폰`,
          content: (
            <div className="flex flex-col gap-4" data-testid="second-phone">
              {bubbles.map((b) => (
                <div key={b.helperId + b.type}>
                  {bubbles.length > 1 ? <p className="mb-1 text-[1rem] font-bold text-muted">{b.alias}의 휴대폰</p> : null}
                  <Bubble b={b} />
                </div>
              ))}
            </div>
          ),
        }
      : null;

  const top = (
    <>
      {mode === "demo" ? <SynthBanner /> : null}
      <DemoBadge />
    </>
  );

  return (
    <PhoneFrame side={layer} top={top} second={second} bottom={phase === "result" && !st.active ? "이 판단은 참고용이에요. 돈을 쓸지 말지는 본인이 정해요." : null}>
      <main>
        <Link href={mode === "demo" ? "/demo" : "/"} className="link text-[1rem]">
          {mode === "demo" ? "다른 인물 고르기" : "처음으로"}
        </Link>

        {phase === "need_settings" ? (
          <section className="mt-4" data-testid="need-settings">
            <p className="h2">먼저 내 설정을 해 주세요.</p>
            <Link href="/start" className="btn btn-primary mt-6">
              내 설정
            </Link>
            <Link href="/demo" className="btn btn-secondary mt-3">
              예시로 해 보기
            </Link>
          </section>
        ) : null}

        {phase === "upload" ? <UploadBox onFile={onFile} /> : null}

        {phase === "mapping" && parsed ? (
          <>
            <MappingTable
              rows={parsed.rows}
              report={parsed.report}
              fileName={parsed.fileName}
              failures={failures}
              onChange={(i: number, role: ColumnRole) => setParsed({ ...parsed, report: applyMapping(parsed.report, i, role) })}
              onAnalyze={runAnalysis}
            />
            <button type="button" className="btn btn-secondary mt-3" onClick={() => setPhase("upload")}>
              다른 파일 고르기
            </button>
          </>
        ) : null}

        {phase === "analyzing" || phase === "loading" ? (
          <section className="mt-10 flex flex-col items-center gap-4 text-center" data-testid="analyzing" aria-live="polite">
            <div className="h-14 w-14 animate-spin rounded-full border-[6px] border-band border-t-accent" aria-hidden="true" />
            <p className="h2">{ANALYZE_MSGS[msgIdx]}</p>
          </section>
        ) : null}

        {phase === "link" && settings && analysis ? (
          <LinkStep
            helpers={settings.helpers}
            counterparties={analysis.counterparties}
            onDone={(links: Record<HelperId, Helper["link"]>) => {
              const next: Settings = { ...settings, helpers: settings.helpers.map((h) => ({ ...h, link: links[h.id] ?? { state: "unknown" } })) };
              setSettings(next);
              setPhase("result");
            }}
          />
        ) : null}

        {phase === "result" && analysis && settings ? (
          <Result
            analysis={analysis}
            settings={settings}
            mode={mode}
            title={scenario ? SCENARIO_META[scenario].title : null}
            tab={tab}
            setTab={setTab}
            shownUpTo={shownUpTo}
            selectedWeek={selectedWeek}
            onPick={setPicked}
            overallLevel={overallLevel}
            replay={replay}
          />
        ) : null}
      </main>

      {phase === "result" && st.active && settings && analysis && st.active.step.kind !== "no_card" ? (
        <FlowSheet
          key={st.active.eventId + (st.active.ctx.reask ? "r" : "")}
          flow={st.active}
          settings={settings}
          weeks={analysis.weeks}
          cpLabels={cpLabels}
          pre={scenario ? SCENARIO_PRE[scenario] : null}
          chips={scenario ? [SCENARIO_CHIP[scenario]] : []}
          onInput={replay.answer}
          onClose={replay.close}
          onHome={() => router.push("/")}
          onMode={setLastMode}
          onBubbles={setBubbles}
          onLayer={setLayer}
          synth={!!scenario}
        />
      ) : null}
    </PhoneFrame>
  );
}

function Result({
  analysis,
  settings,
  mode,
  title,
  tab,
  setTab,
  shownUpTo,
  selectedWeek,
  onPick,
  overallLevel,
  replay,
}: {
  analysis: AnalyzeResult;
  settings: Settings;
  mode: "demo" | "file";
  title: string | null;
  tab: "overview" | "txs";
  setTab: (t: "overview" | "txs") => void;
  shownUpTo: number;
  selectedWeek: WeekResult | null;
  onPick: (w: number) => void;
  overallLevel: WeekResult["level"] | null;
  replay: ReturnType<typeof useReplay>;
}) {
  const { st } = replay;
  const name = settings.displayName;
  const share = analysis.report.unknownCategoryShare;
  const unknownN = Math.round(share * 10);
  const insufficient = analysis.weeks.filter((w) => w.week <= shownUpTo && w.level === "insufficient");
  const noCp = analysis.txs.filter((t) => !t.cpKey).length;
  const cpLabel = (key: string) => analysis.counterparties.find((c) => c.cpKey === key)?.label ?? key;
  return (
    <section className="mt-3" data-testid="result">
      {mode === "file" ? (
        <div className="mb-3">
          <FileBanner />
        </div>
      ) : null}
      <h1 className="h1">{title ?? `${name} 님의 돈 흐름`}</h1>
      <div className="mt-2 flex flex-wrap items-center gap-2" data-testid="level-badge">
        {overallLevel ? (
          <span className={`badge badge-${overallLevel}`} data-level={overallLevel}>
            {LEVEL_TEXT[overallLevel]}
          </span>
        ) : (
          <span className="badge badge-insufficient">재생을 눌러 주세요</span>
        )}
      </div>

      {settings.helpers.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-1.5" aria-label="믿는 사람" data-testid="helper-links">
          {settings.helpers.map((h) => (
            <li key={h.id} className="flex items-center gap-2 text-[1rem]">
              <RelationIcon relation={h.relation} size={24} className="shrink-0 text-accent" />
              <strong>{h.alias}</strong>
              <span className="text-muted">
                {h.link.state === "linked" ? `· ${cpLabel(h.link.cpKey)}` : h.link.state === "not_in_list" ? "· 목록에 없음" : ""}
              </span>
              {h.link.state === "unknown" ? <span className="badge badge-insufficient !text-[0.95rem]">연결 모름</span> : null}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-2" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "overview"} className="btn btn-secondary btn-choice" aria-pressed={tab === "overview"} onClick={() => setTab("overview")}>
          한눈에 보기
        </button>
        <button type="button" role="tab" aria-selected={tab === "txs"} className="btn btn-secondary btn-choice" aria-pressed={tab === "txs"} onClick={() => setTab("txs")}>
          거래 기록
        </button>
      </div>

      <ReplayBar cursor={st.cursor} total={analysis.weeks.length} playing={st.playing} onPlay={replay.play} onPause={replay.pause} onSkip={replay.skipToCard} />
      <Tray items={st.tray} weeks={analysis.weeks} onOpen={replay.openFromTray} title={(w) => safeTitle(w, name)} />

      {tab === "overview" ? (
        <>
          <Timeline weeks={analysis.weeks} shownUpTo={shownUpTo} selected={selectedWeek?.week ?? null} onSelect={onPick} />
          <div className="mt-3 flex flex-col gap-1 text-[1rem]" data-testid="unknowns">
            {share > 0 ? <p data-testid="unknown-category">분류 모름: 10건 중 {unknownN > 0 ? `${unknownN}건` : "1건 미만"}</p> : null}
            {insufficient.length > 0 ? (
              <p data-testid="unknown-insufficient">
                정보 부족 — 판단 보류: {insufficient.length === 1 ? `${insufficient[0].week}주` : `${insufficient[0].week}~${insufficient[insufficient.length - 1].week}주`}
              </p>
            ) : null}
            {noCp > 0 ? <p data-testid="unknown-cp">누구인지 모름: {noCp}건</p> : null}
          </div>
          {selectedWeek && selectedWeek.week <= shownUpTo ? (
            <>
              <SignalList week={selectedWeek} name={name} />
              <WhyBars week={selectedWeek} />
            </>
          ) : null}
          <MiniScore />
        </>
      ) : (
        <TxList txs={analysis.txs} weeks={analysis.weeks} shownUpTo={shownUpTo} />
      )}
    </section>
  );
}

function safeTitle(w: WeekResult, name: string): string {
  try {
    return askCard(w, name).title;
  } catch {
    return LEVEL_TEXT[w.level];
  }
}
