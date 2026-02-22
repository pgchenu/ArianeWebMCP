# Architecture du code

## Vue d'ensemble

ArianeWebMCP est un serveur MCP (Model Context Protocol) en TypeScript. Il expose 4 outils à un client IA (Claude, Cursor...) via un transport **stdio** JSON-RPC.

```
Client IA (Claude Desktop, Cursor...)
        │  JSON-RPC sur stdin/stdout
        ▼
┌─────────────────────────────────────────┐
│              src/index.ts               │  Point d'entrée, transport stdio
│              src/server.ts             │  Serveur MCP, routing des outils
├─────────────────┬───────────────────────┤
│   src/tools/    │                       │  Logique métier des 4 outils
│   search.ts     │   decision.ts         │
│   conclusions.ts│   analysis.ts         │
├─────────────────┴───────────────────────┤
│            src/clients/                 │  Couche HTTP (gelée)
│   arianeweb.ts  │   opendata.ts         │
└─────────────────────────────────────────┘
        │                    │
        ▼                    ▼
  conseil-etat.fr    opendata.justice-
  (ArianeWeb /        administrative.fr
   Sinequa)
```

---

## Structure des fichiers

```
src/
├── index.ts              # Point d'entrée : crée le serveur et démarre le transport stdio
├── server.ts             # Définition des outils MCP et dispatch des requêtes
├── clients/
│   ├── arianeweb.ts      # Client HTTP ArianeWeb (Sinequa / conseil-etat.fr)
│   └── opendata.ts       # Client HTTP OpenData (justice-administrative.fr)
├── tools/
│   ├── search.ts         # handleSearchDecisions — logique de recherche et formatage
│   ├── decision.ts       # handleGetDecision — récupération texte intégral
│   ├── conclusions.ts    # handleGetConclusions — extraction PDF conclusions
│   └── analysis.ts       # handleGetDecisionAnalysis — analyse jurisprudentielle
└── types/
    ├── decision.ts       # Types partagés : DecisionMetadata, DecisionComplete, etc.
    └── search.ts         # Types : SearchParams, SearchResult

tests/
├── clients/
│   ├── arianeweb.test.ts  # Tests d'intégration ArianeWebClient (réseau réel)
│   └── opendata.test.ts   # Tests d'intégration OpenDataClient (réseau réel)
└── tools/
    ├── search.test.ts     # Tests unitaires handleSearchDecisions (mock client)
    ├── decision.test.ts   # Tests unitaires handleGetDecision (mock client)
    ├── conclusions.test.ts# Tests unitaires handleGetConclusions (mock client)
    └── analysis.test.ts   # Tests unitaires handleGetDecisionAnalysis (mock client)
```

---

## Flux d'une requête

Exemple : le client IA appelle `search_decisions` avec `{ query: "droit au logement" }`.

```
1. index.ts         Démarre le serveur MCP avec StdioServerTransport
2. server.ts        Reçoit la requête JSON-RPC CallToolRequest
                    → switch(name) → handleSearchDecisions(args, client, openDataClient)
3. tools/search.ts  Valide les paramètres
                    jurisdiction = "CE+TC" (défaut) → routing vers ArianeWebClient
                    → client.search({ query, jurisdiction, classification, ... })
4. clients/         Deux requêtes GET en parallèle (CE + TC)
   arianeweb.ts     → fusion et tri des résultats par date
                    → filtre classification A/B (défaut)
                    → si aucun résultat A/B → fallback CAA (signalé dans la réponse)
5. tools/search.ts  Formate le résultat en texte structuré (Markdown)
6. server.ts        Retourne { content: [{ type: "text", text }] }
7. index.ts         Sérialise en JSON-RPC sur stdout → le client IA reçoit la réponse
```

---

## Description des modules

### `src/index.ts`

Point d'entrée minimal. Crée le serveur via `createServer()` et le connecte à un `StdioServerTransport`. Le serveur tourne tant que stdin est ouvert.

### `src/server.ts`

- Définit les 4 outils MCP avec leurs schémas JSON (descriptions optimisées pour les LLM)
- Instancie `ArianeWebClient` et `OpenDataClient`
- Dispatche les requêtes `call_tool` vers les handlers correspondants
- Gère les erreurs domaine : retournées au LLM via `isError: true` sans crash du transport

### `src/clients/arianeweb.ts`

Client pour l'API Sinequa d'ArianeWeb. **Couche gelée** — ne pas modifier après validation.

- `search(params)` — recherche CE+TC (deux requêtes fusionnées), CE, CAA ou TC
- `getDecision(id)` — trouve le document Sinequa par numéro d'affaire, télécharge le HTML
- `getConclusions(id)` — télécharge le PDF de conclusions, extrait le texte avec `pdf-parse`
- `getAnalyse(id)` — télécharge le HTML d'analyse, extrait le texte avec `cheerio`

