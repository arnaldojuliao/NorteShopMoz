-- V12 — voltar a pagar + resolução de incidências com nota.
--
-- 1) orders.checkout_url: o link de pagamento passa a PERSISTIR. Até aqui era
--    @Transient — só existia na resposta que criava o pedido; se o cliente
--    fechasse o browser sem pagar, nem a loja nem a página de acompanhamento
--    tinham forma de o enviar de novo para pagar (o email também não o
--    incluía). Persistido, o /pedido/{id} mostra "Pagar agora" para qualquer
--    pedido em "Aguarda pagamento". A coluna nasce vazia: pedidos antigos
--    (anteriores a esta migração) não têm link — para esses existe o endpoint
--    de gerar novo link (POST /api/orders/{id}/payment-link).
--
-- 2) payment_incidents.resolution_note: a nota escrita ao resolver uma
--    incidência era descartada — só ficava na resposta. Agora fica no caso.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS checkout_url varchar(500);
ALTER TABLE payment_incidents ADD COLUMN IF NOT EXISTS resolution_note varchar(500);
