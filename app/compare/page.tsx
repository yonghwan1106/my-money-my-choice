// ⑩ 흔한 경고와 비교 (구현명세 §7-6 문구 그대로)
import { WidePage } from "@/components/WidePage";
import { SynthBanner } from "@/components/SynthBanner";
import { LAYERS } from "@/components/layers";
import { CompareBoard } from "@/components/CompareBoard";

export default function ComparePage() {
  return (
    <WidePage side={LAYERS.compare} top={<SynthBanner />}>
      <div className="max-w-[640px]">
        <h1 className="h1 mt-3">흔한 경고와 비교해 보기</h1>
        <p className="mt-2">같은 가상 거래에 두 방법을 실제로 돌린 결과예요.</p>
        <CompareBoard />
      </div>
    </WidePage>
  );
}
