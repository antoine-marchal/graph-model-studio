# Évaluation de faisabilité — Corporate Slides Studio

Date : 2026-10-18 · Environnement : Windows 11, Node 24.13.0, pnpm 11.0.9, VS Code 1.109.2, PowerPoint (Office 16) installé, LibreOffice absent.

## 1. Gabarit découvert

| Élément | Valeur |
|---|---|
| Fichier | `COMOP fin PI.6 GSA.pptx` (racine du workspace, 1,7 Mo) |
| SHA-256 | `6d4b4f9ee01ef4be49594c4aa13f658788a7f509c2a7d4253133aaf8d6754bd1` |
| Copie de travail | `assets/corporate/original-template.pptx` (copie octet à octet, l'original n'est jamais modifié) |
| Dimensions | 12 192 000 × 6 858 000 EMU = 13,333 × 7,5 in (16:9) |
| Masques | 2 (`slideMaster1` : 36 dispositions, `slideMaster2` : 39 dispositions) |
| Dispositions | 75, dont de nombreux doublons de nom entre les deux masques |
| Diapositives d'exemple | 11 (utilisent `slideLayout47` « Titre et contenu » et `slideLayout75` « 1_Diapositive de titre », tous deux du masque 2) |
| Thème | dk1 `262626`, dk2 `E50019`, accent1 `3E4A83` … ; polices Arial Black (titres) / Arial (corps) |
| Médias | logos et motifs en **EMF** (vectoriel Windows), photos JPEG/PNG |

## 2. Dépendances vérifiées

| Paquet | Version | Commit inspecté | Licence | Rôle |
|---|---|---|---|---|
| `pptx-masters` | 0.1.1 (npm) | `06bc5196822b8b1c3dea0d07a028ca38457c657e` (2026-02-25) | MIT | Extraction des masques |
| `pptxgenjs-plus` | 4.3.4 (npm) | `64db82c923a1b32a168cbc3a3d30c4780bbc6f9f` (2026-10-05) | MIT | Génération PPTX |
| `pptxgenjs-plus-jsx` | 4.3.4 | idem (monorepo `packages/pptxgenjs-jsx`) | MIT | **Non retenu** (voir §4) |

API réellement exposée par `pptx-masters` (`src/index.js`) : `extract(path, { layouts })` → `{ masterData, themeColors, themeFonts, dimensions, warnings, layouts, mediaFiles, templateName }`. `masterData[i]` est un objet au format `defineSlideMaster()` de **PptxGenJS 3.12** (dépendance déclarée : `pptxgenjs ^3.12.0`). `layouts[i]` (parallèle à `masterData`) porte `_file` et `_masterFile`, ce qui permet de rattacher chaque disposition à sa source OOXML. `mediaFiles` ne contient que des chemins d'archive (pas les octets) : notre extracteur relit les médias lui-même.

## 3. Compatibilité pptx-masters → pptxgenjs-plus (testée, pas supposée)

Spike exécuté : `extract()` sur le gabarit réel → `defineSlideMaster()` de `pptxgenjs-plus` → `writeFile()` → ouverture + export PNG via PowerPoint COM.

| Point | Résultat |
|---|---|
| Format `defineSlideMaster` (background, objects rect/text/image/placeholder, slideNumber) | Compatible |
| Marges de texte | pptx-masters émet `[haut, droite, bas, gauche]` en pouces ; pptxgenjs-plus 4.x documente un tableau **TRBL** avec la règle « < 1 = pouces ». Compatible (l'ancien PptxGenJS utilisait un ordre différent — c'est justement un piège corrigé ici). |
| Thème | `pres.theme = { headFontFace, bodyFontFace, themeColors[12] }` est natif dans pptxgenjs-plus : couleurs et polices du thème corporate reproduites **sans post-traitement**. |
| Titres de masque | pptx-masters dérive `title` du nom : 2 dispositions « Titre et contenu » (une par masque) → collision. **Adaptateur** : identifiants stables uniques. |
| Images EMF | **Bug bloquant constaté** : pptxgenjs-plus n'enregistre pas l'extension `emf` dans `[Content_Types].xml` → PowerPoint refuse le fichier (`E_FAIL`). **Adaptateur OOXML isolé** (`pptx-generator/src/compatibility`) qui ajoute `image/x-emf` / `image/x-wmf`, puis validation du paquet. Après correctif, PowerPoint ouvre et rend le fichier. |
| Formes groupées, dégradés | Non supportés par pptx-masters v0.1 (avertissements « grouped shape … not supported », « Gradient fill … first stop color ») → rapportés, pas masqués. |
| Héritage natif | pptxgenjs-plus écrit **un** `slideMaster1.xml` générique plus une `slideLayoutN.xml` par masque défini, contenant les objets statiques et placeholders reconstruits. Il ne copie pas les masques d'origine. |

**Conclusion sur la méthode de fidélité** : la présentation générée utilise des **définitions de masques reconstruites** (dispositions natives PowerPoint, éditables, avec placeholders natifs), pas l'héritage natif des masques d'origine, ni un aplatissement en image. Ceci est écrit dans chaque rapport d'extraction et d'export.

## 4. Choix techniques

- **JSX non retenu** : notre représentation canonique est une donnée (`SlideDocument`), le compilateur appelle directement l'API impérative `pptxgenjs-plus` ; une couche JSX n'apporterait qu'une indirection.
- **EMF dans le navigateur** : les Webviews ne savent pas afficher l'EMF. Conversion locale EMF → PNG via `System.Drawing` (PowerShell, Windows) lors de l'import ; sinon repli sur un cadre hachuré annoté « EMF non prévisualisable ». L'EMF original reste utilisé dans le PPTX.
- **Rendu de référence** : PowerPoint COM (Windows) disponible ici ; LibreOffice (`soffice`) pris en charge s'il est installé ; sinon la comparaison visuelle est sautée et signalée.
- **Unités canoniques** : pouces (identiques à pptx-masters et pptxgenjs-plus) ; conversions documentées dans `architecture.md`.
- **Édition source** : `yaml` (API Document, préserve commentaires et mise en forme) pour le DSL ; `remark` (positions mdast) pour le Markdown.
- **VS Code** : `CustomTextEditorProvider` → la source texte reste le document VS Code, d'où annuler/rétablir, état modifié et sauvegarde natifs.

## 5. Limites identifiées dès le départ

- Héritage natif des masques d'origine non reproduit (reconstruction).
- Groupes, dégradés, motifs, SmartArt, animations, transitions du gabarit : non reproduits (rapportés).
- Rendu navigateur ≠ rendu PowerPoint (métriques de police approchées) : avertissements de débordement heuristiques, comparaison visuelle par PowerPoint quand disponible.
- Conversion EMF → PNG pour l'aperçu limitée à Windows.
