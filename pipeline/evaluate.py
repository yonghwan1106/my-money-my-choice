# -*- coding: utf-8 -*-
"""P8 evaluation on the TEST split (spec 11 / design 11-2, 11-3) -> data/eval/eval_v1.json.
Thresholds come from the validation split (train.py). Numbers are synthetic-data numbers.

Usage: python <repo>/pipeline/evaluate.py
"""
import datetime as dt
import json
import pickle
import sys
from pathlib import Path

import numpy as np
from sklearn.metrics import average_precision_score, precision_recall_curve

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common as C  # noqa: E402

PATTERN_LABELS = {"P1": "반복 송금", "P2": "수입 직후 가로채기", "P3": "명의 대출 통과", "P4": "명의 휴대폰 여러 대",
                  "P5": "소액결제 반복", "P6": "급여 끊김·되돌림"}
N_BOOT = 1000
BOOT_SEED = 20261026

# Pre-written interpretations (design 11-3) — chosen by rule, never rewritten.
INTERP_DIFF_ZERO = "가상 데이터에서는 신호 설계가 성능의 대부분이고, 부스팅이 더한 몫은 뚜렷하지 않았습니다."
INTERP_LOPO_HIGH = "그 수법을 겨냥한 신호가 이미 있어서일 수 있습니다. 신호 설계의 누수는 블라인드 수법으로 따로 쟀습니다."
INTERP_LOPO_LOW = "그 수법을 학습에서 못 본 부스팅은 전용 신호를 덜 씁니다. 이 경우 신호 규칙(B3)과 함께 보아야 합니다."
INTERP_HARD = "이미 오래된 착취와 처음 보는 수법은 잘 못 찾습니다 — 지원센터 첫 상담과 함께 써야 하는 이유입니다."
# Rules fixed before looking at results:
#  diff: the 95% interval of GBM-B3 or GBM-B4 PR-AUC contains 0 -> INTERP_DIFF_ZERO, otherwise "".
#  lopo: mean LOPO recall >= 0.9 x mean full-model recall on the same patterns -> HIGH, else LOW.
#  hard_cases: ongoing-cohort window recall < 0.5 -> INTERP_HARD, otherwise "" (blind result is in eval_blind_v1.json).


def r4(x):
    return None if x is None else float(round(float(x), 4))


def pr_auc(y, s):
    if y.sum() == 0 or y.sum() == len(y):
        return None
    return float(average_precision_score(y, s))


def recall(y, flag):
    return float(flag[y == 1].mean()) if (y == 1).sum() else None


def precision(y, flag):
    return float(y[flag].mean()) if flag.sum() else None


def person_stats(meta, flag, truth):
    """missed rate (all/new/ongoing), first-detection days (new cohort) and S/s."""
    df = meta.assign(flag=flag)
    res = {"all": [0, 0], "new": [0, 0], "ongoing": [0, 0]}
    days = []
    S = 0
    s = 0
    for pid, g in df.groupby("person_id"):
        t = truth[pid]
        if t["cohort"] == "none":
            continue
        if g["label"].sum() == 0 and not (g["label_any"].sum() > 0):
            continue
        S += 1
        inwin = g[(g["week"] >= t["start_week"]) & (g["week"] <= t["end_week"])]
        caught = bool(inwin["flag"].any())
        for k in ("all", t["cohort"]):
            res[k][0] += 1
            res[k][1] += 0 if caught else 1
        if caught:
            s += 1
            if t["cohort"] == "new":
                fw = int(inwin[inwin["flag"]]["week"].min())
                days.append((fw - t["start_week"]) * 7)
    missed = {k: (v[1] / v[0] if v[0] else None) for k, v in res.items()}
    n_persons = {k: v[0] for k, v in res.items()}
    med_days = float(np.median(days)) if days else None
    return missed, n_persons, med_days, S, s


