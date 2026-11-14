-- Executado pelo Hibernate depois de criar o schema no perfil `unit-test` (H2).
--
-- Em produção, `nsm_normalize` é uma função SQL criada pela migração V13
-- (lower + unaccent do PostgreSQL). Os testes correm sobre H2 com o Flyway
-- desligado, por isso a função é aqui emulada por um método Java — sem isto as
-- pesquisas do catálogo falhavam nos testes com «function nsm_normalize not
-- found».
CREATE ALIAS IF NOT EXISTS nsm_normalize FOR 'mz.norteshopmoz.api.support.H2SearchFunctions.nsmNormalize';
