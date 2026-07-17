# 바람길 제주

제주도의 풍향·풍속과 방풍 지형을 고려해 **바람을 덜 맞는 경로**를 비교하는 지도형 반응형 웹 앱입니다. NAVER 지도처럼 지도 위에 길찾기 패널과 컨트롤을 배치했고, 하늘색·바다색·감귤색으로 제주 분위기를 구성했습니다.

## 실행

```bash
cd jeju-wind-route
python3 -m http.server 8080
```

브라우저에서 `http://localhost:8080`을 엽니다. API 키가 없어도 내장 제주 디자인 지도와 데모 데이터로 모든 주요 상호작용을 확인할 수 있습니다.

## 완성된 화면/기능

- 데스크톱 플로팅 검색 패널과 모바일 바텀시트
- 출발지·도착지 입력, 추천 장소, 위치 교환, 현재 위치
- 바람 최소 / 거리·바람 균형 / 가장 빠른 경로 비교
- 경로 시간·거리·바람 노출·방풍 구간 표시
- 제주 SVG 데모 지도, 경로·마커·바람 구간 동적 렌더링
- 바람 레이어와 지도 유형 전환
- 경로 공유 및 브라우저 저장
- 현장 바람 신고 모달과 Google Sheets 저장 연동
- 파비콘, Apple 아이콘, PWA manifest, 서비스 워커
- 키보드 포커스, ARIA, 모바일 safe-area, reduced-motion 대응
- NAVER Maps 키 연결용 어댑터

## Google Sheets 백엔드 연결

1. Google Sheets에서 **확장 프로그램 → Apps Script**를 엽니다.
2. `google-apps-script.gs` 내용을 `Code.gs`에 붙여넣습니다.
3. Apps Script에서 `setupSheets()`를 한 번 실행합니다.
4. **배포 → 새 배포 → 웹 앱**으로 배포합니다.
5. 발급된 `/exec` URL을 `config.js`에 입력합니다.

```js
window.BARAMGIL_CONFIG = Object.freeze({
  NAVER_MAP_KEY_ID: "YOUR_NCP_MAP_KEY_ID",
  API_BASE_URL: "https://script.google.com/macros/s/배포_ID/exec",
  DEMO_MODE: true,
  APP_NAME: "바람길 제주",
});
```

`setupSheets()`가 만드는 시트는 다음과 같습니다.

- `wind_data`: 현재 풍향·풍속·돌풍
- `wind_zones`: 강풍·방풍 구간
- `places`: 추천 장소
- `reports`: 사용자 바람 신고

## NAVER Maps 연결

NAVER Cloud Maps의 Web Dynamic Map Key ID를 `config.js`에 넣고 `DEMO_MODE`를 `false`로 변경합니다.

```js
window.BARAMGIL_CONFIG = Object.freeze({
  NAVER_MAP_KEY_ID: "발급받은_KEY_ID",
  API_BASE_URL: "Google Apps Script /exec URL",
  DEMO_MODE: false,
  APP_NAME: "바람길 제주",
});
```

키를 넣지 않으면 내장 제주 디자인 지도가 계속 사용됩니다.

## 파일 구조

```text
jeju-wind-route/
├─ index.html
├─ styles.css
├─ app.js
├─ config.js
├─ config.example.js
├─ google-apps-script.gs
├─ apps-script/Code.gs
├─ sw.js
├─ site.webmanifest
├─ favicon.svg
├─ favicon-32.png
├─ apple-touch-icon.png
├─ icon-192.png
├─ icon-512.png
└─ assets/logo-mark.svg
```

## 실제 도로 경로 API 연결 시

현재 데모 경로는 화면 검증을 위한 시뮬레이션입니다. 실제 서비스에서는 NAVER Directions 또는 별도 경로 API에서 받은 도로 좌표를 `renderLiveMap()`의 polyline path로 전달하고, 각 구간을 `wind_zones`와 교차 계산하도록 확장하면 됩니다.
