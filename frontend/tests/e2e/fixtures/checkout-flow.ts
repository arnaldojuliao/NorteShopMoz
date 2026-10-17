import { expect, type Page } from '@playwright/test';

/**
 * Fluxos de checkout partilhados pelos specs E2E.
 *
 * O checkout deixou de ter campos de entrega inline: a morada vem do livro de
 * endereços e é editada no modal «Dados de entrega». O pagamento é de SELEÇÃO
 * apenas: o cliente escolhe o método e, ao comprar, é encaminhado para o link
 * de pagamento (página simulada em dev, PaySuite em produção). Estes helpers
 * concentram esse caminho para os specs não o repetirem.
 */

export const TEST_PRODUCT_URL = '/produto/capa-para-iphone';
export const TEST_PRODUCT_NAME = 'Capa para iPhone';
/** Número usado nos dados de entrega (formato aceite pelo servidor). */
export const TEST_PAYMENT_PHONE = '+258 84 123 4567';

/** Adiciona o produto de teste ao carrinho (badge do cabeçalho ≥ 1 item). */
export async function addTestProductToCart(page: Page): Promise<void> {
  await page.goto(TEST_PRODUCT_URL);
  const addBtn = page.locator('button[aria-label*="ao carrinho"]').first();
  await expect(addBtn).toBeVisible({ timeout: 20000 });
  await addBtn.click();

  // Espera o aria-label do carrinho refletir a contagem do servidor.
  await expect
    .poll(
      async () => {
        const label = await page.locator('a[href="/carrinho"]').first().getAttribute('aria-label');
        const m = (label ?? '').match(/(\d+)/);
        return m ? Number(m[1]) : 0;
      },
      { timeout: 20000 },
    )
    .toBeGreaterThan(0);
}

/** Preenche a morada de entrega pelo modal «Dados de entrega» do checkout. */
export async function fillDeliveryAddress(
  page: Page,
  {
    fullName = 'Teste E2E',
    phone = TEST_PAYMENT_PHONE,
    address = 'Av. Julius Nyerere, Bairro Sommerschield',
    city = 'Maputo',
  }: { fullName?: string; phone?: string; address?: string; city?: string } = {},
): Promise<void> {
  await page.getByRole('button', { name: /Adicionar novo endereço/i }).click();

  const dialog = page.getByRole('dialog', { name: 'Dados de entrega' });
  await expect(dialog).toBeVisible({ timeout: 15000 });

  // O modal abre na lista; o formulário aparece a pedido.
  await dialog.getByRole('button', { name: /^Adicionar endereço$/ }).click();
  // Sem `exact`: os campos obrigatórios renderizam `label*` (o asterisco faz
  // parte do nome acessível — ver FieldWrapper em components/ui/Input.tsx).
  await dialog.getByLabel('Identificação (ex.: Casa, Escritório)').fill('Casa');
  await dialog.getByLabel('Nome', { exact: false }).fill(fullName);
  await dialog.getByLabel('Telefone', { exact: false }).fill(phone);
  await dialog.getByLabel('Endereço', { exact: false }).fill(address);
  await dialog.getByLabel('Cidade', { exact: false }).fill(city);
  // A província tem valor por omissão no <select>.
  await dialog.getByRole('button', { name: /Guardar endereço/i }).click();

  await expect(dialog).toBeHidden({ timeout: 15000 });
  // A morada guardada passa a ser a que a encomenda usa.
  await expect(page.getByText(fullName).first()).toBeVisible({ timeout: 15000 });
}

/**
 * Escolhe um método de pagamento — só a seleção: os métodos pagos online usam
 * link de pagamento (checkout hospedado) e não pedem dados no checkout.
 */
export async function choosePaymentMethod(
  page: Page,
  method: 'M-Pesa' | 'e-Mola' | 'mKesh' = 'M-Pesa',
): Promise<void> {
  await page.getByRole('button', { name: method, exact: true }).click();
  await expect(page.getByRole('button', { name: method, exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
    { timeout: 15000 },
  );
}

/**
 * Caminho completo (carrinho → entrega → pagamento → compra) e devolve o ID do
 * pedido. O «Comprar» leva ao ecrã «Aguarde o link de pagamento» (sem
 * redirecionamento automático): o helper lê o ID do pedido no ecrã, abre a
 * página de pagamento simulada pelo link aí disponível, confirma e regressa à
 * loja (página de acompanhamento do pedido).
 */
export async function placeOrder(
  page: Page,
  addressOptions: Parameters<typeof fillDeliveryAddress>[1] = {},
): Promise<string> {
  await addTestProductToCart(page);
  await page.goto('/checkout');
  await fillDeliveryAddress(page, addressOptions);
  await choosePaymentMethod(page);
  await page.getByRole('button', { name: 'Comprar', exact: true }).click();

  // Ecrã «Aguarde o link de pagamento» — o ID do pedido aparece no título/texto.
  await expect(
    page.getByRole('heading', { name: /Aguarde o link de pagamento/i }),
  ).toBeVisible({ timeout: 30000 });
  const summaryText = await page.locator('p', { hasText: /O seu pedido/ }).first().textContent();
  const idMatch = (summaryText ?? '').match(/([A-Z0-9-]{6,})/);
  expect(idMatch, `ID do pedido extraído de: ${summaryText}`).toBeTruthy();
  const orderId = idMatch![1];

  // Pagar pelo link disponível no ecrã (página simulada em dev) e regressar.
  const payLink = page.getByRole('link', { name: /Abrir página de pagamento/i });
  await expect(payLink).toBeVisible({ timeout: 20000 });
  await payLink.click();
  await page.waitForURL(/\/pagamento-simulado/, { timeout: 30000 });
  const confirmBtn = page.getByRole('button', { name: /Confirmar pagamento/i });
  await expect(confirmBtn).toBeVisible({ timeout: 20000 });
  await confirmBtn.click();
  await page.waitForURL(/\/pedido\//, { timeout: 30000 });

  return orderId;
}
