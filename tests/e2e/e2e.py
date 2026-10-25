# e2e (spec 10-4): Python Playwright headless (--disable-gpu), --base URL argument.
# Usage: python -E C:\Users\user\projects\2026_active\my-money-my-choice\tests\e2e\e2e.py --base http://localhost:3290 [--keyless]
#   --keyless : the server was started without ANTHROPIC_API_KEY -> also run test 7 (rule mode + demo badge).
#   --only 1,2 : run a subset.
# Source is ASCII only (Korean UI strings are \u escapes). Prints one PASS/FAIL line per test, exit 1 on any FAIL.
import argparse
import sys
import time
import traceback
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "test-results" / "e2e"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"

K = {
    "yes": "\ub124",
    "no": "\uc544\ub2c8\uc694",
    "next": "\ub2e4\uc74c",
    "start": "\uc774\ub300\ub85c \uc2dc\uc791",
    "more": "\ud55c \uba85 \ub354",
    "name_label": "\ubd80\ub97c \uc774\ub984",
    "alias1": "1\ubc88\uc9f8 \uc0ac\ub78c\uc744 \ubd80\ub974\ub294 \uc774\ub984",
    "alias2": "2\ubc88\uc9f8 \uc0ac\ub78c\uc744 \ubd80\ub974\ub294 \uc774\ub984",
    "family": "\uac00\uc871",
    "activity": "\ud65c\ub3d9\uc9c0\uc6d0\uc0ac",
    "analyze": "\ubd84\uc11d\ud558\uae30",
    "not_in_list": "\uc774 \ubaa9\ub85d\uc5d0 \uc5c6\uc5b4\uc694",
    "skip": "\uac74\ub108\ub6f0\uae30",
    "play_demo": "\uc7ac\uc0dd\ud574 \ubcf4\uae30",
    "mine": "\ub0b4\uac00 \ud558\uace0 \uc2f6\uc5b4\uc11c \ud588\uc5b4\uc694",
    "notsure": "\uc798 \ubaa8\ub974\uaca0\uc5b4\uc694",
    "told": "\ub204\uac00 \ud558\ub77c\uace0 \ud588\uc5b4\uc694",
    "free": "\ub9d0\ub85c \ud560\ub798\uc694",
    "send": "\ubcf4\ub0b4\uae30",
    "right": "\ub9de\uc544\uc694",
    "wrong": "\uc544\ub2c8\uc5d0\uc694",
    "other": "\ub2e4\ub978 \uc0ac\ub78c",
    "notify": "\uc54c\ub824 \uc8fc\uc138\uc694",
    "another": "\ub2e4\ub978 \uc8fc \ubcf4\uae30",
    "minsu": "\ubbfc\uc218",
    "seoyeon": "\uc11c\uc5f0",
    "dohyun_t": "\uae40\ub3c4\ud604 \uc120\uc0dd\ub2d8",
    "dohyun": "\uae40\ub3c4\ud604",
    "unni": "\uc5b8\ub2c8",
    "allowed": "\ubbfc\uc218 \ub2d8\uc774 \uc54c\ub824\ub3c4 \ub41c\ub2e4\uace0 \ud588\uc5b4\uc694",
    "involved": "\uc774 \uc77c\uacfc \uad00\ub828\ub41c \ubd84\uc774\ub77c \uae40\ub3c4\ud604 \uc120\uc0dd\ub2d8\uc5d0\uac8c\ub294 \uc54c\ub9ac\uc9c0 \uc54a\uc544\uc694.",
    "ask_unni": "\uc5b8\ub2c8\uc5d0\uac8c \uc54c\ub9b4\uae4c\uc694?",
    "rel_dohyun": "\uc774\ubc88 \uc77c\uacfc \uad00\ub828\ub41c \uc0ac\ub78c\uc774 \uae40\ub3c4\ud604 \uc120\uc0dd\ub2d8\uc778\uac00\uc694?",
    "rel_unni": "\uc774\ubc88 \uc77c\uacfc \uad00\ub828\ub41c \uc0ac\ub78c\uc774 \uc5b8\ub2c8\uc778\uac00\uc694?",
    "counsel_q": "\uc0c1\ub2f4\uc744 \ubc1b\uc544 \ubcfc\ub798\uc694?",
    "counsel_no": "1644-8295",
    "rule_note": "AI \uc5f0\uacb0 \uc5c6\uc774 \ub0b1\ub9d0\ub85c \uc54c\uc544\ub4e4\uc5c8\uc5b4\uc694.",
    "new_sentence": "\uadf8\ub0e5 \ub0b4\uac00 \uc0ac\uace0 \uc2f6\uc740 \uac8c \uc788\uc5b4\uc11c \uc37c\uc5b4\uc694",
    "bad1": "\uc815\uc0c1\uc778",
    "bad2": "\uac00\uc9dc",
    "synth": "\uac00\uc0c1 \ub370\uc774\ud130 \uae30\uc900",
}

