# Tests

| Suite | Commande | Outil | Couvre |
|---|---|---|---|
| Unitaires | `pnpm test` | Vitest | unités, grammaire en ligne, mutations canoniques, parseurs Markdown/DSL, éditions préservant le format, contrat aller-retour |
| Intégration | `pnpm test` | Vitest | import du **gabarit réel**, sûreté ZIP, artefacts, export PPTX, structure OOXML, objets natifs, dispositions, thème, polices, correctifs, validation de charte |
| Visuel | `pnpm test` (ignoré si PowerPoint absent) | Vitest + PowerPoint COM + pngjs | comparaison pixel par pixel des dispositions d'origine et reconstruites |
| Interaction | `pnpm test:e2e` | Playwright + harnais webview | ouverture, édition en ligne, déplacement, redimensionnement, couleur par jeton, annuler/rétablir, sauvegarde et rechargement, DSL, ajout de diapositive/forme, clavier, modifications externes |
| Hôte VS Code | `pnpm --filter corporate-slides-studio test:host` | @vscode/test-electron (VS Code installé) | commandes d'import, éditeur personnalisé, transaction (même chemin que la webview), rejet des mutations invalides, annuler/rétablir natifs, sauvegarde, validation, export |

Le **harnais** (`packages/extension/webview/harness/`) exécute la vraie interface webview dans Chromium en émulant l'hôte avec le même code (`parser`, `core`) et persiste via un pont fichiers réservé au serveur de développement (jamais livré dans le `.vsix`). Les tests copient les exemples dans `tests/.tmp/` : les exemples ne sont jamais modifiés.

## Résultats (2026-10-18, Windows 11, Node 24.13, VS Code 1.109.2, PowerPoint 16)

- Vitest : **3 + 1 fichiers, 44 tests réussis** (unitaires 22, intégration 15, visuel 7).
- Playwright : **12 tests réussis** (8 interactions + 4 captures d'écran dans `docs/screenshots/`).
- Hôte VS Code : **réussi** (import, éditeur visuel, transaction, rejet, annuler/rétablir, sauvegarde, validation, export).
- `tsc --noEmit` strict sur tout le dépôt : 0 erreur.

## Comparaison visuelle

Même moteur (PowerPoint) des deux côtés : (a) diapositive vide de chaque disposition **du gabarit d'origine**, (b) diapositive vide de la disposition **reconstruite** dans notre PPTX ; rendu 640 px de large. Mesure : part des pixels dont l'écart dépasse 48/255 sur un canal ; tolérance **2 %**.

| Disposition | Pixels différents | Écart moyen (0–255) |
|---|---|---|
| title (diapositive-de-titre) | 0,00 % | 0,00 |
| content (titre-et-contenu) | 0,05 % | 0,07 |
| two-columns (deux-contenus) | 0,05 % | 0,08 |
| section (titre-de-section) | 0,26 % | 0,49 |
| title-only (titre-seul) | 0,06 % | 0,08 |
| quote (citation) | 0,33 % | 0,61 |
| end (fin) | 0,14 % | 0,34 |

Écarts observés : texte du pied de page (le gabarit affiche son propre texte d'exemple), numéro de diapositive, logo blanc des dispositions rouges (image de masque groupée non reproduite). Ces chiffres ne prouvent **pas** une fidélité au pixel du contenu : ils portent sur les dispositions vides. Le rendu navigateur de l'éditeur n'est pas comparé automatiquement (polices et moteur de texte différents) ; le bouton « Rendu de référence » permet la vérification visuelle d'une diapositive avec PowerPoint.

## Régénérer les preuves

```bash
pnpm test
pnpm test:e2e
pnpm --filter corporate-slides-studio test:host
node packages/cli/dist/cli.cjs build examples/corporate-demo/deck.slides.md --render
```
