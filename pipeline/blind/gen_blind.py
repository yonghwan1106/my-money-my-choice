# -*- coding: utf-8 -*-
"""Blind pattern generator (spec 4-5, P9, seed 20261027) - W-D.

Written after the model-frozen tag by a worker who did not write the signals.
Q1 = check-card used by someone else, Q2 = repeated cash withdrawals handed over.
Parameters live in pipeline/blind/blind_spec.yaml. The usual money flow comes
from gen_synth.py (imported, never changed). Output layout and truth schema
follow spec 4-2 (persons/<id>.csv + truth.json), pattern = "Q1" | "Q2".

Usage:
  python <repo>/pipeline/blind/gen_blind.py --out <repo>/pipeline/work/blind --check
"""
import argparse
import csv
import hashlib
import io
import json
import math
import sys
from pathlib import Path

import numpy as np
import yaml

HERE = Path(__file__).resolve().parent
PIPE = HERE.parent
REPO = PIPE.parent
sys.path.insert(0, str(PIPE))
import gen_synth as G  # noqa: E402  (usual-flow helpers, used as-is)
import names as NM  # noqa: E402

SPEC_PATH = HERE / "blind_spec.yaml"
CARD_KIND = "체크카드"
CASH_KIND = "ATM출금"


def load_spec():
    with open(SPEC_PATH, encoding="utf-8") as f:
        return yaml.safe_load(f)


# ---------------------------------------------------------------- small helpers
def alloc(n, shares, rng):
    """Largest-remainder allocation of n items to categories, shuffled."""
    keys = list(shares.keys())
    raw = np.array([float(shares[k]) for k in keys])
    raw = raw / raw.sum() * n
    base = np.floor(raw).astype(int)
    rem = n - int(base.sum())
    order = np.argsort(-(raw - base), kind="stable")
    for i in order[:rem]:
        base[i] += 1
    out = []
    for k, c in zip(keys, base):
        out += [k] * int(c)
    rng.shuffle(out)
    return out


def week_days(w):
    return list(range((w - 1) * 7, min(w * 7, G.N_DAYS)))


def income_of(p):
    v = 0
    if p.get("salary"):
        v += p["salary"]["amount"]
    if p.get("benefit"):
        v += p["benefit"]["amount"]
    return v if v > 0 else 500_000  # assumption when no recorded income


def draw_duration(rng, bins):
    ps = np.array([b["p"] for b in bins], dtype=float)
    ps = ps / ps.sum()
    i = int(rng.choice(len(bins), p=ps))
    return int(rng.integers(bins[i]["lo"], bins[i]["hi"] + 1))


def uni_int(rng, lo, hi, unit):
    v = float(rng.uniform(lo, hi))
    return int(max(unit, round(v / unit) * unit))


def minute_in(rng, h0, h1):
    return int(rng.integers(h0 * 60, h1 * 60 + 60))


def scale_to(raw, take, unit, floor):
    """Scale raw amounts so they sum to about `take`, round to unit, keep >= floor."""
    tot = float(sum(raw))
    if tot <= 0:
        return []
    return [int(max(floor, round(a * take / tot / unit) * unit)) for a in raw]


