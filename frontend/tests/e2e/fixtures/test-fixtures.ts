/* eslint-disable react-hooks/rules-of-hooks */
import { test as base, Page, expect } from '@playwright/test';

/**
 * Fixtures de E2E.
 *
 * O login é feito pelo modal principal da loja (o único fluxo real):
 *  1. Vai à home e clica em "Entrar / Registar-se" no cabeçalho;
 *  2. Preenche o dialog do modal e submete;
 *  3. Considera a sessão ativa quando o botão deixa de estar visível
 *     (o Header mostra o avatar em vez de "Entrar").
 */

type TestFixtures = {
  authenticatedPage: Page;
  adminPage: Page;
  testUser: { email: string; password: string };
};

export const test = base.extend<TestFixtures>({
  testUser: async ({}, use) => {
    // Criado pelo global-setup via POST /api/auth/register.
    await use({ email: 'usera@test.com', password: 'Teste@123' });
  },

  authenticatedPage: async ({ page, testUser }, use) => {
    await loginViaModal(page, testUser.email, testUser.password);
    await use(page);
  },

  adminPage: async ({ page }, use) => {
    // Credenciais criadas pelo DataSeeder do backend.
    await loginViaModal(page, 'admin@norteshopmoz.com', 'Admin@2026');
    await use(page);
  },
});

/** Abre o modal de login a partir do header e autentica. */
async function loginViaModal(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/');
  await expect(page.locator('header')).toBeVisible({ timeout: 20000 });

  const trigger = page.getByRole('button', { name: /entrar/i }).first();
  if (await trigger.isVisible({ timeout: 5000 }).catch(() => false)) {
    await trigger.click();
  } else {
    // Fallback: rota dedicada que abre o modal.
    await page.goto('/entrar');
  }

  const dialog = page.locator('[role="dialog"]').first();
  await expect(dialog).toBeVisible({ timeout: 15000 });

  const emailInput = dialog.locator('input[name="email"]');
  const passwordInput = dialog.locator('input[name="password"]');
  await emailInput.fill(email);
  await passwordInput.fill(password);
  await dialog.locator('button[type="submit"]').click();

  // Sessão ativa = modal fechou E o trigger de login desapareceu do header
  // (substituído pelo avatar/conta do utilizador).
  await expect(dialog).toBeHidden({ timeout: 15000 });
  await expect(
    page.getByRole('button', { name: /entrar/i }).first(),
  ).toBeHidden({ timeout: 15000 });
}

export { expect };
