import { test, expect } from './fixtures/test-fixtures';

const PRODUCT_URL = '/produto/capa-para-iphone';

/**
 * Adiciona o produto de teste ao carrinho a partir da página de detalhe.
 * O carrinho do utilizador de teste persiste no servidor entre corridas —
 * as asserções nunca assumem um total fixo, apenas que aumenta/é positivo.
 */
async function addTestProductToCart(page: import('@playwright/test').Page): Promise<void> {
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

test.describe('Checkout Flow', () => {
  // Serializado: os testes partilham o carrinho do mesmo utilizador de teste.
  test.describe.configure({ mode: 'serial' });
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should add product to cart', async ({ authenticatedPage }) => {
    await addTestProductToCart(authenticatedPage);

    // O item aparece na página do carrinho.
    await authenticatedPage.goto('/carrinho');
    await expect(authenticatedPage.locator('text=Capa para iPhone').first()).toBeVisible({
      timeout: 15000,
    });
  });

  test('should update cart quantity', async ({ authenticatedPage }) => {
    await addTestProductToCart(authenticatedPage);

    await authenticatedPage.goto('/carrinho');
    // O QuantityPicker tem botões +/− com aria-label e o valor num <span>.
    const picker = authenticatedPage.locator('button[aria-label="Aumentar quantidade"]').first();
    await expect(picker).toBeVisible({ timeout: 15000 });
    const quantity = async () =>
      Number(await picker.locator('xpath=preceding-sibling::span[1]').textContent());
    const qtyBefore = await quantity();

    await picker.click();

    // O incremento é persistido no servidor (PUT /api/cart): o valor só muda
    // depois da resposta. Esperar pela atualização evita ler o DOM antes de o
    // carrinho ser gravado (era intermitente).
    await expect.poll(quantity, { timeout: 15000 }).toBe(qtyBefore + 1);
  });

  test('should remove item from cart', async ({ authenticatedPage }) => {
    await addTestProductToCart(authenticatedPage);

    await authenticatedPage.goto('/carrinho');
    const productName = authenticatedPage.locator('text=Capa para iPhone').first();
    await expect(productName).toBeVisible({ timeout: 15000 });

    // Remove a primeira ocorrência do produto de teste.
    const removeButton = authenticatedPage
      .locator('button[aria-label*="Remover"]')
      .first();
    await removeButton.click();

    // O carrinho fica vazio OU com menos instâncias do produto removido.
    const emptyState = authenticatedPage.getByText(/carrinho.*vaz/i).first();
    const remaining = await authenticatedPage.locator('text=Capa para iPhone').count();
    const isEmpty = await emptyState.isVisible().catch(() => false);
    if (!isEmpty) {
      expect(remaining).toBeLessThan(1);
    }
  });

  test('should complete checkout as guest', async () => {
    test.skip(true, 'Skipping due to flaky selectors');
  });

  test('should complete checkout as authenticated user', async () => {
    test.skip(true, 'Requires online payment gateway simulation stability');
  });
});

test.describe('Cart Persistence', () => {
  test('should persist cart across page reloads', async ({ authenticatedPage }) => {
    await addTestProductToCart(authenticatedPage);

    // Recarrega — o carrinho sincronizado com o servidor/localStorage mantém os itens.
    await authenticatedPage.reload();
    await expect
      .poll(
        async () => {
          const label = await authenticatedPage
            .locator('a[href="/carrinho"]')
            .first()
            .getAttribute('aria-label');
          const m = (label ?? '').match(/(\d+)/);
          return m ? Number(m[1]) : 0;
        },
        { timeout: 15000 },
      )
      .toBeGreaterThan(0);
  });
});
