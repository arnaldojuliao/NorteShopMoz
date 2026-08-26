# Catálogo de semente

O ficheiro `catalog.json` é **gerado a partir do catálogo TypeScript do
frontend** (`frontend/src/lib/data/products.ts` e `categories.ts`) — é a
mesma fonte de verdade dos dados mock da loja.

## Regenerar

```bash
cd frontend
node --input-type=module -e "
  import { products } from './src/lib/data/products.ts';
  import { categories } from './src/lib/data/categories.ts';
  import fs from 'node:fs';
  fs.writeFileSync('../backend/src/main/resources/seed/catalog.json',
    JSON.stringify({ categories, products }, null, 1));
"
```

O `DataSeeder` apenas semeia quando a tabela de produtos está vazia
(`productRepository.count() == 0`).
