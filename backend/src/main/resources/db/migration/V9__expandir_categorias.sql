-- V9 — taxonomia de 17 categorias (14 reais no catálogo + 3 vistas no header).
--
-- Motivo: «Moda» foi dividida nos departamentos reais da loja — Mulheres,
-- Homens, Calçados, Joias, Desporto e Crianças — e «Casa» ganhou Móveis e
-- Cozinha como categorias próprias. O header (/lib/compact-categories.ts) e o
-- seed (catalog.json) já refletem a lista; esta migração alinha bases que já
-- estavam a correr (o seed só insere quando o catálogo está vazio).
--
-- Idempotente: ON CONFLICT ignora categorias existentes; os UPDATEs só tocam em
-- produtos cuja categoria era «moda»; o DELETE falha silenciosamente se já
-- não existir (via condição IN).

INSERT INTO categories (slug, name, emoji, image, description) VALUES
  ('mulheres',  'Mulheres',  '👗', 'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=800&q=70', 'Roupa, calçado e acessórios para ela.'),
  ('homens',    'Homens',    '👔', 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?auto=format&fit=crop&w=800&q=70', 'Roupa, calçado e acessórios para ele.'),
  ('calcados',  'Calçados',  '👟', 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=800&q=70', 'Ténis, sandálias, sociais e chinelos.'),
  ('joias',     'Joias',     '💍', 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=800&q=70', 'Colares, pulseiras, anéis e brincos.'),
  ('desporto',  'Desporto',  '⚽', 'https://images.unsplash.com/photo-1517649763962-0c623066013b?auto=format&fit=crop&w=800&q=70', 'Roupa e equipamento desportivo.'),
  ('criancas',  'Crianças',  '🧸', 'https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?auto=format&fit=crop&w=800&q=70', 'Roupa, calçado e brinquedos.'),
  ('moveis',    'Móveis',    '🛋️', 'https://images.unsplash.com/photo-1533090161767-e6ffed986c88?auto=format&fit=crop&w=800&q=70', 'Sofás, camas, mesas e armários.'),
  ('cozinha',   'Cozinha',   '🍳', 'https://images.unsplash.com/photo-1584990347449-a63e2b662294?auto=format&fit=crop&w=800&q=70', 'Utensílios, panelas e eletroportáteis.')
ON CONFLICT (slug) DO NOTHING;

-- Redistribuir os produtos de «Moda» pelas novas categorias (dados demo).
UPDATE products SET category = 'homens'     WHERE category = 'moda' AND (name ILIKE '%t-shirt%' OR name ILIKE '%camisa%' OR name ILIKE '%gang%' OR name ILIKE '%jaqueta%' OR name ILIKE '%sweat%');
UPDATE products SET category = 'mulheres'   WHERE category = 'moda' AND (name ILIKE '%vestido%' OR name ILIKE '%blusa%' OR name ILIKE '%pijama%');
UPDATE products SET category = 'calcados'   WHERE category = 'moda' AND (name ILIKE '%sapatilha%' OR name ILIKE '%sandália%' OR name ILIKE '%sapato%' OR name ILIKE '%chinelo%');
UPDATE products SET category = 'desporto'   WHERE category = 'moda' AND name ILIKE '%treino%';
UPDATE products SET category = 'acessorios' WHERE category = 'moda' AND (name ILIKE '%cinto%' OR name ILIKE '%meias%');
-- Fallback: o que não casou com nenhum padrão vai para Mulheres.
UPDATE products SET category = 'mulheres'   WHERE category = 'moda';

-- «Moda» deixa de existir como categoria (os produtos já foram reafectados).
DELETE FROM categories WHERE slug = 'moda';
