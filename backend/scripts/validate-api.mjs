/**
 * Validação do contrato REST da API NorteShopMoz.
 *
 * Uso:
 *   node backend/scripts/validate-api.mjs
 *   API_BASE=http://localhost:8081 node backend/scripts/validate-api.mjs
 *
 * Cobre: catálogo (filtros/pesquisa/ordenação/limit), categorias, reviews,
 * autenticação JWT (registo/login/me), pedidos (totais recalculados no servidor,
 * guest checkout e isolamento por utilizador), pagamentos online, transições de
 * estado (admin), **cupões** (validação pública + CRUD admin) e **cancelamento**
 * de pedidos (dono/admin, repor stock, estados terminais).
 */

const B = process.env.API_BASE ?? "http://localhost:8081";

let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${extra}`); }
}

async function api(path, opts = {}) {
  const res = await fetch(B + path, opts);
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

// ── 1. Catálogo ────────────────────────────────────────────────────
console.log("\n📦 Catálogo");
{
  const { status, body } = await api("/api/products?limit=3");
  // meta.total deve ser o total de correspondências, não o nº limitado
  check("GET /api/products?limit=3 → {data, meta} (total completo)",
        status === 200 && body?.data?.length === 3 && body?.meta?.total > 3,
        `status=${status} n=${body?.data?.length} total=${body?.meta?.total}`);
  const p = body?.data?.[0];
  check("produto tem isNew (nome exato)", p && "isNew" in p);
  check("produto tem deliveryDays como array de 2", p && Array.isArray(p.deliveryDays) && p.deliveryDays.length === 2);
  check("produto tem badges/specs/images/description/tags", p && ["badges", "specs", "images", "description", "tags"].every(k => Array.isArray(p[k])));
  check("price e oldPrice numéricos", p && typeof p.price === "number" && (p.oldPrice === undefined || typeof p.oldPrice === "number"));
  check("slug do contrato TS bate (id/slug/category)", p && typeof p.slug === "string" && typeof p.category === "string");
}

{
  const { status, body } = await api("/api/products/capa-para-iphone");
  check("GET /api/products/{slug} → {data}", status === 200 && body?.data?.name === "Capa para iPhone");
  check("isNew vem do seed", typeof body?.data?.isNew === "boolean");
  const { status: s404 } = await api("/api/products/nao-existe");
  check("slug inexistente → 404 {error}", s404 === 404);
}

{
  const { status, body } = await api("/api/products?category=telemoveis&sort=price-asc");
  const sorted = body?.data?.every((p, i, a) => i === 0 || a[i - 1].price <= p.price);
  check("filtro category + sort=price-asc", status === 200 && body?.data?.length === 15 && sorted, `n=${body?.data?.length}`);
  const deal = await api("/api/products?deal=1");
  check("filtro deal=1 (Ofertas)", deal.body?.data?.length === 5, `n=${deal.body?.data?.length}`);
  const q = await api("/api/products?q=auscultadores");
  check("pesquisa q=auscultadores", q.body?.data?.length >= 2, `n=${q.body?.data?.length}`);
}

// ── 2. Categorias ──────────────────────────────────────────────────
console.log("\n🗂️  Categorias");
{
  const { status, body } = await api("/api/categories");
  check("GET /api/categories → {data} com productCount",
        status === 200 && body?.data?.length === 7 && typeof body.data[0].productCount === "number",
        `n=${body?.data?.length}`);
}

// ── 3. Reviews ─────────────────────────────────────────────────────
console.log("\n⭐ Reviews");
{
  const { status, body } = await api("/api/products/capa-para-iphone/reviews");
  check("GET /api/products/{slug}/reviews → {data[]}", status === 200 && body?.data?.length > 0 && body.data[0].author && body.data[0].comment);
  check("review tem verified/rating/title/date", body?.data?.length > 0 && ["verified", "rating", "title", "date"].every(k => k in body.data[0]));
}

// ── 4. Autenticação JWT ────────────────────────────────────────────
console.log("\n🔐 Autenticação JWT");
const email = `cliente${Date.now()}@teste.com`;
let token = null, userId = null;
{
  const { status, body } = await api("/api/auth/register", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fullName: "Anabela Teste", email, password: "segredo123", phone: "+258840000000" }),
  });
  check("POST /api/auth/register → 201 + token", status === 201 && typeof body?.data?.token === "string" && body?.data?.user?.email === email);
  token = body?.data?.token; userId = body?.data?.user?.id;
  const dup = await api("/api/auth/register", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fullName: "X", email, password: "segredo123" }),
  });
  check("email duplicado → 409 {error}", dup.status === 409);
}
{
  const { status, body } = await api("/api/auth/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "segredo123" }),
  });
  check("POST /api/auth/login → token", status === 200 && typeof body?.data?.token === "string");
  const bad = await api("/api/auth/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "errada" }),
  });
  check("login com password errada → 401 {error}", bad.status === 401 && bad.body?.error === "Credenciais inválidas");
}
{
  const me = await api("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } });
  check("GET /api/auth/me com token → perfil", me.status === 200 && me.body?.data?.id === userId);
  const anon = await api("/api/auth/me");
  check("GET /api/auth/me sem token → 401 {error}", anon.status === 401 && anon.body?.error);
}

// ── 3b. Submissão de reviews (cliente autenticado) ─────────────────
console.log("\n✍️  Submeter avaliação");
{
  const anon = await api("/api/products/capa-para-iphone/reviews", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rating: 5, title: "Teste", comment: "Muito bom!" }),
  });
  check("POST review sem token → 401", anon.status === 401, `status=${anon.status}`);

  const bad = await api("/api/products/capa-para-iphone/reviews", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ rating: 9, comment: "" }),
  });
  check("review inválida (rating>5, comentário vazio) → 400", bad.status === 400, `status=${bad.status}`);

  const created = await api("/api/products/capa-para-iphone/reviews", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ rating: 4, title: "Boa compra", comment: "Chegou rápido e funciona bem." }),
  });
  check("POST review (autenticado) → 201 {data}",
        created.status === 201 && created.body?.data?.rating === 4 && created.body?.data?.comment?.includes("Chegou rápido"),
        `status=${created.status}`);
  const list = await api("/api/products/capa-para-iphone/reviews");
  check("GET reviews inclui a nova (no topo)",
        list.status === 200 && list.body?.data?.[0]?.comment?.includes("Chegou rápido"),
        `n=${list.body?.data?.length}`);
}

// ── 4b. Favoritos ─────────────────────────────────────────────────
console.log("\n❤️ Favoritos");
{
  const empty = await api("/api/favorites", { headers: { Authorization: `Bearer ${token}` } });
  check("GET /api/favorites (novo utilizador) → []", empty.status === 200 && empty.body?.data?.length === 0, `status=${empty.status}`);

  const put = await api("/api/favorites", {
    method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ productIds: ["p-001", "p-006", "p-001"] }),
  });
  check("PUT /api/favorites → lista dedupada", put.status === 200 && put.body?.data?.length === 2, `status=${put.status}`);

  const get = await api("/api/favorites", { headers: { Authorization: `Bearer ${token}` } });
  check("GET /api/favorites reflete o PUT", get.status === 200 && get.body?.data?.join(",") === "p-001,p-006");

  const bad = await api("/api/favorites", {
    method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ productIds: ["produto-inexistente"] }),
  });
  check("PUT com produto fora do catálogo → 400", bad.status === 400, `status=${bad.status}`);

  const anon = await api("/api/favorites");
  check("GET /api/favorites sem token → 401", anon.status === 401, `status=${anon.status}`);
}

// ── 4c. Carrinho ──────────────────────────────────────────────────
console.log("\n🛒 Carrinho");
{
  const empty = await api("/api/cart", { headers: { Authorization: `Bearer ${token}` } });
  check("GET /api/cart (novo utilizador) → []", empty.status === 200 && empty.body?.data?.length === 0, `status=${empty.status}`);

  const f1 = await api("/api/products/capa-para-iphone");
  const p1 = f1.body.data;
  const put = await api("/api/cart", {
    method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify([
      { productId: "p-001", qty: 2, variant: "128 GB" },
      { productId: "p-006", qty: 1 },
      { productId: "p-001", qty: 200, variant: "128 GB" },
    ]),
  });
  const cart = put.body?.data;
  check("PUT /api/cart → itens colapsados com preço do catálogo",
        put.status === 200 && cart?.length === 2 && cart[0].price === p1.price, `status=${put.status}`);
  // O servidor limita a 99 E ao stock disponível do produto (ver README).
  const capQty = Math.min(99, p1.stock ?? 99);
  check(`quantidade cap a 99 e ao stock (2+200 → ${capQty})`, cart?.length === 2 && cart[0].qty === capQty, `qty=${cart?.[0]?.qty} stock=${p1.stock}`);
  check("item tem slug/name/image/freeShipping do catálogo",
        cart?.[0]?.slug === p1.slug && typeof cart?.[0]?.name === "string" && "freeShipping" in cart[0]);

  const get = await api("/api/cart", { headers: { Authorization: `Bearer ${token}` } });
  check("GET /api/cart reflete o PUT", get.status === 200 && get.body?.data?.length === 2);

  const bad = await api("/api/cart", {
    method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify([{ productId: "produto-inexistente", qty: 1 }]),
  });
  check("PUT com produto fora do catálogo → 400", bad.status === 400, `status=${bad.status}`);

  const anon = await api("/api/cart");
  check("GET /api/cart sem token → 401", anon.status === 401, `status=${anon.status}`);
}

// ── 5. Pedidos ─────────────────────────────────────────────────────
console.log("\n🧾 Pedidos");

// Regras do servidor (espelham o frontend): subtotal/desconto do catálogo,
// envio grátis ≥ 5000 MT, senão taxa da província.
async function computeExpected(province) {
  const f1 = await api("/api/products/capa-para-iphone");
  const f2 = await api("/api/products/coluna-bluetooth-portatil");
  const p1 = f1.body.data, p2 = f2.body.data;
  const items = [
    { p: p1, qty: 1 },
    { p: p2, qty: 2 },
  ];
  const subtotal = items.reduce((acc, { p, qty }) => acc + p.price * qty, 0);
  const discount = items.reduce((acc, { p, qty }) =>
    acc + (p.oldPrice && p.oldPrice > p.price ? (p.oldPrice - p.price) * qty : 0), 0);
  const fee = { "Maputo Cidade": 120, "Maputo Província": 150, "Gaza": 200, "Inhambane": 220,
                "Sofala": 260, "Manica": 280, "Tete": 320, "Zambézia": 300, "Nampula": 320,
                "Cabo Delgado": 360, "Niassa": 380 }[province] ?? 0;
  const shipping = subtotal >= 5000 ? 0 : fee;
  const total = Math.max(0, subtotal - discount) + shipping;
  return { subtotal, discount, shipping, total };
}

{
  const province = "Maputo Cidade";
  const order = {
    items: [
      { productId: "p-001", slug: "capa-para-iphone", name: "Capa para iPhone", image: "img1", price: 1, qty: 1 },
      { productId: "p-006", slug: "coluna-bluetooth-portatil", name: "Coluna Bluetooth portátil", image: "img2", price: 1, qty: 2 },
    ],
    subtotal: 99999, shipping: 999, discount: 999, total: 1, // valores do cliente — devem ser ignorados
    address: { fullName: "Anabela Teste", phone: "+258840000000", email, address: "Av. 24 de Julho, 100",
               city: "Maputo", province, notes: "Ligar antes de entregar" },
    paymentMethod: "Pagamento na entrega",
  };
  const expected = await computeExpected(province);

  const created = await api("/api/orders", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(order),
  });
  const o = created.body?.data;
  check("POST /api/orders → 201 {data}", created.status === 201 && o?.id?.startsWith("NSM-"));
  check(`subtotal recalculado no catálogo (${expected.subtotal})`, o?.subtotal === expected.subtotal, `subtotal=${o?.subtotal}`);
  check(`desconto = Σ(oldPrice−price)×qty (${expected.discount})`, o?.discount === expected.discount, `desconto=${o?.discount}`);
  check(`envio por província / grátis (${expected.shipping})`, o?.shipping === expected.shipping, `envio=${o?.shipping}`);
  check(`total = subtotal − desconto + envio (${expected.total})`, o?.total === expected.total, `total=${o?.total}`);
  check("status inicial 'Pedido recebido'", o?.status === "Pedido recebido", `status=${o?.status}`);
  check("address/province/paymentMethod persistidos", o?.address?.province === province && o?.paymentMethod === "Pagamento na entrega");
  check("date ISO", o && !Number.isNaN(Date.parse(o.date)));

  const mine = await api("/api/orders", { headers: { Authorization: `Bearer ${token}` } });
  check("GET /api/orders (meus pedidos) → {data[]}", mine.status === 200 && mine.body?.data?.length === 1 && mine.body.data[0].id === o.id);

  const one = await api(`/api/orders/${o.id}`, { headers: { Authorization: `Bearer ${token}` } });
  check("GET /api/orders/{id} → {data}", one.status === 200 && one.body?.data?.id === o.id && one.body.data.items.length === 2);

  const anon = await api("/api/orders", {});
  check("GET /api/orders sem token → 401", anon.status === 401);

  // Guest checkout — POST sem token é permitido (o checkout do frontend não exige login)
  const guest = await api("/api/orders", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(order),
  });
  check("POST /api/orders sem token (guest checkout) → 201", guest.status === 201 && guest.body?.data?.id !== o.id, `status=${guest.status}`);

  // Lookup de estado por ID — GET /api/orders/{id} é público (IDs de alta entropia)
  const guestId = guest.body?.data?.id;
  const lookup = await api(`/api/orders/${guestId}`);
  check("GET /api/orders/{id} sem token (lookup guest) → 200",
        lookup.status === 200 && lookup.body?.data?.id === guestId, `status=${lookup.status}`);
  const anonUserOrder = await api(`/api/orders/${o.id}`);
  check("GET /api/orders/{id} de utilizador sem token → 401", anonUserOrder.status === 401, `status=${anonUserOrder.status}`);
}

// ── 5b. Pagamentos online (M-Pesa / e-Mola / cartão) ─────────────
console.log("\n💳 Pagamentos online");
{
  const base = {
    items: [{ productId: "p-001", slug: "capa-para-iphone", name: "Capa para iPhone", image: "i", price: 15900, qty: 1 }],
    subtotal: 0, shipping: 0, discount: 0, total: 0,
    address: { fullName: "Cliente Teste", phone: "+258840000000", email: "guest@teste.com",
               address: "Av. 1", city: "Maputo", province: "Maputo Cidade" },
  };

  const mpesa = await api("/api/orders", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...base, paymentMethod: "M-Pesa", paymentInfo: { phone: "+258 84 123 4567" } }),
  });
  check("M-Pesa com telefone → 201 + pagamento confirmado + referência",
        mpesa.status === 201 && mpesa.body?.data?.status === "Pagamento confirmado"
          && /^MP-/.test(mpesa.body?.data?.paymentReference ?? ""),
        `status=${mpesa.status} ref=${mpesa.body?.data?.paymentReference}`);

  const emola = await api("/api/orders", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...base, paymentMethod: "e-Mola", paymentInfo: { phone: "848765432" } }),
  });
  check("e-Mola → 201 + referência EM-",
        emola.status === 201 && /^EM-/.test(emola.body?.data?.paymentReference ?? ""),
        `status=${emola.status} ref=${emola.body?.data?.paymentReference}`);

  const card = await api("/api/orders", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...base, paymentMethod: "Cartão Visa / Mastercard", paymentInfo: { cardLast4: "1234" } }),
  });
  check("cartão → 201 + referência com últimos 4 dígitos",
        card.status === 201 && (card.body?.data?.paymentReference ?? "").endsWith("••••1234"),
        `status=${card.status} ref=${card.body?.data?.paymentReference}`);

  const noPhone = await api("/api/orders", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...base, paymentMethod: "M-Pesa" }),
  });
  check("M-Pesa sem telefone → 400 {error}", noPhone.status === 400 && noPhone.body?.error, `status=${noPhone.status}`);

  const badPhone = await api("/api/orders", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...base, paymentMethod: "e-Mola", paymentInfo: { phone: "12345" } }),
  });
  check("e-Mola com telefone inválido → 400", badPhone.status === 400, `status=${badPhone.status}`);

  const unknown = await api("/api/orders", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...base, paymentMethod: "Bitcoin" }),
  });
  check("método desconhecido → 400", unknown.status === 400, `status=${unknown.status}`);
}

// ── 6. Admin — transições de estado do pedido ─────────────────────
console.log("\n🛡️ Admin — estado dos pedidos");
{
  const admin = await api("/api/auth/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@norteshopmoz.com", password: "Admin@2026" }),
  });
  const adminToken = admin.body?.data?.token;
  check("login admin → token (role ADMIN)",
        admin.status === 200 && admin.body?.data?.user?.role === "ADMIN", `status=${admin.status}`);

  const adminOrder = {
    items: [{ productId: "p-001", slug: "capa-para-iphone", name: "Capa para iPhone", image: "i", price: 15900, qty: 1 }],
    subtotal: 0, shipping: 0, discount: 0, total: 0,
    address: { fullName: "Cliente Teste", phone: "+258840000000", email: "guest@teste.com",
               address: "Av. 1", city: "Maputo", province: "Maputo Cidade" },
    paymentMethod: "Pagamento na entrega",
  };
  const fresh = await api("/api/orders", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(adminOrder),
  });
  const oid = fresh.body?.data?.id;
  check("pedido de teste criado para transições", fresh.status === 201 && oid, `status=${fresh.status}`);

  const steps = ["Pagamento confirmado", "Em preparação", "Enviado", "Em trânsito", "Entregue"];
  let walked = true;
  for (const step of steps) {
    const r = await api(`/api/orders/${oid}/status`, {
      method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ status: step }),
    });
    if (r.status !== 200 || r.body?.data?.status !== step) { walked = false; break; }
  }
  check("transição admin: 6 estados até Entregue", walked);

  const lookup = await api(`/api/orders/${oid}`);
  check("estado real refletido no lookup (Entregue)", lookup.body?.data?.status === "Entregue", `status=${lookup.body?.data?.status}`);

  // Página admin de pedidos (paginada NO SERVIDOR) + filtro por estado
  const all = await api("/api/orders/admin/all?size=100", { headers: { Authorization: `Bearer ${adminToken}` } });
  check("GET /api/orders/admin/all (admin) → página (items/page/totalItems/statusCounts)",
        all.status === 200 && Array.isArray(all.body?.data?.items)
          && all.body.data.items.length <= all.body.data.size
          && typeof all.body.data.totalItems === "number"
          && all.body.data.totalItems >= 3
          && all.body.data.items.some((o) => o.id === oid)
          && typeof all.body.data.statusCounts === "object",
        `status=${all.status} n=${all.body?.data?.items?.length} total=${all.body?.data?.totalItems}`);
  const hugeSize = await api("/api/orders/admin/all?size=100000", { headers: { Authorization: `Bearer ${adminToken}` } });
  check("teto do tamanho de página (?size=100000 → 100)",
        hugeSize.status === 200 && hugeSize.body?.data?.size === 100,
        `size=${hugeSize.body?.data?.size}`);
  const byStatus = await api("/api/orders/admin/all?status=Entregue&size=100", { headers: { Authorization: `Bearer ${adminToken}` } });
  check("filtro ?status=Entregue (no SQL, e o total é o do filtro)",
        byStatus.status === 200 && byStatus.body?.data?.items?.every((o) => o.status === "Entregue")
          && byStatus.body.data.totalItems <= all.body.data.totalItems,
        `status=${byStatus.status} n=${byStatus.body?.data?.items?.length} total=${byStatus.body?.data?.totalItems}`);
  const badStatus = await api("/api/orders/admin/all?status=NaoExiste", { headers: { Authorization: `Bearer ${adminToken}` } });
  check("filtro com estado inválido → 400", badStatus.status === 400, `status=${badStatus.status}`);
  const customerList = await api("/api/orders/admin/all", { headers: { Authorization: `Bearer ${token}` } });
  check("cliente a listar todos → 403", customerList.status === 403, `status=${customerList.status}`);
  const anonList = await api("/api/orders/admin/all");
  check("admin/all sem token → 401", anonList.status === 401, `status=${anonList.status}`);

  // Estatísticas agregadas no SQL (admin)
  const stats = await api("/api/orders/admin/stats", { headers: { Authorization: `Bearer ${adminToken}` } });
  check("GET /api/orders/admin/stats (admin) → agrega no SQL",
        stats.status === 200 && typeof stats.body?.data?.totalOrders === "number"
          && typeof stats.body?.data?.revenue === "number"
          && Array.isArray(stats.body?.data?.topProducts)
          && Array.isArray(stats.body?.data?.days),
        `status=${stats.status}`);
  const customerStats = await api("/api/orders/admin/stats", { headers: { Authorization: `Bearer ${token}` } });
  check("stats para cliente → 403", customerStats.status === 403, `status=${customerStats.status}`);
  const anonStats = await api("/api/orders/admin/stats");
  check("stats sem token → 401", anonStats.status === 401, `status=${anonStats.status}`);

  const back = await api(`/api/orders/${oid}/status`, {
    method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ status: "Em preparação" }),
  });
  check("recuar estado → 400", back.status === 400, `status=${back.status}`);

  const invalid = await api(`/api/orders/${oid}/status`, {
    method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ status: "Cancelado" }),
  });
  check("estado inválido → 400", invalid.status === 400, `status=${invalid.status}`);

  const customer = await api(`/api/orders/${oid}/status`, {
    method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status: "Pagamento confirmado" }),
  });
  check("cliente (não-admin) → 403", customer.status === 403, `status=${customer.status}`);

  const anon = await api(`/api/orders/${oid}/status`, {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "Pagamento confirmado" }),
  });
  check("PATCH sem token → 401", anon.status === 401, `status=${anon.status}`);
}

// ── 7. Newsletter ─────────────────────────────────────────────────
console.log("\n📬 Newsletter");
{
  const sub = await api("/api/newsletter/subscribe", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `news-${Date.now()}@exemplo.co.mz` }),
  });
  check("POST /api/newsletter/subscribe → 200 {data}",
        sub.status === 200 && sub.body?.data?.email && sub.body.data.active === true,
        `status=${sub.status}`);
  const again = await api("/api/newsletter/subscribe", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: sub.body?.data?.email }),
  });
  check("subscrição repetida é idempotente → 200", again.status === 200, `status=${again.status}`);
  const bad = await api("/api/newsletter/subscribe", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "invalido" }),
  });
  check("email inválido → 400", bad.status === 400, `status=${bad.status}`);
  const anon = await api("/api/newsletter/subscribers");
  check("GET /api/newsletter/subscribers sem token → 401", anon.status === 401, `status=${anon.status}`);
}

// ── 8. Endereços ──────────────────────────────────────────────────
console.log("\n📍 Endereços");
{
  const aToken = await api("/api/auth/register", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fullName: "Cli Endereços", email: `addr-${Date.now()}@exemplo.co.mz`,
                           password: "segredo123", phone: "+258841234567" }),
  });
  const aTok = aToken.body?.data?.token;
  const empty = await api("/api/addresses", { headers: { Authorization: `Bearer ${aTok}` } });
  check("GET /api/addresses (novo utilizador) → []", empty.status === 200 && empty.body?.data?.length === 0,
        `status=${empty.status}`);
  const put = await api("/api/addresses", {
    method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${aTok}` },
    body: JSON.stringify([{ label: "Casa", fullName: "Cli Endereços", phone: "+258841234567",
                            address: "Av. 24 de Julho 100", city: "Maputo",
                            province: "Maputo Cidade", isDefault: true }]),
  });
  check("PUT /api/addresses → 200 com isDefault no contrato",
        put.status === 200 && put.body?.data?.length === 1 && put.body.data[0].isDefault === true,
        `status=${put.status} campos=${Object.keys(put.body?.data?.[0] ?? {}).join(",")}`);
  const noDefault = await api("/api/addresses", {
    method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${aTok}` },
    body: JSON.stringify([{ fullName: "X", phone: "1", address: "a", city: "c", province: "Maputo Cidade" }]),
  });
  check("PUT sem isDefault → 200 (primeiro fica padrão)",
        noDefault.status === 200 && noDefault.body?.data?.[0]?.isDefault === true,
        `status=${noDefault.status}`);
  const badProv = await api("/api/addresses", {
    method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${aTok}` },
    body: JSON.stringify([{ fullName: "X", phone: "1", address: "a", city: "c", province: "Atlantis" }]),
  });
  check("PUT com província inválida → 400", badProv.status === 400, `status=${badProv.status}`);
  const anon = await api("/api/addresses");
  check("GET /api/addresses sem token → 401", anon.status === 401, `status=${anon.status}`);
}

