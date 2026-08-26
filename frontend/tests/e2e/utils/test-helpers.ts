import { Page, expect } from '@playwright/test';

export async function waitForPageLoad(page: Page) {
  await page.waitForLoadState('networkidle');
  await page.waitForLoadState('domcontentloaded');
}

export async function fillAndSubmit(page: Page, selector: string, value: string) {
  await page.fill(selector, value);
  await page.press(selector, 'Enter');
}

export async function clickAndWait(page: Page, selector: string) {
  await page.click(selector);
  await waitForPageLoad(page);
}

export async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await waitForPageLoad(page);
  
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await waitForPageLoad(page);
  
  // Verifica se logou (redireciona para home ou dashboard)
  await expect(page).toHaveURL(/\/(?:configuracoes|admin|$)/);
}

export async function register(page: Page, userData: {
  fullName: string;
  email: string;
  password: string;
  phone?: string;
}) {
  await page.goto('/registro');
  await waitForPageLoad(page);
  
  await page.fill('input[name="fullName"]', userData.fullName);
  await page.fill('input[name="email"]', userData.email);
  await page.fill('input[name="password"]', userData.password);
  if (userData.phone) {
    await page.fill('input[name="phone"]', userData.phone);
  }
  await page.click('button[type="submit"]');
  await waitForPageLoad(page);
}

export async function addToCart(page: Page, productSelector: string) {
  await page.click(productSelector);
  await waitForPageLoad(page);
  await page.click('button:has-text("Adicionar ao carrinho")');
  await page.waitForSelector('[data-testid="cart-count"]', { timeout: 5000 });
}

export async function checkout(page: Page, addressData: {
  fullName: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  province: string;
  paymentMethod: string;
}) {
  await page.goto('/checkout');
  await waitForPageLoad(page);
  
  await page.fill('input[name="fullName"]', addressData.fullName);
  await page.fill('input[name="phone"]', addressData.phone);
  await page.fill('input[name="email"]', addressData.email);
  await page.fill('input[name="address"]', addressData.address);
  await page.fill('input[name="city"]', addressData.city);
  await page.selectOption('select[name="province"]', addressData.province);
  await page.click(`input[name="paymentMethod"][value="${addressData.paymentMethod}"]`);
  await page.click('button:has-text("Finalizar compra")');
  await waitForPageLoad(page);
}

export async function goToAdmin(page: Page) {
  await page.goto('/admin');
  await waitForPageLoad(page);
  await expect(page.locator('h1')).toContainText('Administração');
}

export function generateTestEmail(prefix = 'test'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

export function generateTestUser() {
  const email = generateTestEmail();
  return {
    fullName: 'Test User',
    email,
    password: 'Teste@123',
    phone: '+258840000000',
  };
}