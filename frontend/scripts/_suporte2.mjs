import { chromium } from "@playwright/test";
const b = await chromium.launch({ channel: "chrome" });
const c = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const p = await c.newPage();
await p.goto("http://localhost:3000/suporte", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(2500);
const info = await p.evaluate(() => ({
  title: document.title,
  bodyLen: document.body?.innerText?.length ?? -1,
  bodyHead: (document.body?.innerText ?? "").slice(0, 200),
  headerCount: document.querySelectorAll("header").length,
  mainCount: document.querySelectorAll("main").length,
  nextBody: document.querySelector("#__next") ? "sim" : "nao",
}));
console.log(JSON.stringify(info, null, 2));
await b.close();