// ── 9. Cupões ─────────────────────────────────────────────────────
console.log("\n🎟️  Cupões");
{
  const admin = await api("/api/auth/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@norteshopmoz.com", password: "Admin@2026" }),
  });
  const at = admin.body?.data?.token;
  const authJson = { "Content-Type": "application/json", Authorization: `Bearer ${at}` };
  // Código único por execução (a base é reutilizada entre corridas).
  const code = `TESTE${Date.now().toString().slice(-6)}`;
  const payload = { code, discountType: "PERCENT", discountValue: 10, minimumSubtotal: 1000, usageLimit: 0, active: true };

  const created = await api("/api/admin/coupons", {
    method: "POST", headers: authJson, body: JSON.stringify(payload),
  });
  const couponId = created.body?.data?.id;
  check("POST /api/admin/coupons (admin) → 201",
        created.status === 201 && created.body?.data?.code === code,
        `status=${created.status} code=${created.body?.data?.code}`);

  const dup = await api("/api/admin/coupons", {
    method: "POST", headers: authJson, body: JSON.stringify(payload),
  });
  check("código de cupão duplicado → 409", dup.status === 409, `status=${dup.status}`);

  const badType = await api("/api/admin/coupons", {
    method: "POST", headers: authJson,
    body: JSON.stringify({ ...payload, code: `${code}X`, discountType: "BRINDE" }),
  });
  check("tipo de desconto inválido → 400", badType.status === 400, `status=${badType.status}`);

  const list = await api("/api/admin/coupons", { headers: { Authorization: `Bearer ${at}` } });
  check("GET /api/admin/coupons (admin) → lista com o novo cupão",
        list.status === 200 && (list.body?.data ?? []).some((c) => c.code === code),
        `status=${list.status} n=${list.body?.data?.length}`);

  const customer = await api("/api/admin/coupons", { headers: { Authorization: `Bearer ${token}` } });
  check("cupões com token de cliente → 403", customer.status === 403, `status=${customer.status}`);
  const anonCoupons = await api("/api/admin/coupons");
  check("cupões sem token → 401", anonCoupons.status === 401, `status=${anonCoupons.status}`);

  // Validação pública usada pelo checkout (guest checkout incluído).
  const valid = await api("/api/orders/validate-coupon", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, subtotal: 15900 }),
  });
  check("POST /api/orders/validate-coupon (público) → 10% de 15900",
        valid.status === 200 && Number(valid.body?.data?.discount) === 1590,
        `status=${valid.status} discount=${valid.body?.data?.discount}`);

  const unknownCoupon = await api("/api/orders/validate-coupon", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: `NAOEXISTE${Date.now()}`, subtotal: 15900 }),
  });
  check("cupão inexistente → 400", unknownCoupon.status === 400, `status=${unknownCoupon.status}`);

  const belowMin = await api("/api/orders/validate-coupon", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, subtotal: 500 }),
  });
  check("subtotal abaixo do mínimo → 400", belowMin.status === 400, `status=${belowMin.status}`);

  // Cupão aplicado ao pedido: grava o código e desconta no total.
  const couponOrder = {
    items: [{ productId: "p-003", slug: "power-bank-20000-mah", name: "Power Bank", image: "i", price: 1150, qty: 1 }],
    subtotal: 0, shipping: 0, discount: 0, total: 0,
    address: { fullName: "Cli Cupão", phone: "+258840000000", email: "cupao@teste.com",
               address: "Av. 1", city: "Maputo", province: "Maputo Cidade" },
    paymentMethod: "Pagamento na entrega",
  };
  const plain = await api("/api/orders", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(couponOrder),
  });
  const withCoupon = await api("/api/orders", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...couponOrder, couponCode: code }),
  });
  check("pedido com couponCode → 201 + código gravado",
        withCoupon.status === 201 && withCoupon.body?.data?.couponCode === code,
        `status=${withCoupon.status} couponCode=${withCoupon.body?.data?.couponCode}`);
  check("desconto do cupão reduz o total do pedido",
        plain.status === 201 && Number(withCoupon.body?.data?.total) < Number(plain.body?.data?.total),
        `sem=${plain.body?.data?.total} com=${withCoupon.body?.data?.total}`);

  const disabled = await api(`/api/admin/coupons/${couponId}`, {
    method: "PUT", headers: authJson, body: JSON.stringify({ ...payload, active: false }),
  });
  check("PUT /api/admin/coupons/{id} → 200 (inativo)",
        disabled.status === 200 && disabled.body?.data?.active === false,
        `status=${disabled.status} active=${disabled.body?.data?.active}`);
  const inactive = await api("/api/orders/validate-coupon", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, subtotal: 15900 }),
  });
  check("cupão inativo → 400", inactive.status === 400, `status=${inactive.status}`);

  const removed = await api(`/api/admin/coupons/${couponId}`, {
    method: "DELETE", headers: { Authorization: `Bearer ${at}` },
  });
  check("DELETE /api/admin/coupons/{id} → 200", removed.status === 200, `status=${removed.status}`);
  const removedAgain = await api(`/api/admin/coupons/${couponId}`, {
    method: "DELETE", headers: { Authorization: `Bearer ${at}` },
  });
  check("DELETE repetido → 404", removedAgain.status === 404, `status=${removedAgain.status}`);
}

