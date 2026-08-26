import { test, expect } from './fixtures/test-fixtures';

test.describe('Admin Dashboard', () => {
  test.beforeEach(async ({ adminPage }) => {
    await adminPage.goto('/admin');
    await adminPage.waitForLoadState('domcontentloaded');
  });

  test('should display admin dashboard', async ({ adminPage }) => {
    // Autenticado como admin → o painel mostra "Gestão de pedidos".
    await expect(adminPage.getByRole('heading', { name: 'Gestão de pedidos' })).toBeVisible({
      timeout: 15000,
    });
  });

  test('should display orders section when logged in as admin', async ({ adminPage }) => {
    const ordersTab = adminPage.locator('button:has-text("Pedidos")').first();
    await expect(ordersTab).toBeVisible({ timeout: 10000 });
    // Filtros por estado visíveis (chips "Todos", "Pedido recebido", …).
    await expect(adminPage.locator('button:has-text("Todos")').first()).toBeVisible({
      timeout: 10000,
    });
  });

  test('should show products tab when admin', async ({ adminPage }) => {
    const productsTab = adminPage.locator('button:has-text("Publicar produto")').first();
    await expect(productsTab).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Admin - Navigation', () => {
  test('should handle navigation gracefully', async ({ adminPage }) => {
    await adminPage.goto('/admin');
    await expect(adminPage.getByRole('heading', { level: 1 }).first()).toBeVisible({
      timeout: 15000,
    });
  });
});
