# -*- coding: utf-8 -*-
"""P9 blind evaluation (spec 4-5): frozen model + frozen thresholds, run ONCE.
Written before the model-frozen tag; run only after W-D's blind-made tag.

Steps:
  python <repo>/pipeline/blind/gen_blind.py --out <repo>/pipeline/work/blind          (W-D)
  npx --prefix <repo> tsx <repo>/scripts/featurize.ts --in <repo>/pipeline/work/blind --out <repo>/pipeline/work/blind_features.csv
  python <repo>/pipeline/evaluate_blind.py   -> data/eval/eval_blind_v1.json
The result is not tuned or rerun. A second run refuses unless the output file is absent.
"""
import json
import pickle
import subprocess
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common as C  # noqa: E402

OUT = C.REPO / "data" / "eval" / "eval_blind_v1.json"


def git_rev(ref):
    try:
        return subprocess.run(["git", "-C", str(C.REPO), "rev-parse", ref], capture_output=True, text=True,
                              check=True).stdout.strip()
    except subprocess.CalledProcessError:
        return ""


def is_ancestor(a, b):
    r = subprocess.run(["git", "-C", str(C.REPO), "merge-base", "--is-ancestor", a, b], capture_output=True)
    return r.returncode == 0


def spec_summary():
    p = C.HERE / "blind" / "blind_spec.yaml"
    if not p.exists():
        return ""
    import yaml
    spec = yaml.safe_load(p.read_text(encoding="utf-8"))
    parts = []
    for q in ("Q1", "Q2"):
        s = spec.get(q) if isinstance(spec, dict) else None
        if isinstance(s, dict):
            items = ", ".join("%s=%s" % (k, s[k]) for k in list(s.keys())[:6])
            parts.append("%s: %s" % (q, items))
    return " / ".join(parts) if parts else "blind_spec.yaml 참조"


def main():
    if OUT.exists() and "--force-i-know" not in sys.argv:
        print("eval_blind_v1.json already exists - blind evaluation runs once. Not rerunning.")
        sys.exit(1)
    model_frozen = git_rev("model-frozen")
    blind_commit = git_rev("blind-made")
    if not model_frozen or not blind_commit or not is_ancestor("model-frozen", "blind-made"):
        print("need tags model-frozen < blind-made")
        sys.exit(1)
    with open(C.WORK / "models.pkl", "rb") as f:
        M = pickle.load(f)
    th = json.loads((C.REPO / "data" / "model" / "thresholds.json").read_text(encoding="utf-8"))
    assert abs(th["t1"] - M["t1"]) < 1e-12 and abs(th["t2"] - M["t2"]) < 1e-12
    truth = json.loads((C.WORK / "blind" / "truth.json").read_text(encoding="utf-8"))
    meta, X = C.load_features(C.WORK / "blind_features.csv")
    ok = (meta["level_insufficient"] == 0).to_numpy()
    p = np.zeros(len(meta))
    p[ok] = M["cal"].predict(M["gbm"].predict_proba(X[ok])[:, 1])
    flag = ok & (p >= M["t1"])
    y = meta["label"].to_numpy()
    meta = meta.assign(flag=flag, ok=ok)
    n = {"Q1": 0, "Q2": 0, "none": 0}
    rec = {}
    for q in ("Q1", "Q2"):
        persons = [pid for pid, t in truth.items() if t.get("pattern") == q]
        n[q] = len(persons)
        caught = 0
        denom = 0
        for pid in persons:
            t = truth[pid]
            g = meta[meta["person_id"] == pid]
            if g["label"].sum() == 0:
                continue
            denom += 1
            sw, ew = t.get("start_week") or 1, t.get("end_week") or 26
            win = g[(g["week"] >= sw) & (g["week"] <= ew)]
            caught += int(win["flag"].any())
        sel = (meta["pattern"].to_numpy() == q) & (y == 1) & ok
        rec[q] = {"persons": round(caught / denom, 4) if denom else None,
                  "windows": round(float(flag[sel].mean()), 4) if sel.sum() else None,
                  "n_persons_with_rows": denom, "n_windows": int(sel.sum())}
    none = (meta["cohort"] == "none").to_numpy() & ok
    n["none"] = int(sum(1 for t in truth.values() if t.get("cohort") == "none"))
    out = {"blind_commit": blind_commit, "model_frozen": model_frozen, "n": n, "recall": rec,
           "cards_per_month_none": round(C.cards_per_month(meta[none], flag[none]), 4),
           "spec_summary": spec_summary(),
           "note": "동결 모델·동결 임계값으로 한 번만 잼. 결과가 낮아도 고치지 않음. 가상 데이터 기준."}
    C.write_json(OUT, out)
    print(json.dumps(out, ensure_ascii=False))


if __name__ == "__main__":
    main()
