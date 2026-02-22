# Documentation des APIs

Ce projet exploite deux APIs publiques non officielles pour accéder à la jurisprudence administrative française.

---

## API ArianeWeb (Conseil d'État)

### Présentation

ArianeWeb est la base de jurisprudence officielle du Conseil d'État. Elle est propulsée par le moteur de recherche **Sinequa** et expose un endpoint JSON non documenté utilisé par l'interface web.

**Couverture :** ~300 000 décisions — Conseil d'État (CE), Cours administratives d'appel (CAA), Tribunal des conflits (TC), conclusions de rapporteurs publics (PDF), analyses jurisprudentielles AJCE.

### Endpoint de recherche

```
GET https://www.conseil-etat.fr/xsearch?type=json
```

Sans authentification. Supporte aussi POST (form-encoded).

#### Paramètres de recherche

| Paramètre | Description | Exemple |
|---|---|---|
| `advanced` | Active le mode avancé | `1` |
| `SourceStr4` | Code source (juridiction) | `AW_DCE` |
| `SearchText` | Recherche plein texte | `droit au logement` |
| `SourceStr8` | Classification | `A`, `B`, `C` |
| `SourceCsv1` | Numéro d'affaire | `488011` |
| `SourceInt1` | Filtre par année | `2024` |
| `SkipFrom` | Offset pagination (multiple de 20) | `20`, `40` |
| `sort` | Tri | `SourceDateTime1 desc` |

#### Codes source (SourceStr4)

| Code | Contenu |
|---|---|
| `AW_DCE` | Décisions Conseil d'État |
| `AW_DCA` | Arrêts Cours administratives d'appel |
| `AW_DTC` | Décisions Tribunal des conflits |
| `AW_CRP` | Conclusions rapporteurs publics (PDF) |
| `AW_AJCE` | Analyses jurisprudentielles CE |
| `AW_AJCA` | Analyses jurisprudentielles CAA |
| `AW_AJTC` | Analyses jurisprudentielles TC |

#### Structure de la réponse JSON

```json
{
  "TotalCount": 1523,
  "DocumentsPerPage": 20,
  "DocumentCount": 20,
  "Documents": [
    {
      "Id": "/Ariane_Web/AW_DCE/|488011",
      "SourceStr4": "AW_DCE",
      "SourceStr5": "488011",
      "SourceStr8": "A",
      "SourceStr21": "Résumé de la décision...",
      "SourceDateTime1": "2025-12-30 00:00:00",
      ...
    }
  ]
}
```

#### Pagination

- 20 résultats par page (fixe côté API)
- Paramètre `SkipFrom` : `0`, `20`, `40`...
- `TotalCount` indique le nombre total de résultats

### Mapping complet des champs Sinequa

| Alias interne | Champ Sinequa | Description |
|---|---|---|
| `JURIDICTION` | `SourceStr3` | Nom de la juridiction |
| `FOND` | `SourceStr4` | Code source (AW_DCE, AW_DCA...) |
| `DEC_ID` | `SourceStr5` | Numéro de décision |
| `NUMROLE` | `SourceStr6` | Numéro de rôle |
| `FORMATION` | `SourceStr7` | Formation de jugement |
| `REFBIB` | `SourceStr8` | Classification A/B/C |
| `DEGRE` | `SourceStr9` | Type d'instance |
| `REQ` | `SourceStr13` | Requérant |
| `DEF` | `SourceStr15` | Défendeur |
| `RAP` | `SourceStr16` | Rapporteur |
| `PDT` | `SourceStr17` | Président |
| `CDG` | `SourceStr18` | Rapporteur public |
| `ABSTRACT` | `SourceStr21` | Résumé court (disponible dans les résultats) |
| `ECLI_ID` | `SourceStr30` | Identifiant ECLI |
| `PERMLINK` | `SourceStr39` | Base du lien permanent |
| `AFF_ID` | `SourceCsv1` | Numéro(s) d'affaire (séparés par `;` si jointure) |
| `ANNEE` | `SourceInt1` | Année de lecture |
| `ANALYSE_ID` | `SourceCsv6` | ID Sinequa du document d'analyse |
| `CONCLUSION_ID` | `SourceCsv7` | ID Sinequa du PDF de conclusions |
| `DATE_LEC` | `SourceDateTime1` | Date de lecture (ISO) |
| `SINEQUA_ID` | `Id` | ID interne Sinequa |

### Endpoint de téléchargement

```
GET https://www.conseil-etat.fr/plugin?plugin=Service.downloadFilePagePlugin&Index=Ariane_Web&Id={encodedSinequaId}
```

- `Id` = ID Sinequa encodé URL (ex : `%2FAriane_Web%2FAW_DCE%2F%7C488011`)
- Décisions et analyses : **HTML encodé iso-8859-1** (décoder avec `latin1`)
- Conclusions : **PDF** (parser avec `pdf-parse`)

### Lien permanent d'une décision

```
https://www.conseil-etat.fr/fr/arianeweb{PERMLINK}{DATE_LEC[:10]}/{AFF_ID}
```

Exemples :
- CE : `https://www.conseil-etat.fr/fr/arianeweb/CE/decision/2025-12-30/488011`
- TC : `https://www.conseil-etat.fr/fr/arianeweb/TC/decision/2026-02-09/C4365`
- CAA : `https://www.conseil-etat.fr/fr/arianeweb/CAA/decision/DATE/07MA01549`

