import { test, expect } from './fixtures/test-fixtures';

/**
 * Autenticação pelo modal da loja (o fluxo real).
 *
 * Estes testes estavam reduzidos a `test.skip(true, 'Skipping due to flaky login
 * modal')` com o corpo vazio — o «flaky» era o `locator('header')` ambíguo (a
 * loja renderiza o cabeçalho mobile e o do desktop no DOM), que fazia o fixture
 * de login falhar. Com o seletor corrigido, os testes voltam a correr a sério.
 */

/** Abre o modal de login (o `/entrar` abre-o automaticamente). */
async function openLoginModal(page: import('@playwright/test').Page) {
  await page.goto('/entrar');
  const dialog = page.getByRole('dialog', { name: /Entrar|Criar conta/ }).first();
  await expect(dialog).toBeVisible({ timeout: 20000 });
  return dialog;
}

test.describe('Authentication Flow', () => {
  test('should display login modal via /entrar', async ({ page }) => {
    const dialog = await openLoginModal(page);

    await expect(dialog.locator('input[name="email"]')).toBeVisible();
    await expect(dialog.locator('input[name="password"]')).toBeVisible();
    await expect(dialog.locator('button[type="submit"]')).toBeVisible();
  });

  test('should login with valid credentials', async ({ authenticatedPage }) => {
    // Should be redirected to home or dashboard after login
    await expect(authenticatedPage).toHaveURL(/\/(?:configuracoes|admin|$)/);
  });

  test('should show error for invalid credentials', async ({ page }) => {
    const dialog = await openLoginModal(page);

    await dialog.locator('input[name="email"]').fill('utilizador-inexistente@teste.com');
    await dialog.locator('input[name="password"]').fill('PasswordErrada@123');
    await dialog.locator('button[type="submit"]').click();

    // O servidor responde 401 e a mensagem aparece no próprio modal.
    await expect(dialog.getByRole('alert')).toBeVisible({ timeout: 20000 });
    await expect(dialog.getByRole('alert')).toContainText(/credenciais|inválid/i);
  });

  test('should show validation error for empty fields', async ({ page }) => {
    const dialog = await openLoginModal(page);

    // Os campos são `required`: o browser bloqueia a submissão e o modal fica
    // aberto, com o foco no primeiro campo inválido.
    await expect(dialog.locator('input[name="email"]')).toHaveAttribute('required', '');
    await dialog.locator('button[type="submit"]').click();

    await expect(dialog).toBeVisible();
    await expect(dialog.locator('input[name="email"]')).toBeFocused();
  });

  test('should register new user', async ({ page }) => {
    const dialog = await openLoginModal(page);

    // Muda para o modo de registo (mesmo modal, outro separador).
    await dialog.getByRole('button', { name: 'Criar conta', exact: true }).click();

    const email = `e2e-registo-${Date.now().toString(36)}@teste.com`;
    await dialog.locator('input[name="fullName"]').fill('Utilizador Registo E2E');
    await dialog.locator('input[name="email"]').fill(email);
    await dialog.locator('input[name="password"]').fill('Teste@123');
    await dialog.locator('input[name="confirmPassword"]').fill('Teste@123');
    await dialog.locator('button[type="submit"]').click();

    // Registo bem-sucedido: abre-se um SEGUNDO modal («Conta criada») com o
    // passo de confirmação do email por código — a sessão fica ativa e a conta
    // é criada no servidor.
    const created = page.getByRole('dialog', { name: 'Conta criada' });
    await expect(created).toBeVisible({ timeout: 30000 });
    await expect(created.getByLabel('Código de verificação')).toBeVisible();
  });
});

test.describe('Password Visibility Toggle', () => {
  test('should toggle password visibility', async ({ page }) => {
    const dialog = await openLoginModal(page);
    const password = dialog.locator('input[name="password"]');

    await password.fill('Teste@123');
    await expect(password).toHaveAttribute('type', 'password');

    await dialog.getByRole('button', { name: 'Mostrar palavra-passe' }).first().click();
    await expect(password).toHaveAttribute('type', 'text');

    await dialog.getByRole('button', { name: 'Ocultar palavra-passe' }).first().click();
    await expect(password).toHaveAttribute('type', 'password');
  });
});
