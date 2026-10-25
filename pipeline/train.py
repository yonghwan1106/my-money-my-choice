# -*- coding: utf-8 -*-
"""P5 training (spec 5-3). GBM + isotonic calibration (val) + thresholds (val),
baselines B1 IsolationForest and B4 logistic regression, leave-one-pattern-out.

Usage: python <repo>/pipeline/train.py  ->  pipeline/work/models.pkl
"""
import pickle
import sys
import time

import numpy as np
from sklearn.ensemble import GradientBoostingClassifier, IsolationForest
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler

sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent))
import common as C  # noqa: E402

PATTERNS = ["P1", "P2", "P3", "P4", "P5", "P6"]


def gbm():
    return GradientBoostingClassifier(n_estimators=150, max_depth=3, learning_rate=0.08, subsample=0.8,
                                      random_state=7)


def fit_gbm_block(Xtr, ytr, Xva, yva, meta_va):
    m = gbm().fit(Xtr, ytr)
    pva = m.predict_proba(Xva)[:, 1]
    cal = IsotonicRegression(out_of_bounds="clip").fit(pva, yva)
    cva = cal.predict(pva)
    none = (meta_va["cohort"] == "none").to_numpy()
    t1 = C.pick_t1(meta_va[none], cva[none])
    t2, rule = C.pick_t2(yva, cva, t1)
    return m, cal, t1, t2, rule, cva


def main():
    t0 = time.time()
    meta, X = C.load_features()
    ok = (meta["level_insufficient"] == 0).to_numpy()
    tr = ok & (meta["split"] == "train").to_numpy()
    va = ok & (meta["split"] == "val").to_numpy()
    y = meta["label"].to_numpy()
    mva = meta[va].reset_index(drop=True)

    model, cal, t1, t2, rule, cva = fit_gbm_block(X[tr], y[tr], X[va], y[va], mva)
    none = (mva["cohort"] == "none").to_numpy()
    val_cards = C.cards_per_month(mva[none], cva[none] >= t1)
    sel = cva >= t2
    val_prec = float(y[va][sel].mean()) if sel.sum() else None
    print("GBM t1=%.6f t2=%.6f (%s) val cards/month none=%.3f val precision@t2=%s" % (t1, t2, rule, val_cards, val_prec))

    # B1 Isolation Forest: unsupervised on all train windows, score = -score_samples
    iso = IsolationForest(n_estimators=200, contamination="auto", random_state=7).fit(X[tr])
    s_va = -iso.score_samples(X[va])
    b1_t1 = C.pick_t1(mva[none], s_va[none])
    b1_t2, b1_rule = C.pick_t2(y[va], s_va, b1_t1)

    # B4 logistic regression
    sc = StandardScaler().fit(X[tr])
    lr = LogisticRegression(C=1.0, max_iter=2000).fit(sc.transform(X[tr]), y[tr])
    p4 = lr.predict_proba(sc.transform(X[va]))[:, 1]
    cal4 = IsotonicRegression(out_of_bounds="clip").fit(p4, y[va])
    c4 = cal4.predict(p4)
    b4_t1 = C.pick_t1(mva[none], c4[none])
    b4_t2, b4_rule = C.pick_t2(y[va], c4, b4_t1)
    print("B1 t1=%.4f t2=%.4f (%s) | B4 t1=%.4f t2=%.4f (%s)" % (b1_t1, b1_t2, b1_rule, b4_t1, b4_t2, b4_rule))

    # leave-one-pattern-out: drop that pattern's persons from train and val
    lopo = {}
    pat = meta["pattern"].to_numpy()
    for p in PATTERNS:
        trp = tr & (pat != p)
        vap = va & (pat != p)
        m_p, cal_p, t1_p, t2_p, _, _ = fit_gbm_block(X[trp], y[trp], X[vap], y[vap], meta[vap].reset_index(drop=True))
        lopo[p] = {"model": m_p, "cal": cal_p, "t1": t1_p, "t2": t2_p}
        print("LOPO %s t1=%.4f" % (p, t1_p))

    out = {
        "gbm": model, "cal": cal, "t1": t1, "t2": t2, "t2_rule": rule,
        "val_cards_per_month_none": val_cards, "val_precision_at_t2": val_prec,
        "iso": iso, "b1_t1": b1_t1, "b1_t2": b1_t2, "b1_t2_rule": b1_rule,
        "scaler": sc, "lr": lr, "cal4": cal4, "b4_t1": b4_t1, "b4_t2": b4_t2, "b4_t2_rule": b4_rule,
        "lopo": lopo, "train_pos_rate": float(y[tr].mean()),
        "n_train_windows": int(tr.sum()), "n_val_windows": int(va.sum()),
    }
    with open(C.WORK / "models.pkl", "wb") as f:
        pickle.dump(out, f)
    print("saved models.pkl  train windows=%d val windows=%d  %.1fs" % (tr.sum(), va.sum(), time.time() - t0))


if __name__ == "__main__":
    main()
