# B7 screen captures (spec 10-2 B7): docs/captures/01_home.png ... 12_eval.png (1920x1080) + docs/vote_thumb.png (1280x720)
# Usage: python -E C:\Users\user\projects\2026_active\my-money-my-choice\scripts\capture.py --base http://localhost:3290
# Python Playwright headless, --disable-gpu. Source is ASCII only (Korean UI strings are \u escapes).
import argparse
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
CAP = ROOT / "docs" / "captures"

T = {
    "yes": "\ub124",
    "next": "\ub2e4\uc74c",
    "name": "\ubd80\ub97c \uc774\ub984",
    "minsu": "\ubbfc\uc218",
    "family": "\uac00\uc871",
    "center": "\uc9c0\uc6d0\uc13c\ud130 \uc120\uc0dd\ub2d8",
    "more": "\ud55c \uba85 \ub354",
    "alias1": "1\ubc88\uc9f8 \uc0ac\ub78c\uc744 \ubd80\ub974\ub294 \uc774\ub984",
    "alias2": "2\ubc88\uc9f8 \uc0ac\ub78c\uc744 \ubd80\ub974\ub294 \uc774\ub984",
    "nuna": "\ub204\ub098",
    "sujin": "\uc774\uc218\uc9c4 \uc120\uc0dd\ub2d8",
    "right": "\ub9de\uc544\uc694",
    "other": "\ub2e4\ub978 \uc0ac\ub78c",
    "notify": "\uc54c\ub824 \uc8fc\uc138\uc694",
    "dont": "\uc774\ubc88\uc5d4 \uc54c\ub9ac\uc9c0 \ub9c8\uc694",
    "another": "\ub2e4\ub978 \uc8fc \ubcf4\uae30",
    "told": "\ub204\uac00 \ud558\ub77c\uace0 \ud588\uc5b4\uc694",
    "notsure": "\uc798 \ubaa8\ub974\uaca0\uc5b4\uc694",
}


def sheet(page):
    return page.locator('[data-testid="flow-sheet"]')


def step(page):
    s = sheet(page)
    return s.get_attribute("data-step") if s.count() else None


def click(page, key):
    sheet(page).get_by_role("button", name=T[key], exact=True).click()
    page.wait_for_timeout(200)


def shot(page, name):
    page.wait_for_timeout(400)
    page.screenshot(path=str(CAP / name))
    print("saved", name)


def open_demo(page, base, sid):
    page.goto(base + "/check?scenario=" + sid)
    page.wait_for_selector('[data-testid="result"]', timeout=20000)


def play_until_sheet(page):
    page.get_by_test_id("btn-play").click()
    page.wait_for_selector('[data-testid="flow-sheet"]', timeout=30000)


def drive(page, until, answers):
    """Follow the flow with simple answers until step == until (or done)."""
    for _ in range(20):
        s = step(page)
        if s is None or s == until or s == "done":
            return s
        if s == "explain" or s == "involved_notice" or s == "decline_ack" or s == "later_ack" or s == "predelegated_sent":
            click(page, "next")
        elif s == "preview":
            page.wait_for_selector('[data-testid="message-preview"] button:not([disabled])', timeout=20000)
            click(page, "next")
        elif s == "relation_check":
            sheet(page).get_by_role("button", name="\uc544\ub2c8\uc5d0\uc694", exact=True).click()
        elif s == "notify_choice":
            click(page, answers.get("notify", "notify"))
        elif s == "counsel_offer":
            click(page, "yes")
        elif s == "who":
            click(page, "other")
        else:
            return s
    return step(page)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:3290")
    a = ap.parse_args()
    base = a.base.rstrip("/")
    CAP.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as pw:
        b = pw.chromium.launch(headless=True, args=["--disable-gpu"])
        ctx = b.new_context(viewport={"width": 1920, "height": 1080})
        page = ctx.new_page()
        page.goto(base + "/")
        shot(page, "01_home.png")
        page.goto(base + "/demo")
        shot(page, "02_demo.png")
        # 03 settings: trusted people step
        page.goto(base + "/start")
        page.get_by_role("button", name=T["yes"], exact=True).click()
        page.get_by_label(T["name"]).fill(T["minsu"])
        page.get_by_role("button", name=T["next"], exact=True).click()
        page.locator('[data-testid="helper-draft-1"]').get_by_role("button", name=T["family"], exact=True).click()
        page.get_by_label(T["alias1"]).fill(T["nuna"])
        page.get_by_role("button", name=T["more"]).click()
        page.locator('[data-testid="helper-draft-2"]').get_by_role("button", name=T["center"], exact=True).click()
        page.get_by_label(T["alias2"]).fill(T["sujin"])
        shot(page, "03_start.png")

        # A: ask -> free answer chip -> confirm -> who -> notify (multi) -> preview -> done
        open_demo(page, base, "A")
        play_until_sheet(page)
        shot(page, "05_ask.png")
        page.get_by_test_id("btn-free").click()
        page.locator("[data-chip]").first.click()
        page.wait_for_selector('[data-testid="understand-confirm"]', timeout=20000)
        click(page, "right")
        if step(page) == "who":
            click(page, "other")
        if step(page) == "notify_choice":
            multi = sheet(page).locator('[data-testid="notify-picker"]').get_attribute("data-multi") == "1"
            if multi:
                sheet(page).locator('[data-testid="notify-picker"] [data-helper="h2"]').click()
            shot(page, "06_notify.png")
            click(page, "notify")
        page.wait_for_selector('[data-testid="message-preview"] button:not([disabled])', timeout=20000)
        shot(page, "07_preview.png")
        drive(page, "done", {})
        if step(page) == "done":
            click(page, "another")
        page.locator('[data-testid="timeline"]').scroll_into_view_if_needed()
        shot(page, "04_check.png")

        # C: later on early high cards, then the repeat card -> counsel
        open_demo(page, base, "C")
        for _ in range(6):
            play_until_sheet(page)
            wk = sheet(page).get_attribute("data-week")
            if wk == "19" or step(page) != "ask":
                break
            page.get_by_test_id("btn-later").click()
            page.wait_for_timeout(200)
            click(page, "next")
            click(page, "another")
        click(page, "notsure")
        drive(page, "counsel_info", {})
        page.wait_for_selector('[data-testid="counsel-info"]', timeout=20000)
        shot(page, "08_counsel.png")

        # B: decline once -> re-ask on the next replay step
        open_demo(page, base, "B")
        play_until_sheet(page)
        click(page, "told")
        drive(page, "decline_ack", {"notify": "dont"})
        drive(page, "done", {})
        if step(page) == "done":
            click(page, "another")
        play_until_sheet(page)
        page.wait_for_selector('[data-testid="reask-card"]', timeout=20000)
        shot(page, "09_reask.png")

        page.goto(base + "/compare")
        page.wait_for_selector('[data-testid="compare-row-d"]', timeout=20000)
        shot(page, "10_compare.png")
        page.goto(base + "/how")
        shot(page, "11_how.png")
        page.goto(base + "/eval")
        shot(page, "12_eval.png")
        ctx.close()

        ctx = b.new_context(viewport={"width": 1280, "height": 720})
        page = ctx.new_page()
        page.goto(base + "/thumb")
        page.wait_for_selector('[data-testid="thumb"][data-ready="1"]', timeout=20000)
        page.wait_for_timeout(500)
        page.screenshot(path=str(ROOT / "docs" / "vote_thumb.png"))
        print("saved vote_thumb.png")
        ctx.close()
        b.close()


if __name__ == "__main__":
    main()
