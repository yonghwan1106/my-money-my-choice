# -*- coding: utf-8 -*-
"""P12 check (spec 12): evaluation JSON files exist, have the required fields and
values are in range. Does not judge whether values are good.

Usage: python <repo>/pipeline/check_eval.py [--strict]
  default : files of other bundles that do not exist yet are listed as PENDING (exit 0 if all present files pass)
  --strict: every file must exist (integration / before deploy)
"""
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
EV = REPO / "data" / "eval"

ROW_FIELDS = ["id", "name", "pr_auc", "pr_auc_ci", "recall_at_rule", "recall_ci", "cards_per_month_none",
              "high_precision", "median_days_first", "missed_rate"]
ROW_IDS = ["B0", "B1", "B3", "B4", "GBM", "RANDOM"]

errors = []


def err(f, msg):
    errors.append("%s: %s" % (f, msg))


def prob(f, name, v, allow_none=True):
    if v is None:
        if not allow_none:
            err(f, "%s is null" % name)
        return
    if not isinstance(v, (int, float)) or not (0 <= v <= 1):
        err(f, "%s out of [0,1]: %r" % (name, v))


def nonneg(f, name, v, allow_none=True):
    if v is None:
        if not allow_none:
            err(f, "%s is null" % name)
        return
    if not isinstance(v, (int, float)) or v < 0:
        err(f, "%s negative/not number: %r" % (name, v))


def interval(f, name, v, n=2, lo=0.0, hi=1.0):
    if v is None:
        return
    if not (isinstance(v, list) and len(v) == n and all(isinstance(x, (int, float)) for x in v)):
        err(f, "%s not a %d-list: %r" % (name, n, v))
        return
    if v != sorted(v):
        err(f, "%s not ordered: %r" % (name, v))
    if any(x < lo or x > hi for x in v):
        err(f, "%s out of [%s,%s]: %r" % (name, lo, hi, v))


def need(f, d, keys):
    for k in keys:
        if k not in d:
            err(f, "missing field %s" % k)


def check_eval_v1(d):
    f = "eval_v1.json"
    need(f, d, ["version", "generated_at", "split", "thresholds", "rows", "paired_diff", "by_pattern", "lopo",
                "cohorts", "family_perp", "pr_curve", "interpretations", "narration"])
    need(f, d.get("split", {}), ["train", "val", "test", "test_windows", "test_pos_windows", "pos_rate"])
    prob(f, "split.pos_rate", d.get("split", {}).get("pos_rate"), False)
    th = d.get("thresholds", {})
    need(f, th, ["t1", "t2", "t2_rule"])
    prob(f, "t1", th.get("t1"), False)
    prob(f, "t2", th.get("t2"), False)
    if th.get("t1") is not None and th.get("t2") is not None and th["t2"] < th["t1"]:
        err(f, "t2 < t1")
    ids = [r.get("id") for r in d.get("rows", [])]
    if ids != ROW_IDS:
        err(f, "rows ids %r != %r" % (ids, ROW_IDS))
    for r in d.get("rows", []):
        need(f + ":" + str(r.get("id")), r, ROW_FIELDS)
        prob(f, r.get("id") + ".pr_auc", r.get("pr_auc"))
        interval(f, r.get("id") + ".pr_auc_ci", r.get("pr_auc_ci"))
        prob(f, r.get("id") + ".recall_at_rule", r.get("recall_at_rule"))
        interval(f, r.get("id") + ".recall_ci", r.get("recall_ci"))
        nonneg(f, r.get("id") + ".cards_per_month_none", r.get("cards_per_month_none"))
        prob(f, r.get("id") + ".high_precision", r.get("high_precision"))
        nonneg(f, r.get("id") + ".median_days_first", r.get("median_days_first"))
        for k in ("all", "new", "ongoing"):
            prob(f, r.get("id") + ".missed_rate." + k, (r.get("missed_rate") or {}).get(k))
    for k in ("GBM_minus_B3", "GBM_minus_B4"):
        pd_ = d.get("paired_diff", {}).get(k)
        if pd_ is None:
            err(f, "paired_diff.%s missing" % k)
            continue
        interval(f, k + ".pr_auc", pd_.get("pr_auc"), 3, -1, 1)
        interval(f, k + ".recall_at_rule", pd_.get("recall_at_rule"), 3, -1, 1)
    for b in d.get("by_pattern", []):
        need(f, b, ["pattern", "label", "recall", "n_windows"])
        prob(f, "by_pattern.recall", b.get("recall"))
    if [b.get("pattern") for b in d.get("by_pattern", [])] != ["P1", "P2", "P3", "P4", "P5", "P6"]:
        err(f, "by_pattern must be P1..P6")
    for b in d.get("lopo", []):
        need(f, b, ["held_out", "recall", "n_windows"])
        prob(f, "lopo.recall", b.get("recall"))
    for c in ("new", "ongoing"):
        cc = d.get("cohorts", {}).get(c, {})
        need(f, cc, ["recall", "missed_rate", "n_persons"])
        prob(f, c + ".recall", cc.get("recall"))
        prob(f, c + ".missed_rate", cc.get("missed_rate"))
    need(f, d.get("family_perp", {}), ["recall", "n_windows"])
    for k in ("GBM", "B4", "B3"):
        pts = d.get("pr_curve", {}).get(k)
        if not pts:
            err(f, "pr_curve.%s empty" % k)
            continue
        for p in pts:
            if not (len(p) == 2 and 0 <= p[0] <= 1 and 0 <= p[1] <= 1):
                err(f, "pr_curve.%s bad point %r" % (k, p))
                break
    need(f, d.get("interpretations", {}), ["diff", "lopo", "hard_cases"])
    need(f, d.get("narration", {}), ["S", "s", "D", "F", "F_text"])
    n = d.get("narration", {})
    if isinstance(n.get("S"), int) and isinstance(n.get("s"), int) and n["s"] > n["S"]:
        err(f, "narration s > S")


