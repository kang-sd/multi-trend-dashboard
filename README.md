# Multi-trend Dashboard (Web)

개인 AI 트렌드 허브의 프론트엔드 프로젝트입니다.

## 실행

```bash
npm install
# 터미널 1
npm run dev:api

# 터미널 2
npm run dev
```

기본 개발 주소:
- Web: `http://127.0.0.1:5173`
- Upload API: `http://127.0.0.1:8787/api/health`

## Cloudflare Pages Functions (운영)

배포 후 API는 동일 경로로 동작합니다.

- `GET /api/health`
- `POST /api/lectures/upload`
- `POST /api/lectures/register-drive-file`
- `POST /api/lectures/sync-folder`

Cloudflare에 아래 시크릿/변수를 설정하세요.

1. `GOOGLE_SERVICE_ACCOUNT` (필수): 서비스계정 JSON 전체 문자열
2. `DASHBOARD_SHEET_ID` (선택): 기본값 `19n-FIkuZHHAnEIoBo2MrCaQhFcifFDZFZRJqL0KYseU`
3. `DRIVE_FOLDER_ID` (선택): 기본값 `1lZnZbqVg3OTGTPvyy2xEuS7KT-i1apqc`
4. `DRIVE_FALLBACK_PARENT_ID` (선택): 기본값 `1_bH_GjcTYKUL9WnM9oo-YJDyJJoKMOiL`
5. `DRIVE_TARGET_FOLDER_NAME` (선택): 기본값 `Multi-trend Dashboard DB`

예시:

```bash
npx wrangler secret put GOOGLE_SERVICE_ACCOUNT
# JSON 전체 붙여넣기 후 저장
```

## trends 보고서 표준 템플릿

`trends` 시트는 단순 요약이 아니라 `원문 + 추론 + 예측 + 각주` 형식으로 저장합니다.

필수 기본 컬럼:

1. `id`
2. `source`
3. `title`
4. `link` (원문 링크)
5. `summary` (3줄 요약)
6. `score` (0~100)
7. `date`
8. `image`

확장 보고서 컬럼:

9. `key_facts`
10. `why_important`
11. `industry_impact`
12. `action_point`
13. `causal_analysis`
14. `second_order_effect`
15. `forecast_3m`
16. `forecast_12m`
17. `scenario_base`
18. `scenario_bull`
19. `scenario_bear`
20. `probability_base` (%)
21. `probability_bull` (%)
22. `probability_bear` (%)
23. `confidence` (`high`/`medium`/`low`)
24. `evidence_quality`
25. `glossary_terms`
26. `footnotes`

`footnotes` 작성 규칙:

- 어려운 용어는 본문에 번호로 표기: `HBM[1]`, `CoWoS[2]`
- 각주는 줄바꿈 또는 `||` 구분으로 저장
- 예시: `[1] HBM: GPU 옆에 붙는 초고속 메모리 || [2] CoWoS: 칩 결합 패키징 기술`

## 업로드 API 환경 변수

기본값이 코드에 포함되어 있지만, 운영 시에는 환경 변수 설정을 권장합니다.

- `GOOGLE_AUTH_MODE` : `service_account`(기본) 또는 `adc`(사용자 gcloud 자격증명)
- `GOOGLE_SERVICE_ACCOUNT_PATH` : 서비스 계정 JSON 파일 경로
- `DASHBOARD_SHEET_ID` : `lectures` 시트가 포함된 스프레드시트 ID
- `DRIVE_FOLDER_ID` : 업로드 대상 Google Drive 폴더 ID
- `DRIVE_FALLBACK_PARENT_ID` : 기본 폴더 접근 불가 시 하위 폴더를 자동 생성할 부모 폴더 ID
- `DRIVE_TARGET_FOLDER_NAME` : 자동 생성 대상 폴더명 (기본 `Multi-trend Dashboard DB`)
- `UPLOAD_API_PORT` : 업로드 API 포트(기본 `8787`)

### 서비스계정 업로드 한도 오류 시 (중요)

`Service Accounts do not have storage quota` 오류가 뜨면, 사용자 인증 모드로 전환하십시오.

```powershell
gcloud application-default login --scopes=https://www.googleapis.com/auth/drive,https://www.googleapis.com/auth/spreadsheets
$env:GOOGLE_AUTH_MODE = "adc"
npm run dev:api
```

## 품질 확인

```bash
npm run lint
npm run build
```

## 현재 구현 범위 (2026-04-20)

1. 탭 구조: `Home`, `AI 기술 최신`, `나를 알아가는 8가지 탐구`, `강의허브 블로그`, `Ops`
2. 데이터 소스: Google Sheets `apps`, `trends`, `lectures` 시트
3. 동작 기능:
- 전체 검색 필터
- 수동 동기화(`Force Sync`)
- 동기화 경고 표시(`Ops`)
- 모바일 탭 네비게이션
- 강의허브 블로그 등록 시 Google Drive 업로드 + `lectures` 시트 기록

## 소스 구조

1. `src/App.tsx`: 화면 구성, 탭 전환, 검색/동기화 상태 관리
2. `src/services/dashboardData.ts`: Google Sheets 조회 및 강의 업로드 API 호출
3. `functions/api/*`: Cloudflare Pages Functions API
4. `server/drive-upload-api.mjs`: 로컬 개발용 API 서버(보조)
5. `src/types/dashboard.ts`: 대시보드 데이터/탭 타입 정의

## 다음 단계 (계획서 정렬)

1. Cloudflare Workers API 레이어 추가 (프론트 직접 시트 호출 제거)
2. n8n 실행 결과를 `Ops` 탭으로 연결
3. Lecture Hub 상세(태그 필터/정렬) 강화
