# -*- coding: utf-8 -*-
"""Shared helpers for train / export / evaluate (no feature computation here:
features come from scripts/featurize.ts)."""
import json
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
WORK = HERE / "work"
N_FEAT = 22
META = ["person_id", "week", "split", "cohort", "pattern", "perpetrator", "label", "baseline_weeks_meta",
        "level_insufficient", "b0", "b3"]


def feature_names():
    return ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9", "s10",
            "baseline_missing", "out_total_ratio", "n_transfer_cps", "new_cp_share", "night_out_share",
            "cash_share", "unknown_share", "baseline_weeks", "a1_income_out48", "a2_transfer_income_4w",
            "a3_cash_income_4w", "a4_top_cp_share_4w"]


def load_features(path=None):
    """features.csv -> (meta DataFrame, X float64 ndarray). The last 22 columns are
    the features (the header repeats 'baseline_weeks', so read by position)."""
    path = Path(path) if path else WORK / "features.csv"
    raw = pd.read_csv(path, header=None, skiprows=1, dtype=str, keep_default_na=False)
    meta = raw.iloc[:, :len(META)].copy()
    meta.columns = META
    for c in ("week", "label", "baseline_weeks_meta", "level_insufficient", "b0", "b3"):
        meta[c] = meta[c].astype(int)
    X = raw.iloc[:, len(META):len(META) + N_FEAT].astype(np.float64).to_numpy()
    assert X.shape[1] == N_FEAT
    return meta, X


def cards_per_month(meta, flag):
    """Mean over persons of (flagged windows / observed months), months = windows*7/30.44."""
    df = pd.DataFrame({"pid": meta["person_id"].to_numpy(), "f": flag.astype(int)})
    g = df.groupby("pid")["f"].agg(["sum", "count"])
    if len(g) == 0:
        return 0.0
    return float((g["sum"] / (g["count"] * 7 / 30.44)).mean())


def pick_t1(meta_none, p_none):
    """Lowest threshold whose mean none-person cards/month <= 1."""
    cands = np.unique(p_none)
    cands = np.concatenate([cands, [np.nextafter(cands.max(), np.inf)]]) if len(cands) else np.array([0.5])
    for t in cands:  # ascending
        if cards_per_month(meta_none, p_none >= t) <= 1.0:
            return float(t)
    return float(cands[-1])


def pick_t2(y, p, t1):
    """Lowest threshold >= t1 with window precision >= 0.80, else fallback."""
    for t in np.unique(p[p >= t1]):
        sel = p >= t
        if sel.sum() == 0:
            continue
        if y[sel].mean() >= 0.80:
            return float(t), "precision80"
    return float(t1 + (1 - t1) / 2), "fallback"


def write_json(path, obj):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
