-- V6 — corrige a constraint de estado dos pedidos.
--
-- Problema (bug pré-existente, apanhado ao validar o cancelamento): a V1 cria a
-- tabela `orders` com `CREATE TABLE IF NOT EXISTS` e uma constraint
-- `orders_status_check` que inclui `CANCELADO`. Numa base de dados que já existia
-- antes (criada pelo antigo ddl-auto=update, ou por uma V1 anterior), a
-- constraint ficou SEM `CANCELADO` — e a V1 nunca a corrige, porque o
-- `IF NOT EXISTS` não altera tabelas já existentes.
--
-- Efeito: cancelar um pedido (DELETE /api/orders/{id}, ou a transição admin para
-- "Cancelado") falhava com 500 — `new row violates check constraint
-- orders_status_check` — porque se tentava gravar o estado `CANCELADO` que a
-- constraint rejeitava.
--
-- Esta migração substitui a constraint pela definição correta, mas apenas quando
-- a existente ainda não aceita `CANCELADO` (idempotente e sem tocar no que já
-- está correto).

do $$
declare
    def text;
begin
    select pg_get_constraintdef(c.oid) into def
    from pg_constraint c
    where c.conrelid = 'orders'::regclass
      and c.conname = 'orders_status_check';

    if def is not null and def not like '%CANCELADO%' then
        alter table orders drop constraint orders_status_check;
        alter table orders add constraint orders_status_check
            check (status in ('PEDIDO_RECEBIDO', 'PAGAMENTO_CONFIRMADO', 'EM_PREPARACAO',
                              'ENVIADO', 'EM_TRANSITO', 'ENTREGUE', 'CANCELADO'));
    end if;
end $$;
