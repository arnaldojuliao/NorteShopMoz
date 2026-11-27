-- V14 — bairro e ponto de referência na morada de entrega.
--
-- Em Moçambique a morada por si só (rua/avenida + número) raramente chega: o
-- entregador localiza o cliente pelo bairro e por uma referência conhecida.
-- Campos opcionais para não quebrar pedidos/endereços já existentes.
alter table orders
    add column if not exists neighborhood varchar(120);
alter table orders
    add column if not exists reference varchar(300);

alter table address_book_entries
    add column if not exists neighborhood varchar(120);
alter table address_book_entries
    add column if not exists reference varchar(300);
