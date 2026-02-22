# ArianeWebMCP

Serveur [MCP (Model Context Protocol)](https://modelcontextprotocol.io) qui connecte votre assistant IA à la jurisprudence administrative française. Il permet à Claude, ChatGPT, Mistral ou tout client MCP compatible d'**interroger directement ArianeWeb** (base officielle du Conseil d'État) et d'**OpenData justice-administrative.fr** (tribunaux administratifs et cours administratives d'appel).

## Ce que ça fait concrètement

Une fois configuré, votre assistant peut :
- Rechercher des décisions par mots-clés, numéro d'affaire, date, juridiction ou niveau d'importance
- Lire le texte intégral d'une décision
- Lire les conclusions du rapporteur public (quand disponibles)
- Lire l'analyse jurisprudentielle rédigée par les services du Conseil d'État

### Les 4 outils exposés

| Outil | Description |
|---|---|
| `search_decisions` | Recherche par mots-clés, numéro, date, juridiction, classification |
| `get_decision` | Texte intégral + métadonnées complètes d'une décision |
| `get_conclusions` | Conclusions du rapporteur public (PDF → texte) |
| `get_decision_analysis` | Analyse jurisprudentielle AJCE (décisions A/B uniquement) |

### Comportement intelligent par défaut

- Interroge par défaut le **Conseil d'État + Tribunal des conflits** (décisions de principe)
- Si aucun résultat A/B n'est trouvé → élargit automatiquement aux CAA
- Résultats triés : A > B > C ; les décisions C sont filtrées sauf demande explicite
- Les Tribunaux administratifs (OpenData) sont accessibles sur demande explicite (`jurisdiction: "TA"`)

> **Note sur la pseudonymisation** — Depuis 2022, les décisions sont pseudonymisées (noms remplacés par des initiales). Préférez les recherches par **mots-clés juridiques**, références de textes (ex : `L761-1 CJA`) ou numéros d'affaire.

---

## Installation

### Méthode 1 : Desktop Extension (recommandé pour Claude Desktop)

La méthode la plus simple — un seul fichier, installation en un clic :

1. Téléchargez le fichier `arianeweb-mcp.mcpb` depuis la [page Releases](https://github.com/pgchenu/ArianeWebMCP/releases)
2. Dans Claude Desktop, allez dans **Developer → Extensions → Install Extension**
3. Sélectionnez le fichier `.mcpb` téléchargé

C'est tout. Les 4 outils apparaissent immédiatement dans Claude Desktop.

### Méthode 2 : Docker

Pour les autres clients MCP (Cursor, Continue, etc.) ou si vous préférez Docker :

```bash
git clone https://github.com/pgchenu/ArianeWebMCP.git
cd ArianeWebMCP
docker build -t arianeweb-mcp .
```

Configuration Claude Desktop (`~/Library/Application Support/Claude/claude_desktop_config.json` sur macOS, `%APPDATA%\Claude\claude_desktop_config.json` sur Windows) :

```json
{
  "mcpServers": {
    "arianeweb": {
      "command": "docker",
      "args": ["run", "--rm", "-i", "arianeweb-mcp"]
    }
  }
}
```

#### Autres clients MCP

Tout client compatible MCP peut utiliser la même commande :

```
docker run --rm -i arianeweb-mcp
```

### Méthode 3 : Node.js (développement)

Nécessite Node.js 20+ et npm.

```bash
git clone https://github.com/pgchenu/ArianeWebMCP.git
cd ArianeWebMCP
npm install
npm run build
```

Configuration Claude Desktop :

```json
{
  "mcpServers": {
    "arianeweb": {
      "command": "node",
      "args": ["/chemin/absolu/vers/ArianeWebMCP/dist/index.js"]
    }
  }
}
```

---

## Référence des outils

### `search_decisions`

| Paramètre | Type | Défaut | Description |
|---|---|---|---|
| `query` | string | *requis* | Mots-clés, références (ex : `L761-1 CJA`), numéro d'affaire |
| `jurisdiction` | `CE+TC` \| `CE` \| `TC` \| `CAA` \| `TA` | `CE+TC` | Juridiction cible |
| `classification` | `AB` \| `A` \| `B` \| `C` | `AB` | Niveau d'importance |
| `date_start` | `YYYY-MM-DD` | — | Filtre par année (précision mois/jour non supportée) |
| `page` | number | `1` | Numéro de page |
| `page_size` | number | `10` | Résultats par page (max 20) |

**Exemples de requêtes utiles :**
- Recherche par référence : `"L761-1 CJA"`
- Recherche thématique : `"droit au logement opposable"` avec `jurisdiction: "CE+TC"`
- Recherche dans les TA : `"urbanisme permis de construire"` avec `jurisdiction: "TA"`

### `get_decision`

| Paramètre | Type | Description |
|---|---|---|
| `id` | string | Numéro d'affaire (ex : `488011`) ou identifiant retourné par `search_decisions` |

Retourne : texte intégral, date, formation, rapporteur, rapporteur public, lien de consultation, et si des conclusions sont disponibles (`conclusionsDisponibles: true`).

### `get_conclusions`

Disponible uniquement si `conclusionsDisponibles: true` dans la réponse de `search_decisions` ou `get_decision`.

| Paramètre | Type | Description |
|---|---|---|
| `id` | string | Numéro d'affaire (ex : `488011`) |

Retourne le texte intégral des conclusions du rapporteur public (extrait du PDF officiel).

### `get_decision_analysis`

Disponible pour les décisions classifiées **A** (Recueil Lebon) ou **B** (Tables du Recueil).

| Paramètre | Type | Description |
|---|---|---|
| `id` | string | Numéro d'affaire (ex : `488011`) |

Retourne l'analyse jurisprudentielle rédigée par les services du Conseil d'État.

---

## Sources de données

| Source | Couverture | API |
|---|---|---|
| **ArianeWeb** (Conseil d'État) | CE, CAA, TC — ~300 000 décisions + conclusions + analyses | `https://www.conseil-etat.fr/xsearch` |
| **OpenData justice-administrative.fr** | TA et CAA | `https://opendata.justice-administrative.fr/recherche/api` |

---

## Développement

```bash
npm run build              # Compilation TypeScript
npm test                   # Tous les tests (76 tests)
npm run test:watch         # Mode watch
npm run test:integration   # Tests d'intégration uniquement (réseau réel)
npm run build:mcpb         # Génère le fichier arianeweb-mcp.mcpb (Desktop Extension)
```

Pour la documentation technique détaillée :
- [`docs/api.md`](docs/api.md) — Documentation des APIs ArianeWeb et OpenData
- [`docs/architecture.md`](docs/architecture.md) — Structure du code et décisions d'architecture

---

## Remerciements

Un grand merci à
* [Raphaël d'Assignies](https://www.linkedin.com/in/dassignies/) pour son projet [mcp-server-legifrance](https://github.com/pylegifrance/mcp-server-legifrance), que je ne peux que recommander, aussi gratuitement disponible [en ligne](https://www.openlegi.fr/) ;
* [Xavier Aurey](https://www.linkedin.com/in/xavieraurey/) du blog [fondamentaux.org](https://fondamentaux.org/) pour son [travail de reverse engineering de ArianeWeb](https://fondamentaux.org/2021/open-data-des-decisions-de-justice-et-api-des-cours-francaises-et-europeennes/).

---

## Licence

MIT
