# Limites connues

## Fidélité des masques
- **Masques reconstruits, pas copiés** : le PPTX généré contient un masque générique pptxgenjs-plus et une disposition reconstruite par disposition utilisée. Les masques d'origine, leurs `p:txStyles` complets et l'héritage masque → disposition du gabarit ne sont pas reproduits à l'identique.
- **Non reproduits** (signalés dans `compatibility-report.md`) : formes groupées, dégradés (première couleur), motifs, géométries libres, SmartArt, graphiques et tableaux des dispositions, animations, transitions, objets OLE, effets 3D, WordArt, polices incorporées.
- Pieds de page / dates : remplacés par `footer` / `date` de la présentation (absents si non renseignés). Les champs date automatiques ne sont pas recréés.
- Couleurs `clrMapOvr` par disposition : celles résolues par pptx-masters.

## Édition
- Markdown : la mise en forme de caractères autre que gras/italique est refusée (convertir en DSL). L'édition en ligne remplace les runs d'un paragraphe modifié par du texte simple (gras/italique conservés pour les paragraphes inchangés).
- Pas de multi-sélection par rectangle (Maj+clic seulement), pas de rotation à la souris (champ numérique), pas de groupes.
- Graphiques (charts) non implémentés dans le DSL ni l'éditeur.
- L'annulation passe par l'historique natif du document VS Code : une transaction visuelle = une étape d'annulation (WorkspaceEdit).
- L'insertion d'image copie le fichier dans `images/` à côté de la source si nécessaire.

## Rendu
- L'aperçu navigateur utilise les métriques de police du navigateur : retours à la ligne et débordements peuvent différer de PowerPoint. L'avertissement « débordement probable » est une **estimation** (largeur moyenne des glyphes).
- EMF/WMF : aperçu PNG seulement sous Windows ; ailleurs, cadre hachuré dans l'éditeur (le PPTX contient l'original).
- Rendu de référence : PowerPoint (Windows, COM) ou LibreOffice. Avec LibreOffice, seule la première diapositive est exportée en PNG.

## Dépendances amont
- pptxgenjs-plus 4.3.4 : type MIME EMF manquant et collision des médias de dispositions (`layout-image-N`) — corrigés par l'adaptateur OOXML (`pptx-generator/src/compatibility.ts`). pptxgenjs-plus doit être chargé nativement par Node (import dynamique `Function('return import(s)')`).
- pptx-masters 0.1.1 : pas de `srcRect`, pas de `hidden`, styles du numéro de diapositive hérités non résolus, noms de masques non uniques — compensés dans `master-extractor/src/normalize.ts` sans modifier la bibliothèque.

## Plateforme
- Développé et vérifié sous Windows 11 avec VS Code 1.109.2 et PowerPoint 16. Les chemins sont gérés avec `node:path` ; Linux/macOS non testés (rendu de référence via LibreOffice uniquement).
