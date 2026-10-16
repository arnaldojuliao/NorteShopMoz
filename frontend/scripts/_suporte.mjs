import { chromium } from "@playwright/test";
const b = await chromium.launch({ channel: "chrome" });
const c = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const p = await c.newPage();
const errs = [];
p.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 120)); });
for (let i = 0; i < 3; i++) {
  await p.goto("http://localhost:3000/suporte", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(2000);
  const r = await p.evaluate(() => {
    const all = [...document.querySelectorAll("header")];
    const vis = all.filter((h) => h.getClientRects().length > 0);
    return { total: all.length, visiveis: vis.length, altura: vis[0] ? Math.round(vis[0].getBoundingClientRect().height) : 0 };
  });
  console.log(`run${i + 1}:`, JSON.stringify(r));
}
console.log("erros:", JSON.stringify(errs.slice(0, 3)));
await b.close();
