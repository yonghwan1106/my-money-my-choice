import { test } from "node:test";
import assert from "node:assert/strict";
import { redact, redactNumbers } from "../lib/privacy/redact";
import { mkHelper } from "./_fixtures";

const CTX = {
  displayName: "민수",
  helpers: [
    mkHelper("h1", "누나", "family", { state: "linked", cpKey: "cp_01" }),
    mkHelper("h2", "이수진 선생님", "center", { state: "not_in_list" }),
  ],
  cpLabels: ["김은정", "한지훈"],
};

test("이름·별칭·상대방·전화·숫자가 사라지고 토큰이 남는다", () => {
  const src = "민수가 누나한테 말 안 했는데 이수진 선생님이 알아요. 한지훈 형이 010-1234-5678로 연락해서 1,070,000원 보냈어요. 지훈이가 또 달래요";
  const out = redact(src, CTX);
  for (const gone of ["민수", "누나", "이수진", "수진", "한지훈", "지훈", "010-1234-5678", "1,070,000", "1234", "5678"]) {
    assert.ok(!out.includes(gone), `${gone} 남음: ${out}`);
  }
  for (const tok of ["[본인]", "[H1]", "[H2]", "[상대2]", "[전화]", "[숫자]"]) assert.ok(out.includes(tok), `${tok} 없음: ${out}`);
  assert.ok(out.includes("[H2]이 알아요") || out.includes("[H2] 선생님이") || out.includes("[H2]이"), out);
});

test("긴 낱말부터 바꾼다(「이수진 선생님」 전체가 먼저)", () => {
  const out = redact("이수진 선생님한테 물어볼래요", CTX);
  assert.equal(out, "[H2]한테 물어볼래요");
});

test("계좌 모양·4자리 이상 숫자 → [숫자], 3자리 이하는 둠", () => {
  assert.equal(redactNumbers("123-456-789012 계좌"), "[숫자] 계좌");
  assert.equal(redactNumbers("20000원"), "[숫자]원");
  assert.equal(redactNumbers("3번 보냈어요"), "3번 보냈어요");
  assert.equal(redactNumbers("01012345678"), "[전화]");
});

test("200자로 자른다", () => {
  const out = redact("가".repeat(300), CTX);
  assert.equal(Array.from(out).length, 200);
});
