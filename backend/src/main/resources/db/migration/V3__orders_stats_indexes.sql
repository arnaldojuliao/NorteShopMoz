-- V3 — índices para as estatísticas de vendas (agregação no SQL).
--
-- O painel de admin conta/soma por estado e agrupa por dia. Sem estes índices,
-- cada consulta varre a tabela de pedidos (e os itens) inteira. Com eles, as
-- contagens por estado e a série diária usam o índice em vez de um full scan.
--
-- Idempotente, como as migrações anteriores.

create index if not exists idx_orders_status on orders (status);
create index if not exists idx_orders_date on orders (date);
create index if not exists idx_order_items_product_id on order_items (product_id);
