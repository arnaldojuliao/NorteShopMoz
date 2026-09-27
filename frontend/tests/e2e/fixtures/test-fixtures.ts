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
  /**
   * Preloader de entrada nos testes. O padrão é `skip`: a animação cobre a
   * página durante segundos e só atrasaria as interações. O spec do preloader
   * usa `test.use({ preloader: "show" })` para o ver a correr de verdade.
   */
  preloader: "skip" | "show";
  /** Aplica a opção `preloader` a todos os testes (fixture automática). */
  _preloader: void;
  authenticatedPage: Page;
  adminPage: Page;
  testUser: { email: string; password: string };
};

/**
 * Conta de utilizador exclusiva por worker — os testes em paralelo não
 * partilham o carrinho do servidor (elimina corridas entre workers).
 * Fallback para a conta partilhada se o worker não tiver conta própria.
 */
function workerUser(workerIndex: number): { email: string; password: string } {
  if (workerIndex >= 1 && workerIndex <= 8) {
    return { email: `e2e-worker${workerIndex}@test.com`, password: 'Teste@123' };
  }
  return { email: 'usera@test.com', password: 'Teste@123' };
}

export const test = base.extend<TestFixtures>({
  preloader: ["skip", { option: true }],

  _preloader: [
    async ({ page, preloader }, use) => {
      if (preloader === "skip") {
        // Mesma chave que o script de arranque (/preloader-init.js) consulta
        // antes da primeira pintura: a sentinela "skip" desliga o preloader.
        await page.addInitScript(() => {
          try {
            window.localStorage.setItem("nsm:preloader", "skip");
          } catch {
            /* sem armazenamento: o preloader corre e as ações esperam por ele */
          }
        });
      }
      await use();
    },
    { auto: true },
  ],

  testUser: async ({}, use, testInfo) => {
    // Criado pelo global-setup via POST /api/auth/register.
    await use(workerUser(testInfo.workerIndex));
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
  for (let attempt = 1; attempt <= 3; attempt++) {
    await page.goto('/');
    await expect(page.locator('header')).toBeVisible({ timeout: 20000 });

    // Nota: a hidratação do React pode ainda estar em curso — se o clique não
    // abrir o modal, o loop recomeça (o 2.º attempt encontra a página hidratada).
    const trigger = page.getByRole('button', { name: /entrar/i }).first();
    if (await trigger.isVisible({ timeout: 5000 }).catch(() => false)) {
      await trigger.click();
    } else {
      // Já autenticado de uma tentativa anterior — sessão ativa.
      return;
    }

    const dialog = page.locator('[role="dialog"]').first();
    const opened = await dialog
      .waitFor({ state: 'visible', timeout: 15000 })
      .then(() => true)
      .catch(() => false);
    if (!opened) continue; // hidratação lenta — recomeça

    const emailInput = dialog.locator('input[name="email"]');
    const passwordInput = dialog.locator('input[name="password"]');
    await emailInput.fill(email);
    await passwordInput.fill(password);
    await dialog.locator('button[type="submit"]').click();

    // Sessão ativa = modal fechou E o trigger de login desapareceu do header
    // (substituído pelo avatar/conta do utilizador). Sob carga do dev server
    // o login pode falhar (timeout) — repete até 3x.
    const modalClosed = await dialog
      .waitFor({ state: 'hidden', timeout: 20000 })
      .then(() => true)
      .catch(() => false);
    if (!modalClosed) continue;

    const headerTrigger = page.getByRole('button', { name: /entrar/i }).first();
    if (await headerTrigger.isHidden({ timeout: 5000 }).catch(() => false)) return;

    // Header ainda não atualizou — recarrega para revalidar a sessão.
    await page.reload();
    await expect(page.locator('header')).toBeVisible({ timeout: 20000 });
    if (await headerTrigger.isHidden({ timeout: 10000 }).catch(() => false)) return;
    // Sessão realmente não pegou — nova tentativa de login.
  }
  throw new Error(`Login via modal falhou após 3 tentativas (${email}).`);
}

export { expect };