Points techniques :
- **Rate limiting** : 500 ms minimum entre requêtes (respect des CGU)
- **Encodage** : les décisions et analyses HTML sont en `iso-8859-1` (décodé avec `latin1`)
- **Conclusions** : format PDF (pas HTML — l'interface web affiche le PDF en iframe)
- **CE+TC** : l'API Sinequa ne supporte pas `SourceStr4=AW_DCE OR AW_DTC` — deux requêtes en `Promise.all`
- **Recherche par numéro** : retourne aussi les docs AW_CRP/AW_AJCE → filtre sur `SourceStr4`

### `src/clients/opendata.ts`

Client pour l'API Elasticsearch d'opendata.justice-administrative.fr.

- `search(params)` — recherche dans tous les TA ou CAA via chaîne OR de codes juridiction
- `getDecision(id)` — récupère le texte intégral via l'endpoint `testView` (highlight Elasticsearch)
- `isOpenDataId(id)` — détecte si un identifiant est au format OpenData (`TA76:...`)
- `parseId(id)` — décompose l'id en `{ codeJuridiction, numeroDossier, identification }`

Format d'identifiant : `{Code_Juridiction}:{Numero_Dossier}:{Identification_sans_ext}`

### `src/tools/search.ts`

Handler `handleSearchDecisions`. Responsabilités :
- Validation et normalisation des paramètres
- Routing : `jurisdiction = "TA"` → `OpenDataClient`, sinon → `ArianeWebClient`
- Logique de fallback CE+TC → CAA si aucun résultat A/B
- Tri des résultats : A > B > C
- Formatage en texte lisible par le LLM

### `src/tools/decision.ts`

Handler `handleGetDecision`. Détecte le format de l'id pour router vers le bon client :
- `OpenDataClient.isOpenDataId(id)` → `openDataClient.getDecision(id)`
- Sinon → `arianeWebClient.getDecision(id)`

### `src/tools/conclusions.ts`

Handler `handleGetConclusions`. Délègue à `arianeWebClient.getConclusions(id)`. Formate le texte extrait du PDF avec nom du rapporteur public si disponible.

### `src/tools/analysis.ts`

Handler `handleGetDecisionAnalysis`. Délègue à `arianeWebClient.getAnalyse(id)`. Formate le texte HTML extrait.

### `src/types/`

Interfaces TypeScript partagées entre clients et outils :
- `DecisionMetadata` — données de base d'une décision (id, numero, date, juridiction...)
- `DecisionComplete` — étend `DecisionMetadata` avec le texte intégral et les champs détaillés
- `Conclusions` — texte des conclusions + nom du rapporteur public
- `Analyse` — texte de l'analyse jurisprudentielle
- `SearchParams` / `SearchResult` — paramètres et résultats de recherche

---

## Décisions d'architecture

### Pourquoi deux clients séparés ?

ArianeWeb (Sinequa) et OpenData (Elasticsearch) ont des APIs, des formats de réponse et des formats d'identifiants radicalement différents. La séparation évite tout couplage et permet de tester chaque client indépendamment.

### Pourquoi la couche `clients/` est-elle gelée ?

Les tests d'intégration valident les clients contre les APIs réelles. Une fois verts, les clients constituent un contrat stable. Les outils (`tools/`) ne dépendent que de l'interface publique des clients, jamais des détails HTTP.

### Pourquoi stdio et pas HTTP ?

Le protocole MCP recommande stdio pour les serveurs locaux — pas de port à ouvrir, pas de problème de réseau ou d'authentification. Docker avec `--rm -i` est la façon standard de packager un serveur MCP stdio.

### Gestion des erreurs

Les erreurs domaine (décision introuvable, conclusions non disponibles) sont retournées au LLM via `isError: true` dans la réponse MCP — le LLM peut alors expliquer le problème à l'utilisateur. Les erreurs réseau propagent une exception qui est attrapée dans `server.ts`.

---

## Stack technique

| Outil | Version | Usage |
|---|---|---|
| TypeScript | 5.x | Langage principal (ESM, NodeNext) |
| Node.js | 20+ | Runtime (fetch natif) |
| `@modelcontextprotocol/sdk` | 1.x | Serveur MCP, transport stdio |
| `cheerio` | 1.x | Parsing HTML des décisions et analyses |
| `pdf-parse` | 2.x | Extraction texte des PDF de conclusions |
| `vitest` | 4.x | Tests unitaires et d'intégration |
| Docker | — | Packaging et déploiement |
