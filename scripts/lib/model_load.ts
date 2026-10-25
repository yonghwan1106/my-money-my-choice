// 모델 등록(W-A의 lib/engine/model.ts가 있으면 불러서 analyze에 GBM을 등록하게 한다). 없으면 모델 없이 돈다.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export async function tryLoadModel(): Promise<boolean> {
  const f = path.resolve(__dirname, "..", "..", "lib", "engine", "model.ts");
  if (!fs.existsSync(f)) return false;
  try {
    const m = (await import(pathToFileURL(f).href)) as Record<string, unknown>;
    for (const name of ["registerDefaultModels", "loadModels", "init"]) {
      const fn = m[name];
      if (typeof fn === "function") { await (fn as () => unknown)(); break; }
    }
    return true;
  } catch {
    return false;
  }
}
