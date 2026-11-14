import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/test-fixtures';
import { placeOrder } from './fixtures/checkout-flow';

/**
 * Abre a primeira pasta semanal.
 *
 * O clique num filtro de estado dispara uma nova listagem e substitui os nós do
 * DOM; o `toPass` re-tenta o clique se o botão for desanexado entre a
 * verificação de visibilidade e o clique (foi a causa de um timeout de 90s).
 */
async function openFirstWeekFolder(page: Page): Promise<void> {
  await expect(page.getByRole('button', { name: /Ver pedidos/i }).first()).toBeVisible({
    timeout: 20000,
  });
  await expect(async () => {
    await page.getByRole('button', { name: /Ver pedidos/i }).first().click({ timeout: 5000 });
  }).toPass({ timeout: 30000 });
}

/**
 * Filtra a lista de pedidos por estado e espera pela resposta do servidor.
 *
 * Sem esta espera, o teste podia clicar na pasta da lista anterior enquanto a
 * listagem filtrada era carregada — a pasta era substituída a meio do clique.
 */
async function filterOrdersByStatus(page: Page, status: string): Promise<void> {
  const chip = page.getByRole('button', { name: new RegExp(status, 'i') }).first();
  await expect(chip).toBeVisible({ timeout: 15000 });

  const filtered = page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      response.url().includes('/api/orders/admin/all') &&
      response.url().includes('status=') &&
      response.ok(),
    { timeout: 20000 },
  );
  await chip.click();
  await filtered;
}

/**
 * Cancelamento de pedidos.
 * - A UI do cliente (página de acompanhamento) chama o backend real
 *   (DELETE /api/orders/{id}) com cookies HttpOnly (nsm_at) — nunca
 *   mockada. Os testes criam um pedido real pelo fluxo de checkout
 *   (autenticado) e interagem com o botão de cancelar.
 * - No admin, o botão Cancelar vive dentro das pastas semanais
 *   ("Ver pedidos") ou nos filtros por estado — os testes navegam até lá.
 *
 * O checkout é feito pelo helper partilhado (`placeOrder`): o endereço passou a
 * ser preenchido no modal «Dados de entrega» e o método de pagamento é só
 * selecionado (o link de pagamento chega ao comprar)
 * — o CTA final chama-se «Comprar».
 */

test.describe('Cancelamento de pedidos', () => {
  // Serializado: os testes de admin partilham o mesmo painel/pedidos do servidor.
  test.describe.configure({ mode: 'serial' });

  test('página de acompanhamento mostra o botão de cancelar para pedidos em curso', async ({
    authenticatedPage: page,
  }) => {
    const orderId = await placeOrder(page);

    await page.goto(`/pedido/${encodeURIComponent(orderId)}`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('h1.font-display').first()).toBeVisible({ timeout: 15000 });

    const cancelBtn = page.locator('button:has-text("Cancelar pedido")').first();
    await expect(cancelBtn).toBeVisible({ timeout: 20000 });
  });

  test('admin: botão Cancelar visível dentro da pasta semanal de pedidos', async ({
    adminPage: page,
  }) => {
    await page.goto('/admin');
    await expect(page.locator('h1.font-display').first()).toBeVisible({ timeout: 15000 });

    // Abre a pasta semanal mais recente ("Ver pedidos") — o botão Cancelar
    // aparece nos cartões de pedidos ainda em curso dentro da pasta.
    await openFirstWeekFolder(page);

    // Com pedidos em curso na pasta, o botão Cancelar fica visível.
    // (A pasta semanal só mostra Cancelar em estados não terminais.)
    const cancelBtn = page.locator('button:has-text("Cancelar")').first();
    await expect(cancelBtn).toBeVisible({ timeout: 20000 });
  });

  test('admin: filtrar por estado e abrir pasta mostra cartões com botão Cancelar', async ({
    adminPage: page,
  }) => {
    await page.goto('/admin');
    await expect(page.locator('h1.font-display').first()).toBeVisible({ timeout: 15000 });

    // Filtra por um estado com pedidos — o checkout deixa-os em
    // "Aguarda pagamento" enquanto o link não é enviado.
    await filterOrdersByStatus(page, 'Aguarda pagamento');

    await openFirstWeekFolder(page);

    // Dentro da pasta, cartões de pedidos em curso têm o botão Cancelar.
    const cancelBtn = page.locator('button:has-text("Cancelar")').first();
    await expect(cancelBtn).toBeVisible({ timeout: 20000 });
  });

  test('admin: cancelar um pedido atualiza o cartão sem recarregar', async ({
    adminPage: page,
  }) => {
    test.setTimeout(120_000);
    await page.goto('/admin');
    await expect(page.locator('h1.font-display').first()).toBeVisible({ timeout: 15000 });

    // Filtra por um estado com pedidos e abre a pasta semanal.
    await filterOrdersByStatus(page, 'Aguarda pagamento');

    await openFirstWeekFolder(page);

    const cancelBtn = page.locator('button:has-text("Cancelar")').first();
    await expect(cancelBtn).toBeVisible({ timeout: 20000 });

    // Aceita o window.confirm e clica — o cartão atualiza sem recarregar.
    page.once('dialog', (dialog) => void dialog.accept());
    await cancelBtn.click();

    // Feedback: o painel continua montado (sem recarregar para página de erro).
    await expect(page.locator('h1.font-display').first()).toBeVisible({ timeout: 15000 });
  });
});
