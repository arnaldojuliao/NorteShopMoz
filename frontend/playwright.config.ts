import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

/**
 * @see https://playwright.dev/docs/test-configuration
 *
 * Requisitos:
 *  - Frontend em http://localhost:3000 (o webServer arranca `npm run dev` se necessário);
 *  - Backend Spring Boot (porta do .env.local, por padrão http://localhost:8080).
 */

/**
 * Fallback para máquinas onde os binários da versão exata do Playwright ainda
 * não foram baixados (`npx playwright install chromium`): se existir um chromium
 * antigo no cache, usamo-lo em vez de falhar. Em CI (binários garantidos) é ignorado.
 */
function cachedChromium(): string | undefined {
  if (process.env.CI) return undefined;
  const base = join(homedir(), '.cache', 'ms-playwright');
  // Chrome completo primeiro — o headless shell de versões antigas tem
  // incompatibilidades de protocolo com versões novas do Playwright.
  const candidates = [
    join(base, 'chromium-1208', 'chrome-linux64', 'chrome'),
    join(base, 'chromium_headless_shell-1208', 'chrome-headless-shell-linux64', 'chrome-headless-shell'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

const executablePath = cachedChromium();

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  // Timeout folgado: o dev server do Next compila rotas a pedido e a máquina
  // pode estar sob carga (builds simultâneos).
  timeout: 90_000,
  expect: { timeout: 12_000 },
  reporter: [['html', { outputFolder: 'playwright-report' }], ['list']],
  globalSetup: './tests/e2e/global-setup',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(executablePath ? { launchOptions: { executablePath } } : {}),
      },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
