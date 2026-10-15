import { defineConfig, devices } from '@playwright/test';

const chromiumPath = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    acceptDownloads: true,
    launchOptions: {
      executablePath: chromiumPath,
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: [
    {
      command: 'npx vite build && npx vite preview --port 4173 --strictPort',
      port: 4173,
      timeout: 180_000,
      reuseExistingServer: false,
    },
    {
      // Integraciones: sin IA (se comprueba el modo local) y música con el proveedor de prueba.
      command: 'npx tsx server/index.ts',
      port: 8787,
      env: { AI_PROVIDER: 'none', MUSIC_PROVIDER: 'mock', MUSIC_DAILY_LIMIT: '5', API_PORT: '8787' },
      reuseExistingServer: false,
    },
  ],
});
