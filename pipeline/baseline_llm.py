# B2 baseline: LLM only (spec 10-3 C8, schema 12 eval_b2_v1.json). Offline, standard library only (urllib).
#   1) npx --prefix <repo> tsx <repo>\scripts\lib\b2_windows.ts   -> pipeline/work/b2_windows.json (200 windows + frozen GBM values)
#   2) KEY_FILE=<key file> python -I <repo>\pipeline\baseline_llm.py [--only haiku|sonnet]
# Models: claude-haiku-5-5 (thinking disabled, max_tokens 100) / claude-sonnet-5 (no thinking field = default, max_tokens 2000,
#         retry once with 4000 if no text block). No temperature. 0.3 s between calls.
# Card rule for LLM: p >= 0.5 (it has no calibrated threshold). GBM on the same windows: prob >= t1 (thresholds.json).
# Progress is saved after every call (pipeline/work/b2_progress.json) so an interrupted run resumes without re-calling.
# The key is read from the file named by KEY_FILE into memory only; it is never printed or written.
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / "pipeline" / "work"
OUT = ROOT / "data" / "eval" / "eval_b2_v1.json"
PRICE = {"claude-haiku-5-5": (0.10, 0.50), "claude-sonnet-5": (2.0, 10.0)}  # USD per MTok (02 analysis U6)
MODELS = [
    {"model": "claude-haiku-5-5", "thinking": "disabled", "max_tokens": 100, "retry_tokens": None},
    {"model": "claude-sonnet-5", "thinking": "default", "max_tokens": 2000, "retry_tokens": 4000},
]
KEY_RE = re.compile("-".join(["sk", "ant", "api03"]) + r"-[A-Za-z0-9_\-]+")


def read_key():
    f = os.environ.get("KEY_FILE")
    if not f:
        return None
    try:
        m = KEY_RE.search(open(f, encoding="utf-8", errors="ignore").read())
        return m.group(0) if m else None
    except OSError:
        return None


