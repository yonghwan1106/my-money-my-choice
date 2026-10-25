# -*- coding: utf-8 -*-
"""Synthetic transaction generator (spec 4-2, seed 20261026).

All amounts are assumed values. Durations and perpetrator shares follow
pipeline/config/stats_sources.yaml (2024 report, p.151). Committed BEFORE any
signal code (tag gen-frozen).

Public helpers (also used by make_scenarios.py and the blind generator):
  N_DAYS, day_to_date(day), date_to_day(y, m, d)
  random_profile(rng)                    -> profile dict for the usual money flow
  normal_flow(rng, profile)              -> list of tx dicts (usual flow only)
  mk_tx(day, minute, kind, cp, out, inc, branch, exploit=False)
  finalize(rng, txs, start_balance)      -> sorted rows with balances
  write_csv(path, rows, fmt, encoding, preamble)

Usage:
  python <repo>/pipeline/gen_synth.py --out <repo>/pipeline/work/synth --check
"""
import argparse
import csv
import datetime as dt
import hashlib
import io
import json
import math
import sys
from pathlib import Path

import numpy as np
import yaml

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
sys.path.insert(0, str(HERE))
import names as NM  # noqa: E402

SEED = 20261026
START = dt.date(2026, 4, 6)   # Monday, week 1
END = dt.date(2026, 10, 4)    # Sunday, week 26
N_DAYS = (END - START).days + 1  # 182
N_WEEKS = 26
N_PERSONS = 600

HEADER_F1 = ["거래일시", "적요", "기재내용", "찾으신금액", "맡기신금액", "잔액", "거래점"]
HEADER_F2 = ["거래일자", "시간", "적요", "출금액", "입금액", "잔액", "거래기점"]


# ---------------------------------------------------------------- dates
def day_to_date(day):
    return START + dt.timedelta(days=int(day))


def date_to_day(y, m, d):
    return (dt.date(y, m, d) - START).days


def week_of(day):
    return int(day) // 7 + 1


