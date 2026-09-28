#!/usr/bin/env bash
# =============================================================================
# NorteShopMoz — build do frontend para o deployment na Vercel
#
# Complementa `scripts/vercel-install.sh`: com a raiz do repositório como Root
# Directory, o build tem de ser apontado explicitamente para a app que vive em
# `frontend/`. O `vercel.json` declara `outputDirectory: frontend/.next` para o
# builder ler o resultado ali (neste layout o Next escreve o Build Output em
# `frontend/.next/output/`, e o builder serve esse diretório tal como está em
# `path.join(entryPath, outputDirectory, 'output')`).
#
# Usado por `vercel.json` (buildCommand). Em desenvolvimento não se corre à mão:
# dentro de `frontend/`, `npm run build`.
# =============================================================================

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

echo "Vercel: a construir a loja (frontend/) ..."
npm run build --prefix frontend
