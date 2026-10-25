# -*- coding: utf-8 -*-
"""Demo scenarios (spec 4-3): YAML -> public/samples/<key>_f1.csv (format 1, UTF-8)
and <key>_f2.csv (format 2, CP949, same transactions) + data/scenarios/meta/<key>.json.

Usual flow = gen_synth.random_profile(seed) with the YAML fixed values on top;
events are added exactly as written. Committed before training.

Usage: python <repo>/pipeline/make_scenarios.py
"""
import json
import sys
from pathlib import Path

import numpy as np
import yaml

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
sys.path.insert(0, str(HERE))
import gen_synth as G  # noqa: E402

KEYS = ["A_minsu", "B_seoyeon", "C_youngho", "D_haneul"]


def parse_at(s):
    d, t = s.split(" ")
    y, m, dd = (int(x) for x in d.split("-"))
    hh, mi = (int(x) for x in t.split(":"))
    return G.date_to_day(y, m, dd), hh * 60 + mi


def build(spec):
    rng = np.random.default_rng(int(spec["seed"]))
    p = G.random_profile(rng)
    u = spec["usual"]
    for k, v in u.items():
        if k == "disable":
            continue
        p[k] = v
    for k in u.get("disable", []):
        if k in ("family", "friends", "occasional"):
            p[k] = []
        elif k == "cash":
            p["cash_per_month"] = [0, 0]
        elif k == "micro":
            p["micro"] = False
        elif k == "insurance":
            p["insurance"] = None
    txs = G.normal_flow(rng, p)
    for e in spec["events"]:
        day, minute = parse_at(e["at"])
        t = e["type"]
        if t == "transfer_out":
            tx = G.transfer_out(day, minute, e["cp"], e["amount"], True)
        elif t == "transfer_in":
            tx = G.transfer_in(day, minute, e["cp"], e["amount"], True)
        elif t == "loan_in":
            tx = G.loan_in(day, minute, e["cp"], e["amount"], True)
        elif t == "autopay":
            tx = G.autopay(day, minute, e["cp"], e["amount"], True)
        elif t == "card":
            tx = G.card_pay(day, minute, e["cp"], e["amount"], True)
        elif t == "cash":
            tx = G.cash_out(day, minute, e["amount"], True)
        else:
            raise ValueError("unknown event type " + t)
        txs.append(tx)
    rows = G.finalize(rng, txs, p["start_balance"])
    return rows


def main():
    out_samples = REPO / "public" / "samples"
    out_meta = REPO / "data" / "scenarios" / "meta"
    out_samples.mkdir(parents=True, exist_ok=True)
    out_meta.mkdir(parents=True, exist_ok=True)
    for key in KEYS:
        with open(HERE / "scenarios" / (key + ".yaml"), encoding="utf-8") as f:
            spec = yaml.safe_load(f)
        rows = build(spec)
        G.write_csv(out_samples / (key + "_f1.csv"), rows, 1, "utf-8")
        G.write_csv(out_samples / (key + "_f2.csv"), rows, 2, "cp949")
        settings = dict(spec["settings"])
        helpers = []
        for h in settings["helpers"]:
            h = dict(h)
            h["link"] = spec["links"].get(h["id"], {"state": "unknown"})
            helpers.append(h)
        settings["helpers"] = helpers
        meta = {
            "id": spec["id"], "key": key, "title": spec["title"],
            "person": {"displayName": spec["person"]["displayName"], "fullName": spec["person"]["fullName"]},
            "sample": {"f1": "/samples/%s_f1.csv" % key, "f2": "/samples/%s_f2.csv" % key},
            "settings": settings,
            "links": spec["links"],
            "script": spec["script"],
            "expected": spec["expected"],
            "event_rows": [k + 1 for k, r in enumerate(rows) if r["exploit"]],
            "n_rows": len(rows),
            "note": "가상 인물·가상 거래(연습용). link의 cpLabel은 precompute에서 cpKey로 바꾼다.",
        }
        (out_meta / (key + ".json")).write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n",
                                                encoding="utf-8")
        print(key, "rows", len(rows), "events", len(meta["event_rows"]))


if __name__ == "__main__":
    main()