def check_blind(d):
    f = "eval_blind_v1.json"
    need(f, d, ["blind_commit", "model_frozen", "n", "recall", "cards_per_month_none", "spec_summary"])
    for q in ("Q1", "Q2"):
        r = d.get("recall", {}).get(q, {})
        need(f, r, ["persons", "windows"])
        prob(f, q + ".persons", r.get("persons"))
        prob(f, q + ".windows", r.get("windows"))
    nonneg(f, "cards_per_month_none", d.get("cards_per_month_none"))


def check_b2(d):
    f = "eval_b2_v1.json"
    need(f, d, ["subset_n", "subset_pos", "rows", "cost_usd", "note"])
    for r in d.get("rows", []):
        need(f, r, ["model", "pr_auc", "recall_at_rule"])
        prob(f, "pr_auc", r.get("pr_auc"))
        prob(f, "recall_at_rule", r.get("recall_at_rule"))
    nonneg(f, "cost_usd", d.get("cost_usd"))


def check_understand(d):
    f = "understand_eval_v1.json"
    need(f, d, ["prompt_version", "model", "dev_n", "test_n", "final", "llm", "k0", "confusion", "failures", "cost_usd"])
    for k in ("llm", "k0"):
        need(f, d.get(k, {}), ["accuracy", "macro_f1", "dangerous_misclass"])
        prob(f, k + ".accuracy", d.get(k, {}).get("accuracy"))
        prob(f, k + ".macro_f1", d.get(k, {}).get("macro_f1"))
        nonneg(f, k + ".dangerous_misclass", d.get(k, {}).get("dangerous_misclass"))


def check_helpernote(d):
    f = "helpernote_eval_v1.json"
    need(f, d, ["prompt_version", "n", "pass_first", "pass_after_retry", "numbers_match_rate", "banned_hits",
                "intent_hits", "template_fallbacks", "cost_usd"])
    for k in ("pass_first", "pass_after_retry", "numbers_match_rate"):
        prob(f, k, d.get(k))
    for k in ("banned_hits", "intent_hits", "template_fallbacks", "cost_usd"):
        nonneg(f, k, d.get(k))


def check_policy(d):
    f = "policy_tests_v1.json"
    need(f, d, ["passed", "total", "at"])
    if isinstance(d.get("passed"), int) and isinstance(d.get("total"), int) and d["passed"] > d["total"]:
        err(f, "passed > total")


def check_prov(d):
    f = "provenance.json"
    need(f, d, ["gen_commit", "signals_frozen", "model_frozen", "blind_commit", "truth_sha256", "seed"])


FILES = [("provenance.json", check_prov, "A"), ("eval_v1.json", check_eval_v1, "A"),
         ("eval_blind_v1.json", check_blind, "A/D"), ("eval_b2_v1.json", check_b2, "C"),
         ("understand_eval_v1.json", check_understand, "C"), ("helpernote_eval_v1.json", check_helpernote, "C"),
         ("policy_tests_v1.json", check_policy, "C")]


def main():
    strict = "--strict" in sys.argv
    pending = []
    for name, fn, owner in FILES:
        p = EV / name
        if not p.exists():
            pending.append("%s (%s)" % (name, owner))
            if strict:
                err(name, "missing")
            continue
        try:
            fn(json.loads(p.read_text(encoding="utf-8")))
        except json.JSONDecodeError as e:
            err(name, "bad json: %s" % e)
        print("checked", name)
    for e in errors:
        print("FAIL", e)
    if pending:
        print("PENDING", ", ".join(pending))
    print("OK" if not errors else "FAIL")
    sys.exit(0 if not errors else 1)


if __name__ == "__main__":
    main()