def main():
    with open(C.WORK / "models.pkl", "rb") as f:
        M = pickle.load(f)
    truth = json.loads((C.WORK / "synth" / "truth.json").read_text(encoding="utf-8"))
    meta_all, X_all = C.load_features()
    # persons whose positive windows are all 'insufficient' still count as exploited persons
    pos_any = meta_all.groupby("person_id")["label"].max()
    meta_all["label_any"] = meta_all["person_id"].map(pos_any).astype(int)
    test = (meta_all["split"] == "test").to_numpy()
    ok = test & (meta_all["level_insufficient"] == 0).to_numpy()
    meta = meta_all[ok].reset_index(drop=True)
    X = X_all[ok]
    y = meta["label"].to_numpy()
    none = (meta["cohort"] == "none").to_numpy()

    g_raw = M["gbm"].predict_proba(X)[:, 1]
    g = M["cal"].predict(g_raw)
    b4 = M["cal4"].predict(M["lr"].predict_proba(M["scaler"].transform(X))[:, 1])
    b1 = -M["iso"].score_samples(X)
    b3 = meta["b3"].to_numpy().astype(float)
    b0 = meta["b0"].to_numpy().astype(bool)

    methods = {
        "B0": {"score": None, "watch": b0, "high": None},
        "B1": {"score": b1, "watch": b1 >= M["b1_t1"], "high": b1 >= M["b1_t2"]},
        "B3": {"score": b3, "watch": b3 >= 1, "high": b3 >= 2},
        "B4": {"score": b4, "watch": b4 >= M["b4_t1"], "high": b4 >= M["b4_t2"]},
        "GBM": {"score": g, "watch": g >= M["t1"], "high": g >= M["t2"]},
    }
    names = {"B0": "흔한 고정 금액 규칙(30만 원·하루 3번)", "B1": "이상치 찾기(Isolation Forest)",
             "B3": "신호 규칙(켜진 신호 수)", "B4": "로지스틱 회귀", "GBM": "이 AI(부스팅)"}

    # person-grouped bootstrap
    pids = meta["person_id"].to_numpy()
    uniq = np.unique(pids)
    groups = {p: np.flatnonzero(pids == p) for p in uniq}
    rng = np.random.default_rng(BOOT_SEED)
    boot = {k: {"pr": [], "rec": []} for k in methods}
    diffs = {"GBM_minus_B3": {"pr": [], "rec": []}, "GBM_minus_B4": {"pr": [], "rec": []}}
    for _ in range(N_BOOT):
        samp = rng.choice(uniq, size=len(uniq), replace=True)
        ix = np.concatenate([groups[p] for p in samp])
        yb = y[ix]
        if yb.sum() == 0:
            continue
        vals = {}
        for k, m in methods.items():
            pr = pr_auc(yb, m["score"][ix]) if m["score"] is not None else None
            rc = recall(yb, m["watch"][ix])
            vals[k] = (pr, rc)
            if pr is not None:
                boot[k]["pr"].append(pr)
            boot[k]["rec"].append(rc)
        for a, b in (("GBM", "B3"), ("GBM", "B4")):
            diffs["GBM_minus_" + b]["pr"].append(vals[a][0] - vals[b][0])
            diffs["GBM_minus_" + b]["rec"].append(vals[a][1] - vals[b][1])

    def ci(xs):
        return [r4(np.percentile(xs, 2.5)), r4(np.percentile(xs, 97.5))] if len(xs) else None

    rows = []
    method_person = {}
    for k, m in methods.items():
        missed, n_persons, med_days, S, s = person_stats(meta, m["watch"], truth)
        method_person[k] = (missed, n_persons, med_days, S, s)
        rows.append({
            "id": k, "name": names[k],
            "pr_auc": r4(pr_auc(y, m["score"])) if m["score"] is not None else None,
            "pr_auc_ci": ci(boot[k]["pr"]) if m["score"] is not None else None,
            "recall_at_rule": r4(recall(y, m["watch"])), "recall_ci": ci(boot[k]["rec"]),
            "cards_per_month_none": r4(C.cards_per_month(meta[none], m["watch"][none])),
            "high_precision": r4(precision(y, m["high"])) if m["high"] is not None else None,
            "median_days_first": r4(med_days),
            "missed_rate": {kk: r4(v) for kk, v in missed.items()},
        })
    pos_rate = float(y.mean())
    rows.append({"id": "RANDOM", "name": "무작위로 고를 때", "pr_auc": r4(pos_rate), "pr_auc_ci": None,
                 "recall_at_rule": None, "recall_ci": None, "cards_per_month_none": None, "high_precision": None,
                 "median_days_first": None, "missed_rate": {"all": None, "new": None, "ongoing": None}})

    paired = {}
    for k, d in diffs.items():
        b = k.split("_")[-1]
        obs_pr = pr_auc(y, g) - pr_auc(y, methods[b]["score"])
        obs_rc = recall(y, methods["GBM"]["watch"]) - recall(y, methods[b]["watch"])
        paired[k] = {"pr_auc": [r4(np.percentile(d["pr"], 2.5)), r4(obs_pr), r4(np.percentile(d["pr"], 97.5))],
                     "recall_at_rule": [r4(np.percentile(d["rec"], 2.5)), r4(obs_rc), r4(np.percentile(d["rec"], 97.5))]}

    # by pattern & LOPO
    pat = meta["pattern"].to_numpy()
    by_pattern, lopo = [], []
    for p in ["P1", "P2", "P3", "P4", "P5", "P6"]:
        sel = (pat == p) & (y == 1)
        by_pattern.append({"pattern": p, "label": PATTERN_LABELS[p], "recall": r4(methods["GBM"]["watch"][sel].mean()) if sel.sum() else None,
                           "n_windows": int(sel.sum())})
        L = M["lopo"][p]
        lp = L["cal"].predict(L["model"].predict_proba(X)[:, 1])
        lopo.append({"held_out": p, "recall": r4((lp[sel] >= L["t1"]).mean()) if sel.sum() else None, "n_windows": int(sel.sum())})

    gm = method_person["GBM"]
    coh = {}
    for c in ("new", "ongoing"):
        sel = (meta["cohort"].to_numpy() == c) & (y == 1)
        coh[c] = {"recall": r4(methods["GBM"]["watch"][sel].mean()) if sel.sum() else None,
                  "missed_rate": r4(gm[0][c]), "n_persons": int(gm[1][c])}
    fam = (np.isin(meta["perpetrator"].to_numpy(), ["sibling", "other_family_or_other"])) & (y == 1)
    family = {"recall": r4(methods["GBM"]["watch"][fam].mean()) if fam.sum() else None, "n_windows": int(fam.sum())}

    def curve(s):
        pr, rc, _ = precision_recall_curve(y, s)
        pts = sorted(zip(rc.tolist(), pr.tolist()))
        if len(pts) > 60:
            step = (len(pts) - 1) / 59
            pts = [pts[round(i * step)] for i in range(60)]
        return [[r4(a), r4(b)] for a, b in pts]

    # interpretations by the pre-fixed rules
    contains0 = any(paired[k]["pr_auc"][0] <= 0 <= paired[k]["pr_auc"][2] for k in paired)
    full = [b["recall"] for b in by_pattern if b["recall"] is not None]
    lo = [l["recall"] for l in lopo if l["recall"] is not None]
    lopo_high = bool(full and lo and np.mean(lo) >= 0.9 * np.mean(full))
    hard = coh["ongoing"]["recall"] is not None and coh["ongoing"]["recall"] < 0.5

    F = rows[[r["id"] for r in rows].index("GBM")]["cards_per_month_none"] or 0.0
    if F == 0:
        F_text = "한 번도 없었습니다"
    elif F >= 1:
        F_text = "한 달에 %d번꼴" % round(F)
    else:
        F_text = "%d달에 한 번꼴" % round(1 / F)
    out = {
        "version": "eval-v1",
        "generated_at": dt.datetime.now(dt.timezone(dt.timedelta(hours=9))).isoformat(timespec="seconds"),
        "split": {"train": int(meta_all[meta_all["split"] == "train"]["person_id"].nunique()),
                  "val": int(meta_all[meta_all["split"] == "val"]["person_id"].nunique()),
                  "test": int(meta_all[meta_all["split"] == "test"]["person_id"].nunique()),
                  "test_windows": int(len(y)), "test_pos_windows": int(y.sum()), "pos_rate": r4(pos_rate)},
        "thresholds": {"t1": r4(M["t1"]), "t2": r4(M["t2"]), "t2_rule": M["t2_rule"]},
        "rows": rows,
        "paired_diff": paired,
        "by_pattern": by_pattern,
        "lopo": lopo,
        "cohorts": coh,
        "family_perp": family,
        "pr_curve": {"GBM": curve(g), "B4": curve(b4), "B3": curve(b3)},
        "interpretations": {"diff": INTERP_DIFF_ZERO if contains0 else "",
                            "lopo": INTERP_LOPO_HIGH if lopo_high else INTERP_LOPO_LOW,
                            "hard_cases": INTERP_HARD if hard else ""},
        "narration": {"S": int(gm[3]), "s": int(gm[4]), "D": int(round(gm[2])) if gm[2] is not None else None,
                      "F": r4(F), "F_text": F_text},
        "note": "가상 데이터 기준. 보정·임계값은 검증셋으로 정하고, 위 수치는 시험셋에서 쟀어요.",
    }
    C.write_json(C.REPO / "data" / "eval" / "eval_v1.json", out)
    for r in rows:
        print("%-6s pr_auc=%s ci=%s recall=%s ci=%s cards/mo=%s high_prec=%s days=%s missed=%s" % (
            r["id"], r["pr_auc"], r["pr_auc_ci"], r["recall_at_rule"], r["recall_ci"], r["cards_per_month_none"],
            r["high_precision"], r["median_days_first"], r["missed_rate"]))
    print("paired", json.dumps(paired))
    print("by_pattern", [(b["pattern"], b["recall"]) for b in by_pattern])
    print("lopo", [(b["held_out"], b["recall"]) for b in lopo])
    print("cohorts", coh, "family", family)
    print("narration", out["narration"])
    print("interpretations", out["interpretations"])


if __name__ == "__main__":
    main()
