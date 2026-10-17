-- V11 — inclui AGUARDA_PAGAMENTO na constraint de estado dos pedidos.
--
-- O estado "Aguarda pagamento" nasceu com o checkout hospedado da PaySuite: o
-- pedido existe mas o pagamento só é confirmado pela notificação do provedor.
-- A V1 cria a tabela com a lista completa, mas bases de dados criadas ANTES
-- desse estado (pelo antigo ddl-auto=update ou por uma V1 anterior) ficaram com
-- a constraint antiga — e a V6 só corrigia o caso em que faltava CANCELADO.
--
-- Efeito da lacuna: qualquer checkout pago online falhava com 500
-- ("new row violates check constraint orders_status_check") na base afetada.
--
-- A migração substitui a constraint pela definição completa, apenas quando a
-- existente ainda não aceita AGUARDA_PAGAMENTO (idempotente — em bases novas a
-- constraint já está certa e nada é tocado).
do $$
declare
    def text;
begin
    select pg_get_constraintdef(c.oid) into def
    from pg_constraint c
    where c.conrelid = 'orders'::regclass
      and c.conname = 'orders_status_check';

    if def is not null and def not like '%AGUARDA_PAGAMENTO%' then
        alter table orders drop constraint orders_status_check;
        alter table orders add constraint orders_status_check
            check (status in ('AGUARDA_PAGAMENTO', 'PEDIDO_RECEBIDO', 'PAGAMENTO_CONFIRMADO',
                              'EM_PREPARACAO', 'ENVIADO', 'EM_TRANSITO', 'ENTREGUE', 'CANCELADO'));
    end if;
end $$;