# ---------------------------------------------------------------- Q1 / Q2
def add_q1(rng, p, txs, sw, ew, share, q, jit):
    lo_id, hi_id = q["unfamiliar_shop_ids"]
    n_fav = int(rng.integers(q["unfamiliar_per_person"][0], q["unfamiliar_per_person"][1] + 1))
    favs = [NM.extra_shop(int(i)) for i in rng.choice(np.arange(lo_id, hi_id + 1), size=n_fav, replace=False)]
    income = income_of(p)
    for w in range(sw, ew + 1):
        days = week_days(w)
        if not days:
            continue
        weekdays = [d for d in days if d % 7 <= 4] or days   # day 0 = Monday
        k = int(rng.integers(q["per_week"][0], q["per_week"][1] + 1))
        take = share * income * 7 / 30.44 * float(rng.uniform(*jit))
        raw = [uni_int(rng, q["amount_won"][0], q["amount_won"][1], 100) for _ in range(k)]
        amts = scale_to(raw, take, 100, q["min_payment_won"])
        for a in amts:
            if rng.random() < q["night_share"]:
                d = int(rng.choice(days))
                m = minute_in(rng, q["night_hours"][0], q["night_hours"][1])
            else:
                d = int(rng.choice(weekdays))
                m = minute_in(rng, q["day_hours"][0], q["day_hours"][1])
            shop = (str(rng.choice(favs)) if rng.random() < q["unfamiliar_share"]
                    else str(rng.choice(NM.DAILY_SHOPS)))
            if rng.random() < q["pair_prob"] and a >= 2 * q["min_payment_won"]:
                a1 = int(round(a * float(rng.uniform(0.4, 0.7)) / 100) * 100)
                a2 = max(q["min_payment_won"], a - a1)
                m2 = min(1439, m + int(rng.integers(q["pair_gap_min"][0], q["pair_gap_min"][1] + 1)))
                txs.append(G.card_pay(d, m, shop, a1, True))
                txs.append(G.card_pay(d, m2, shop, a2, True))
            else:
                txs.append(G.card_pay(d, m, shop, a, True))
    return txs


