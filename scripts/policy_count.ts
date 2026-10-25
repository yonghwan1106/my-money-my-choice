// 지원의사결정 규칙 시험 통과 수 기록 (구현명세 §6-3) → data/eval/policy_tests_v1.json
//   실행: npx --prefix <repo> tsx <repo>\scripts\policy_count.ts
//   tests/policy.test.ts를 TAP으로 돌려 「P-xx」로 시작하는 시험만 센다(손으로 적지 않음).
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(__dirname, "..");
const cli = path.join(ROOT, "node_modules", "tsx", "dist", "cli.mjs");
const r = spawnSync(process.execPath, [cli, "--test", "--test-reporter=tap", path.join(ROOT, "tests", "policy.test.ts")], {
  cwd: ROOT, encoding: "utf-8", maxBuffer: 32 * 1024 * 1024,
});
const lines = (r.stdout ?? "").split(/\r?\n/);
const ids = new Map<string, boolean>();
for (const l of lines) {
  const m = l.match(/^(not ok|ok) \d+ - (P-\d{2})\b/);
  if (m) ids.set(m[2], m[1] === "ok");
}
const total = ids.size;
const passed = [...ids.values()].filter(Boolean).length;
const failed = [...ids.entries()].filter(([, v]) => !v).map(([k]) => k);
const out = { passed, total, at: new Date().toISOString(), failed };
fs.writeFileSync(path.join(ROOT, "data", "eval", "policy_tests_v1.json"), JSON.stringify(out, null, 2) + "\n", "utf-8");
console.log(`policy tests ${passed}/${total}${failed.length ? " failed: " + failed.join(",") : ""}`);
process.exit(total === 29 && passed === 29 ? 0 : 1);
