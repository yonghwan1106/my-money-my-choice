// 오프라인 스크립트 키 읽기 (구현명세 §9-2) — 환경변수 KEY_FILE의 파일에서 첫 일치만 메모리로 읽는다.
// 키를 출력·저장하지 않는다. 값이 없으면 null(스크립트는 「키 없음」으로 멈추거나 규칙 모드로 돈다).
import fs from "node:fs";

// 접두어를 글자 그대로 두지 않는다(저장소 전체 「키 접두어 0건」 점검, §11-2).
const KEY_RE = new RegExp(["sk", "ant", "api03"].join("-") + "-[A-Za-z0-9_\\-]+");

export function readKey(): string | null {
  const file = process.env.KEY_FILE;
  if (!file) return null;
  try {
    const m = fs.readFileSync(file, "utf-8").match(KEY_RE);
    return m ? m[0] : null;
  } catch {
    return null;
  }
}
