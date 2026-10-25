# B2 parse test fixtures (synthetic, names from spec 4-6 list only).
# Run: python -I C:\Users\user\projects\2026_active\my-money-my-choice\tests\fixtures\make_fixtures.py
from pathlib import Path

OUT = Path(__file__).resolve().parent

# (date, time, memo1, memo2, out, in)
TX = [
    ("2026-07-01", "09:00:00", "\uc790\ub3d9\uc774\uccb4", "\uc6d4\uc138", 300000, 0),
    ("2026-07-02", "12:31:05", "\uccb4\ud06c\uce74\ub4dc", "\ub3d9\ub124\ud3b8\uc758\uc810", 6200, 0),
    ("2026-07-03", "18:02:00", "\uccb4\ud06c\uce74\ub4dc", "\uc0c8\uc2f9\ubd84\uc2dd", 8000, 0),
    ("2026-07-05", "10:00:00", "\uc778\ud130\ub137\ubc45\ud0b9", "\uc724\ud61c\uc9c4", 0, 100000),
    ("2026-07-06", "14:10:00", "ATM\ucd9c\uae08", "", 50000, 0),
    ("2026-07-08", "20:15:00", "\uc571\uacb0\uc81c", "", 3000, 0),
    ("2026-07-15", "11:00:00", "\uc778\ud130\ub137\ubc45\ud0b9", "\uae40\uc740\uc815", 50000, 0),
    ("2026-07-17", "09:30:00", "\uae09\uc5ec", "\ud587\uc0b4\ubcf4\ud638\uc791\uc5c5\uc7a5", 0, 1300000),
    ("2026-07-20", "06:00:00", "\uc7a5\uc560\uc778\uc5f0\uae08", "", 0, 400000),
    ("2026-07-21", "08:00:00", "\uc790\ub3d9\uc774\uccb4", "\uc608\uc2dc\ud1b5\uc2e0A", 45000, 0),
    ("2026-07-21", "13:20:00", "\uc608\uc2dc\uce90\ud53c\ud0c8 \ub300\ucd9c", "", 0, 3000000),
    ("2026-07-21", "18:05:00", "\ubaa8\ubc14\uc77c\ubc45\ud0b9", "\uc7a5\ud0dc\uc2dd", 2800000, 0),
    ("2026-07-22", "19:40:00", "\uccb4\ud06c\uce74\ub4dc", "\ubcc4\ube5b\uce74\ud398", 4500, 0),
    ("2026-07-23", "07:50:00", "\uccb4\ud06c\uce74\ub4dc", "\ub9c8\uc744\ubc84\uc2a4", 1400, 0),
    ("2026-07-27", "23:59:00", "\uc778\ud130\ub137\ubc45\ud0b9", "\ud55c\uc9c0\ud6c8", 150000, 0),
    ("2026-07-28", "00:00:00", "\uc778\ud130\ub137\ubc45\ud0b9", "\ud55c\uc9c0\ud6c8", 100000, 0),
    ("2026-07-29", "10:10:00", "\uae30\ud0c0\uac70\ub798", "", 1000, 0),
    ("2026-08-03", "09:00:00", "\uc790\ub3d9\uc774\uccb4", "\uc608\uc2dc\ud1b5\uc2e0B", 52000, 0),
    ("2026-08-06", "09:00:00", "\ub2e8\ub9d0\uae30\ud560\ubd80", "\uc608\uc2dc\ud1b5\uc2e0C", 38000, 0),
    ("2026-08-07", "15:40:00", "\uccb4\ud06c\uce74\ub4dc", "\ud478\ub978\uac00\uc804", 1290000, 0),
]
N = len(TX)


def money(v):
    return "" if v == 0 else "{:,}".format(v)


def q(s):
    return '"' + s + '"' if ("," in s or '"' in s) else s


def rows_f1():
    bal = 2000000
    out = ["\uac70\ub798\uc77c\uc2dc,\uc801\uc694,\uae30\uc7ac\ub0b4\uc6a9,\ucc3e\uc73c\uc2e0\uae08\uc561,\ub9e1\uae30\uc2e0\uae08\uc561,\uc794\uc561,\uac70\ub798\uc810"]
    for d, t, m1, m2, o, i in TX:
        bal = bal - o + i
        out.append(",".join([d.replace("-", ".") + " " + t, m1, m2, q(money(o)), q(money(i)), q("{:,}".format(bal)), "\ubaa8\ubc14\uc77c"]))
    return out


def rows_f2():
    bal = 2000000
    out = ["\uac70\ub798\uc77c\uc790,\uc2dc\uac04,\uc801\uc694,\ucd9c\uae08\uc561,\uc785\uae08\uc561,\uc794\uc561,\uac70\ub798\uae30\uc810"]
    for d, t, m1, m2, o, i in TX:
        bal = bal - o + i
        memo = (m1 + " " + m2).strip()
        out.append(",".join([d, t[:5], memo, q(money(o)), q(money(i)), q("{:,}".format(bal)), "\uc778\ud130\ub137"]))
    return out


def write(name, lines, enc, bom=False):
    data = ("\r\n".join(lines) + "\r\n").encode(enc)
    if bom:
        data = b"\xef\xbb\xbf" + data
    (OUT / name).write_bytes(data)


write("f1_utf8.csv", rows_f1(), "utf-8")
write("f2_cp949.csv", rows_f2(), "cp949")
write("f1_bom.csv", rows_f1(), "utf-8", bom=True)
notice = ["\uac70\ub798\ub0b4\uc5ed \uc870\ud68c", "\uc870\ud68c\uae30\uac04 2026.07.01 ~ 2026.08.07", ""]
write("f2_notice.csv", notice + rows_f2(), "utf-8")
# single amount + sign column, parentheses negative, slash dates and compact dates
single = [
    "\uac70\ub798\uc77c,\ub0b4\uc6a9,\uae08\uc561,\uc785\ucd9c\uae08\uad6c\ubd84,\uac70\ub798 \ud6c4 \uc794\uc561",
    "2026/07/01,\uc790\ub3d9\uc774\uccb4 \uc6d4\uc138,\"300,000\uc6d0\",\ucd9c\uae08,\"1,700,000\"",
    "20260702,\uc778\ud130\ub137\ubc45\ud0b9 \uae40\uc740\uc815,\"(50,000)\",,\"1,650,000\"",
    "2026-07-05,\uc724\ud61c\uc9c4,\"100,000\",\uc785\uae08,\"1,750,000\"",
    "2026-07-06,ATM\ucd9c\uae08,\"20,000\",\ucd9c\uae08,\"1,730,000\"",
    "2026-07-07,\ud569\uacc4,0,,",
]
write("single_amount.csv", single, "utf-8")
# missing amount columns
write("missing_amount.csv", ["\uac70\ub798\uc77c\uc2dc,\uc801\uc694,\uae30\uc7ac\ub0b4\uc6a9,\uc794\uc561", "2026.07.01 09:00:00,\uc790\ub3d9\uc774\uccb4,\uc6d4\uc138,\"1,000\""], "utf-8")
print("rows", N)
