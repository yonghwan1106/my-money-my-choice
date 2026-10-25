"use client";
// 앱 상태 — React Context(메모리)만. localStorage·sessionStorage·쿠키를 쓰지 않는다(구현명세 §7-0).
// 새로고침하면 설정과 결과가 모두 지워진다.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AnalyzeResult, HealthResponse, Settings } from "@/lib/engine/types";

export type ScenarioId = "A" | "B" | "C" | "D";
export type Source = { kind: "demo"; id: ScenarioId } | { kind: "file"; name: string };
export type LastMode = "live" | "cache" | "precomputed" | "rule" | "template" | null;

interface AppStateValue {
  settings: Settings | null;
  setSettings: (s: Settings | null) => void;
  source: Source | null;
  setSource: (s: Source | null) => void;
  analysis: AnalyzeResult | null;
  setAnalysis: (a: AnalyzeResult | null) => void;
  health: HealthResponse | null;
  lastMode: LastMode;
  setLastMode: (m: LastMode) => void;
  /** 데모 배지를 보일지: /api/health가 demo이거나 마지막 응답 mode가 rule·template */
  demoMode: boolean;
  reset: () => void;
}

const Ctx = createContext<AppStateValue | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [analysis, setAnalysis] = useState<AnalyzeResult | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [lastMode, setLastMode] = useState<LastMode>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/health", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: HealthResponse | null) => {
        if (alive && j && typeof j === "object") setHealth(j);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const reset = useCallback(() => {
    setSettings(null);
    setSource(null);
    setAnalysis(null);
    setLastMode(null);
  }, []);

  const value = useMemo<AppStateValue>(
    () => ({
      settings,
      setSettings,
      source,
      setSource,
      analysis,
      setAnalysis,
      health,
      lastMode,
      setLastMode,
      demoMode: health?.llm === "demo" || lastMode === "rule" || lastMode === "template",
      reset,
    }),
    [settings, source, analysis, health, lastMode, reset],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppState(): AppStateValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("AppStateProvider 밖에서 useAppState를 불렀어요");
  return v;
}
