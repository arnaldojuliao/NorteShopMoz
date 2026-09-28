#!/usr/bin/env bash
# =============================================================================
# NorteShopMoz — instalação de dependências para o deployment na Vercel
#
# A loja Next.js vive em `frontend/`, mas o projeto da Vercel tem a RAIZ do
# repositório como Root Directory. Isso obriga a refazer aqui o que o Root
# Directory faria, porque essa definição existe só no painel da Vercel:
#
#   · não está no schema oficial do vercel.json (openapi.vercel.sh/vercel.json
#     não tem `rootDirectory`) — pô-la no ficheiro é ignorado com aviso;
#   · o próprio builder do Next da Vercel assume isso em comentário, em
#     `packages/next/src/index.ts`:
#       // TODO: remove after testing used for simulating root directory monorepo
#       // setting that can't be triggered with vercel.json
#
# O que este script tem de garantir, pela ordem em que o builder o verifica:
#
#   1. As dependências da app ficam instaladas — o build corre em `frontend/`.
#      Dev incluídas: tailwind/postcss/typescript/eslint são precisos ao
#      `next build`.
#
#   2. `next` é resolvível a partir da RAIZ do repositório. O builder faz
#      `require.resolve('next/package.json', { paths: [<Root Directory>] })` e
#      aborta com NEXT_NO_VERSION — «No Next.js version detected. Make sure your
#      package.json has "next" … Also check your Root Directory setting matches
#      the directory of your package.json file» — quando não o encontra.
#      Um symlink para a instalação do `frontend` resolve-o sem duplicar versões
#      nem criar um `package.json` na raiz: se a app atualizar o Next, o symlink
#      acompanha-a e não há versões a divergir.
#
# Não é preciso espelhar `frontend/public`: o builder procura `public/` também ao
# lado do outputDirectory (`getStaticFiles` testa
# `path.join(entryPath, outputDirectory, '../public')`), que é exactamente
# `frontend/public`.
#
# Usado por `vercel.json` (installCommand). Em desenvolvimento não se corre à
# mão: dentro de `frontend/`, `npm ci`.
# =============================================================================

set -euo pipefail

# As duas fases do vercel.json (install/build) correm a partir da raiz.
cd "$(dirname "${BASH_SOURCE[0]}")/.."

echo "Vercel: a instalar as dependências de frontend/ ..."
npm ci --prefix frontend --include=dev

echo "Vercel: a expor \`next\` na raiz do repositório (exigido pelo builder) ..."
mkdir -p node_modules
ln -sfn ../frontend/node_modules/next node_modules/next

echo "Vercel: dependências prontas."
