---
title: Architecture PLM / MES / ERP
author: Direction des systèmes d'information
master: corporate
theme: default
footer: Corporate Slides Studio — démonstration
date: 18/10/2026
---

---
id: cover
layout: title
---

# Architecture PLM / MES / ERP

Paysage cible et stratégie d'intégration

---
id: agenda
layout: content
---

# Sommaire

- Contexte et enjeux
- Principes d'intégration
- Paysage cible
- Feuille de route

---
id: principles
layout: two-columns
---

# Principes d'intégration

::: left
## PLM
- Définition produit
- Gestion de configuration
- Modifications techniques
:::

::: right
## MES / ERP
- Orchestration de l'exécution
- Opérations de fabrication
- Planification des ressources
:::

::: notes
Insister sur la séparation des responsabilités entre PLM et ERP.
:::

---
id: landscape
layout: title-only
elements:
  - id: plm-box
    type: shape
    shape: roundRect
    x: 0.9
    y: 2.2
    w: 3.2
    h: 1.4
    content: '**PLM**'
    style:
      fill: theme.accent1
      fontSize: 24
  - id: mes-box
    type: shape
    shape: roundRect
    x: 5.05
    y: 2.2
    w: 3.2
    h: 1.4
    content: '**MES**'
    style:
      fill: theme.accent5
      fontSize: 24
  - id: erp-box
    type: shape
    shape: roundRect
    x: 9.2
    y: 2.2
    w: 3.2
    h: 1.4
    content: '**ERP**'
    style:
      fill: theme.dk2
      fontSize: 24
  - id: flow-1
    type: shape
    shape: rightArrow
    x: 4.2
    y: 2.65
    w: 0.75
    h: 0.5
    style:
      fill: theme.dk1.lighter40
  - id: flow-2
    type: shape
    shape: rightArrow
    x: 8.35
    y: 2.65
    w: 0.75
    h: 0.5
    style:
      fill: theme.dk1.lighter40
  - id: caption
    type: text
    x: 0.9
    y: 4.2
    w: 11.5
    h: 1.2
    content: |-
      Nomenclature d'ingénierie → nomenclature de fabrication → ordres de fabrication
      *Flux unidirectionnels, référentiel article maîtrisé par le PLM*
    style:
      fontSize: 16
      align: center
---

# Paysage cible

---
id: roadmap
layout: content
---

# Feuille de route

| Lot | Périmètre | Échéance |
| --- | --- | --- |
| 1 | Référentiel article PLM | T1 2027 |
| 2 | Interface PLM → ERP | T2 2027 |
| 3 | Intégration MES | T4 2027 |

---
id: end
layout: end
---

# Merci
