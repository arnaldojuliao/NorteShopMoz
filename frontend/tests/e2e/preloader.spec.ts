import { test, expect } from './fixtures/test-fixtures';

/**
 * Preloader de entrada (camião de contentor a levar a logomarca até ao destino;
 * no fim, camião e estrada saem e entra o círculo com o visto).
 *
 * A fixture `_preloader` desliga-o nos restantes testes; aqui pede-se o
 * contrário (`preloader: "show"`) para o ver a correr de verdade.
 */
test.use({ preloader: 'show' });

test.describe('preloader de entrada', () => {
  test('faz a viagem, mostra o visto grande e revela a loja sozinho', async ({ page }) => {
    await page.goto('/');

    const loader = page.locator('.nsm-preloader');
    await expect(loader).toBeVisible();

    // Camião (SVG) e barra de progresso (estrada) fazem parte da animação.
    await expect(page.getByRole('img', { name: /camião de entrega/i })).toBeVisible();
    await expect(page.getByRole('progressbar')).toBeVisible();

    // Chega ao destino sem qualquer interação: o camião sai de cena e entra o
    // círculo de confirmação com "Entrega concluída!".
    await expect(page.getByText('Entrega concluída!')).toBeVisible({ timeout: 20000 });
    await expect(loader).toBeHidden({ timeout: 20000 });

    // O site fica utilizável: o conteúdo voltou e o scroll está livre.
    await expect(page.locator('header')).toBeVisible();
    await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
  });

  test('pode ser saltado com o botão "Saltar introdução"', async ({ page }) => {
    await page.goto('/');

    const loader = page.locator('.nsm-preloader');
    await expect(loader).toBeVisible();

    await page.getByRole('button', { name: /saltar introdução/i }).click();
    await expect(loader).toBeHidden({ timeout: 5000 });
    await expect(page.locator('header')).toBeVisible();
  });

  test('visita repetida no mesmo dia corre a versão curta', async ({ page }) => {
    // Primeira visita completa marca o seen com validade de um dia.
    await page.goto('/');
    await expect(page.locator('.nsm-preloader')).toBeVisible();
    await expect(page.locator('.nsm-preloader')).toBeHidden({ timeout: 20000 });

    // A segunda (mesma página, novo carregamento) deve ser a curta. O modo é
    // decidido pelo /preloader-init.js ANTES da primeira pintura e exposto em
    // `data-preloader-mode` — assere-se isso, e não um cronómetro: medir
    // `Date.now()` à volta do `reload()` media o carregamento da página (rede,
    // SSR, hidratação) e sob carga dava >5 s com a animação curta correta.
    await page.reload();
    const loader = page.locator('.nsm-preloader');
    await expect(loader).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-preloader-mode', 'short');
    // E, de facto, sai antes de a viagem completa terminar (2,4 s + espera + fade).
    await expect(loader).toBeHidden({ timeout: 6000 });
  });
});