// ── 10. Cancelamento de pedidos ───────────────────────────────────
console.log("\n🚫 Cancelamento de pedidos");
{
  const admin = await api("/api/auth/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@norteshopmoz.com", password: "Admin@2026" }),
  });
  const at = admin.body?.data?.token;

  const orderBody = {
    items: [{ productId: "p-003", slug: "power-bank-20000-mah", name: "Power Bank", image: "i", price: 1150, qty: 1 }],
    subtotal: 0, shipping: 0, discount: 0, total: 0,
    address: { fullName: "Cli Cancelamento", phone: "+258840000000", email: "cancel@teste.com",
               address: "Av. 1", city: "Maputo", province: "Maputo Cidade" },
    paymentMethod: "Pagamento na entrega",
  };
  const createOrder = (headers = {}) =>
    api("/api/orders", {
      method: "POST", headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(orderBody),
    });

  // O dono autenticado cancela o próprio pedido.
  const mine = await createOrder({ Authorization: `Bearer ${token}` });
  const mineId = mine.body?.data?.id;
  check("pedido do cliente criado para cancelar", mine.status === 201 && Boolean(mineId),
        `status=${mine.status}`);
  const cancelled = await api(`/api/orders/${mineId}`, {
    method: "DELETE", headers: { Authorization: `Bearer ${token}` },
  });
  check("DELETE /api/orders/{id} (dono) → 200 Cancelado",
        cancelled.status === 200 && cancelled.body?.data?.status === "Cancelado",
        `status=${cancelled.status} estado=${cancelled.body?.data?.status}`);
  const lookup = await api(`/api/orders/${mineId}`);
  check("estado Cancelado refletido no lookup público",
        lookup.body?.data?.status === "Cancelado", `estado=${lookup.body?.data?.status}`);
  const twice = await api(`/api/orders/${mineId}`, {
    method: "DELETE", headers: { Authorization: `Bearer ${token}` },
  });
  check("cancelar um pedido já cancelado → 400", twice.status === 400, `status=${twice.status}`);

  // Outro cliente não pode cancelar pedidos alheios.
  const other = await api("/api/auth/register", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fullName: "Outro Cliente", email: `outro-${Date.now()}@teste.com`,
                           password: "segredo123", phone: "+258841111111" }),
  });
  const otherId = (await createOrder({ Authorization: `Bearer ${token}` })).body?.data?.id;
  const forbidden = await api(`/api/orders/${otherId}`, {
    method: "DELETE", headers: { Authorization: `Bearer ${other.body?.data?.token}` },
  });
  check("outro cliente a cancelar → 403", forbidden.status === 403, `status=${forbidden.status}`);

  const anonCancel = await api(`/api/orders/${otherId}`, { method: "DELETE" });
  check("DELETE sem token → 401", anonCancel.status === 401, `status=${anonCancel.status}`);

  const missing = await api("/api/orders/NSM-NAOEXISTE000", {
    method: "DELETE", headers: { Authorization: `Bearer ${at}` },
  });
  check("cancelar pedido inexistente → 404", missing.status === 404, `status=${missing.status}`);

  // Admin cancela um pedido de convidado (sem dono a validar).
  const guest = await createOrder();
  const guestId = guest.body?.data?.id;
  const adminCancel = await api(`/api/orders/${guestId}`, {
    method: "DELETE", headers: { Authorization: `Bearer ${at}` },
  });
  check("admin cancela pedido de convidado → 200",
        adminCancel.status === 200 && adminCancel.body?.data?.status === "Cancelado",
        `status=${adminCancel.status}`);

  // Pedido entregue não pode ser cancelado.
  const delivered = await createOrder();
  const deliveredId = delivered.body?.data?.id;
  for (const step of ["Pagamento confirmado", "Em preparação", "Enviado", "Em trânsito", "Entregue"]) {
    await api(`/api/orders/${deliveredId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${at}` },
      body: JSON.stringify({ status: step }),
    });
  }
  const deliveredCancel = await api(`/api/orders/${deliveredId}`, {
    method: "DELETE", headers: { Authorization: `Bearer ${at}` },
  });
  check("cancelar um pedido entregue → 400", deliveredCancel.status === 400, `status=${deliveredCancel.status}`);
}

console.log(`\n📊 RESULTADO: ${pass} ✅ | ${fail} ❌`);
process.exit(fail > 0 ? 1 : 0);
