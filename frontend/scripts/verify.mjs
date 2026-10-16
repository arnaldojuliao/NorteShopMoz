import { chromium } from "@playwright/test";
import fs from "node:fs";

const OUT = "/tmp/nsm-verify";
fs.mkdirSync(OUT, { recursive: true });
const BASE = "http://localhost:3000";
const browser = await chromium.launch({ channel: "chrome" });

async function ctx(viewport, isMobile) {
  const c = await browser.newContext({ viewport, isMobile, hasTouch: isMobile, locale: "pt-MZ" });
  await c.addInitScript(() => {
    try { localStorage.setItem("nsm:preloader:last", String(Date.now())); } catch {}
  });
  return c;
}

async function clean(p) {
  await p.evaluate(() => {
    document.documentElement.removeAttribute("data-preloader");
    document.querySelectorAll(".nsm-preloader").forEach((n) => n.remove());
    document.body.classList.remove("nsm-booting");
  });
}

// ── 1. Telemóvel: primeira dobra + carrinho vazio + add-to-cart sem login ──
{
  const c = await ctx({ width: 390, height: 844 }, true);
  const p = await c.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e).slice(0, 120)));
  await p.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(2000);
  await clean(p);
  const m = await p.evaluate(() => {
    const r = (sel) => { const e = document.querySelector(sel); return e ? Math.round(e.getBoundingClientRect().height) : null; };
    const card = document.querySelector('a[href*="/produto/"]');
    return {
      header: r("header"),
      primeiroProduto: card ? Math.round(card.getBoundingClientRect().top) : null,
      viewport: window.innerHeight,
      h1s: document.querySelectorAll("h1").length,
    };
  });
  console.log("MOBILE home:", JSON.stringify(m), "| pct do ecrã:", (m.primeiroProduto / m.viewport * 100).toFixed(0) + "%");
  await p.screenshot({ path: `${OUT}/m-home.png` });
  await p.screenshot({ path: `${OUT}/m-home-full.png`, fullPage: true });

  // adicionar ao carrinho sem sessão
  await p.goto(BASE + "/produto/smartwatch", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(1500); await clean(p);
  await p.locator("button", { hasText: "Adicionar ao carrinho" }).first().click();
  await p.waitForTimeout(2500);
  const addResult = await p.evaluate(() => ({
    modalLogin: !!document.body.innerText.match(/Entrar para acompanhar pedidos/),
    texto: document.body.innerText.replace(/\n+/g, " | ").slice(0, 160),
  }));
  console.log("ADD-TO-CART convidado → modal de login?", addResult.modalLogin);
  await p.screenshot({ path: `${OUT}/m-pos-add.png` });

  await p.goto(BASE + "/carrinho", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(2000); await clean(p);
  const cart = await p.evaluate(() => document.body.innerText.replace(/\n+/g, " | ").slice(0, 260));
  console.log("CARRINHO:", cart);
  console.log("  tem 'Esvaziar'?", /Esvaziar/.test(cart), "| tem '120 MT'?", /120 MT/.test(cart));
  await p.screenshot({ path: `${OUT}/m-carrinho.png`, fullPage: true });

  // checkout acessível sem sessão
  await p.goto(BASE + "/checkout", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(2500); await clean(p);
  console.log("CHECKOUT url (sem sessão):", p.url());
  const co = await p.evaluate(() => document.body.innerText.replace(/\n+/g, " | ").slice(0, 200));
  console.log("CHECKOUT texto:", co);
  await p.screenshot({ path: `${OUT}/m-checkout.png`, fullPage: true });

  // explorar sem query
  await p.goto(BASE + "/explore", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(2000); await clean(p);
  console.log("EXPLORE sem query:", (await p.evaluate(() => document.body.innerText.replace(/\n+/g, " | "))).slice(0, 160));
  await p.screenshot({ path: `${OUT}/m-explore.png` });

  // pedidos sem sessão → deve ter h1
  await p.goto(BASE + "/pedidos", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(2000); await clean(p);
  console.log("PEDIDOS h1:", await p.evaluate(() => [...document.querySelectorAll("h1")].map((h) => h.textContent.trim())));
  console.log("erros de página:", errs.slice(0, 3));

  await c.close();
}

// ── 2. Desktop: carrinho com navegação, checkout, categorias ──
{
  const c = await ctx({ width: 1440, height: 900 }, false);
  const p = await c.newPage();
  for (const [name, path] of [["carrinho", "/carrinho"], ["checkout", "/checkout"], ["categorias", "/categorias"], ["categoria", "/categoria/telemoveis"], ["explore", "/explore"]]) {
    await p.goto(BASE + path, { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(1800); await clean(p);
    const info = await p.evaluate(() => ({
      header: !!document.querySelector("header"),
      h1: [...document.querySelectorAll("h1")].map((h) => h.textContent.trim()).slice(0, 2),
      navLinks: document.querySelectorAll("header a").length,
    }));
    console.log(`DESKTOP ${name}:`, JSON.stringify(info));
    await p.screenshot({ path: `${OUT}/d-${name}.png` });
  }
  await c.close();
}

await browser.close();
