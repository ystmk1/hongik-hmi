# hongik-hmi

로보택시 탑승자 HMI(태블릿 내비, 홍익 AI 패널) 디자인 디벨롭용 저장소입니다.
CARLA 시뮬레이터 없이 브라우저에서 바로 화면을 띄우고, Vercel로 배포해 팀원과 같은 화면을 보며 작업합니다.

원본: [jungmin5589-del/hongik-carla-hmi](https://github.com/jungmin5589-del/hongik-carla-hmi) (CARLA 연동 전체 코드). 가져온 시점의 커밋은 `public/demo/data/source.json`에 있습니다.

## 바로 보기

| 화면 | 주소 |
| --- | --- |
| 시나리오 선택 | `/` |
| 내비 (중간발표 UX) | `/navigation` |
| 내비 (이전 버전) | `/navigation/classic` |

`/navigation?profile=fog&condition=A` 처럼 주소에 시나리오와 조건을 붙이면 바로 그 상태로 열립니다.
profile: `congestion`, `night`, `fog`, `yield`, `carpool`, `rattle`, `cargo` / condition: `A`, `B` / 언어: `&lang=en`, `&lang=zh`

`/navigation?state=alert` 처럼 `state`를 붙이면 그 화면 상태에서 멈춘 채로 열립니다(디자인 검토, 피그마 캡처용).
state: `ready`, `driving`, `alert`, `countdown`, `result`, `ending`. 선택지와 실행 확인 화면은 `alert`에서 홍익 AI 버튼을 눌러 엽니다.

화면 위쪽 가운데의 **DEMO** 막대에서 재생 속도(1×, 2×, 4×), 상황 발생으로 건너뛰기, 처음으로 돌아가기를 쓸 수 있습니다. `?demobar=0`을 붙이면 숨겨집니다.

## 로컬에서 실행

```bash
npm run dev        # http://localhost:5173
```

Node 18 이상만 있으면 되고 설치할 패키지는 없습니다.

## 어디를 고치면 되나

디자인 작업은 대부분 아래 파일에서 합니다.

| 파일 | 내용 |
| --- | --- |
| `public/navigation.html` | 내비 전체 레이아웃과 3D 도로 화면 |
| `public/cockpit.css` | 내비 기본 스타일 (상단 바, 지도, 속도, 음악) |
| `public/nurec-nav.css` | 주행 설정 패널, 출발 버튼 |
| `public/midterm-panel.css`, `midterm-panel.js` | 홍익 AI 알림, 설명, 선택지, 카운트다운, 결과 화면 |
| `public/index.html` | 시나리오 선택 화면 |
| `public/vendor/PretendardVariable.woff2` | 폰트 |

## 데모 데이터

`public/demo/mock-backend.js`가 연구실 서버(`native_carla.py`) 대신 응답합니다. 실제 주행이 아니라 화면 상태를 보여주기 위한 대본이라, 차량 움직임은 단순화돼 있습니다.
음성 파일과 실제 주행 영상은 원본 저장소에도 없으므로 여기서도 재생되지 않습니다. 결과 화면의 주행 영상 자리는 `public/demo/frame.svg`로 대신합니다.

## 연구실 코드로 반영할 때

이 저장소의 파일 이름은 브라우저 주소 기준입니다. 원본 저장소의 파일과는 아래처럼 대응합니다.

| 여기 | 원본 |
| --- | --- |
| `nurec-nav.js`, `nurec-nav.css` | `navigation.js`, `navigation.css` |
| `midterm-panel.js`, `midterm-panel.css` | `midterm_panel.js`, `midterm_panel.css` |
| `cockpit.js`, `cockpit.css`, `research-events.css` | `course_ui/` 같은 이름 |
| `navigation.html` | `course_ui/index.html` (서버가 스크립트 태그를 덧붙여 조립) |
| `index.html` | `native_home.html` |

나머지 대응표는 `scripts/import_from_lab.py`의 `SERVED`에 있습니다. HTML을 원본에 옮길 때는 맨 앞의 `<script src="/demo/mock-backend.js">` 한 줄을 빼면 됩니다.

원본이 바뀌어 다시 가져오고 싶으면 원본을 옆 폴더에 받은 뒤 `npm run import-lab`을 실행합니다. 이 저장소에서 고친 파일을 덮어쓰니 먼저 커밋해 두세요.