API_HITS = []


def sheet(page):
    return page.locator('[data-testid="flow-sheet"]')


def step(page):
    s = sheet(page)
    return s.get_attribute("data-step") if s.count() else None


def sheet_week(page):
    s = sheet(page)
    return s.get_attribute("data-week") if s.count() else None


def sbtn(page, key):
    sheet(page).get_by_role("button", name=K[key], exact=True).click()
    page.wait_for_timeout(250)


def sheet_text(page):
    return sheet(page).inner_text() if sheet(page).count() else ""


def expect(cond, msg):
    if not cond:
        raise AssertionError(msg)


def wait_text(page, text, timeout=15000):
    page.get_by_text(text, exact=False).first.wait_for(timeout=timeout)


def track(page):
    def on_req(req):
        u = req.url
        if "/api/understand" in u or "/api/helper-note" in u:
            API_HITS.append(u)
    page.on("request", on_req)


def open_demo(page, base, sid):
    page.goto(base + "/demo")
    page.locator('[data-testid="demo-card-%s"]' % sid).get_by_role("link", name=K["play_demo"]).click()
    page.wait_for_selector('[data-testid="result"]', timeout=30000)


def play_until_sheet(page, timeout=40000):
    page.get_by_test_id("btn-play").click()
    page.wait_for_selector('[data-testid="flow-sheet"]', timeout=timeout)
    page.wait_for_timeout(300)


def dismiss(page):
    """Close the current card without answering (later -> next -> another)."""
    for _ in range(8):
        s = step(page)
        if s is None:
            return
        if s == "done":
            sbtn(page, "another")
            return
        if s == "ask":
            page.get_by_test_id("btn-later").click()
            page.wait_for_timeout(250)
            continue
        btn = sheet(page).get_by_role("button", name=K["next"], exact=True)
        if btn.count():
            btn.click()
            page.wait_for_timeout(250)
            continue
        btn = sheet(page).get_by_role("button", name=K["another"], exact=True)
        if btn.count():
            btn.click()
            page.wait_for_timeout(250)
            continue
        return


def timeline_levels(page):
    out = {}
    for g in page.locator('[data-testid="timeline"] g[data-week]').all():
        out[int(g.get_attribute("data-week"))] = g.get_attribute("data-level")
    return out


def fill_settings(page, base, name, helpers):
    """helpers: list of (relation_label_key, alias)."""
    page.goto(base + "/start")
    page.get_by_role("button", name=K["yes"], exact=True).click()
    page.get_by_label(K["name_label"]).fill(name)
    page.get_by_role("button", name=K["next"], exact=True).click()
    for i, (rel, alias) in enumerate(helpers):
        if i > 0:
            page.get_by_role("button", name=K["more"]).click()
        page.locator('[data-testid="helper-draft-%d"]' % (i + 1)).get_by_role("button", name=K[rel], exact=True).click()
        page.get_by_label(K["alias%d" % (i + 1)]).fill(alias)
    page.get_by_role("button", name=K["next"], exact=True).click()  # helper editor
    for _ in helpers:
        page.get_by_role("button", name=K["next"], exact=True).click()  # scope step per helper
        page.wait_for_timeout(150)
    page.get_by_role("button", name=K["next"], exact=True).click()  # predelegate
    page.wait_for_selector('[data-testid="confirm-step"]', timeout=10000)
    page.get_by_role("button", name=K["start"], exact=True).click()
    page.wait_for_selector('[data-testid="upload-box"]', timeout=15000)


