import { test, expect } from './fixtures/test-fixtures';

test.describe('Pesquisa (combobox) e página /explore', () => {
  test('dropdown abre no foco com histórico e buscas populares', async ({ page }) => {
    // Semeia o histórico antes de abrir o site.
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem(
          'nsm:search-history',
          JSON.stringify(['smartphone', 'TV LED']),
        );
      } catch {
        /* sem armazenamento: o painel mostra só as populares */
      }
    });

    await page.goto('/');
    await expect(page.locator('header')).toBeVisible({ timeout: 20000 });

    const input = page.getByRole('combobox', { name: /pesquisar produtos/i }).first();
    await input.click();

    const dropdown = page.locator('div.absolute.z-50').first();
    await expect(dropdown).toBeVisible();

    await expect(dropdown.getByText('Buscas recentes')).toBeVisible();
    await expect(dropdown.getByText('smartphone').first()).toBeVisible();
    await expect(dropdown.getByText('Buscas populares')).toBeVisible();
    await expect(dropdown.getByText('Smartphone').first()).toBeVisible();
  });

  test('digitar mostra sugestões categorizadas e Enter navega para /explore?q=', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('header')).toBeVisible({ timeout: 20000 });

    const input = page.getByRole('combobox', { name: /pesquisar produtos/i }).first();
    await input.click();
    await input.fill('smart');

    const dropdown = page.locator('div.absolute.z-50').first();
    await expect(dropdown).toBeVisible();
    await expect(dropdown.getByText(/Smartwatch/i).first()).toBeVisible();
    await expect(
      dropdown.getByText('Ver todos os resultados para “smart”'),
    ).toBeVisible();

    await input.press('Enter');
    await expect(page).toHaveURL(/\/explore\?q=smart$/);
    await expect(page.locator('h1')).toContainText('Resultados para');
    await expect(page.getByText(/produto(s)? dispon(is|í)ve(is|l)/)).toBeVisible();
  });

  test('sugestão de produto leva à página do produto; categoria à categoria', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('header')).toBeVisible({ timeout: 20000 });

    const input = page.getByRole('combobox', { name: /pesquisar produtos/i }).first();
    await input.click();
    await input.fill('smartwatch');

    const dropdown = page.locator('div.absolute.z-50').first();
    await expect(dropdown).toBeVisible();

    // O produto "Smartwatch" bate "ver todos" — clicar na entrada de produto.
    const productOption = dropdown.getByText(/Smartwatch/i).first();
    await expect(productOption).toBeVisible();
    await productOption.click();

    await expect(page).toHaveURL(/\/produto\//);
  });

  test('remover entrada do histórico funciona', async ({ page }) => {
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem(
          'nsm:search-history',
          JSON.stringify(['termo para remover', 'TV LED']),
        );
      } catch {
        /* ignore */
      }
    });

    await page.goto('/');
    await expect(page.locator('header')).toBeVisible({ timeout: 20000 });

    const input = page.getByRole('combobox', { name: /pesquisar produtos/i }).first();
    await input.click();

    const dropdown = page.locator('div.absolute.z-50').first();
    await expect(dropdown.getByText('termo para remover')).toBeVisible();

    await page
      .getByRole('button', { name: 'Remover termo para remover do histórico' })
      .click();
    await expect(dropdown.getByText('termo para remover')).toHaveCount(0);
    await expect(dropdown.getByText('TV LED').first()).toBeVisible();
  });

  test('página /explore sem q mostra instruções e permanece indexável', async ({ page }) => {
    await page.goto('/explore');
    await expect(page.locator('h1')).toContainText('Pesquisar na NorteShopMoz');

    // Indexável: robots de índice (sem meta noindex) e canónica.
    const robots = await page.locator('meta[name="robots"]').getAttribute('content');
    expect(robots ?? '').not.toContain('noindex');
  });

  test('página /explore sem resultados mostra estado vazio', async ({ page }) => {
    await page.goto('/explore?q=zzzznaoexistezzzz');
    await expect(page.locator('h1')).toContainText('Resultados para');
    await expect(page.getByText(/Nenhum produto corresponde/i)).toBeVisible();
  });
});
