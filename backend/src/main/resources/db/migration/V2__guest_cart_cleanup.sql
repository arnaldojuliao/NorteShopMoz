-- V2 — carimbo de atualização nos carrinhos.
--
-- Motivo: os carrinhos de convidado (chave `guest:<uuid>`, sem conta) nunca
-- expiravam. Cada dispositivo ou valor novo do header `X-Guest-Id` criava uma
-- linha permanente em `user_carts` — crescimento ilimitado da base de dados.
-- Com `updated_at`, o GuestCartCleanup apaga os carrinhos de convidado inativos
-- há mais de N dias (configurável em app.cart.guest-retention-days).
--
-- Idempotente, como a V1: aplicável tanto a uma base nova como a uma existente.

alter table if exists user_carts
    add column if not exists updated_at timestamp(6) with time zone not null default now();

create index if not exists idx_user_carts_updated_at on user_carts (updated_at);
