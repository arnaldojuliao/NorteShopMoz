/*
 * Decide se o preloader de entrada corre — executado no <head>, antes da
 * primeira pintura. Fica em /public (e não inline) pela mesma razão do
 * theme-init.js: a CSP não permite scripts inline e `script-src 'self'` cobre
 * este ficheiro.
 *
 * Modos (atributo data-preloader-mode no <html>, lido pelo DeliveryLoader):
 *   full  — primeira visita do dia (ou passadas ~20h): viagem completa;
 *   short — visita repetida no mesmo dia: versão curta (~1s), "um silk" da
 *           marca sem atrasar quem já conhece a loja.
 * Desligado (sem atributo → o overlay fica escondido por CSS):
 *   - `prefers-reduced-motion: reduce`: o site aparece de imediato;
 *   - sentinela "skip" na chave (usada pelos testes E2E).
 *
 * Uma falha aqui nunca deixa a página presa atrás do preloader.
 */
(function () {
  var SEEN_KEY = "nsm:preloader";
  var VALIDITY_MS = 20 * 60 * 60 * 1000; // "um dia" de visitas
  try {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var raw = window.localStorage.getItem(SEEN_KEY);
    if (raw === "skip") return;
    var seenAt = parseInt(raw || "", 10);
    var mode =
      Number.isFinite(seenAt) && Date.now() - seenAt < VALIDITY_MS ? "short" : "full";
    document.documentElement.setAttribute("data-preloader", "on");
    document.documentElement.setAttribute("data-preloader-mode", mode);
    // Marca a visita já: recarregar a meio da animação não a repete completa.
    window.localStorage.setItem(SEEN_KEY, String(Date.now()));
  } catch {
    /* armazenamento bloqueado (modo privado, cookies off) — mostra o site */
  }
})();
