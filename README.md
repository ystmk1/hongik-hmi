# hongik-hmi

로보택시 탑승자 HMI(태블릿 내비, 홍익이 패널) 디자인 디벨롭용 저장소입니다.
CARLA 시뮬레이터 없이 브라우저에서 바로 화면을 띄우고, Vercel로 배포해 팀원과 같은 화면을 보며 작업합니다.

원본: [jungmin5589-del/hongik-carla-hmi](https://github.com/jungmin5589-del/hongik-carla-hmi) (CARLA 연동 전체 코드).
가져온 브랜치와 커밋은 `demo/data/source.json`에 있습니다. 지금은 `codex/experiment-protocol-20261120` 브랜치(11월 22일) 기준입니다.

## 바로 보기

| 화면 | 주소 |
| --- | --- |
| 시나리오 선택 | `/` |
| 실험 진행 (AI OFF, ON 회차) | `/experiment` |
| 내비 | `/navigation` |
| 내비 (이전 버전) | `/navigation/classic` |
| 관리자, 기록 | `/admin` |

시나리오 선택이나 실험 진행에서 주행을 고르면, 준비가 끝난 뒤 같은 탭에서 내비로 넘어갑니다.
연구실에서는 서버가 내비를 별도 창으로 띄우는데, 데모에는 그 역할이 없어서 같은 탭을 씁니다.

`/navigation?profile=fog&condition=A` 처럼 주소에 시나리오와 조건을 붙이면 바로 그 상태로 열립니다.

- profile: `congestion`, `night`, `fog`, `yield`, `carpool`, `rattle`, `cargo`
- condition: `A`, `B`
- 언어: `&lang=en`, `&lang=zh`

### 멈춘 화면 링크

`/navigation?state=alert` 처럼 `state`를 붙이면 그 화면 상태에서 멈춘 채로 열립니다. 디자인 검토와 피그마 캡처용입니다.

- state: `ready`, `driving`, `alert`, `countdown`, `result`, `ending`
- 선택지와 실행 확인 화면은 `alert`에서 아래쪽 웨이브(홍익이 버튼)를 눌러 엽니다.
- 실험 회차로 보려면 `&experiment=번호`를 붙입니다. 0 연습, 1 정체 OFF, 2 정체 ON, 3 졸음운전 OFF, 4 졸음운전 ON

### DEMO 막대

화면 위쪽 가운데의 DEMO 막대에서 재생 속도(1×, 2×, 4×), 상황 발생으로 건너뛰기, 처음으로 돌아가기를 쓸 수 있습니다.
정체와 졸음운전은 출발 후 30초 동안 정상 주행하다가 상황이 생기니, 건너뛰기를 쓰면 편합니다. `?demobar=0`을 붙이면 숨겨집니다.

## 로컬에서 실행

```bash
npm run dev        # http://localhost:5173
```

Node 18 이상만 있으면 되고 설치할 패키지는 없습니다. 파일을 고치고 새로고침하면 바로 반영됩니다.

## 어디를 고치면 되나

파일 이름과 위치는 원본 저장소와 똑같습니다. 그래서 고친 파일을 원본에 그대로 옮길 수 있습니다.

| 파일 | 내용 |
| --- | --- |
| `course_ui/index.html` | 내비 전체 레이아웃과 3D 도로 화면 |
| `course_ui/cockpit.css` | 내비 기본 스타일 (상단 바, 지도, 속도, 음악) |
| `navigation.css` | 주행 설정 패널, 출발 버튼 |
| `midterm_panel.css`, `midterm_panel.js` | 홍익이 웨이브 버튼, 상황 배너, 설명, 선택지, 카운트다운, 결과 화면 |
| `experiment_ui.js` | 홍익이 창 안의 직접 요청하기 (글이나 말로 요청) |
| `survey_ui.js` | 주행 후 설문, 비상 정지 확인 창 |
| `native_home.html` | 시나리오 선택 화면 |
| `experiment.html` | 실험 진행 화면 |
| `course_ui/vendor/PretendardVariable.woff2` | 폰트 |

브라우저 주소와 파일의 대응은 `scripts/build.mjs`의 `SERVED`에 있습니다. 예: `/midterm-panel.css`는 `midterm_panel.css`.
`/navigation` 페이지는 연구실 서버처럼 `course_ui/index.html`에 스크립트 태그를 덧붙여 조립합니다(`scripts/build.mjs`).

## 데모 데이터

`demo/mock-backend.js`가 연구실 서버(`native_carla.py`) 대신 응답합니다. 실제 주행이 아니라 화면 상태를 보여주기 위한 대본이라 원본과 다른 점이 있습니다.

- 차량 움직임은 단순화돼 있습니다.
- 음성 파일과 실제 주행 영상은 원본 저장소에도 없어서 재생되지 않습니다. 결과 화면의 주행 영상 자리는 `demo/frame.svg`로 대신합니다.
- 음성 인식(STT)은 쓸 수 없습니다. 직접 요청은 글로 입력해서 확인하세요.
- 요청 후 실행까지는 3.5초로 고정했습니다. 연구실에서는 안내 음성 길이에 맞춰 3초에서 15초 사이로 바뀝니다.
- '알려 줘' 요청은 8초 뒤에 알림이 옵니다. 연구실에서는 실제로 틈이 생기거나 위험해졌을 때 옵니다.
- 참가자, 기록, 설문 답변은 이 브라우저에만 저장됩니다.

## 원본과 주고받기

원본을 옆 폴더(`../hongik-carla-hmi`)에 받아 둔 상태에서 씁니다.

```bash
npm run export-lab   # 여기서 고친 UI 파일을 원본의 같은 경로에 덮어쓰기
npm run import-lab   # 원본의 최신 UI 파일을 여기로 가져오기 (여기서 고친 내용을 덮어쓰니 먼저 커밋)
```

주고받는 파일 목록은 `lab-files.txt`입니다. 원본에서 브랜치 작업을 가져올 때는 원본 폴더에서 그 브랜치를 체크아웃한 뒤 `import-lab`을 실행합니다.
새 UI 파일을 만들면 `lab-files.txt`와 `scripts/build.mjs`에 추가하고, 원본 쪽 서버(`native_carla.py`)에도 경로를 등록해야 실제로 불러와집니다.
