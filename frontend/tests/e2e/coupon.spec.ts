import { test, expect } from './fixtures/test-fixtures';
import type { Page } from '@playwright/test';

const PRODUCT_URL = '/produto/capa-para-iphone';
const VALIDATE_URL = '**/api/orders/validate-coupon';
const COUPON_INPUT = 'input[placeholder="EX: NOVO2024"]';

/**
 * Adiciona o produto de teste ao carrinho. O painel do cupão só é renderizado
 * no checkout quando há itens, por isso este passo é obrigatório.
 */
async function addTestProductToCart(page: Page): Promise<void> {
  await page.goto(PRODUCT_URL);
  const addBtn = page.locator('button[aria-label*="ao carrinho"]').first();
  await expect(addBtn).toBeVisible({ timeout: 20000 });
  await addBtn.click();

  // Espera o aria-label do carrinho refletir a contagem (≥ 1 item).
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
      { timeout: 15000 },
    )
    .toBeGreaterThan(0);
}

test.describe('Cupões no checkout', () => {
  // Serializado: os testes partilham o carrinho do mesmo utilizador de teste.
  test.describe.configure({ mode: 'serial' });
  test('aplica o cupão e mostra o desconto no resumo', async ({ authenticatedPage: page }) => {
    await addTestProductToCart(page);

    // Resposta do backend simulada: o teste foca a ligação do cliente à API
    // (POST com { code, subtotal }) e não depende do backend estar a correr.
    // O corpo tem de usar o envelope { data } — é assim que todas as respostas
    // do backend chegam (o checkout desembrulha `data`) e sem ele o cupão nunca
    // chegava a ser aplicado, fazendo este teste falhar por si próprio.
    const sent: { method?: string; body?: { code?: string; subtotal?: number } } = {};
    await page.route(VALIDATE_URL, async (route) => {
      sent.method = route.request().method();
      sent.body = route.request().postDataJSON() as { code?: string; subtotal?: number };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            code: 'BEMVINDO10',
            discountType: 'PERCENT',
            discountValue: 10,
            discount: 1590,
            minimumSubtotal: 1000,
          },
        }),
      });
    });

    await page.goto('/checkout');
    const input = page.locator(COUPON_INPUT);
    await expect(input).toBeVisible({ timeout: 20000 });

    // O campo normaliza para maiúsculas antes de enviar.
    await input.fill('bemvindo10');
    await page.locator('button:has-text("Aplicar")').first().click();

    // Confirmação na UI: linha do desconto do cupão no resumo.
    await expect(page.getByText(/Cupão aplicado/i).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Cupão \(BEMVINDO10\)/).first()).toBeVisible();

    // Contrato do endpoint: POST com o código e o subtotal.
    // (O desconto é sempre calculado pelo servidor, nunca pelo cliente.)
    expect(sent.method).toBe('POST');
    expect(sent.body?.code).toBe('BEMVINDO10');
    expect(typeof sent.body?.subtotal).toBe('number');
  });

  test('mostra a mensagem do servidor quando o cupão é inválido', async ({
    authenticatedPage: page,
  }) => {
    await addTestProductToCart(page);

    await page.route(VALIDATE_URL, (route) =>
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Cupão inválido ou inexistente' }),
      }),
    );

    await page.goto('/checkout');
    const input = page.locator(COUPON_INPUT);
    await expect(input).toBeVisible({ timeout: 20000 });

    await input.fill('naoexiste');
    await page.locator('button:has-text("Aplicar")').first().click();

    // A mensagem mostrada é a do envelope { error } do backend.
    await expect(page.getByText('Cupão inválido ou inexistente').first()).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText(/Cupão aplicado/i)).toHaveCount(0);
  });
});
