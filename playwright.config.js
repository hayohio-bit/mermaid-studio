import { defineConfig } from '@playwright/test'

// 변환기 회귀를 잡는 헤드리스 스모크 테스트 설정.
// 변환기는 mermaid가 그린 SVG의 좌표·id를 읽으므로 브라우저 없이는 검증할 수 없다.
// 개발 서버를 직접 띄우고(포트는 vite.config.js가 고정), 로컬에서 이미 떠 있으면 재사용한다.
export default defineConfig({
  testDir: 'e2e',
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:5199',
    // 사이드바(280px)·캔버스·편집 패널(260px)이 한 화면에 들어오는 폭. 스크린샷 기준 크기와 같다.
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5199',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
