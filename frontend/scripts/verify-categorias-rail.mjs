import { chromium } from "@playwright/test";

const BASE = "http://localhost:3000";
const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FALHA"}  ${name}${detail ? "  — " + detail : ""}`);
}

const browser = await chromium.launch({ channel: "chrome" });

// ── Mobile ──────────────────────────────────────────────────────
{
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "pt-MZ" });
  const p = await c.newPage();

  await p.goto(BASE + "/categorias", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(2200);

  // 1) O carril de categorias existe e tem 17 itens.
  const rail = await p.evaluate(() => {
    const aside = document.querySelector("aside nav[aria-label=\"Categorias\"]");
    if (!aside) return { existe: false, itens: 0, sticky: false, scrollavel: false };
    const cs = getComputedStyle(aside);
    return {
      existe: true,
      itens: aside.querySelectorAll("button").length,
      sticky: cs.position === "sticky",
      scrollavel: cs.overflowY === "auto" || cs.overflowY === "scroll",
      visivel: aside.getClientRects().length > 0,
    };
  });
  check("mobile /categorias: carril com 17 categorias", rail.existe && rail.itens === 17, `itens=${rail.itens} visivel=${rail.visivel}`);
  check("mobile /categorias: carril fixo (sticky) com scroll próprio", rail.sticky && rail.scrollavel, `sticky=${rail.sticky} overflowY=${rail.scrollavel}`);

  // 1b) Estando fixo, a base do carril não fica tapada pelo menu inferior.
  await p.evaluate(() => window.scrollTo(0, 600));
  await p.waitForTimeout(400);
  const gap = await p.evaluate(() => {
    const rail = document.querySelector('aside nav[aria-label="Categorias"]');
    const nav = document.querySelector('nav[aria-label="Navegação principal"]');
    if (!rail || !nav) return -1;
    return Math.round(nav.getBoundingClientRect().top - rail.getBoundingClientRect().bottom);
  });
  check("mobile /categorias: carril não tapado pelo menu inferior", gap >= 0, `gap=${gap}px`);
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.waitForTimeout(300);

  // 2) A faixa de categorias do cabeçalho está OCULTA em /categorias.
  const faixaOculta = await p.evaluate(() => {
    const h = [...document.querySelectorAll("header")].find((x) => x.getClientRects().length > 0);
    if (!h) return true;
    const strip = h.querySelector('nav[aria-label="Categorias"]');
    return !strip || strip.getClientRects().length === 0;
  });
  check("mobile /categorias: faixa de categorias do header oculta", faixaOculta);

  // 3) Numa outra rota a faixa do header continua presente.
  await p.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(1800);
  const faixaNaHome = await p.evaluate(() => {
    const h = [...document.querySelectorAll("header")].find((x) => x.getClientRects().length > 0);
    const strip = h?.querySelector('nav[aria-label="Categorias"]');
    return !!strip && strip.getClientRects().length > 0;
  });
  check("mobile /: faixa de categorias do header presente", faixaNaHome);

  await p.goto(BASE + "/categorias", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(2000);
  await p.screenshot({ path: "/tmp/nsm-verify/m-categorias-rail.png", fullPage: false });

  // 4) Todos os tiles (visão Todos + subcategorias) não dão 404.
  const hrefs = await p.evaluate(() => [...document.querySelectorAll("main a[href]")].map((a) => a.getAttribute("href")));
  const unicos = [...new Set(hrefs)];
  let falhas404 = [];
  for (const href of unicos) {
    const url = href.startsWith("http") ? href : BASE + href;
    const res = await p.request.get(url);
    if (res.status() >= 400) falhas404.push(`${res.status()} ${href}`);
  }
  check("mobile /categorias: todos os tiles ligam a destinos válidos", falhas404.length === 0, `tiles=${unicos.length} ${JSON.stringify(falhas404.slice(0, 5))}`);

  // 5) Clicar numa categoria sem catálogo próprio (Desporto) não dá 404.
  await p.evaluate(() => {
    const btn = [...document.querySelectorAll("aside nav button")].find((b) => /Desporto/.test(b.textContent ?? ""));
    btn?.click();
  });
  await p.waitForTimeout(600);
  const desportoTiles = await p.evaluate(() => [...document.querySelectorAll("main a[href]")].map((a) => a.getAttribute("href")));
  let falhasDesporto = [];
  for (const href of [...new Set(desportoTiles)]) {
    const res = await p.request.get(BASE + href);
    if (res.status() >= 400) falhasDesporto.push(`${res.status()} ${href}`);
  }
  check("mobile: categoria Desporto (sem catálogo) sem 404", falhasDesporto.length === 0, `tiles=${desportoTiles.length} ${JSON.stringify(falhasDesporto)}`);

  await c.close();
}

await browser.close();
const falhas = results.filter((r) => !r.ok);
console.log(`\n${results.length - falhas.length}/${results.length} verificações passaram`);
process.exit(falhas.length ? 1 : 0);