def upload(page, fname):
    page.get_by_test_id("file-input").set_input_files(str(ROOT / "public" / "samples" / fname))
    page.wait_for_selector('[data-testid="mapping-table"]', timeout=20000)
    page.get_by_role("button", name=K["analyze"], exact=True).click()


def b_upload_to_card(page, base, link):
    fill_settings(page, base, K["seoyeon"], [("activity", K["dohyun_t"]), ("family", K["unni"])])
    upload(page, "B_seoyeon_f2.csv")
    page.wait_for_selector('[data-testid="link-step"]', timeout=30000)
    if link:
        h1 = page.get_by_test_id("link-h1")
        h1.get_by_role("button", name=K["dohyun"] + " \u00b7").first.click()
        page.get_by_test_id("link-h2").get_by_role("button", name=K["not_in_list"], exact=True).click()
        page.get_by_test_id("link-step").get_by_role("button", name=K["next"], exact=True).click()
    else:
        page.get_by_test_id("link-step").get_by_role("button", name=K["skip"], exact=True).click()
    page.wait_for_selector('[data-testid="result"]', timeout=20000)
    page.locator('[data-testid="tray"] [data-event="w16"]').click()
    page.wait_for_selector('[data-testid="flow-sheet"]', timeout=10000)
    expect(sheet_week(page) == "16", "B card week %s != 16" % sheet_week(page))
    expect(step(page) == "ask", "B first step %s" % step(page))


# ---------------- tests ----------------

def t1(page, base):
    n0 = len(API_HITS)
    open_demo(page, base, "A")
    play_until_sheet(page)
    wk = sheet_week(page)
    expect(wk in ("19", "20"), "A card week %s" % wk)
    expect(step(page) == "ask", "A step %s" % step(page))
    page.get_by_test_id("btn-free").click()
    page.locator("[data-chip]").first.click()
    page.wait_for_selector('[data-testid="understand-confirm"]', timeout=20000)
    sbtn(page, "right")
    expect(step(page) == "who", "after confirm %s" % step(page))
    sbtn(page, "other")
    expect(step(page) == "notify_choice", "after who %s" % step(page))
    picker = sheet(page).locator('[data-testid="notify-picker"]')
    if picker.get_attribute("data-multi") == "1":
        picker.locator('[data-helper="h2"]').click()
        expect(picker.locator('[data-helper="h1"]').get_attribute("aria-pressed") != "true", "h1 selected")
    sbtn(page, "notify")
    page.wait_for_selector('[data-testid="message-preview"]', timeout=20000)
    page.locator('[data-testid="preview-bubble"]').first.wait_for(state="attached", timeout=20000)
    expect(K["allowed"] in page.locator('[data-testid="message-preview"]').first.inner_text() or K["allowed"] in page.locator("body").inner_text(), "allowed sentence missing")
    bubbles = page.locator('[data-testid="preview-bubble"]')
    helpers = set(bubbles.nth(i).get_attribute("data-helper") for i in range(bubbles.count()))
    expect(helpers == {"h2"}, "bubbles to %s" % helpers)
    prev = page.locator('[data-testid="message-preview"]')
    expect(prev.locator('[data-testid="tx-list"], table, li').count() == 0, "preview has a list")
    expect(len(API_HITS) == n0, "api calls %d" % (len(API_HITS) - n0))
    return "week %s, preview to h2 only, api 0" % wk


def t2(page, base):
    b_upload_to_card(page, base, link=True)
    sbtn(page, "told")
    expect(step(page) == "involved_notice", "after told %s" % step(page))
    expect(K["involved"] in sheet_text(page), "involved text missing")
    sbtn(page, "next")
    expect(K["ask_unni"] in sheet_text(page), "ask unni missing (step %s)" % step(page))
    return "involved_notice -> ask unni"


