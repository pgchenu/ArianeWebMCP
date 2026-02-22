#!/usr/bin/env bash
# Build script pour créer le bundle MCPB (Desktop Extension pour Claude Desktop)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
STAGING_DIR="$PROJECT_DIR/mcpb-staging"

echo "=== ArianeWebMCP — Build MCPB ==="

# 1. Compiler le TypeScript
echo "[1/6] Compilation TypeScript..."
cd "$PROJECT_DIR"
npx tsc

# 2. Préparer le répertoire de staging
echo "[2/6] Préparation du staging..."
rm -rf "$STAGING_DIR"
mkdir -p "$STAGING_DIR/server"

# 3. Bundle avec esbuild (ESM, minifié, tout inclus)
#    - inject mcpb-polyfills.js : crée globalThis.require via createRequire (pour les
#      dépendances CJS qui font require("buffer") etc.) et polyfill DOMMatrix/Path2D/
#      ImageData (pour pdfjs-dist qui les utilise au chargement pour le canvas rendering
#      dont on n'a pas besoin — on ne fait que de l'extraction texte)
echo "[3/6] Bundle esbuild..."
npx esbuild dist/index.js \
  --bundle \
  --platform=node \
  --target=node20 \
  --format=esm \
  --minify \
  --inject:"$SCRIPT_DIR/mcpb-polyfills.js" \
  --outfile="$STAGING_DIR/server/index.js"

# 4. Ajouter un package.json minimal pour la résolution ESM
echo '{"type":"module"}' > "$STAGING_DIR/server/package.json"

# 5. Copier le manifest
echo "[4/6] Copie du manifest..."
cp "$PROJECT_DIR/manifest.json" "$STAGING_DIR/manifest.json"

# 6. Valider le manifest
echo "[5/6] Validation du manifest..."
npx --yes @anthropic-ai/mcpb validate "$STAGING_DIR"

# 7. Empaqueter en .mcpb
echo "[6/6] Empaquetage MCPB..."
npx --yes @anthropic-ai/mcpb pack "$STAGING_DIR" "$PROJECT_DIR/arianeweb-mcp.mcpb"

# 8. Nettoyage
echo "Nettoyage du staging..."
rm -rf "$STAGING_DIR"

# Résultat
MCPB_SIZE=$(du -h "$PROJECT_DIR/arianeweb-mcp.mcpb" | cut -f1)
echo ""
echo "✓ Bundle créé : arianeweb-mcp.mcpb ($MCPB_SIZE)"
echo "  → Installer dans Claude Desktop : Developer > Extensions > Install Extension"
