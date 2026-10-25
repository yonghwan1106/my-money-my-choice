# -*- coding: utf-8 -*-
"""Fixed pseudonym lists (spec 4-6). No other names may be used in data."""

SURNAMES = ["김", "이", "최", "정", "강", "조", "윤", "장", "임", "한",
            "오", "서", "신", "권", "황", "안", "송", "류", "전", "홍"]

GIVEN = ["민준", "서준", "예준", "지호", "주원", "하준", "지훈", "준서", "시우", "은우",
         "서연", "서윤", "지우", "하은", "민서", "지민", "수아", "지아", "채원", "다은",
         "예린", "수빈", "유진", "정민", "영호", "성민", "상훈", "혜진", "미영", "은정",
         "경수", "동현", "재영", "태식", "수진", "하늘", "민수", "도현", "서진", "지현"]

# Scenario fixed people (all combinations of the lists above)
SCENARIO_PEOPLE = ["김민수", "김은정", "이수진", "한지훈",
                   "이서연", "김도현", "이서진",
                   "최영호", "오지현", "장태식",
                   "정하늘", "윤혜진"]

# Shops (invented generic names only). 푸른가전 is kept for big purchases.
SHOPS = ["동네편의점", "골목마트", "새싹분식", "따끈국밥", "소담밥상", "늘봄빵집", "별빛카페",
         "시내버스", "마을버스", "도시철도", "동네약국", "초록문구", "바른안경", "하늘미용실",
         "동네세탁소", "푸른가전", "꽃길꽃집", "튼튼정형외과", "맑은치과", "우리동네정육점"]
DAILY_SHOPS = [s for s in SHOPS if s != "푸른가전"]
APPLIANCE_SHOP = "푸른가전"

def extra_shop(i):
    """Any other place uses the 'example shop N' form."""
    return "예시상점%d" % i

# Finance / telecom / workshops (regulated sectors carry the 'example' prefix)
LENDERS = ["예시캐피탈", "예시카드론", "예시저축은행"]
TELECOMS = ["예시통신A", "예시통신B", "예시통신C"]
# Extra telecom labels in the same 'example' form, needed when a person gets
# more new phone lines than the three base labels allow.
TELECOMS_EXTRA = ["예시통신D", "예시통신E", "예시통신F"]
WORKSHOPS = ["햇살보호작업장", "늘봄보호작업장", "초록보호작업장"]
INSURER = "예시보험"

BENEFIT_MEMOS = ["장애인연금", "장애수당", "생계급여"]
MICRO_MEMOS_NORMAL = ["앱결제", "콘텐츠", "게임충전"]
MICRO_MEMOS_EXPLOIT = ["앱결제", "게임충전"]


def full_name(rng, exclude=()):
    """Random surname+given name from the lists, avoiding names in exclude."""
    for _ in range(1000):
        n = SURNAMES[int(rng.integers(len(SURNAMES)))] + GIVEN[int(rng.integers(len(GIVEN)))]
        if n not in exclude:
            return n
    raise RuntimeError("name pool exhausted")


def all_allowed_full_names():
    return {s + g for s in SURNAMES for g in GIVEN}
