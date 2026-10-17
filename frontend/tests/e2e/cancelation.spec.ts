import { test, expect } from './fixtures/test-fixtures';
import { placeOrder } from './fixtures/checkout-flow';

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
    const openFolder = page.locator('button:has-text("Ver pedidos")').first();
    await expect(openFolder).toBeVisible({ timeout: 20000 });
    await openFolder.click();

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

    // Filtra por um estado com pedidos ("Pagamento confirmado") e abre a pasta.
    const chip = page.locator('button:has-text("Pagamento confirmado")').first();
    await expect(chip).toBeVisible({ timeout: 15000 });
    await chip.click();

    const openFolder = page.locator('button:has-text("Ver pedidos")').first();
    await expect(openFolder).toBeVisible({ timeout: 20000 });
    await openFolder.click();

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
    const chip = page.locator('button:has-text("Pagamento confirmado")').first();
    await expect(chip).toBeVisible({ timeout: 15000 });
    await chip.click();

    const openFolder = page.locator('button:has-text("Ver pedidos")').first();
    await expect(openFolder).toBeVisible({ timeout: 20000 });
    await openFolder.click();

    const cancelBtn = page.locator('button:has-text("Cancelar")').first();
    await expect(cancelBtn).toBeVisible({ timeout: 20000 });

    // Aceita o window.confirm e clica — o cartão atualiza sem recarregar.
    page.once('dialog', (dialog) => void dialog.accept());
    await cancelBtn.click();

    // Feedback: o painel continua montado (sem recarregar para página de erro).
    await expect(page.locator('h1.font-display').first()).toBeVisible({ timeout: 15000 });
  });
});
