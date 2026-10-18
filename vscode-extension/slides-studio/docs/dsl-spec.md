# Spécification des sources

Deux formats, un seul modèle (`SlideDocument`). Extensions reconnues : `.deck`, `.slides.md`, `.slides.yaml`, `.slides.yml`, `.slides.json` (le JSON est lu par le parseur YAML 1.2).

**`.deck`** est le format recommandé : la syntaxe hybride Markdown + YAML du mode 1 ci-dessous (en-tête YAML, diapositives Markdown, `elements:` YAML par diapositive pour le placement précis). VS Code l'ouvre directement dans l'éditeur visuel ; le bouton **Source** (ou `Corporate Slides: Basculer éditeur visuel / source`) affiche le texte.

**Diagrammes Graph Model Studio** : une image dont `src` est un fichier `.gmc` est un diagramme. La source reste dans le `.gmc` versionné ; l'aperçu et le PowerPoint affichent le rendu `.png` voisin (`diagrams/flux.gmc` → `diagrams/flux.png`), régénéré par l'extension Graph Model Studio à chaque enregistrement du `.gmc`.

```yaml
elements:
  - id: flux
    type: image
    src: diagrams/flux.gmc
    x: 2
    y: 1.8
    w: 9.2
    h: 4.6
```

En Markdown pur : `![Flux applicatifs](diagrams/flux.gmc)` (lié à l'espace réservé image de la disposition).

## Conventions communes

- **Unités** : pouces (`in`), origine en haut à gauche de la diapositive. 4 décimales maximum (arrondi à l'écriture).
- **Couleurs** : `theme.<emplacement>` (`dk1`, `lt1`, `dk2`, `lt2`, `accent1`…`accent6`, `hlink`, `folHlink`), `theme.<emplacement>.<variante>` (`lighter80`, `lighter60`, `lighter40`, `lighter25`, `darker25`, `darker50`), `#RRGGBB` (déconseillé : avertissement « hors charte » si absent de la palette), ou `none`.
- **Polices** : `theme.heading`, `theme.body` ou un nom de famille (avertissement si non autorisé).
- **Dispositions** : id (`titre-et-contenu`) ou alias générique (`title`, `content`, `two-columns`, `section`, `title-only`, `blank`, `agenda`, `quote`, `end`, `comparison`, `image-content`). Voir `.corporate-slides/master/slide-masters.md`.
- **Espaces réservés** : clés stables par disposition : `title`, `subtitle`, `body`, `body-2`…, `pic`… Alias : `content`/`text` → premier `body` ; `left`/`right` → 1er/2e `body` par position horizontale ; `subtitle` ↔ `body` en repli mutuel.
- **Identifiants** : `[A-Za-z0-9][A-Za-z0-9_-]{0,63}`, uniques par diapositive (éléments) et par document (diapositives).
- **Texte en ligne** : `**gras**`, `*italique*`, `\*` échappe. Dans une chaîne `content` : une ligne = un paragraphe ; `- ` puce ; `1. ` numéroté ; deux espaces d'indentation par niveau (0–4) ; `## ` sous-titre en gras.

## Héritage et valeurs par défaut

1. Un élément lié à un espace réservé **sans** géométrie hérite de la position/taille de la disposition (et reste lié dans le PPTX). Toute coordonnée explicite surcharge **cet axe seulement**.
2. Style : élément → espace réservé (police, taille, couleur, alignement, marges) → niveaux de liste du masque (puces corporate, retraits, tailles) → thème.
3. Formes : remplissage `theme.accent1`, texte blanc centré ; ligne : `theme.dk1`, 1,5 pt.
4. Éléments libres sans géométrie : boîte centrée par défaut (et avertissement « zone de sécurité » éventuel).
5. Ordre d'empilement : ordre du fichier ; `z` explicite prioritaire.

## Mode 1 — Markdown (`.slides.md`)

```markdown
---                     ← en-tête du document (obligatoire en tête de fichier)
title: Architecture
author: DSI
master: corporate
theme: default
footer: Texte du pied de page corporate
date: 18/10/2026
constraints:            ← dérogations locales (le gabarit n'est jamais modifié)
  rules: { palette: off }
---

---                     ← séparateur de diapositive
id: cover               ← en-tête de diapositive (clés autorisées : id, layout, notes, hidden, elements)
layout: title
---

# Titre {#id-optionnel}

Sous-titre (premier paragraphe directement après le titre, s'il est le seul bloc libre)

---
layout: two-columns
elements:               ← surcharges (même id) ou éléments supplémentaires (DSL complet)
  - id: left
    x: 0.8
    w: 6
  - id: badge
    type: shape
    shape: roundRect
    x: 10
    y: 1
    w: 2
    h: 0.6
    content: '**Nouveau**'
    style: { fill: theme.accent3 }
---

# Principes {#main-title}

::: left                ← bloc lié à un espace réservé (left, right, body-2, subtitle…)
- Point
  - Sous-point
:::

::: right {#col-droite}
1. Étape
:::

::: notes               ← notes de l'orateur
Texte des notes.
:::
```

### Règles exactes

| Construction | Résultat |
|---|---|
| Lignes `---` (hors blocs de code) | séparateurs de diapositives |
| Segment YAML entre deux `---` dont toutes les clés sont `id`, `layout`, `notes`, `hidden`, `elements` | en-tête de la diapositive suivante |
| Premier `# Titre` | élément `title` (id `title` ou `{#id}`), lié à `title` |
| Paragraphe unique suivant immédiatement le titre | élément `subtitle`, lié à `subtitle` |
| Autres blocs (paragraphes, listes, `##`…`######`, citations, code) | un élément `body`, lié à `body` |
| Paragraphe ne contenant qu'une image `![alt](chemin)` (+ `{#id}` facultatif) | élément `image` (`image-N`), lié à `pic` |
| Tableau GFM | élément `table` (`table-N`) ; lié à `body` s'il n'y a pas de texte libre |
| `::: nom {#id}` … `:::` | élément texte lié à l'espace réservé `nom` ; `notes` = notes |
| `<!-- commentaires -->` | conservés tels quels, ignorés par le rendu |
| Diapositive sans `id` | id implicite `slide-N` ; matérialisé dans l'en-tête dès la première opération structurelle (ajout, déplacement…) |

### Ce qui est sans perte en Markdown

| Modification visuelle | Écriture dans la source |
|---|---|
| Texte d'un titre, sous-titre, corps, bloc `:::` | réécriture du bloc Markdown concerné (le reste du fichier est intact) |
| Position, taille, rotation, style, verrouillage, liaison | surcharge dans `elements:` de l'en-tête de diapositive |
| Ajout d'un élément (forme, texte, image, tableau) | entrée DSL complète dans `elements:` |
| Ordre des calques | valeurs `z` dans `elements:` |
| Ajout / duplication / suppression / déplacement de diapositive, disposition, notes | manipulation des blocs de diapositive / en-tête |
| Mise en forme de caractères autre que gras/italique (couleur de run, souligné) | **refusée** en Markdown (message explicite) → convertir en DSL |

La commande **« Convertir en DSL complet »** (`slides convert`) produit un `.slides.yaml` équivalent, explicite et sans perte (le `.md` est conservé).

## Mode 2 — DSL déclaratif (`.slides.yaml`)

```yaml
presentation:
  title: Architecture cible      # métadonnées : title, author, subject, footer, date
  master: corporate
  theme: default
  constraints: { minMargin: 0.2 }
slides:
  - id: overview                 # obligatoire, stable
    layout: content
    notes: |
      Notes de l'orateur
    hidden: false
    elements:
      - id: title-1
        type: text               # défaut : text
        placeholder: title
        content: Architecture cible
      - id: plm-box
        type: shape
        shape: roundRect
        x: 1.0
        y: 2.0
        w: 3.2
        h: 1.1
        rotation: 0
        content: '**PLM**'
        style:
          fill: theme.accent1
          line: none
          color: theme.lt1
          fontFace: theme.body
          fontSize: 20
          bold: true
          align: center          # left | center | right | justify
          valign: middle         # top | middle | bottom
      - id: logo
        type: image
        src: images/schema.png   # relatif au fichier source ; URL distantes refusées
        alt: Schéma
        x: 8
        y: 2
        w: 4
        h: 3
      - id: planning
        type: table
        header: true
        x: 0.8
        y: 4.5
        w: 11
        h: 2
        rows:
          - [Lot, Périmètre, Échéance]
          - ['1', Référentiel, T1 2027]
```

Champs d'élément : `id`, `type` (`text` | `shape` | `image` | `table`), `placeholder`, `shape`, `x`, `y`, `w`, `h`, `rotation`, `z`, `locked`, `hidden`, `name`, `content` **ou** `paragraphs` (forme riche : `[{ runs: [{ text, bold, italic, underline, color }], list, level, heading }]`), `src`, `alt`, `rows`, `header`, `flipH`, `flipV`, `style` (`fill`, `line`, `lineWidth` pt, `dash` solid|dash|dot, `transparency` 0–100, `fontFace`, `fontSize` pt, `color`, `bold`, `italic`, `underline`, `align`, `valign`, `lineSpacing`).

Les éditions visuelles utilisent l'API Document de `yaml` : **commentaires, lignes vides et ordre des clés sont conservés** ; les nouvelles chaînes multilignes sont écrites en bloc `|`.

## Validation

`slides validate <fichier>` / commande VS Code : erreurs de syntaxe (avec numéro de ligne), erreurs de schéma, puis règles de charte (voir `limitations.md` et `core/src/validation.ts`) : disposition inconnue, identifiants dupliqués, image manquante (erreurs bloquantes) ; espace réservé inconnu, hors diapositive, hors zone de sécurité, débordement de texte estimé, couleur hors palette, police non autorisée, taille hors hiérarchie, chevauchement du logo, titre manquant, image déformée (avertissements). Gravité de chaque règle modifiable par `constraints.rules` (`error` | `warning` | `off`).
