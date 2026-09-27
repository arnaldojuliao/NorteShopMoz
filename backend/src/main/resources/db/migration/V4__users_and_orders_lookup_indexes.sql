-- V4 — índices para consultas por utilizador e por token.
--
-- Sem estes índices, consultas que correm em caminhos quentes fazem varredura
-- completa da tabela:
--   · `orders.user_id`     — histórico do cliente (GET /api/orders) e o selo
--                            "compra verificada" (hasOrderedProduct, avaliado em
--                            cada nova avaliação);
--   · `users.reset_token`  — reposição de palavra-passe (findByResetToken);
--   · `users.verification_token` — confirmação de email por link.
--
-- Idempotente, como as migrações anteriores.

create index if not exists idx_orders_user_id on orders (user_id);
create index if not exists idx_users_reset_token on users (reset_token);
create index if not exists idx_users_verification_token on users (verification_token);