def call(key, body, timeout):
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=json.dumps(body).encode("utf-8"),
        headers={"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def parse_p(msg):
    texts = [b.get("text", "") for b in msg.get("content", []) if b.get("type") == "text"]
    if not texts:
        return None, "no_text"
    t = "".join(texts).strip()
    m = re.match(r"^```(?:json)?\s*([\s\S]*?)\s*```$", t)
    if m:
        t = m.group(1).strip()
    try:
        p = float(json.loads(t)["p"])
    except Exception:
        m2 = re.search(r'"p"\s*:\s*([0-9.]+)', t)
        if not m2:
            return None, "bad_json"
        p = float(m2.group(1))
    if not (0.0 <= p <= 1.0):
        return None, "range"
    return p, None


def average_precision(y, s):
    # PR-AUC as average precision (ties broken by order of descending score, stable)
    pairs = sorted(zip(s, y), key=lambda x: -x[0])
    npos = sum(y)
    if npos == 0:
        return None
    tp = 0
    ap = 0.0
    i = 0
    n = len(pairs)
    while i < n:
        j = i
        while j < n and pairs[j][0] == pairs[i][0]:
            j += 1
        block = pairs[i:j]
        tp_block = sum(lbl for _, lbl in block)
        tp += tp_block
        prec = tp / j
        ap += prec * tp_block / npos
        i = j
    return round(ap, 4)


def recall(y, card):
    npos = sum(y)
    return round(sum(1 for a, b in zip(y, card) if a == 1 and b) / npos, 4) if npos else None


def main():
    only = None
    if "--only" in sys.argv:
        only = sys.argv[sys.argv.index("--only") + 1]
    data = json.loads((WORK / "b2_windows.json").read_text(encoding="utf-8"))
    wins = data["windows"]
    system = data["system"]
    key = read_key()
    if not key:
        print("no key (KEY_FILE)")
        sys.exit(1)
    prog_file = WORK / "b2_progress.json"
    prog = json.loads(prog_file.read_text(encoding="utf-8")) if prog_file.exists() else {}
    for spec in MODELS:
        name = spec["model"]
        if only and only not in name:
            continue
        done = prog.setdefault(name, {})
        for idx, w in enumerate(wins):
            wid = "%s:%d" % (w["pid"], w["week"])
            if wid in done:
                continue
            body = {"model": name, "max_tokens": spec["max_tokens"], "system": system,
                    "messages": [{"role": "user", "content": w["user"]}]}
            if spec["thinking"] == "disabled":
                body["thinking"] = {"type": "disabled"}
            rec = {"p": None, "error": None, "in": 0, "out": 0, "calls": 0}
            tries = [spec["max_tokens"]] + ([spec["retry_tokens"]] if spec["retry_tokens"] else [])
            for k, mt in enumerate(tries):
                body["max_tokens"] = mt
                rec["calls"] += 1
                try:
                    msg = call(key, body, 120 if "sonnet" in name else 30)
                    u = msg.get("usage", {})
                    rec["in"] += int(u.get("input_tokens", 0))
                    rec["out"] += int(u.get("output_tokens", 0))
                    p, err = parse_p(msg)
                    rec["p"], rec["error"] = p, err
                    if err == "no_text" and k + 1 < len(tries):
                        time.sleep(0.3)
                        continue
                    break
                except urllib.error.HTTPError as e:
                    rec["error"] = "http_%d" % e.code
                    break
                except Exception as e:  # timeout, network
                    rec["error"] = type(e).__name__
                    break
            done[wid] = rec
            prog_file.write_text(json.dumps(prog), encoding="utf-8")
            if (idx + 1) % 20 == 0:
                print("%s %d/%d" % (name, idx + 1, len(wins)), flush=True)
            time.sleep(0.3)

    y = [w["label"] for w in wins]
    rows = []
    cost = 0.0
    for spec in MODELS:
        name = spec["model"]
        done = prog.get(name, {})
        if len(done) < len(wins):
            print("%s incomplete %d/%d" % (name, len(done), len(wins)))
            continue
        recs = [done["%s:%d" % (w["pid"], w["week"])] for w in wins]
        scores = [r["p"] if r["p"] is not None else 0.0 for r in recs]
        fails = sum(1 for r in recs if r["p"] is None)
        calls = sum(r["calls"] for r in recs)
        pin, pout = PRICE[name]
        c = sum(r["in"] * pin + r["out"] * pout for r in recs) / 1e6
        cost += c
        row = {"model": name, "thinking": spec["thinking"]}
        if spec["thinking"] == "default":
            row["max_tokens"] = spec["max_tokens"]
        row.update({"pr_auc": average_precision(y, scores), "recall_at_rule": recall(y, [s >= 0.5 for s in scores]),
                    "calls": calls, "failures": fails, "cost_usd": round(c, 4)})
        rows.append(row)
    gbm = [w["gbm_prob"] for w in wins]
    rows.append({"model": "GBM(\uac19\uc740 200\uac1c)", "pr_auc": average_precision(y, gbm), "recall_at_rule": recall(y, [w["gbm_card"] for w in wins])})
    out = {
        "subset_n": len(wins), "subset_pos": sum(y), "rows": rows, "cost_usd": round(cost, 4),
        "note": "\uc5b8\uc5b4\ubaa8\ub378 \ub2e8\ub3c5\uc740 200\uac1c \uc8fc \ubd80\ubd84\uc9d1\ud569 \uacb0\uacfc",
        "rule": {"llm": "p >= 0.5", "gbm": "prob >= t1 (thresholds.json)", "t1": data["t1"]},
        "subset": {"seed": data["seed"], "neg_tricky": sum(1 for w in wins if w["label"] == 0 and w["tricky"]), "pools": data["pools"]},
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: v for k, v in out.items() if k in ("subset_n", "subset_pos", "rows", "cost_usd")}, ensure_ascii=True))


if __name__ == "__main__":
    main()