def add_q2(rng, p, txs, sw, ew, share, q, jit):
    income = income_of(p)
    incomes = [t for t in txs if t["inc"] > 0 and t["kind"] not in ("타행이체", "대출입금")]
    unit = 10_000
    for w in range(sw, ew + 1):
        days = week_days(w)
        if not days:
            continue
        take = share * income * 7 / 30.44 * float(rng.uniform(*jit))
        k = int(rng.integers(q["per_week"][0], q["per_week"][1] + 1))
        k = min(k, max(1, int(take // q["min_raw_per_withdrawal"])))
        raw = [uni_int(rng, q["amount_won"][0], q["amount_won"][1], unit) for _ in range(k)]
        amts = scale_to(raw, take, unit, q["min_withdrawal_won"])
        wk_inc = [t for t in incomes if days[0] <= t["day"] <= days[-1]]
        slots = []
        for j in range(len(amts)):
            if j == 0 and wk_inc and rng.random() < q["after_income_prob"]:
                t = wk_inc[0]
                tot = t["day"] * 1440 + t["minute"] + int(rng.integers(q["after_income_hours"][0] * 60,
                                                                       q["after_income_hours"][1] * 60 + 1))
                d, m = tot // 1440, tot % 1440
                h0, h1 = q["atm_hours"]
                if m < h0 * 60 or m > h1 * 60 + 59:      # ATM hours: move to the next morning slot
                    if m > h1 * 60 + 59:
                        d += 1
                    m = minute_in(rng, h0, h0 + 2)
                if d > days[-1]:                           # keep the row inside this week
                    d, m = int(rng.choice(days)), minute_in(rng, *q["atm_hours"])
            else:
                d, m = int(rng.choice(days)), minute_in(rng, *q["atm_hours"])
            slots.append((d, m))
        for (d, m), a in zip(slots, amts):
            if rng.random() < q["split_prob"] and a >= 2 * unit:
                a1 = int(round(a * float(rng.uniform(0.4, 0.6)) / unit) * unit)
                a1 = min(max(unit, a1), a - unit)
                m2 = min(1439, m + int(rng.integers(q["split_gap_min"][0], q["split_gap_min"][1] + 1)))
                txs.append(G.cash_out(d, m, a1, True))
                txs.append(G.cash_out(d, m2, a - a1, True))
            else:
                txs.append(G.cash_out(d, m, a, True))
    return txs


# ---------------------------------------------------------------- tricky (none persons)
def add_tricky(rng, p, txs, kind, used):
    w = int(rng.integers(6, 25))
    d = int(rng.choice(week_days(w)))
    if kind == "trip":
        nd = int(rng.integers(2, 4))
        for j in range(nd):
            dd = min(G.N_DAYS - 1, d + j)
            for _ in range(int(rng.integers(2, 4))):
                txs.append(G.card_pay(dd, minute_in(rng, 8, 21), NM.extra_shop(int(rng.integers(21, 31))),
                                      uni_int(rng, 30_000, 150_000, 1000)))
    elif kind == "appliance":
        txs.append(G.card_pay(d, minute_in(rng, 11, 19), NM.APPLIANCE_SHOP, uni_int(rng, 500_000, 1_500_000, 10_000)))
    elif kind == "family_event":
        days = week_days(w)
        for _ in range(int(rng.integers(2, 4))):
            txs.append(G.cash_out(int(rng.choice(days)), minute_in(rng, 9, 20), uni_int(rng, 100_000, 300_000, 10_000)))
    elif kind == "gift":
        shop = "꽃길꽃집" if rng.random() < 0.5 else NM.extra_shop(int(rng.integers(36, 41)))
        for _ in range(int(rng.integers(1, 3))):
            txs.append(G.card_pay(d, minute_in(rng, 18, 21), shop, uni_int(rng, 50_000, 200_000, 1000)))
    elif kind == "deposit":
        n = NM.full_name(rng, used)
        used.add(n)
        txs.append(G.transfer_out(d, minute_in(rng, 10, 17), n, uni_int(rng, 1_000_000, 3_000_000, 100_000)))
        for dd in range(d + 1, min(G.N_DAYS, d + 15)):
            for _ in range(int(rng.integers(1, 3))):
                amt = int(max(500, round(float(rng.lognormal(math.log(6000), 0.8)) / 100) * 100))
                t = G.card_pay(dd, minute_in(rng, 8, 21), NM.extra_shop(int(rng.integers(31, 36))), amt)
                t["disc"] = True
                txs.append(t)
    return txs


def preamble_lines(rng):
    lines = ["거래내역 조회", "조회기간 2026.04.06 ~ 2026.10.04"]
    if rng.random() < 0.5:
        lines.append("출력일 2026.10.05")
    return lines


# ---------------------------------------------------------------- main
def build_assignments(rng, spec, stats):
    n_q1, n_q2, n_none = spec["persons"]["Q1"], spec["persons"]["Q2"], spec["persons"]["none"]
    n = n_q1 + n_q2 + n_none
    ids = ["%s%04d" % (spec["id_prefix"], i + 1) for i in range(n)]
    order = list(range(n))
    rng.shuffle(order)
    a = {}
    groups = [("Q1", order[:n_q1]), ("Q2", order[n_q1:n_q1 + n_q2])]
    for q, idxs in groups:
        perps = alloc(len(idxs), stats["perpetrator"], rng)
        intens = alloc(len(idxs), {"high": 1, "mid": 1, "low": 1}, rng)
        for j, idx in enumerate(idxs):
            a[ids[idx]] = {"cohort": spec["cohort"], "pattern": q, "perpetrator": perps[j],
                           "intensity": intens[j], "tricky": None}
    tlist = []
    for k, v in spec["tricky"].items():
        tlist += [k] * int(v["n"])
    none_idx = order[n_q1 + n_q2:]
    tlist += [None] * (len(none_idx) - len(tlist))
    rng.shuffle(tlist)
    for j, idx in enumerate(none_idx):
        a[ids[idx]] = {"cohort": "none", "pattern": None, "perpetrator": None, "intensity": None,
                       "tricky": tlist[j]}
    fmts = alloc(n, {int(k): v for k, v in spec["format_share"].items()}, rng)
    encs = alloc(n, {"cp949": spec["cp949_share"], "utf-8": 1 - spec["cp949_share"]}, rng)
    pre = alloc(n, {True: spec["preamble_share"], False: 1 - spec["preamble_share"]}, rng)
    for i, pid in enumerate(ids):
        a[pid]["format"] = int(fmts[i])
        a[pid]["encoding"] = encs[i]
        a[pid]["preamble"] = bool(pre[i])
        a[pid]["split"] = spec["split"]
    return ids, a


def generate(out_dir, check=False):
    spec = load_spec()
    stats = G.load_stats()
    seed = int(spec["seed"])
    master = np.random.default_rng(seed)
    ids, assign = build_assignments(master, spec, stats)
    seeds = np.random.SeedSequence(seed).spawn(len(ids))
    out_dir = Path(out_dir)
    pdir = out_dir / "persons"
    pdir.mkdir(parents=True, exist_ok=True)
    jit = spec["weekly_take_jitter"]
    truth = {}
    n_tx = []
    extra = {}
    for i, pid in enumerate(ids):
        rng = np.random.default_rng(seeds[i])
        x = assign[pid]
        used = set(NM.SCENARIO_PEOPLE)
        p = G.random_profile(rng, used)
        used.update(p["family"])
        used.update(p["friends"])
        txs = G.normal_flow(rng, p)
        sw = ew = None
        if x["pattern"]:
            q = spec[x["pattern"]]
            sw = int(rng.integers(q["start_week"][0], q["start_week"][1] + 1))
            D = draw_duration(rng, stats["duration_weeks"])
            ew = min(G.N_WEEKS, sw + D - 1)
            lo, hi = spec["intensity"][x["intensity"]]
            share = float(rng.uniform(lo, hi))
            if x["pattern"] == "Q1":
                txs = add_q1(rng, p, txs, sw, ew, share, q, jit)
            else:
                txs = add_q2(rng, p, txs, sw, ew, share, q, jit)
            extra[pid] = {"duration": D, "share": round(share, 4), "income": income_of(p)}
        if x["tricky"]:
            txs = add_tricky(rng, p, txs, x["tricky"], used)
        rows = G.finalize(rng, txs, p["start_balance"])
        pre = preamble_lines(rng) if x["preamble"] else None
        G.write_csv(pdir / (pid + ".csv"), rows, x["format"], x["encoding"], pre)
        n_tx.append(len(rows))
        truth[pid] = {
            "format": x["format"], "encoding": x["encoding"], "split": x["split"], "cohort": x["cohort"],
            "tricky": x["tricky"], "pattern": x["pattern"], "perpetrator": x["perpetrator"],
            "intensity": x["intensity"], "start_week": sw, "end_week": ew,
            "helper_is_perp": False, "perp_label": None,
            "exploit_rows": [k + 1 for k, r in enumerate(rows) if r["exploit"]],
            "missing_salary_days": [],
            "preamble_lines": len(pre) if pre else 0,
            "n_rows": len(rows),
        }
    tbytes = json.dumps(truth, ensure_ascii=False, sort_keys=True, indent=1).encode("utf-8")
    (out_dir / "truth.json").write_bytes(tbytes)
    sha = hashlib.sha256(tbytes).hexdigest()
    summary = summarize(truth, stats, n_tx, sha, seed, extra)
    (out_dir / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n",
                                          encoding="utf-8")
    if check:
        return 0 if print_check(out_dir, truth, summary) else 1
    return 0


def summarize(truth, stats, n_tx, sha, seed, extra):
    vals = list(truth.values())
    ex = [v for v in vals if v["pattern"]]
    pc = {}
    for v in ex:
        pc[v["perpetrator"]] = pc.get(v["perpetrator"], 0) + 1
    return {
        "seed": seed, "persons": len(vals),
        "patterns": {q: sum(1 for v in vals if v["pattern"] == q) for q in ("Q1", "Q2")},
        "cohorts": {c: sum(1 for v in vals if v["cohort"] == c) for c in ("none", "new")},
        "tricky": {k: sum(1 for v in vals if v["tricky"] == k)
                   for k in sorted({v["tricky"] for v in vals if v["tricky"]})},
        "intensity": {q: {k: sum(1 for v in ex if v["pattern"] == q and v["intensity"] == k)
                          for k in ("high", "mid", "low")} for q in ("Q1", "Q2")},
        "start_week_range": [min(v["start_week"] for v in ex), max(v["start_week"] for v in ex)],
        "format_share": {"1": sum(1 for v in vals if v["format"] == 1) / len(vals),
                         "2": sum(1 for v in vals if v["format"] == 2) / len(vals)},
        "cp949_share": sum(1 for v in vals if v["encoding"] == "cp949") / len(vals),
        "preamble_share": sum(1 for v in vals if v["preamble_lines"] > 0) / len(vals),
        "perpetrator_share": {k: round(pc.get(k, 0) / len(ex), 4) for k in stats["perpetrator"]},
        "perpetrator_share_target": stats["perpetrator"],
        "exploit_windows_in_range": sum(v["end_week"] - v["start_week"] + 1 for v in ex),
        "exploit_rows_total": sum(len(v["exploit_rows"]) for v in vals),
        "persons_with_exploit_rows": sum(1 for v in ex if v["exploit_rows"]),
        "mean_tx_per_person": round(float(np.mean(n_tx)), 1),
        "per_person": extra,
        "truth_sha256": sha,
        "note": "가상 인물·가상 거래. Q1·Q2 금액·횟수·시간대는 W-D 가정값(blind_spec.yaml).",
    }


def read_back(path, enc, n_pre):
    """Decode the written CSV and return (header, data rows)."""
    text = Path(path).read_bytes().decode("cp949" if enc == "cp949" else "utf-8")
    rows = list(csv.reader(io.StringIO(text)))
    return rows[n_pre], rows[n_pre + 1:]


def print_check(out_dir, truth, s):
    ok = True

    def line(name, cond, val):
        nonlocal ok
        ok = ok and cond
        print("%-28s %-5s %s" % (name, "OK" if cond else "FAIL", val))
    line("persons 80", s["persons"] == 80, s["persons"])
    line("Q1 20 / Q2 20", s["patterns"] == {"Q1": 20, "Q2": 20}, s["patterns"])
    line("none 40", s["cohorts"]["none"] == 40, s["cohorts"])
    line("tricky 12", sum(s["tricky"].values()) == 12, s["tricky"])
    line("format 50+-2%", abs(s["format_share"]["1"] - 0.5) <= 0.02, s["format_share"])
    line("cp949 20+-2%", abs(s["cp949_share"] - 0.2) <= 0.02, s["cp949_share"])
    line("preamble 10+-2%", abs(s["preamble_share"] - 0.1) <= 0.02, s["preamble_share"])
    line("start week 9..20", 9 <= s["start_week_range"][0] and s["start_week_range"][1] <= 20,
         s["start_week_range"])
    line("every Q person has rows", s["persons_with_exploit_rows"] == 40, s["persons_with_exploit_rows"])
    bad = []
    for pid, t in sorted(truth.items()):
        hdr, data = read_back(Path(out_dir) / "persons" / (pid + ".csv"), t["encoding"], t["preamble_lines"])
        want = G.HEADER_F1 if t["format"] == 1 else G.HEADER_F2
        if hdr != want or len(data) != t["n_rows"]:
            bad.append(pid + ":header/rows")
            continue
        want_kind = {"Q1": CARD_KIND, "Q2": CASH_KIND}.get(t["pattern"])
        for r in t["exploit_rows"]:
            row = data[r - 1]
            k = row[1] if t["format"] == 1 else (row[6] if row[6] == want_kind else row[2])
            if k != want_kind:
                bad.append("%s:row%d=%s" % (pid, r, k))
                break
            dstr = data[r - 1][0][:10].replace(".", "-")
            y, mth, dd = (int(z) for z in dstr.split("-"))
            wk = G.date_to_day(y, mth, dd) // 7 + 1
            if not (t["start_week"] <= wk <= t["end_week"]):
                bad.append("%s:row%d week %d" % (pid, r, wk))
                break
    line("csv read-back + exploit rows", not bad, bad[:5] if bad else "all 80")
    print("%-28s %-5s %s" % ("perpetrator share", "INFO", s["perpetrator_share"]))
    print("%-28s %-5s %s" % ("intensity", "INFO", s["intensity"]))
    print("%-28s %-5s %s" % ("exploit windows", "INFO", s["exploit_windows_in_range"]))
    print("%-28s %-5s %s" % ("exploit rows total", "INFO", s["exploit_rows_total"]))
    print("%-28s %-5s %s" % ("mean tx per person", "INFO", s["mean_tx_per_person"]))
    print("%-28s %-5s %s" % ("truth_sha256", "INFO", s["truth_sha256"]))
    print("CHECK", "OK" if ok else "FAIL")
    return ok


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(REPO / "pipeline" / "work" / "blind"))
    ap.add_argument("--check", action="store_true")
    a = ap.parse_args()
    sys.exit(generate(a.out, a.check))


if __name__ == "__main__":
    main()