def month_days(dom):
    """Day offsets (inside the period) whose day-of-month == dom."""
    out = []
    y, m = START.year, START.month
    while dt.date(y, m, 1) <= END:
        last = (dt.date(y + (m // 12), m % 12 + 1, 1) - dt.timedelta(days=1)).day
        d = min(dom, last)
        dd = dt.date(y, m, d)
        if START <= dd <= END:
            out.append((dd - START).days)
        m += 1
        if m == 13:
            y, m = y + 1, 1
    return out


def months():
    """List of (first_day_offset, last_day_offset) clipped to the period."""
    out = []
    y, m = START.year, START.month
    while dt.date(y, m, 1) <= END:
        first = max(dt.date(y, m, 1), START)
        nxt = dt.date(y + (m // 12), m % 12 + 1, 1)
        last = min(nxt - dt.timedelta(days=1), END)
        out.append(((first - START).days, (last - START).days))
        m += 1
        if m == 13:
            y, m = y + 1, 1
    return out


# ---------------------------------------------------------------- tx
def mk_tx(day, minute, kind, cp, out, inc, branch, exploit=False):
    """kind = bank memo word (적요 in format 1), cp = counterparty text (기재내용)."""
    return {"day": int(day), "minute": int(minute), "kind": kind, "cp": cp or "",
            "out": int(out), "inc": int(inc), "branch": branch or "", "exploit": bool(exploit),
            "disc": False}


def r_amt(rng, lo, hi, unit):
    v = rng.uniform(lo, hi)
    return int(max(unit, round(v / unit) * unit))


def rminute(rng, h0, h1):
    """Uniform minute between h0:00 and h1:59."""
    return int(rng.integers(h0 * 60, h1 * 60 + 60))


def transfer_out(day, minute, to, amount, exploit=False):
    return mk_tx(day, minute, "모바일뱅킹", to, amount, 0, "모바일", exploit)


def transfer_in(day, minute, frm, amount, exploit=False):
    return mk_tx(day, minute, "타행이체", frm, 0, amount, "모바일", exploit)


def cash_out(day, minute, amount, exploit=False):
    return mk_tx(day, minute, "ATM출금", "", amount, 0, "자동화기기", exploit)


def card_pay(day, minute, shop, amount, exploit=False):
    return mk_tx(day, minute, "체크카드", shop, amount, 0, "가맹점", exploit)


def micro_pay(day, minute, memo, amount, exploit=False):
    return mk_tx(day, minute, "소액결제", memo, amount, 0, "", exploit)


def autopay(day, minute, label, amount, exploit=False):
    return mk_tx(day, minute, "자동이체", label, amount, 0, "", exploit)


def salary_in(day, minute, employer, amount, memo="급여"):
    return mk_tx(day, minute, memo, employer, 0, amount, "", False)


def benefit_in(day, minute, memo, amount):
    return mk_tx(day, minute, memo, "", 0, amount, "", False)


def loan_in(day, minute, lender, amount, exploit=False):
    return mk_tx(day, minute, "대출입금", lender, 0, amount, "", exploit)


# ---------------------------------------------------------------- usual flow
def random_profile(rng, used_names=()):
    """Usual money flow parameters for one person (all amounts assumed)."""
    used = set(used_names)
    p = {}
    if rng.random() < 0.70:
        p["salary"] = {"day": int(rng.choice([5, 10, 15, 25])),
                       "amount": r_amt(rng, 600_000, 1_800_000, 1000),
                       "employer": str(rng.choice(NM.WORKSHOPS)), "memo": "급여"}
    else:
        p["salary"] = None
    if rng.random() < 0.90:
        p["benefit"] = {"day": 20, "amount": r_amt(rng, 300_000, 700_000, 1000),
                        "memo": str(rng.choice(NM.BENEFIT_MEMOS))}
    else:
        p["benefit"] = None
    p["rent"] = {"day": 1, "amount": r_amt(rng, 150_000, 350_000, 1000),
                 "label": str(rng.choice(["월세", "관리비"]))}
    p["telecom"] = [{"day": 21, "amount": r_amt(rng, 30_000, 70_000, 100),
                     "label": str(rng.choice(NM.TELECOMS))}]
    p["insurance"] = ({"day": 10, "amount": r_amt(rng, 20_000, 80_000, 100), "label": NM.INSURER}
                      if rng.random() < 0.5 else None)
    fam = []
    for _ in range(int(rng.integers(1, 3))):
        n = NM.full_name(rng, used)
        used.add(n)
        fam.append(n)
    p["family"] = fam
    p["family_per_month"] = [0, 2]
    p["family_amount"] = [10_000, 100_000]
    fr = []
    for _ in range(int(rng.integers(0, 3))):
        n = NM.full_name(rng, used)
        used.add(n)
        fr.append(n)
    p["friends"] = fr
    p["friend_per_month"] = [0, 1]
    p["friend_amount"] = [10_000, 50_000]
    p["occasional"] = []          # people seen now and then (e.g. a centre staff member)
    p["fixed_transfers"] = []     # [{day, amount, to}] monthly (scenarios)
    p["fixed_incoming"] = []      # [{day, amount, frm}] monthly (scenarios)
    p["cash_per_month"] = [0, 3]
    p["cash_amount"] = [10_000, 100_000]
    p["micro"] = bool(rng.random() < 0.20)
    p["micro_per_month"] = [0, 4]
    p["micro_amount"] = [1_000, 30_000]
    p["card_daily_rate"] = 1.5
    p["start_balance"] = r_amt(rng, 500_000, 3_000_000, 1000)
    return p


def monthly_income(p):
    v = 0
    if p.get("salary"):
        v += p["salary"]["amount"]
    if p.get("benefit"):
        v += p["benefit"]["amount"]
    return v if v > 0 else 500_000  # assumption when no recorded income


def normal_flow(rng, p):
    """Usual transactions for the whole period from a profile dict."""
    txs = []
    if p.get("salary"):
        s = p["salary"]
        for d in month_days(s["day"]):
            if d in s.get("skip_days", ()):
                continue
            txs.append(salary_in(d, rminute(rng, 9, 10), s["employer"], s["amount"], s.get("memo", "급여")))
    if p.get("benefit"):
        b = p["benefit"]
        for d in month_days(b["day"]):
            txs.append(benefit_in(d, rminute(rng, 9, 9), b["memo"], b["amount"]))
    if p.get("rent"):
        r = p["rent"]
        for d in month_days(r["day"]):
            txs.append(autopay(d, rminute(rng, 6, 8), r["label"], r["amount"]))
    for t in p.get("telecom") or []:
        for d in month_days(t["day"]):
            txs.append(autopay(d, rminute(rng, 6, 8), t["label"], t["amount"]))
    if p.get("insurance"):
        ins = p["insurance"]
        for d in month_days(ins["day"]):
            txs.append(autopay(d, rminute(rng, 6, 8), ins["label"], ins["amount"]))
    for f in p.get("fixed_transfers") or []:
        for d in month_days(f["day"]):
            m = f.get("minute")
            txs.append(transfer_out(d, m if m is not None else rminute(rng, 10, 20), f["to"], f["amount"]))
    for f in p.get("fixed_incoming") or []:
        for d in month_days(f["day"]):
            m = f.get("minute")
            txs.append(transfer_in(d, m if m is not None else rminute(rng, 10, 20), f["frm"], f["amount"]))

    for (d0, d1) in months():
        span = d1 - d0 + 1
        frac = span / 30.0
        # family transfers out
        if p.get("family"):
            lo, hi = p["family_per_month"]
            k = int(rng.integers(lo, hi + 1)) if span >= 20 else int(rng.random() < frac * (lo + hi) / 2.0)
            for _ in range(k):
                d = int(rng.integers(d0, d1 + 1))
                txs.append(transfer_out(d, rminute(rng, 9, 21), str(rng.choice(p["family"])),
                                        r_amt(rng, *p["family_amount"], 10_000)))
        if p.get("friends"):
            lo, hi = p["friend_per_month"]
            k = int(rng.integers(lo, hi + 1)) if span >= 20 else 0
            for _ in range(k):
                d = int(rng.integers(d0, d1 + 1))
                txs.append(transfer_out(d, rminute(rng, 11, 22), str(rng.choice(p["friends"])),
                                        r_amt(rng, *p["friend_amount"], 10_000)))
        for occ in p.get("occasional") or []:
            if rng.random() < 0.5 * frac:
                d = int(rng.integers(d0, d1 + 1))
                txs.append(transfer_out(d, rminute(rng, 10, 18), occ, r_amt(rng, 10_000, 50_000, 10_000)))
        lo, hi = p.get("cash_per_month", [0, 0])
        k = int(rng.integers(lo, hi + 1)) if span >= 20 else int(rng.random() < frac * (lo + hi) / 2.0)
        for _ in range(k):
            d = int(rng.integers(d0, d1 + 1))
            t = cash_out(d, rminute(rng, 9, 20), r_amt(rng, *p["cash_amount"], 10_000))
            t["disc"] = True
            txs.append(t)
        if p.get("micro"):
            lo, hi = p["micro_per_month"]
            k = int(rng.integers(lo, hi + 1))
            for _ in range(k):
                d = int(rng.integers(d0, d1 + 1))
                t = micro_pay(d, rminute(rng, 12, 22), str(rng.choice(NM.MICRO_MEMOS_NORMAL)),
                              r_amt(rng, *p["micro_amount"], 100))
                t["disc"] = True
                txs.append(t)
    rate = p.get("card_daily_rate", 0.0)
    if rate > 0:
        for d in range(N_DAYS):
            for _ in range(int(rng.poisson(rate))):
                amt = int(max(500, round(float(rng.lognormal(math.log(6000), 0.8)) / 100) * 100))
                t = card_pay(d, rminute(rng, 8, 21), str(rng.choice(NM.DAILY_SHOPS)), amt)
                t["disc"] = True
                txs.append(t)
        if not any(t["day"] <= 6 for t in txs):
            t = card_pay(0, rminute(rng, 8, 21), str(rng.choice(NM.DAILY_SHOPS)), 4500)
            t["disc"] = True
            txs.append(t)
    return txs


def finalize(rng, txs, start_balance):
    """Sort, drop discretionary outflows that would push the balance below 0,
    compute balances. Returns rows (dicts with 'balance')."""
    txs = sorted(txs, key=lambda t: (t["day"], t["minute"], 0 if t["inc"] > 0 else 1))
    bal = int(start_balance)
    out = []
    for t in txs:
        nb = bal + t["inc"] - t["out"]
        if t["disc"] and not t["exploit"] and nb < 0:
            continue
        bal = nb
        r = dict(t)
        r["balance"] = bal
        r["sec"] = int(rng.integers(0, 60))
        out.append(r)
    return out


# ---------------------------------------------------------------- csv
def fmt_amt(v):
    return "{:,}".format(int(v))


def to_rows(rows, fmt):
    lines = []
    for r in rows:
        d = day_to_date(r["day"])
        hh, mm = divmod(r["minute"], 60)
        if fmt == 1:
            lines.append(["%04d.%02d.%02d %02d:%02d:%02d" % (d.year, d.month, d.day, hh, mm, r.get("sec", 0)),
                          r["kind"], r["cp"], fmt_amt(r["out"]), fmt_amt(r["inc"]), fmt_amt(r["balance"]),
                          r["branch"]])
        else:
            memo = r["cp"] if r["cp"] else r["kind"]
            lines.append(["%04d-%02d-%02d" % (d.year, d.month, d.day), "%02d:%02d" % (hh, mm), memo,
                          fmt_amt(r["out"]), fmt_amt(r["inc"]), fmt_amt(r["balance"]),
                          r["kind"] if r["cp"] else r["branch"]])
    return lines


def csv_text(rows, fmt, preamble=None):
    buf = io.StringIO()
    if preamble:
        for line in preamble:
            buf.write(line + "\r\n")
    w = csv.writer(buf, lineterminator="\r\n")
    w.writerow(HEADER_F1 if fmt == 1 else HEADER_F2)
    for line in to_rows(rows, fmt):
        w.writerow(line)
    return buf.getvalue()


def write_csv(path, rows, fmt, encoding="utf-8", preamble=None):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    text = csv_text(rows, fmt, preamble)
    path.write_bytes(text.encode("cp949" if encoding == "cp949" else "utf-8"))


def make_preamble(rng):
    lines = ["거래내역 조회", "조회기간 2026.04.06 ~ 2026.10.04"]
    if rng.random() < 0.5:
        lines.append("출력일 2026.10.05")
    return lines


# ---------------------------------------------------------------- exploitation
def load_stats():
    with open(HERE / "config" / "stats_sources.yaml", encoding="utf-8") as f:
        return yaml.safe_load(f)


def draw_duration(rng, bins):
    ps = np.array([b["p"] for b in bins], dtype=float)
    ps = ps / ps.sum()
    i = int(rng.choice(len(bins), p=ps))
    return int(rng.integers(bins[i]["lo"], bins[i]["hi"] + 1))


def quota(n, shares, rng):
    """Largest-remainder allocation of n items to categories, shuffled."""
    keys = list(shares.keys())
    raw = np.array([shares[k] for k in keys], dtype=float)
    raw = raw / raw.sum() * n
    base = np.floor(raw).astype(int)
    rem = n - base.sum()
    order = np.argsort(-(raw - base), kind="stable")
    for i in order[:rem]:
        base[i] += 1
    out = []
    for k, c in zip(keys, base):
        out += [k] * int(c)
    rng.shuffle(out)
    return out


INTENSITY = {"high": (0.60, 0.90), "mid": (0.30, 0.60), "low": (0.10, 0.30)}


def week_days(w):
    return list(range((w - 1) * 7, min(w * 7, N_DAYS)))


def add_exploit(rng, p, txs, spec, used):
    """Append exploitation transactions. spec has pattern, perpetrator, intensity,
    start_week, end_week. Returns (txs, info) with info: perp_label, missing_salary_days."""
    pat, perp, inten = spec["pattern"], spec["perpetrator"], spec["intensity"]
    sw, ew = spec["start_week"], spec["end_week"]
    lo_i, hi_i = INTENSITY[inten]
    share = float(rng.uniform(lo_i, hi_i))
    income = monthly_income(p)
    info = {"perp_label": None, "missing_salary_days": []}
    d_start = (sw - 1) * 7
    d_end = min(ew * 7 - 1, N_DAYS - 1)

    # who receives the money
    mode = "transfer"
    cp = None
    if perp == "facility_staff":
        if rng.random() < 0.60:
            mode = "cash"
        else:
            if not p["occasional"]:
                n = NM.full_name(rng, used)
                used.add(n)
                p["occasional"].append(n)
            cp = p["occasional"][0]
    elif perp in ("sibling", "other_family_or_other"):
        cp = str(rng.choice(p["family"]))
    else:  # acquaintance or stranger -> a new person
        cp = NM.full_name(rng, used)
        used.add(cp)
        if perp == "acquaintance" and sw > 1:
            # first appears within 2 weeks before the start (not exploitation)
            d0 = int(rng.integers(max(0, d_start - 14), max(1, d_start)))
            amt = r_amt(rng, 10_000, 30_000, 10_000)
            if rng.random() < 0.5:
                txs.append(transfer_in(d0, rminute(rng, 11, 21), cp, amt))
            else:
                txs.append(transfer_out(d0, rminute(rng, 11, 21), cp, amt))
    if pat in ("P4", "P5"):
        cp_used = None
    else:
        cp_used = cp if mode == "transfer" else None

    def send(day, minute, amount):
        if day > N_DAYS - 1:
            return
        if mode == "cash":
            # hand over cash: 1-2 withdrawals
            k = 1 if amount < 300_000 else int(rng.integers(1, 3))
            part = max(10_000, int(round(amount / k / 10_000) * 10_000))
            for j in range(k):
                txs.append(cash_out(day, min(1439, minute + j * 7), part, True))
        else:
            txs.append(transfer_out(day, minute, cp, max(10_000, int(round(amount / 10_000) * 10_000)), True))

    def shift(day, minute, add_min):
        tot = day * 1440 + minute + int(add_min)
        return tot // 1440, tot % 1440

    if pat == "P1":
        wk_cap = share * income * 7 / 30.44
        for w in range(sw, ew + 1):
            days = week_days(w)
            k = int(rng.integers(2, 6))
            amts = [r_amt(rng, 50_000, 300_000, 10_000) for _ in range(k)]
            tot = sum(amts)
            if tot > wk_cap:
                amts = [a * wk_cap / tot for a in amts]
            for a in amts:
                d = int(rng.choice(days))
                send(d, rminute(rng, 9, 22), max(10_000, a))
    elif pat in ("P2", "P6"):
        incomes = [t for t in txs if t["inc"] > 0 and t["kind"] != "타행이체" and t["kind"] != "대출입금"
                   and d_start <= t["day"] <= d_end]
        if pat == "P6":
            incomes = [t for t in incomes if t["kind"] == p["salary"].get("memo", "급여")
                       and t["cp"] == p["salary"]["employer"]]
        if pat == "P6" and spec.get("p6_mode") == "missing":
            miss = [t for t in incomes]
            for t in miss:
                txs.remove(t)
                info["missing_salary_days"].append(t["day"])
            cp_used = None
        else:
            for t in incomes:
                if pat == "P2":
                    amount = t["inc"] * share
                    dd, mm = shift(t["day"], t["minute"], rng.integers(0, 36 * 60 + 1))
                    send(dd, mm, amount)
                else:
                    frac = float(rng.uniform(0.70, 1.00))
                    dd, mm = shift(t["day"], t["minute"], rng.integers(0, 72 * 60 + 1))
                    if dd <= N_DAYS - 1:
                        to = p["salary"]["employer"] if spec.get("p6_to") == "employer" or cp is None else cp
                        txs.append(transfer_out(dd, mm, to, int(round(t["inc"] * frac / 10_000) * 10_000), True))
            if pat == "P6" and spec.get("p6_to") == "employer":
                cp_used = p["salary"]["employer"]
    elif pat == "P3":
        span_days = list(range(d_start, d_end + 1))
        k = 1 if len(span_days) < 14 else int(rng.integers(1, 3))
        for _ in range(k):
            d = int(rng.choice(span_days))
            amt = r_amt(rng, 1_000_000, 5_000_000, 100_000)
            m = rminute(rng, 9, 16)
            txs.append(loan_in(d, m, str(rng.choice(NM.LENDERS[:2])), amt, True))
            dd, mm = shift(d, m, rng.integers(0, 48 * 60 + 1))
            send(dd, mm, amt * float(rng.uniform(0.70, 0.95)))
    elif pat == "P4":
        usual = {t["label"] for t in p["telecom"]}
        pool = [x for x in NM.TELECOMS + NM.TELECOMS_EXTRA if x not in usual]
        nl = int(rng.integers(2, 5))
        over = int(rng.integers(2, 5)) * 7
        lines = []
        for j in range(nl):
            d = int(rng.integers(d_start, min(d_end, d_start + over - 1) + 1))
            lines.append((d, pool[j], r_amt(rng, 30_000, 70_000, 100)))
        hd = int(rng.integers(d_start, min(d_end, d_start + over - 1) + 1))
        hlabel = "단말기할부 " + lines[0][1]
        hamt = r_amt(rng, 30_000, 80_000, 1000)
        for (d, lab, amt) in lines + [(hd, hlabel, hamt)]:
            dd = d
            while dd <= d_end:
                txs.append(autopay(dd, rminute(rng, 6, 8), lab, amt, True))
                nd = day_to_date(dd)
                nm_y, nm_m = (nd.year + (nd.month // 12), nd.month % 12 + 1)
                try:
                    dd = (dt.date(nm_y, nm_m, nd.day) - START).days
                except ValueError:
                    dd = (dt.date(nm_y, nm_m, 28) - START).days
    elif pat == "P5":
        wk_cap = share * income * 7 / 30.44
        for w in range(sw, ew + 1):
            days = week_days(w)
            k = int(rng.integers(6, 21))
            amts = [r_amt(rng, 5_000, 50_000, 100) for _ in range(k)]
            tot = sum(amts)
            if tot > wk_cap:
                amts = [max(1_000, int(round(a * wk_cap / tot / 100) * 100)) for a in amts]
            for a in amts:
                d = int(rng.choice(days))
                txs.append(micro_pay(d, rminute(rng, 10, 23), str(rng.choice(NM.MICRO_MEMOS_EXPLOIT)), a, True))
    info["perp_label"] = cp_used
    return txs, info


def add_tricky(rng, p, txs, kind, used):
    w = int(rng.integers(6, 25))
    d = int(rng.choice(week_days(w)))
    if kind == "appliance":
        t = card_pay(d, rminute(rng, 11, 19), NM.APPLIANCE_SHOP, r_amt(rng, 500_000, 1_500_000, 10_000))
        txs.append(t)
    elif kind == "deposit":
        n = NM.full_name(rng, used)
        used.add(n)
        txs.append(transfer_out(d, rminute(rng, 10, 17), n, r_amt(rng, 1_000_000, 3_000_000, 100_000)))
    elif kind == "trip":
        nd = int(rng.integers(2, 4))
        for j in range(nd):
            dd = min(N_DAYS - 1, d + j)
            for _ in range(int(rng.integers(2, 4))):
                txs.append(card_pay(dd, rminute(rng, 8, 21), NM.extra_shop(int(rng.integers(1, 6))),
                                    r_amt(rng, 30_000, 150_000, 1000)))
    elif kind == "gift":
        n = NM.full_name(rng, used)
        used.add(n)
        txs.append(transfer_out(d, rminute(rng, 12, 21), n, r_amt(rng, 50_000, 200_000, 10_000)))
    elif kind == "family_event":
        txs.append(transfer_out(d, rminute(rng, 10, 20), str(rng.choice(p["family"])),
                                r_amt(rng, 100_000, 500_000, 10_000)))
    elif kind == "new_phone":
        usual = {t["label"] for t in p["telecom"]}
        lab = [x for x in NM.TELECOMS if x not in usual][0]
        amt = r_amt(rng, 30_000, 70_000, 100)
        dd = d
        while dd <= N_DAYS - 1:
            txs.append(autopay(dd, rminute(rng, 6, 8), lab, amt))
            dd += 30
    return txs


# ---------------------------------------------------------------- main
def build_assignments(rng, stats):
    ids = ["p%04d" % (i + 1) for i in range(N_PERSONS)]
    order = list(range(N_PERSONS))
    rng.shuffle(order)
    exploit_idx = order[:240]
    none_idx = order[240:]
    a = {}
    patterns = ["P1", "P2", "P3", "P4", "P5", "P6"]
    # cohorts: 120 new / 120 ongoing, patterns 20 each per cohort
    cohort_pat = []
    for c in ("new", "ongoing"):
        for ptn in patterns:
            cohort_pat += [(c, ptn)] * 20
    rng.shuffle(cohort_pat)
    perps = quota(240, stats["perpetrator"], rng)
    intens = quota(240, {"high": 1, "mid": 1, "low": 1}, rng)
    new_positions = [i for i, (c, _) in enumerate(cohort_pat) if c == "new"]
    early = set(rng.choice(new_positions, size=8, replace=False).tolist())
    for j, idx in enumerate(exploit_idx):
        c, ptn = cohort_pat[j]
        a[ids[idx]] = {"cohort": c, "pattern": ptn, "perpetrator": perps[j], "intensity": intens[j],
                       "early": j in early, "tricky": None}
    tricky_kinds = ["appliance", "deposit", "trip", "gift", "family_event", "new_phone"]
    tlist = []
    for k in tricky_kinds:
        tlist += [k] * 18
    tlist += [None] * (360 - len(tlist))
    rng.shuffle(tlist)
    for j, idx in enumerate(none_idx):
        a[ids[idx]] = {"cohort": "none", "pattern": None, "perpetrator": None, "intensity": None,
                       "early": False, "tricky": tlist[j]}
    # formats / encodings / preamble by quota over all persons
    fmts = quota(N_PERSONS, {1: 1, 2: 1}, rng)
    encs = quota(N_PERSONS, {"cp949": 0.2, "utf-8": 0.8}, rng)
    pre = quota(N_PERSONS, {True: 0.1, False: 0.9}, rng)
    for i, pid in enumerate(ids):
        a[pid]["format"] = int(fmts[i])
        a[pid]["encoding"] = encs[i]
        a[pid]["preamble"] = bool(pre[i])
    # split by strata: cycle train,train,train,val,test within each stratum order
    def stratum(pid):
        x = a[pid]
        if x["cohort"] == "none":
            return ("none", x["tricky"] or "plain")
        return (x["cohort"], x["pattern"])
    strata = {}
    for pid in ids:
        strata.setdefault(stratum(pid), []).append(pid)
    seq = []
    for key in sorted(strata.keys(), key=lambda k: (str(k[0]), str(k[1]))):
        lst = strata[key][:]
        rng.shuffle(lst)
        seq += lst
    cyc = ["train", "train", "train", "val", "test"]
    for i, pid in enumerate(seq):
        a[pid]["split"] = cyc[i % 5]
    return ids, a


def generate(out_dir, check=False):
    stats = load_stats()
    master = np.random.default_rng(SEED)
    ids, assign = build_assignments(master, stats)
    seeds = np.random.SeedSequence(SEED).spawn(N_PERSONS)
    out_dir = Path(out_dir)
    pdir = out_dir / "persons"
    pdir.mkdir(parents=True, exist_ok=True)
    truth = {}
    n_tx = []
    helper_candidates = []
    for i, pid in enumerate(ids):
        rng = np.random.default_rng(seeds[i])
        x = assign[pid]
        used = set(NM.SCENARIO_PEOPLE)
        p = random_profile(rng, used)
        used.update(p["family"])
        used.update(p["friends"])
        spec = None
        if x["cohort"] != "none":
            if x["pattern"] == "P6" and not p["salary"]:
                p["salary"] = {"day": int(rng.choice([5, 10, 15, 25])),
                               "amount": r_amt(rng, 600_000, 1_800_000, 1000),
                               "employer": str(rng.choice(NM.WORKSHOPS)), "memo": "급여"}
            if x["pattern"] == "P2" and not p["salary"] and not p["benefit"]:
                p["benefit"] = {"day": 20, "amount": r_amt(rng, 300_000, 700_000, 1000),
                                "memo": str(rng.choice(NM.BENEFIT_MEMOS))}
            if x["perpetrator"] == "facility_staff":
                n = NM.full_name(rng, used)
                used.add(n)
                p["occasional"] = [n]
            D = draw_duration(rng, stats["duration_weeks"])
            if x["cohort"] == "new":
                s = int(rng.integers(1, 4)) if x["early"] else int(rng.integers(9, 21))
                e = min(N_WEEKS, s + D - 1)
            else:
                while D < 2:
                    D = draw_duration(rng, stats["duration_weeks"])
                past = int(rng.integers(1, D))
                s = 1
                e = min(N_WEEKS, D - past)
            spec = {"pattern": x["pattern"], "perpetrator": x["perpetrator"], "intensity": x["intensity"],
                    "start_week": s, "end_week": e, "duration": D,
                    "p6_mode": ("missing" if rng.random() < 0.5 else "returned") if x["pattern"] == "P6" else None,
                    "p6_to": ("employer" if rng.random() < 0.5 else "relative") if x["pattern"] == "P6" else None}
        txs = normal_flow(rng, p)
        info = {"perp_label": None, "missing_salary_days": []}
        if spec:
            txs, info = add_exploit(rng, p, txs, spec, used)
        if x["tricky"]:
            txs = add_tricky(rng, p, txs, x["tricky"], used)
        rows = finalize(rng, txs, p["start_balance"])
        pre = make_preamble(rng) if x["preamble"] else None
        write_csv(pdir / (pid + ".csv"), rows, x["format"], x["encoding"], pre)
        exploit_rows = [k + 1 for k, r in enumerate(rows) if r["exploit"]]
        n_tx.append(len(rows))
        truth[pid] = {
            "format": x["format"], "encoding": x["encoding"], "split": x["split"], "cohort": x["cohort"],
            "tricky": x["tricky"], "pattern": x["pattern"], "perpetrator": x["perpetrator"],
            "intensity": x["intensity"],
            "start_week": spec["start_week"] if spec else None,
            "end_week": spec["end_week"] if spec else None,
            "helper_is_perp": False, "perp_label": info["perp_label"],
            "exploit_rows": exploit_rows,
            # extension: P6 'missing' salary has no row; the expected pay days are kept here
            "missing_salary_days": info["missing_salary_days"],
            "preamble_lines": len(pre) if pre else 0,
            "n_rows": len(rows),
        }
        if spec and info["perp_label"] and not info["perp_label"].endswith("보호작업장"):
            helper_candidates.append(pid)
    # 10% of exploited persons (24) have the perpetrator in their helper list
    hc = sorted(helper_candidates)
    pick = master.choice(len(hc), size=min(24, len(hc)), replace=False)
    for j in sorted(pick.tolist()):
        truth[hc[j]]["helper_is_perp"] = True
    tbytes = json.dumps(truth, ensure_ascii=False, sort_keys=True, indent=1).encode("utf-8")
    (out_dir / "truth.json").write_bytes(tbytes)
    sha = hashlib.sha256(tbytes).hexdigest()
    summary = summarize(truth, stats, n_tx, sha)
    (REPO / "data" / "synth").mkdir(parents=True, exist_ok=True)
    (REPO / "data" / "synth" / "summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    write_samples(out_dir, truth)
    if check:
        ok = print_check(summary, stats)
        return 0 if ok else 1
    return 0


def summarize(truth, stats, n_tx, sha):
    vals = list(truth.values())
    ex = [v for v in vals if v["cohort"] != "none"]
    pc = {}
    for v in ex:
        pc[v["perpetrator"]] = pc.get(v["perpetrator"], 0) + 1
    windows = 0
    for v in ex:
        windows += max(0, v["end_week"] - v["start_week"] + 1)
    return {
        "seed": SEED, "period": [START.isoformat(), END.isoformat()], "weeks": N_WEEKS,
        "persons": len(vals),
        "cohorts": {c: sum(1 for v in vals if v["cohort"] == c) for c in ("none", "new", "ongoing")},
        "new_start_week_1_3": sum(1 for v in ex if v["cohort"] == "new" and v["start_week"] <= 3),
        "patterns": {pt: sum(1 for v in ex if v["pattern"] == pt) for pt in ["P1", "P2", "P3", "P4", "P5", "P6"]},
        "tricky": {k: sum(1 for v in vals if v["tricky"] == k)
                   for k in ["appliance", "deposit", "trip", "gift", "family_event", "new_phone"]},
        "intensity": {k: sum(1 for v in ex if v["intensity"] == k) for k in ["high", "mid", "low"]},
        "format_share": {"1": sum(1 for v in vals if v["format"] == 1) / len(vals),
                         "2": sum(1 for v in vals if v["format"] == 2) / len(vals)},
        "cp949_share": sum(1 for v in vals if v["encoding"] == "cp949") / len(vals),
        "preamble_share": sum(1 for v in vals if v["preamble_lines"] > 0) / len(vals),
        "perpetrator_share": {k: round(pc.get(k, 0) / len(ex), 4) for k in stats["perpetrator"]},
        "perpetrator_share_target": stats["perpetrator"],
        "split": {s: sum(1 for v in vals if v["split"] == s) for s in ("train", "val", "test")},
        "exploit_windows_in_range": windows,
        "exploit_rows_total": sum(len(v["exploit_rows"]) for v in vals),
        "persons_with_exploit_rows": sum(1 for v in ex if v["exploit_rows"] or v["missing_salary_days"]),
        "helper_is_perp": sum(1 for v in vals if v["helper_is_perp"]),
        "mean_tx_per_person": round(float(np.mean(n_tx)), 1),
        "truth_sha256": sha,
        "note": "가상 인물·가상 거래. 금액·수법 비율은 가정값, 지속기간·행위자 비율은 2024 장애인학대 현황보고서 151쪽.",
    }


def print_check(s, stats):
    ok = True

    def line(name, cond, val):
        nonlocal ok
        ok = ok and cond
        print("%-28s %-5s %s" % (name, "OK" if cond else "FAIL", val))
    line("persons", s["persons"] == 600, s["persons"])
    line("cohorts 240(120/120)", s["cohorts"]["new"] == 120 and s["cohorts"]["ongoing"] == 120,
         s["cohorts"])
    line("new start wk1-3 = 8", s["new_start_week_1_3"] == 8, s["new_start_week_1_3"])
    line("patterns 40 each", all(v == 40 for v in s["patterns"].values()), s["patterns"])
    line("tricky 18 each", all(v == 18 for v in s["tricky"].values()), s["tricky"])
    line("format 50+-2%", abs(s["format_share"]["1"] - 0.5) <= 0.02, s["format_share"])
    line("cp949 20+-2%", abs(s["cp949_share"] - 0.2) <= 0.02, s["cp949_share"])
    line("preamble 10%", abs(s["preamble_share"] - 0.1) <= 0.02, s["preamble_share"])
    dev = {k: round(s["perpetrator_share"][k] - stats["perpetrator"][k], 4) for k in stats["perpetrator"]}
    print("%-28s %-5s %s" % ("perpetrator +-2%p", "OK" if all(abs(v) <= 0.02 for v in dev.values()) else "NOTE",
                             {"actual": s["perpetrator_share"], "diff": dev}))
    line("split 360/120/120", s["split"] == {"train": 360, "val": 120, "test": 120}, s["split"])
    print("%-28s %-5s %s" % ("exploit windows", "INFO", s["exploit_windows_in_range"]))
    print("%-28s %-5s %s" % ("persons with exploit rows", "INFO", s["persons_with_exploit_rows"]))
    print("%-28s %-5s %s" % ("helper_is_perp", "INFO", s["helper_is_perp"]))
    print("%-28s %-5s %s" % ("mean tx per person", "INFO", s["mean_tx_per_person"]))
    print("%-28s %-5s %s" % ("truth_sha256", "INFO", s["truth_sha256"]))
    print("CHECK", "OK" if ok else "FAIL")
    return ok


def write_samples(out_dir, truth):
    """5 sample persons -> data/synth/sample/ (copied bytes) + sample truth."""
    sdir = REPO / "data" / "synth" / "sample"
    sdir.mkdir(parents=True, exist_ok=True)
    picks = []
    want = [("none", None), ("none", "appliance"), ("new", "P1"), ("ongoing", "P2"), ("new", "P3")]
    for coh, extra in want:
        for pid in sorted(truth):
            v = truth[pid]
            if pid in picks or v["split"] != "test":
                continue
            if v["cohort"] != coh:
                continue
            if coh == "none" and v["tricky"] != extra:
                continue
            if coh != "none" and v["pattern"] != extra:
                continue
            picks.append(pid)
            break
    st = {}
    for pid in picks:
        (sdir / (pid + ".csv")).write_bytes((Path(out_dir) / "persons" / (pid + ".csv")).read_bytes())
        st[pid] = truth[pid]
    (sdir / "truth_sample.json").write_text(json.dumps(st, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(REPO / "pipeline" / "work" / "synth"))
    ap.add_argument("--check", action="store_true")
    a = ap.parse_args()
    sys.exit(generate(a.out, a.check))


if __name__ == "__main__":
    main()
