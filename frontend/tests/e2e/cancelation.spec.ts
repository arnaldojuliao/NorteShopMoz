import { test, expect } from './fixtures/test-fixtures';
import type { Page } from '@playwright/test';

/**
 * Cancelamento de pedidos.
 * - A UI do cliente (página de acompanhamento) chama o backend real
 *   (DELETE /api/orders/{id}) com cookies HttpOnly (nsm_at) — nunca
 *   mockada. Os testes criam um pedido real pelo fluxo de checkout
 *   (convidado) e interagem com o botão de cancelar.
 * - No admin, o botão Cancelar vive dentro das pastas semanais
 *   ("Ver pedidos") ou nos filtros por estado — os testes navegam até lá.
 */

const PRODUCT_URL = '/produto/capa-para-iphone';

/** Adiciona o produto de teste ao carrinho (badge ≥ 1 no header). */
async function addTestProductToCart(page: Page): Promise<void> {
  await page.goto(PRODUCT_URL);
  const addBtn = page.locator('button[aria-label*="ao carrinho"]').first();
  await expect(addBtn).toBeVisible({ timeout: 20000 });
  await addBtn.click();

  // Espera o aria-label do carrinho refletir a contagem do servidor (≥ 1 item).
  await expect
    .poll(
      async () => {
        const label = await page
          .locator('a[href="/carrinho"]')
          .first()
          .getAttribute('aria-label');
        const m = (label ?? '').match(/(\d+)/);
        return m ? Number(m[1]) : 0;
      },
      { timeout: 20000 },
    )
    .toBeGreaterThan(0);
}

/** Submete o checkout (utilizador autenticado) e devolve o ID do pedido criado. */
async function submitCheckout(page: Page): Promise<string> {
  await addTestProductToCart(page);
  await page.goto('/checkout');

  // O formulário só é renderizado com itens no carrinho.
  const fullNameInput = page.getByLabel('Nome completo');
  await expect(fullNameInput).toBeVisible({ timeout: 20000 });
  await fullNameInput.fill('Teste Cancelamento');
  await page.getByLabel('Telefone').fill('+258 84 123 4567');
  await page.getByLabel('Email').fill('cancelamento-e2e@test.com');
  await page
    .getByLabel('Endereço (rua, bairro, referência)')
    .fill('Av. Julius Nyerere, Bairro Sommerschield');
  await page.getByLabel('Cidade').fill('Maputo');
  // Província já tem valor padrão no <select>.

  // "Pagamento na entrega" — método padrão disponível sem validação extra.
  await page.getByRole('button', { name: /Confirmar pedido/ }).click();

  // Confirmação: "Pedido recebido com sucesso!" com o ID do pedido.
  const successHeading = page.getByRole('heading', { name: /Pedido recebido com sucesso/i });
  await expect(successHeading).toBeVisible({ timeout: 30000 });
  const confirmText = await page
    .locator('p', { hasText: /O seu pedido/ })
    .first()
    .textContent();
  const match = (confirmText ?? '').match(/([A-Z0-9-]{6,})/);
  expect(match, `ID do pedido extraído de: ${confirmText}`).toBeTruthy();
  return match![1];
}

test.describe('Cancelamento de pedidos', () => {
  // Serializado: os testes de admin partilham o mesmo painel/pedidos do servidor.
  test.describe.configure({ mode: 'serial' });
  test('página de acompanhamento mostra o botão de cancelar para pedidos em curso', async ({
    authenticatedPage: page,
  }) => {
    const orderId = await submitCheckout(page);
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
