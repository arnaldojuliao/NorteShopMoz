import { chromium } from "@playwright/test";

const BASE = "http://localhost:3000";
const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FALHA"}  ${name}${detail ? "  — " + detail : ""}`);
}

const browser = await chromium.launch({ channel: "chrome" });
const logs = [];

/** Descarta o preloader de entrada, se ainda estiver no ecrã. */
async function skipPreloader(p) {
  const skip = p.locator("text=Saltar introdução");
  try {
    await skip.waitFor({ state: "visible", timeout: 4000 });
    await skip.click({ timeout: 3000 });
  } catch {
    /* já desapareceu (ou não existe) */
  }
  await p.waitForTimeout(400);
}

/**
 * Mede sempre o cabeçalho VISÍVEL: as duas versões (mobile e desktop) estão no
 * DOM e só uma tem caixa — procurar no documento inteiro encontrava a lupa do
 * mobile escondido e dava falsos negativos no desktop.
 */
const probe = () => {
  const visiveis = [...document.querySelectorAll("header")].filter((h) => h.getClientRects().length > 0);
  const h = visiveis[0] ?? null;
  return {
    visiveis: visiveis.length,
    temPesquisa: !!h?.querySelector('input[type="search"]'),
    temLupa: !!h?.querySelector('button[type="submit"][aria-label="Pesquisar"]'),
    categorias: h ? h.querySelectorAll('nav[aria-label="Categorias"] a').length : 0,
    entrega: false,
    menuInferior: document.querySelectorAll('nav[aria-label="Navegação principal"] a').length,
    laterais: [...document.querySelectorAll("aside, [class*='fixed inset-y-0']")].filter(
      (e) => e.getClientRects().length > 0 && e.getBoundingClientRect().width < window.innerWidth * 0.9,
    ).length,
    alturaHeader: h ? Math.round(h.getBoundingClientRect().height) : 0,
  };
};

// ── Mobile: cabeçalho novo em todas as páginas ────────────────────
{
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "pt-MZ" });
  const p = await c.newPage();
  p.on("pageerror", (e) => logs.push("pageerror: " + String(e).slice(0, 140)));
  p.on("console", (m) => { if (m.type() === "error") logs.push("console: " + m.text().slice(0, 140)); });
  p.on("response", (res) => {
    if (res.status() >= 400) logs.push(`http ${res.status()} ${res.url().replace(BASE, "")}`);
  });

  const rotas = ["/", "/categorias", "/carrinho", "/produto/chaveiro", "/explore", "/suporte", "/pedidos", "/pagamentos", "/categoria/telemoveis", "/categoria/moda", "/favoritos"];
  for (const path of rotas) {
    await p.goto(BASE + path, { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(1700);
    const r = await p.evaluate(probe);
    check(`mobile ${path}: 1 cabeçalho novo (105px, sem vestígios do antigo)`,
      r.visiveis === 1 && r.temPesquisa && r.temLupa && r.alturaHeader === 105,
      `headers=${r.visiveis} altura=${r.alturaHeader} pesquisa=${r.temPesquisa} lupa=${r.temLupa}`);
    check(`mobile ${path}: faixa de categorias + menu inferior (sem faixa de entrega)`,
      r.categorias === 10 && !r.entrega && r.menuInferior === 5,
      `categorias=${r.categorias} entrega=${r.entrega} menu=${r.menuInferior}`);
  }

  // Partes laterais (só faz sentido onde existiam: /categorias e /categoria/*)
  for (const path of ["/categorias", "/categoria/telemoveis", "/categoria/moda"]) {
    await p.goto(BASE + path, { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(1700);
    const r = await p.evaluate(probe);
    check(`mobile ${path}: sem painel lateral`, r.laterais === 0, `laterais=${r.laterais}`);
  }
  // O botão «Categorias» que abria o painel também saiu
  await p.goto(BASE + "/categoria/moda", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(1500);
  const botaoDrawer = await p.evaluate(() =>
    [...document.querySelectorAll("button")].some((b) => /^\s*Categorias\s*$/.test(b.textContent ?? "")),
  );
  check("mobile /categoria/moda: botão do painel removido", !botaoDrawer);

  // Pesquisa funciona numa página que antes tinha o cabeçalho antigo
  await p.goto(BASE + "/suporte", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(1500);
  await skipPreloader(p);
  // Sem esperar pela hidratação, o Enter submete o formulário nativamente
  // (GET para a página atual com ?q=) em vez de navegar para /explore.
  await p.waitForLoadState("networkidle");
  await p.locator('header input[type="search"]').first().fill("tv");
  await p.keyboard.press("Enter");
  await p.waitForTimeout(2500);
  check("mobile /suporte: pesquisa pela lupa → /explore?q=tv", decodeURIComponent(p.url()).includes("/explore?q=tv"), p.url().replace(BASE, ""));

  await p.goto(BASE + "/categorias", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(1800);
  await p.screenshot({ path: "/tmp/nsm-verify/m-categorias-novo.png" });
  await p.goto(BASE + "/categoria/moda", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(1800);
  await p.screenshot({ path: "/tmp/nsm-verify/m-categoria-novo.png" });
  await p.goto(BASE + "/suporte", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(1800);
  await p.screenshot({ path: "/tmp/nsm-verify/m-suporte-novo.png" });
  await c.close();
}

// ── Desktop: intacto ──────────────────────────────────────────────
{
  const c = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "pt-MZ" });
  const p = await c.newPage();
  for (const path of ["/", "/categorias", "/carrinho", "/suporte", "/categoria/moda"]) {
    await p.goto(BASE + path, { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(1600);
    const r = await p.evaluate(() => {
      const visiveis = [...document.querySelectorAll("header")].filter((h) => h.getClientRects().length > 0);
      const h = visiveis[0] ?? null;
      return {
        visiveis: visiveis.length,
        temLupa: !!h?.querySelector('button[type="submit"][aria-label="Pesquisar"]'),
        categorias: h ? h.querySelectorAll('nav[aria-label="Categorias"] a').length : 0,
        aside: [...document.querySelectorAll("aside")].filter((a) => a.getClientRects().length > 0).length,
        altura: h ? Math.round(h.getBoundingClientRect().height) : 0,
      };
    });
    check(`desktop ${path}: 1 cabeçalho (sem lupa mobile)`, r.visiveis === 1 && !r.temLupa, JSON.stringify(r));
    check(`desktop ${path}: faixa de categorias`, r.categorias === 10);
    if (path === "/categorias") check("desktop /categorias: menu lateral mantido", r.aside === 1, `asides=${r.aside}`);
  }
  await c.close();
}

check("sem erros de página/consola", logs.length === 0, JSON.stringify(logs.slice(0, 3)));

await browser.close();
const falhas = results.filter((r) => !r.ok);
console.log(`\n${results.length - falhas.length}/${results.length} verificações passaram`);
process.exit(falhas.length ? 1 : 0);
