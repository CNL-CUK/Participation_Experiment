# CNL 실험 참가 예약

React와 Vite로 만든 예약 프론트엔드이며 Google Sheets와 Google Apps Script를 백엔드로 사용합니다.

## 로컬 실행

1. `.env.example`을 복사해 `.env`를 만듭니다.
2. `VITE_GAS_URL`에 Apps Script 웹 앱 URL을 입력합니다.
3. 아래 명령을 실행합니다.

```bash
npm install
npm run dev
```

## 자주 변경하는 설정

- 화면의 실험 정보와 정책: `src/config.js`
- 실험 일정과 운영 시간: `backend/Code.gs` 상단의 `SCHEDULE`
- 학번 자릿수와 취소 마감: 프론트엔드 `CONFIG`와 백엔드 `POLICY`를 동일하게 유지

## 배포

GitHub 저장소의 Actions secret에 `VITE_GAS_URL`을 등록하고 `main` 브랜치에 push하면 GitHub Pages로 배포됩니다. 저장소 이름은 빌드 시 자동으로 경로에 반영됩니다.
