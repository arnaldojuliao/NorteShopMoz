import { chromium } from "@playwright/test";

const BASE = "http://localhost:3000";
const browser = await chromium.launch({ channel: "chrome" });
const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FALHA"}  ${name}${detail ? "  — " + detail : ""}`);
}

const c = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  locale: "pt-MZ",
});
const p = await c.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(String(e).slice(0, 120)));

async function goto(path, wait = 2600) {
  await p.goto(BASE + path, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(wait);
  return p.url().replace(BASE, "");
}

// ── 1. Hero removido da homepage ─────────────────────────────
{
  await goto("/");
  const text = await p.evaluate(() => document.body.innerText);
  for (const frase of [
    "Compre online e receba à sua porta",
    "Ver ofertas de hoje",
    "Compra protegida: devolução gratuita até 90 dias",
    "Pague na entrega — M-Pesa, e-Mola ou dinheiro",
    "Entrega em todo Moçambique",
  ]) {
    check(`hero removido: «${frase}» ausente`, !text.includes(frase));
  }
  const temCatalogo = await p.evaluate(() => !!document.querySelector('a[href*="/produto/"]'));
  check("homepage continua a mostrar catálogo", temCatalogo);
}

// ── 2. Convidado: /checkout e /carrinho não expulsam para / ───
{
  const url1 = await goto("/checkout");
  check("convidado vê /checkout (1.ª visita)", url1 === "/checkout", url1);
  const ls = await p.evaluate(() => window.localStorage.getItem("nsm:user"));
  check("visitar /checkout não cria a marca de sessão", ls == null, String(ls));

  const url2 = await goto("/checkout");
  check("convidado vê /checkout (recarga)", url2 === "/checkout", url2);

  const url3 = await goto("/carrinho");
  check("convidado vê /carrinho", url3 === "/carrinho", url3);
  const h1 = await p.evaluate(() => [...document.querySelectorAll("h1")].map((h) => h.textContent.trim()));
  check("estado de carrinho vazio com h1", h1.includes("O seu carrinho está vazio"), JSON.stringify(h1));

  const url4 = await goto("/pedidos");
  check("/pedidos pede sessão em vez de rebentar", url4 === "/pedidos", url4);
  const h1p = await p.evaluate(() => [...document.querySelectorAll("h1")].map((h) => h.textContent.trim()));
  check("/pedidos tem h1 próprio", h1p.includes("Entre na sua conta"), JSON.stringify(h1p));
}

// ── 3. Convidado adiciona ao carrinho (sem login) ─────────────
{
  await goto("/produto/smartwatch");
  const btn = p.locator("button", { hasText: /adicionar ao carrinho/i }).first();
  const n = await btn.count();
  check("botão «Adicionar ao carrinho» existe", n > 0, `n=${n}`);
  if (n > 0) {
    await btn.click();
    await p.waitForTimeout(2500);
    const dialog = await p.evaluate(() =>
      document.body.innerText.includes("Entrar para acompanhar pedidos") ||
      document.body.innerText.includes("Entrar / Registar"),
    );
    check("adicionar ao carrinho não abre login", !dialog);
    const url = await goto("/carrinho");
    check("/carrinho mantém item adicionado", url === "/carrinho", url);
    const txt = await p.evaluate(() => document.body.innerText.replace(/\n+/g, " | "));
    check("carrinho mostra o produto", /Smartwatch/i.test(txt), txt.slice(0, 120));
    check("carrinho tem ação «Esvaziar»", /Esvaziar/.test(txt));
  }
}

check("sem erros de página", errs.length === 0, JSON.stringify(errs.slice(0, 3)));

await c.close();
await browser.close();

const falhas = results.filter((r) => !r.ok);
console.log(`\n${results.length - falhas.length}/${results.length} verificações passaram`);
process.exit(falhas.length ? 1 : 0);
