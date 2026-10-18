# Extraction des masques

Commande : `Corporate Slides: Importer un gabarit PowerPoint` ou `slides master import [gabarit] [--thumbnails]`. Sans argument, le gabarit est découvert dans le projet (`*.pptx`/`*.potx`, hors `node_modules`, `out`, dossiers cachés). Le fichier source est seulement lu (SHA-256 consigné et vérifié par les tests).

## Étapes

1. **Contrôle de sûreté** (`safety.ts`) : taille ≤ 300 Mo, ≤ 10 000 entrées, pas de traversée de chemin, ratio de compression, présence de `presentation.xml`.
2. **Inventaire OOXML** (`ooxml.ts`) : masques (`sldMasterIdLst`), dispositions par masque dans l'ordre (`sldLayoutIdLst`), type OOXML des dispositions, utilisation par les diapositives du gabarit (masque principal = le plus utilisé), médias, polices incorporées, relations externes, fonctionnalités non prises en charge (groupes, dégradés, motifs, géométries libres, rognages, SmartArt, graphiques, animations, OLE…).
3. **pptx-masters `extract()`** : thème, palette (via `generateThemeJson`), arrière-plans, espaces réservés, numéros de diapositive, objets statiques au format `defineSlideMaster`.
4. **Styles de texte du masque** : `p:txStyles` (titres, corps par niveau : tailles, couleurs, puces) et style du numéro de diapositive, résolus avec les fonctions internes de pptx-masters (`createColorResolver`, `extractTextProps`).
5. **Adaptateurs de normalisation** (`normalize.ts`) :
   - identifiants stables et uniques (`titre-et-contenu`, doublons d'un autre masque suffixés `-m1`) ;
   - clés d'espaces réservés stables (`title`, `subtitle`, `body`, `body-2`…), car les noms du gabarit ne sont pas uniques ;
   - alias génériques (type OOXML → composition des espaces réservés → mots-clés du nom) ;
   - rognage `a:srcRect` récupéré (ignoré par pptx-masters) ;
   - objets `hidden="1"` exclus (pptx-masters les reproduisait) ;
   - objets hors diapositive (annotations « Disposition : … », « Astuce : … ») exclus et signalés ;
   - rôles : `logo` (petites images en coin, pour la règle de chevauchement), `footer`/`date` (remplacés par les métadonnées de la présentation), `decoration`, `text` ;
   - taille par défaut des pieds de page et style hérité du numéro de diapositive.
6. **Ressources** : copie des médias dans `assets/` ; EMF/WMF convertis en PNG d'aperçu (Windows, `System.Drawing`, local) — l'original vectoriel reste utilisé dans le PPTX.
7. **Vignettes de référence** (option) : PowerPoint (COM, local) ouvre une **copie temporaire** du gabarit en lecture seule, ajoute une diapositive par disposition et exporte des PNG (`thumbnails/m<masque>-l<disposition>.png`), sans jamais enregistrer.
8. **Contraintes dérivées** : polices autorisées, plages de tailles, palette (thème + variantes + couleurs utilisées par le gabarit), zone de sécurité (titre + corps de la disposition `content`), marge minimale, ratio.

## Artefacts (`.corporate-slides/master/`)

| Fichier | Contenu |
|---|---|
| `corporate-master.json` | design system normalisé (schéma `CorporateMaster`, validé par Zod au chargement) |
| `theme.json`, `layouts.json` | extraits pratiques |
| `generated-masters.ts` | module TypeScript enregistrant les masques reconstruits dans pptxgenjs-plus (pour les développeurs ; jamais exécuté par l'outil) |
| `extraction-report.md` | masques, thème, dispositions, ressources, avertissements |
| `compatibility-report.md` | méthode de fidélité, fonctionnalités non reproduites, compatibilité des bibliothèques |
| `slide-masters.md` | référence pour développeurs et agents IA |
| `style-guide.md` | guide éditorial **jamais écrasé** |
| `assets/`, `thumbnails/` | médias et aperçus |

## Méthode de fidélité (déclarée dans chaque rapport)

| Méthode | Utilisée |
|---|---|
| Héritage natif des masques d'origine | **Non** — pptxgenjs-plus ne sait pas importer les masques d'un fichier |
| Définitions de masques reconstruites | **Oui** — une disposition PowerPoint native par disposition du gabarit, avec espaces réservés natifs |
| Approximation aplatie | Non |

Comparaison mesurée (PowerPoint, même moteur des deux côtés) : voir `testing.md`.
