-- V13 — pesquisa do catálogo com trigramas e sem acentos.
--
-- Problema: `ProductSpecifications` fazia `lower(coluna) LIKE '%termo%'` em
-- name/brand/short_description. Esse padrão com `%` à esquerda **não usa
-- índice** (B-tree não serve) e por isso é um sequential scan em products a
-- cada pesquisa — invisível com 108 produtos, degradante à medida que o
-- catálogo cresce. Além disso "chá" e "cha" eram termos distintos para a base
-- de dados: o cliente que escrevia sem acento não encontrava o produto.
--
-- Solução:
--   1) extensões pg_trgm (índices GIN para LIKE '%…%') e unaccent;
--   2) `nsm_normalize(text)` = lower + unaccent, para a expressão do índice e
--      da pesquisa serem exatamente a mesma;
--   3) índices GIN trigram em name, brand e short_description.
--
-- Porque é que `nsm_normalize` é um wrapper e não `lower(unaccent(...))`
-- direto no índice: `unaccent()` é STABLE (depende do dicionário carregado) e
-- o Postgres só aceita expressões IMMUTABLE num índice. O wrapper declara
-- IMMUTABLE — é a prática recomendada para este caso; a contrapartida é que
-- alterar o dicionário do unaccent exige REINDEX destes índices.
--
-- Requer que o utilizador do Flyway possa CREATE EXTENSION (o DB_USER por
-- omissão é `postgres`). Se não puder, a migração falha em vez de deixar a
-- pesquisa silenciosamente lenta.

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- `search_path` fixo: sem ele a função herdaria o do chamador e podia resolver
-- outro dicionário (ou falhar) consoante o contexto.
CREATE OR REPLACE FUNCTION nsm_normalize(txt text)
    RETURNS text
    LANGUAGE sql
    IMMUTABLE
    PARALLEL SAFE
    SET search_path = public, pg_temp
AS $$
    SELECT lower(public.unaccent('public.unaccent'::regdictionary, coalesce(txt, '')))
$$;

COMMENT ON FUNCTION nsm_normalize(text) IS
    'Normaliza texto para pesquisa: minúsculas + sem acentos (usado nos índices GIN do catálogo).';

-- Índices trigram: servem LIKE '%termo%' sobre a expressão exata nsm_normalize(col).
CREATE INDEX IF NOT EXISTS idx_products_search_name
    ON products USING gin (nsm_normalize(name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_search_brand
    ON products USING gin (nsm_normalize(brand) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_search_short_description
    ON products USING gin (nsm_normalize(short_description) gin_trgm_ops);

-- A estatística do planeador em colunas text longas decide entre seq scan e
-- índice; aumentar o alvo nesta tabela ajuda o GIN a ser escolhido.
ALTER TABLE products ALTER COLUMN name SET STATISTICS 500;
ALTER TABLE products ALTER COLUMN short_description SET STATISTICS 500;
