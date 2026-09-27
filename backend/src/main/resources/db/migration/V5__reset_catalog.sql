-- V5 — reset do catálogo de DEMONSTRAÇÃO.
--
-- Contexto: o catálogo de exemplo foi substituído por um novo conjunto de
-- produtos/categorias definido em frontend/src/lib/data/*.ts. O DataSeeder só
-- semeia quando a tabela de produtos está vazia, por isso bases de dados que já
-- tinham o catálogo de exemplo continuariam a mostrá-lo.
--
-- ⚠️ SEGURANÇA EM PRODUÇÃO: esta migração NUNCA pode apagar um catálogo real.
-- Por isso a limpeza está CONDICIONADA à presença do catálogo de demonstração
-- antigo (identificado pelos seus slugs conhecidos). Numa base de dados de
-- produção com produtos reais — que não contém estes slugs — a migração é um
-- no-op e nada é apagado. Numa base nova (sem produtos) também é um no-op.
--
-- Notas:
--   * order_items são preservados: guardam nome/slug/imagem/preço do momento da
--     compra e não têm chave estrangeira para products.
--   * favorites é limpo porque a sua chave primária inclui product_id e
--     apontaria para produtos que deixam de existir.
--   * As categorias são removidas para evitar colisão de chave primária (slug)
--     quando o DataSeeder voltar a inserir as categorias novas.

do $$
begin
    if exists (
        select 1
        from products
        where slug in (
            'smartphone-nsm-x10-128gb',
            'coluna-bluetooth-boom',
            'power-bank-20000mah'
        )
    ) then
        delete from reviews;
        delete from favorites;
        delete from products;
        delete from categories;
    end if;
end $$;