def t3(page, base):
    b_upload_to_card(page, base, link=False)
    sbtn(page, "notsure")
    expect(step(page) == "explain", "after notsure %s" % step(page))
    sbtn(page, "next")
    expect(K["rel_dohyun"] in sheet_text(page), "rel dohyun missing (step %s)" % step(page))
    sbtn(page, "right")
    expect(K["involved"] in sheet_text(page), "involved missing (step %s)" % step(page))
    sbtn(page, "next")
    expect(K["rel_unni"] in sheet_text(page), "rel unni missing (step %s)" % step(page))
    sbtn(page, "wrong")
    expect(K["ask_unni"] in sheet_text(page), "ask unni missing (step %s)" % step(page))
    return "explain -> rel(dohyun) yes -> involved -> rel(unni) no -> ask unni"


def t4(page, base):
    n0 = len(API_HITS)
    open_demo(page, base, "C")
    for _ in range(6):
        play_until_sheet(page)
        if sheet_week(page) == "19" or step(page) != "ask":
            break
        dismiss(page)
    expect(sheet_week(page) == "19" and step(page) == "ask", "C at week %s step %s" % (sheet_week(page), step(page)))
    sbtn(page, "notsure")
    for _ in range(10):
        s = step(page)
        if s == "counsel_offer":
            break
        if s == "notify_choice":
            sbtn(page, "notify")
        elif s == "preview":
            page.wait_for_selector('[data-testid="message-preview"] button:not([disabled])', timeout=20000)
            sbtn(page, "next")
        elif s == "relation_check":
            sbtn(page, "wrong")
        else:
            sbtn(page, "next")
    expect(K["counsel_q"] in sheet_text(page), "counsel offer missing (step %s)" % step(page))
    sbtn(page, "yes")
    page.wait_for_selector('[data-testid="counsel-info"]', timeout=10000)
    expect(K["counsel_no"] in sheet_text(page), "1644-8295 missing")
    expect(len(API_HITS) == n0, "api calls %d" % (len(API_HITS) - n0))
    return "week 19 -> counsel_info 1644-8295, api 0"


def t5(page, base):
    n0 = len(API_HITS)
    open_demo(page, base, "D")
    # D 21 is a watch week: replay does not stop on watch, so jump card by card (btn-skip stops on watch too)
    for _ in range(10):
        page.get_by_test_id("btn-skip").click()
        page.wait_for_selector('[data-testid="flow-sheet"]', timeout=10000)
        page.wait_for_timeout(300)
        if sheet_week(page) == "21":
            break
        dismiss(page)
    expect(sheet_week(page) == "21", "D week %s" % sheet_week(page))
    sbtn(page, "mine")
    expect(step(page) == "done", "after mine %s" % step(page))
    expect(page.locator('[data-testid="message-preview"]').count() == 0, "preview shown")
    expect(len(API_HITS) == n0, "api calls %d" % (len(API_HITS) - n0))
    return "week 21 -> done, no preview"


def t6(page, base):
    fill_settings(page, base, K["minsu"], [])
    upload(page, "A_minsu_f1.csv")
    page.wait_for_selector('[data-testid="result"]', timeout=30000)
    page.wait_for_timeout(500)
    up = timeline_levels(page)
    open_demo(page, base, "A")
    for _ in range(40):
        page.get_by_test_id("btn-skip").click()
        try:
            page.wait_for_selector('[data-testid="flow-sheet"]', timeout=2500)
        except Exception:
            break
        dismiss(page)
    page.wait_for_timeout(500)
    demo = timeline_levels(page)
    expect(len(up) > 0 and len(demo) > 0, "no weeks (upload %d demo %d)" % (len(up), len(demo)))
    expect(len(up) == len(demo), "week counts upload %d demo %d" % (len(up), len(demo)))
    diff = [w for w in up if up[w] != demo.get(w)]
    expect(not diff, "level differs at weeks %s" % diff[:5])
    return "%d weeks identical" % len(up)


