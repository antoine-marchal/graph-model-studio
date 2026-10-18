# Architecture

> Principe : **un modèle canonique (`SlideDocument`), plusieurs interfaces d'édition, un seul générateur PowerPoint déterministe.**

```
 .pptx/.potx ──► master-extractor ──► .corporate-slides/master/corporate-master.json (design system)
                  (pptx-masters + adaptateurs OOXML)                │
                                                                    ▼
 .slides.md ─┐                                          ┌──► renderer (React, navigateur) ──► webview WYSIWYG
             ├─► parser ──► SlideDocument (core, Zod) ──┤
 .slides.yaml┘      ▲                                   ├──► validation (charte corporate)
                    │                                   └──► pptx-generator ──► pptxgenjs-plus ──► adaptateur OOXML ──► .pptx
                    │
        mutations typées ◄── webview (glisser, redimensionner, texte, couleurs…)
        appliquées au TEXTE source (édition préservant le format) via WorkspaceEdit
```

## Paquets (`packages/`)

| Paquet | Rôle | Dépend de |
|---|---|---|
| `core` | Schémas Zod (`SlideDocument`, `CorporateMaster`, mutations, protocole webview), unités, thème, géométrie partagée, métriques de texte, validateur de charte | `zod` |
| `parser` | Markdown (`remark` + positions) et DSL (`yaml` Document API) → `SlideDocument` ; application des mutations **sur le texte source** ; sérialisation déterministe | `core` |
| `master-extractor` | Chargement sûr du ZIP, inventaire OOXML, appel de `pptx-masters`, normalisation, ressources, aperçus EMF, vignettes PowerPoint, rapports | `core`, `pptx-masters` |
| `renderer` | Composants React de rendu (diapositive, dispositions, formes, texte) | `core` |
| `pptx-generator` | Adaptateur de masques → `pptxgenjs-plus`, compilation des éléments, adaptateur OOXML, validation du paquet, rapport d'export | `core`, `pptxgenjs-plus` |
| `cli` | Commande `slides` + utilitaires projet partagés avec l'extension | tous sauf `renderer` |
| `vscode-extension` | Commandes, éditeur personnalisé (CustomTextEditor), arbre et navigateur de masques, webview React/Vite/Tailwind | tous |

Aucune dépendance circulaire : `core` ne dépend de rien d'interne ; `renderer` et `parser` ne dépendent que de `core`.

## Modèle canonique

`SlideDocument` (`packages/core/src/schema.ts`) : `version`, `metadata` (titre, auteur, pied de page, date), `masterRef`, `themeRef`, `dimensions`, `constraints` (dérogations), `slides[]`. Chaque `SlideNode` a un `id` stable, une `layout` (id ou alias), des `notes`, des `elements[]`.

Éléments : `text`, `shape` (rect, roundRect, ellipse, triangle, rightArrow, chevron, line — avec texte optionnel), `image`, `table`. Chaque élément porte : `id` stable, `type`, géométrie `x/y/w/h` (pouces, optionnelle si liée à un espace réservé), `rotation`, `z`, `placeholder`, `locked`, `hidden`, `style` (jetons de thème), contenu (`paragraphs` → `runs`), et `source` (provenance calculée : lignes du fichier).

### Unités

| Système | Conversion |
|---|---|
| Canonique | pouce, origine coin haut-gauche, arrondi à 4 décimales |
| OOXML | 1 in = 914 400 EMU |
| Typographie | 1 in = 72 pt |
| Navigateur | 1 in = 96 px CSS à zoom 1 ; le zoom est un `transform: scale()` |

### Fidélité partagée

Le rendu navigateur et le générateur utilisent les **mêmes** fonctions de `core` : `resolveSlide`/`resolveElement` (héritage de géométrie des espaces réservés), `resolveStyle` (cascade style élément → espace réservé → niveau de liste → thème), `paragraphLook` (puces corporate, retraits, tailles par niveau), `resolveColor` (jetons → hex), et les mêmes définitions de forme (`roundRect` rayon = 15 % du petit côté). L'estimation de débordement (`metrics.ts`) est déterministe et partagée par le validateur, l'éditeur et le rapport.

## Synchronisation bidirectionnelle

1. VS Code ouvre `*.slides.md|yaml` avec l'éditeur personnalisé `corporateSlides.editor` (**CustomTextEditorProvider**) : le `TextDocument` reste l'unique source.
2. L'hôte analyse la source → `SlideDocument` → message `document` (avec `version` du document) vers la webview.
3. Une action visuelle produit une **transaction** de mutations typées (`updateElement`, `addElement`, `reorderElement`, `addSlide`, `moveSlide`, `setSlideLayout`, `setNotes`…), appliquée de façon optimiste dans la webview.
4. L'hôte **valide** le message (Zod), vérifie `baseVersion` (sinon conflit → rejet + rechargement), applique les mutations **au texte** (`parser.applyMutations`), puis remplace uniquement la plage modifiée (`WorkspaceEdit`).
5. VS Code gère nativement l'état modifié, la sauvegarde, l'annulation/rétablissement ; `onDidChangeTextDocument` renvoie le document ré-analysé à la webview. Une modification externe suit le même chemin (pas de boucle : la webview n'émet jamais de mutation en réponse à un document reçu).
6. Toute mutation non représentable lève `MutationError` → message `rejected` affiché : **aucune modification visuelle n'est perdue silencieusement**.

Navigation : sélection d'un élément → bouton « Afficher la source » (révèle la ligne) ; déplacement du curseur dans l'éditeur texte → sélection de l'élément correspondant dans la webview.

Contrat testé (`parser.test.ts`) : pour toute transaction `m`, `parse(applyMutations(src, m)) ≡ applyToDocument(parse(src), m)`.

## Génération PPTX

`SlideDocument → layoutToSlideMaster (adaptateur de masques) → pptxgenjs-plus → postProcess (adaptateur OOXML) → validatePackage → .pptx + rapport`.

- Seules les dispositions utilisées sont enregistrées (`defineSlideMaster`, nom = id de disposition).
- Les textes liés à un espace réservé utilisent `placeholder` (héritage PowerPoint conservé) et ne passent que les axes de géométrie surchargés.
- Thème : `pres.theme.themeColors` (12 couleurs) et polices titres/corps.
- Adaptateur OOXML isolé (`pptx-generator/src/compatibility.ts`) : types MIME EMF/WMF, correction de la collision `layout-image-N` de pptxgenjs-plus 4.3.4. Chaque correctif est listé dans le rapport.

## Sécurité

- Gabarit traité comme non fiable : taille, nombre d'entrées, traversée de chemin, ratio de compression (`safety.ts`) **avant** tout parsing ; noms de médias filtrés.
- Webview : CSP stricte (`default-src 'none'`, scripts avec nonce, ressources locales uniquement), `localResourceRoots` restreints, tous les messages entrants validés par Zod.
- Aucune exécution de code issu d'une présentation (le DSL est de la donnée ; `generated-masters.ts` est documentaire, jamais exécuté par l'outil).
- Images : chemins locaux uniquement (URL distantes refusées par le schéma), résolues dans la racine du projet.
- Pas de télémétrie ; journal local dans le canal de sortie « Corporate Slides ».
- Le rendu de référence pilote PowerPoint/LibreOffice **localement** ; les chemins sont passés en arguments de processus, jamais interpolés dans un script.
