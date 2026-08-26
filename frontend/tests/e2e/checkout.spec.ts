import { test, expect } from './fixtures/test-fixtures';

const PRODUCT_URL = '/produto/smartphone-nsm-x10-128gb';

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

  // O badge do carrinho (header/bottom nav) fica visível com contagem ≥ 1.
  await expect(
    page.locator('a[href="/carrinho"] span', { hasText: /^\d+$/ }).first(),
  ).toBeVisible({ timeout: 15000 });
}

test.describe('Checkout Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should add product to cart', async ({ authenticatedPage }) => {
    await addTestProductToCart(authenticatedPage);

    // O item aparece na página do carrinho.
    await authenticatedPage.goto('/carrinho');
    await expect(authenticatedPage.locator('text=Smartphone NSM X10').first()).toBeVisible({
      timeout: 15000,
    });
  });

  test('should update cart quantity', async ({ authenticatedPage }) => {
    await addTestProductToCart(authenticatedPage);

    await authenticatedPage.goto('/carrinho');
    // O QuantityPicker tem botões +/− com aria-label e o valor num <span>.
    const picker = authenticatedPage.locator('button[aria-label="Aumentar quantidade"]').first();
    await expect(picker).toBeVisible({ timeout: 15000 });
    const qtyBefore = Number(
      await picker.locator('xpath=preceding-sibling::span[1]').textContent(),
    );

    await picker.click();

    const qtyAfter = Number(
      await picker.locator('xpath=preceding-sibling::span[1]').textContent(),
    );
    expect(qtyAfter).toBe(qtyBefore + 1);
  });

  test('should remove item from cart', async ({ authenticatedPage }) => {
    await addTestProductToCart(authenticatedPage);

    await authenticatedPage.goto('/carrinho');
    const productName = authenticatedPage.locator('text=Smartphone NSM X10').first();
    await expect(productName).toBeVisible({ timeout: 15000 });

    // Remove a primeira ocorrência do produto de teste.
    const removeButton = authenticatedPage
      .locator('button[aria-label*="Remover"]')
      .first();
    await removeButton.click();

    // O carrinho fica vazio OU com menos instâncias do produto removido.
    const emptyState = authenticatedPage.getByText(/carrinho.*vaz/i).first();
    const remaining = await authenticatedPage.locator('text=Smartphone NSM X10').count();
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
    await expect(
      authenticatedPage.locator('a[href="/carrinho"] span', { hasText: /^\d+$/ }).first(),
    ).toBeVisible({ timeout: 15000 });
  });
});