def t7(page, base):
    open_demo(page, base, "A")
    play_until_sheet(page)
    page.get_by_test_id("btn-free").click()
    page.get_by_label("\ub9d0\ub85c \ud55c \ub2f5").fill(K["new_sentence"])
    sheet(page).get_by_role("button", name=K["send"]).click()
    page.wait_for_selector('[data-testid="understand-confirm"]', timeout=20000)
    expect(K["rule_note"] in sheet_text(page), "rule note missing")
    expect(page.get_by_test_id("demo-badge").count() > 0, "demo badge missing")
    return "rule note + demo badge"


def t8(browser, base):
    ctx = browser.new_context(viewport={"width": 360, "height": 780}, user_agent=UA)
    page = ctx.new_page()
    OUT.mkdir(parents=True, exist_ok=True)
    res = []
    try:
        for name, url in (("01_home", "/"), ("12_eval", "/eval")):
            page.goto(base + url)
            page.wait_for_timeout(600)
            sw = page.evaluate("document.documentElement.scrollWidth")
            page.screenshot(path=str(OUT / ("m360_%s.png" % name)))
            res.append((name, sw))
        open_demo(page, base, "A")
        page.wait_for_timeout(600)
        res.append(("04_check", page.evaluate("document.documentElement.scrollWidth")))
        page.screenshot(path=str(OUT / "m360_04_check.png"))
        play_until_sheet(page)
        res.append(("05_ask", page.evaluate("document.documentElement.scrollWidth")))
        page.screenshot(path=str(OUT / "m360_05_ask.png"))
    finally:
        ctx.close()
    bad = [r for r in res if r[1] > 360]
    expect(not bad, "scrollWidth > 360: %s" % bad)
    return " ".join("%s=%d" % r for r in res)


def t9(page, base):
    out = []
    for url in ("/eval", "/compare"):
        page.goto(base + url)
        page.wait_for_timeout(800)
        txt = page.locator("body").inner_text()
        expect(K["bad1"] not in txt and K["bad2"] not in txt, "banned word on %s" % url)
        expect(K["synth"] in txt, "synthetic note missing on %s" % url)
        out.append(url)
    return "ok " + " ".join(out)


TESTS = [(1, t1), (2, t2), (3, t3), (4, t4), (5, t5), (6, t6), (7, t7), (8, None), (9, t9)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:3290")
    ap.add_argument("--keyless", action="store_true")
    ap.add_argument("--only", default="")
    a = ap.parse_args()
    base = a.base.rstrip("/")
    only = set(int(x) for x in a.only.split(",") if x.strip())
    fails = 0
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, args=["--disable-gpu"])
        for no, fn in TESTS:
            if only and no not in only:
                continue
            if no == 7 and not a.keyless:
                print("e2e %d SKIP (needs --keyless local server)" % no)
                continue
            t0 = time.time()
            ctx = None
            try:
                if no == 8:
                    msg = t8(browser, base)
                else:
                    ctx = browser.new_context(viewport={"width": 1440, "height": 900}, user_agent=UA)
                    page = ctx.new_page()
                    track(page)
                    msg = fn(page, base)
                print("e2e %d PASS %.1fs | %s" % (no, time.time() - t0, msg))
            except Exception as e:
                fails += 1
                print("e2e %d FAIL %.1fs | %s" % (no, time.time() - t0, str(e).splitlines()[0][:300] if str(e) else repr(e)))
                if ctx is not None:
                    try:
                        OUT.mkdir(parents=True, exist_ok=True)
                        ctx.pages[0].screenshot(path=str(OUT / ("fail_%d.png" % no)))
                    except Exception:
                        pass
                traceback.print_exc(limit=2, file=sys.stdout)
            finally:
                if ctx is not None:
                    ctx.close()
        browser.close()
    print("e2e summary: %s" % ("ALL PASS" if fails == 0 else "%d FAIL" % fails))
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
