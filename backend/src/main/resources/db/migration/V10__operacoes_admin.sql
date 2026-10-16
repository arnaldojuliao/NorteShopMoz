-- Operações de backoffice: gestão de utilizadores, reconciliação de pagamentos,
-- devoluções, movimentos de stock e código de tracking dos pedidos.
--
-- Todas as alterações são idempotentes (IF NOT EXISTS) para poderem correr contra
-- bases já existentes. Os defaults NOT NULL permitem adicionar colunas sem
-- backfill (as linhas antigas ficam com o valor por omissão).

-- ── Utilizadores: bloqueio de conta (gestão no painel admin) ─────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS banned boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_reason varchar(300);

-- ── Pedidos: código de tracking do envio ─────────────────────────────────────
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_code varchar(80);

-- ── Incidências de pagamento (reconciliação) ──────────────────────────────────
-- Registo durável de falhas que antes só ficavam no log: payment.failed recebido
-- por webhook e estornos (refunds) que falharam. A operação resolve-as no painel
-- (marca resolvida ou tenta o estorno de novo).
CREATE TABLE IF NOT EXISTS payment_incidents (
    id BIGSERIAL PRIMARY KEY,
    order_id varchar(40) NOT NULL,
    payment_reference varchar(80),
    incident_type varchar(30) NOT NULL,        -- WEBHOOK_FAILED | REFUND_FAILED
    detail TEXT,
    status varchar(20) NOT NULL DEFAULT 'ABERTA', -- ABERTA | RESOLVIDA
    created_at timestamptz NOT NULL DEFAULT now(),
    resolved_at timestamptz,
    resolved_by varchar(40)
);
CREATE INDEX IF NOT EXISTS idx_payment_incidents_status ON payment_incidents (status);
CREATE INDEX IF NOT EXISTS idx_payment_incidents_order ON payment_incidents (order_id);

-- ── Devoluções ───────────────────────────────────────────────────────────────
-- Um pedido tem no máximo um pedido de devolução (o cliente pode reabrir? não —
-- rejeitar é final; nova tentativa só por contacto com o suporte).
CREATE TABLE IF NOT EXISTS return_requests (
    id BIGSERIAL PRIMARY KEY,
    order_id varchar(40) NOT NULL,
    user_id varchar(40),
    reason TEXT NOT NULL,
    status varchar(20) NOT NULL DEFAULT 'PEDIDO', -- PEDIDO | APROVADA | REJEITADA | REEMBOLSADA
    admin_note varchar(500),
    refund_amount numeric(12, 2),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_return_requests_order UNIQUE (order_id)
);
CREATE INDEX IF NOT EXISTS idx_return_requests_status ON return_requests (status);
CREATE INDEX IF NOT EXISTS idx_return_requests_order ON return_requests (order_id);

-- ── Movimentos de stock ──────────────────────────────────────────────────────
-- Histórico de cada alteração de stock (checkout, cancelamento, ajuste manual) —
-- é o que permite responder "porque é que o stock mudou?" sem adivinhar.
CREATE TABLE IF NOT EXISTS stock_movements (
    id BIGSERIAL PRIMARY KEY,
    product_id varchar(40) NOT NULL,
    delta int NOT NULL,                        -- negativo = saída, positivo = entrada
    stock_after int,                           -- stock resultante (informativo)
    reason varchar(40) NOT NULL,               -- CHECKOUT | CANCELAMENTO | AJUSTE_MANUAL
    detail varchar(300),
    user_id varchar(40),                       -- admin que fez o ajuste (quando aplicável)
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements (product_id, created_at DESC);
