import { test, expect } from './fixtures/test-fixtures';
import {
  addTestProductToCart,
  placeOrder,
  TEST_PRODUCT_NAME,
  TEST_PRODUCT_URL,
} from './fixtures/checkout-flow';

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
    await expect(authenticatedPage.locator(`text=${TEST_PRODUCT_NAME}`).first()).toBeVisible({
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
    const productName = authenticatedPage.locator(`text=${TEST_PRODUCT_NAME}`).first();
    await expect(productName).toBeVisible({ timeout: 15000 });

    // Remove a primeira ocorrência do produto de teste.
    const removeButton = authenticatedPage.locator('button[aria-label*="Remover"]').first();
    await removeButton.click();

    // O carrinho fica vazio OU com menos instâncias do produto removido.
    const emptyState = authenticatedPage.getByText(/carrinho.*vaz/i).first();
    const remaining = await authenticatedPage.locator(`text=${TEST_PRODUCT_NAME}`).count();
    const isEmpty = await emptyState.isVisible().catch(() => false);
    if (!isEmpty) {
      expect(remaining).toBeLessThan(1);
    }
  });

  /**
   * Checkout de convidado — o caminho principal da loja (sem conta).
   *
   * Estava desativado com `test.skip(true, 'Skipping due to flaky selectors')`;
   * os «selectors flaky» eram a UI antiga (endereço inline e botão «Confirmar
   * pedido»), substituída pelo modal de endereços e pelo CTA «Comprar». O fluxo
   * real (endereço → pagamento → pedido) corre de ponta a ponta contra a API.
   */
  test('should complete checkout as guest', async ({ page }) => {
    await page.goto(TEST_PRODUCT_URL);
    const orderId = await placeOrder(page);

    // O pedido existe no servidor e é consultável (convidado identifica-se pelo
    // email usado no checkout).
    expect(orderId).toMatch(/^NSM-/);
  });

  /** Checkout de cliente com sessão: o pedido fica ligado à conta. */
  test('should complete checkout as authenticated user', async ({ authenticatedPage }) => {
    await authenticatedPage.goto(TEST_PRODUCT_URL);
    const orderId = await placeOrder(authenticatedPage);

    // A área de conta lista o pedido acabado de criar (pedidos reais da conta).
    await authenticatedPage.goto('/pedidos');
    await expect(authenticatedPage.getByText(orderId).first()).toBeVisible({ timeout: 20000 });
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