> L'URL est une SPA Angular — valide comme lien permanent de navigation.

### Limitations connues

- **Filtre de date précis** : non supporté en GET. Seul le filtre par année (`SourceInt1=YYYY`) fonctionne.
- **Multi-source** : Sinequa ne supporte pas `SourceStr4=AW_DCE OR AW_DTC` en GET. La recherche CE+TC nécessite deux requêtes fusionnées.
- **Recherche par numéro** : retourne aussi les documents AW_CRP et AW_AJCE associés — filtrer par `SourceStr4` pour isoler les décisions.

---

## API OpenData justice-administrative.fr

### Présentation

L'API OpenData expose les décisions des **Tribunaux administratifs (TA)** et des **Cours administratives d'appel (CAA)**, publiées en open data depuis 2022. Elle est basée sur Elasticsearch.

**Couverture :** TA (41 codes) et CAA (9 codes). Le Conseil d'État et le Tribunal des conflits ne sont pas disponibles sur cette API.

### URL de base

```
https://opendata.justice-administrative.fr/recherche/api
```

### Route de recherche

```
GET /model_search_juri/openData/{juriEncoded}/{keyword}/{limit}
```

| Paramètre | Description |
|---|---|
| `juriEncoded` | Code juridiction URL-encodé, ou chaîne OR (ex : `TA75 OR TA76 OR ...`) |
| `keyword` | Mots-clés de recherche URL-encodés |
| `limit` | Nombre maximum de résultats (max 20 recommandé) |

**Codes TA disponibles :** `TA06`, `TA13`, `TA14`, `TA20`, `TA21`, `TA25`, `TA30`, `TA31`, `TA33`, `TA34`, `TA35`, `TA38`, `TA44`, `TA45`, `TA51`, `TA54`, `TA59`, `TA63`, `TA64`, `TA67`, `TA69`, `TA75`, `TA76`, `TA77`, `TA78`, `TA80`, `TA83`, `TA86`, `TA87`, `TA93`, `TA95`, `TA101`–`TA109`

**Codes CAA disponibles :** `CAA13`, `CAA31`, `CAA33`, `CAA44`, `CAA54`, `CAA59`, `CAA69`, `CAA75`, `CAA78`

> Note : `"TA"` ou `"CAA"` seuls (sans numéro) retournent 0 résultats.

### Route texte intégral

```
GET /testView/openData/vu/{identification}/{codeJuridiction}/{numeroDossier}
```

- Utiliser `vu` comme mot-clé (présent dans "Vu la procédure suivante" de toute décision)
- La réponse contient `highlight.paragraph[0]` : texte complet délimité par `$$$`
- Les balises `<mark>` entourent les occurrences du mot-clé → à supprimer

### Structure de la réponse

```json
{
  "decisions": {
    "body": {
      "hits": {
        "total": { "value": 42 },
        "hits": [
          {
            "_id": "...",
            "_source": {
              "Identification": "ORTA_2600849_20260218.xml",
              "Code_Juridiction": "TA76",
              "Nom_Juridiction": "Tribunal Administratif de Rouen",
              "Numero_ECLI": "undefined",
              "Code_Publication": "D",
              "Formation_Jugement": "undefined",
              "Numero_Dossier": "2600849",
              "Type_Decision": "Ordonnance",
              "Date_Lecture": "2026-02-18",
              "lastModified": "2026-02-19"
            },
            "highlight": null
          }
        ]
      }
    }
  }
}
```

### Champs `_source`

| Champ | Description | Notes |
|---|---|---|
| `Identification` | Nom du fichier XML source | ex : `ORTA_2600849_20260218.xml` |
| `Code_Juridiction` | Code de la juridiction | ex : `TA76`, `CAA75` |
| `Nom_Juridiction` | Nom complet | ex : `Tribunal Administratif de Rouen` |
| `Numero_ECLI` | Identifiant ECLI | souvent la chaîne `"undefined"` |
| `Code_Publication` | Classification | `A`, `B`, `C`, `D`, `""` |
| `Formation_Jugement` | Formation | souvent la chaîne `"undefined"` |
| `Numero_Dossier` | Numéro de dossier | ex : `2600849` |
| `Type_Decision` | Type | `Ordonnance` ou `Décision` |
| `Date_Lecture` | Date ISO | ex : `2026-02-18` |
| `lastModified` | Date de mise à jour | ex : `2026-02-19` |

### Format de l'identifiant interne

```
{Code_Juridiction}:{Numero_Dossier}:{Identification_sans_extension}
```

Exemple : `TA76:2600849:ORTA_2600849_20260218`

### Limitations connues

- **Pas de pagination** : l'API ne supporte pas de paramètre d'offset. Seule la première page est accessible (scroll Elasticsearch non implémenté).
- **Pas de conclusions ni d'analyses** : seul le texte intégral de la décision est disponible.
- **Pseudonymisation variable** : certains champs comme `Numero_ECLI` et `Formation_Jugement` peuvent valoir la chaîne littérale `"undefined"`.

---

## Respect des CGU

Les deux APIs sont interrogées avec un délai minimum de **500 ms entre les requêtes** (rate limiting implémenté dans les clients).
