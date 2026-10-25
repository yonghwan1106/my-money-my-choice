# 내 돈, 내가 정해요

아는 사람이 돈을 가져갈 때, 발달장애인 본인에게 먼저 묻는 AI

## 1. 무엇

## 2. 왜

## 3. 어떻게

### 언어모델이 하는 일 — 딱 두 곳

| 하는 일 | 하지 않는 일 |
|---|---|
| 본인이 말로 한 답을 다섯 가지(`my_choice`·`asked_by_someone`·`threatened`·`not_sure`·`unclear`) 중 하나로 알아듣기 — `/api/understand`. 본인이 「맞아요」를 눌러야 반영돼요. | 위험 판단(통계 신호 + 직접 학습한 부스팅 모델이 해요) |
| 믿는 사람에게 가는 알림의 「무슨 일이 있었는지」 요약(90자 이하) 쓰기 — `/api/helper-note`. 숫자 검사를 통과한 것만 써요. | 확인 카드 문장 쓰기(검수한 고정 문장에 숫자만 채워요, `lib/engine/templates.ts`) |
| | 알릴 사람 정하기(본인 답 × 본인 설정 → 지원의사결정 규칙, `lib/engine/policy.ts`) |
| | 거래 기록 읽기 · 숫자 계산 |

- **모델**: `claude-haiku-5-5`(thinking 끔, temperature 없음). API 오류면 `claude-haiku-4-5`로 한 번, 검증 실패면 같은 모델로 한 번 다시 써요. 그래도 안 되면 낱말 규칙(K0, `lib/llm/k0.ts`)이나 고정 문장으로 바꿔요. 키가 없어도 같은 화면이 데모 모드로 돌아요.
- **검증기**(`lib/llm/validate.ts`): 알아듣기는 범주 이름·근거가 입력 문장에 그대로 있는지, 요약은 길이·물음표·숫자 일치(요약 속 숫자가 모두 코드가 준 값에 있는지)·금지어·상대 의도 단정 낱말·사람 이름을 봐요.
- **서버로 가는 것**: 이름을 지운 답 문장(200자 이하, `lib/privacy/redact.ts`가 브라우저에서 이름·전화·숫자를 지움)과 이름 없는 요약 숫자뿐이에요. 저장하지 않아요. 요청·응답 본문을 로그에 남기지 않아요.
- **비용 상한**: IP당 분당 6회 · 인스턴스당 하루 300회(인스턴스 메모리라 인스턴스마다 따로 세요 — 진짜 상한은 Anthropic 콘솔 지출 한도). 시연 버튼은 사전계산 결과(`data/scenarios/*.json`)를 써서 실시간 호출이 없어요.
- **평가**(가상 데이터 기준, 수치는 `/eval`과 JSON에서만): 알아듣기 `data/eval/understand_eval_v1.json`(개발팀이 쓴 가상 문장 120개 중 시험 80개, 한 번만 실행), 알림 요약 `data/eval/helpernote_eval_v1.json`(합성 시험 사람의 살펴보기·위험 주 60개), 언어모델만으로 위험 판단 비교 `data/eval/eval_b2_v1.json`(200개 주 부분집합), 지원의사결정 규칙 시험 `data/eval/policy_tests_v1.json`.
- **다시 만들기**: `KEY_FILE=<키 파일 경로> npx --prefix <저장소> tsx <저장소>/scripts/eval_understand.ts --split dev` · `…/scripts/eval_helpernote.ts` · `…/scripts/precompute.ts` · `npx --prefix <저장소> tsx <저장소>/scripts/lib/b2_windows.ts` 뒤 `python <저장소>/pipeline/baseline_llm.py`. 키는 파일에서 프로세스 메모리로만 읽어요.

## 4. 성적(가상 데이터 기준)

## 5. 데이터

## 6. 실행

## 7. 출처·라이선스

## 8. 후보작 구현 안내
