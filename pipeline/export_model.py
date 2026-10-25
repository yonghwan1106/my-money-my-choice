# -*- coding: utf-8 -*-
"""P6 export (spec 5-3): data/model/{gbm_v1,calib_v1,thresholds,feature_names,lr_v1}.json
and pipeline/work/parity_cases.json (450 test windows + 50 rows near first-split thresholds).

Usage: python <repo>/pipeline/export_model.py
"""
import math
import pickle
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common as C  # noqa: E402

OUT = C.REPO / "data" / "model"


def tree_json(est):
    t = est.tree_
    return {"f": [int(x) for x in t.feature], "t": [float(x) for x in t.threshold],
            "l": [int(x) for x in t.children_left], "r": [int(x) for x in t.children_right],
            "v": [float(x) for x in t.value[:, 0, 0]]}


def main():
    with open(C.WORK / "models.pkl", "rb") as f:
        M = pickle.load(f)
    g = M["gbm"]
    names = C.feature_names()
    meta, X = C.load_features()
    init_raw = float(g._raw_predict_init(X[:1])[0, 0])
    p = M["train_pos_rate"]
    assert abs(init_raw - math.log(p / (1 - p))) < 1e-9, (init_raw, p)
    gj = {"version": "gbm-v1", "feature_names": names, "learning_rate": float(g.learning_rate),
          "init_raw": init_raw, "trees": [tree_json(g.estimators_[i, 0]) for i in range(g.n_estimators_)]}
    C.write_json(OUT / "gbm_v1.json", gj)
    cal = M["cal"]
    C.write_json(OUT / "calib_v1.json", {"x": [float(v) for v in cal.X_thresholds_], "y": [float(v) for v in cal.y_thresholds_]})
    C.write_json(OUT / "thresholds.json", {"t1": M["t1"], "t2": M["t2"], "t2_rule": M["t2_rule"],
                                           "val_cards_per_month_none": M["val_cards_per_month_none"],
                                           "val_precision_at_t2": M["val_precision_at_t2"]})
    C.write_json(OUT / "feature_names.json", names)
    sc, lr, cal4 = M["scaler"], M["lr"], M["cal4"]
    C.write_json(OUT / "lr_v1.json", {"version": "lr-v1", "mean": [float(v) for v in sc.mean_],
                                      "scale": [float(v) for v in sc.scale_], "coef": [float(v) for v in lr.coef_[0]],
                                      "intercept": float(lr.intercept_[0]),
                                      "calib": {"x": [float(v) for v in cal4.X_thresholds_], "y": [float(v) for v in cal4.y_thresholds_]},
                                      "t1": M["b4_t1"], "t2": M["b4_t2"]})

    # parity cases
    ok = (meta["level_insufficient"] == 0).to_numpy() & (meta["split"] == "test").to_numpy()
    idx = np.flatnonzero(ok)
    rng = np.random.default_rng(20261026)
    pick = np.sort(rng.choice(idx, size=min(450, len(idx)), replace=False))
    rows = [X[i].copy() for i in pick]
    # 50 rows: a test row with the root feature of tree k set to threshold +/- 1e-7
    for k in range(50):
        tree = g.estimators_[k % g.n_estimators_, 0].tree_
        f0, t0 = int(tree.feature[0]), float(tree.threshold[0])
        x = X[pick[k]].copy()
        x[f0] = t0 + (1e-7 if k % 2 == 0 else -1e-7)
        rows.append(x)
    R = np.array(rows)
    raw = g.predict_proba(R)[:, 1]
    calp = cal.predict(raw)
    lr_raw = lr.predict_proba(sc.transform(R))[:, 1]
    lr_cal = cal4.predict(lr_raw)
    cases = [{"features": [float(v) for v in R[i]], "proba_raw_sklearn": float(raw[i]), "proba_calibrated": float(calp[i]),
              "lr_raw": float(lr_raw[i]), "lr_calibrated": float(lr_cal[i])} for i in range(len(R))]
    C.write_json(C.WORK / "parity_cases.json", cases)
    print("exported %d trees, calib %d points, parity cases %d (near-threshold 50)" % (len(gj["trees"]), len(cal.X_thresholds_), len(cases)))


if __name__ == "__main__":
    main()
