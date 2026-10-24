---
title: Quarterly review
client: Contoso
markdownStudio:
  version: 1
  master: studio-body
  fields:
    client: Contoso
    version: "2.1"
  objects:
    arch:
      type: image
      placement: anchored
      box: { x: 300, y: 0, width: 160, height: 100 }
      wrap: square
      name: Architecture
    note:
      type: textbox
      placement: anchored
      box: { x: 0, y: 10, width: 180, height: 60 }
      wrap: square
      style: { fill: E7F3F8, line: 1F6BFF, lineWidth: 1 }
      name: Side note
    stamp:
      type: shape
      shape: ellipse
      placement: page
      relativeTo: margin
      box: { x: 380, y: 600, width: 70, height: 70 }
      plane: front
      style: { fill: FFC000, line: null }
      name: Approved stamp
    a:
      type: shape
      shape: rect
      placement: anchored
      box: { x: 0, y: 0, width: 110, height: 50 }
      wrap: topBottom
      group: flow
      style: { fill: 4D8DFF }
    b:
      type: shape
      shape: rect
      placement: anchored
      box: { x: 220, y: 0, width: 110, height: 50 }
      wrap: topBottom
      group: flow
      style: { fill: 70AD47 }
    ab:
      type: connector
      placement: anchored
      box: { x: 0, y: 0, width: 0, height: 0 }
      group: flow
      from: { id: a, side: right }
      to: { id: b, side: left }
      style: { endArrow: triangle }
    ghost:
      type: shape
      shape: rect
      placement: anchored
      hidden: true
      box: { x: 0, y: 0, width: 20, height: 20 }
---

# Quarterly review

<!-- embed:toc -->
<!-- embed:toc:end -->

<!-- ms:block {"id":"lead","style":"Lead"} -->
This report summarises the quarter for **Contoso**: <span style="color:#C62828">two risks</span> need attention and <mark>one decision</mark> is pending.

## Highlights

<!-- ms:object {"id":"arch"} -->
![Architecture overview](assets/architecture.png)
<!-- ms:endobject -->

Revenue grew steadily across every region while operating costs stayed flat. The platform team shipped the new ingestion pipeline ahead of schedule. Customer satisfaction scores improved for the third consecutive quarter. Risks remain around supplier concentration and hiring in the data group. Revenue grew steadily across every region while operating costs stayed flat. The platform team shipped the new ingestion pipeline ahead of schedule. Customer satisfaction scores improved for the third consecutive quarter. Risks remain around supplier concentration and hiring in the data group. Revenue grew steadily across every region while operating costs stayed flat. The platform team shipped the new ingestion pipeline ahead of schedule. Customer satisfaction scores improved for the third consecutive quarter. Risks remain around supplier concentration and hiring in the data group. Revenue grew steadily across every region while operating costs stayed flat. The platform team shipped the new ingestion pipeline ahead of schedule.

<!-- ms:object {"id":"note"} -->
**Note** — figures are unaudited.
<!-- ms:endobject -->

Revenue grew steadily across every region while operating costs stayed flat. The platform team shipped the new ingestion pipeline ahead of schedule. Customer satisfaction scores improved for the third consecutive quarter. Risks remain around supplier concentration and hiring in the data group. Revenue grew steadily across every region while operating costs stayed flat. The platform team shipped the new ingestion pipeline ahead of schedule. Customer satisfaction scores improved for the third consecutive quarter. Risks remain around supplier concentration and hiring in the data group. Revenue grew steadily across every region while operating costs stayed flat. The platform team shipped the new ingestion pipeline ahead of schedule.

- Shipped the ingestion pipeline
- Hired 4 engineers
  1. Two in data
  2. Two in platform
- [x] Closed the audit

<!-- ms:object {"id":"a"} -->
Plan
<!-- ms:endobject -->

<!-- ms:object {"id":"b"} -->
Deliver
<!-- ms:endobject -->

<!-- ms:object {"id":"ab"} -->

<!-- ms:object {"id":"ghost"} -->

Revenue grew steadily across every region while operating costs stayed flat. The platform team shipped the new ingestion pipeline ahead of schedule. Customer satisfaction scores improved for the third consecutive quarter. Risks remain around supplier concentration and hiring in the data group. Revenue grew steadily across every region while operating costs stayed flat. The platform team shipped the new ingestion pipeline ahead of schedule. Customer satisfaction scores improved for the third consecutive quarter. Risks remain around supplier concentration and hiring in the data group. Revenue grew steadily across every region while operating costs stayed flat. The platform team shipped the new ingestion pipeline ahead of schedule. Customer satisfaction scores improved for the third consecutive quarter. Risks remain around supplier concentration and hiring in the data group.

## Regional figures

| Row | Region | Value | Status |
| --- | ------ | ----: | ------ |
| R01 | North | 100 | At risk |
| R02 | South | 107 | On track |
| R03 | East | 114 | On track |
| R04 | West | 121 | At risk |
| R05 | North | 128 | On track |
| R06 | South | 135 | On track |
| R07 | East | 142 | At risk |
| R08 | West | 149 | On track |
| R09 | North | 156 | On track |
| R10 | South | 163 | At risk |
| R11 | East | 170 | On track |
| R12 | West | 177 | On track |
| R13 | North | 184 | At risk |
| R14 | South | 191 | On track |
| R15 | East | 198 | On track |
| R16 | West | 205 | At risk |
| R17 | North | 212 | On track |
| R18 | South | 219 | On track |
| R19 | East | 226 | At risk |
| R20 | West | 233 | On track |
| R21 | North | 240 | On track |
| R22 | South | 247 | At risk |
| R23 | East | 254 | On track |
| R24 | West | 261 | On track |
| R25 | North | 268 | At risk |
| R26 | South | 275 | On track |
| R27 | East | 282 | On track |
| R28 | West | 289 | At risk |
| R29 | North | 296 | On track |
| R30 | South | 303 | On track |
| R31 | East | 310 | At risk |
| R32 | West | 317 | On track |
| R33 | North | 324 | On track |
| R34 | South | 331 | At risk |
| R35 | East | 338 | On track |
| R36 | West | 345 | On track |
| R37 | North | 352 | At risk |
| R38 | South | 359 | On track |
| R39 | East | 366 | On track |
| R40 | West | 373 | At risk |
| R41 | North | 380 | On track |
| R42 | South | 387 | On track |

<!-- ms:object {"id":"stamp"} -->

Revenue grew steadily across every region while operating costs stayed flat. The platform team shipped the new ingestion pipeline ahead of schedule. Customer satisfaction scores improved for the third consecutive quarter. Risks remain around supplier concentration and hiring in the data group. Revenue grew steadily across every region while operating costs stayed flat. The platform team shipped the new ingestion pipeline ahead of schedule. Customer satisfaction scores improved for the third consecutive quarter. Risks remain around supplier concentration and hiring in the data group.

```ts
const total = rows.reduce((a, r) => a + r.value, 0);
```

See [the appendix](#appendix) and [our site](https://example.com).

<!-- ms:pagebreak -->

## Decisions

<!-- ms:block {"keepTogether":true} -->
Revenue grew steadily across every region while operating costs stayed flat. The platform team shipped the new ingestion pipeline ahead of schedule. Customer satisfaction scores improved for the third consecutive quarter. Risks remain around supplier concentration and hiring in the data group. Revenue grew steadily across every region while operating costs stayed flat. The platform team shipped the new ingestion pipeline ahead of schedule.

<!-- ms:section {"master":"studio-landscape"} -->

<!-- ms:block {"id":"appendix"} -->
# Appendix

| Metric | Q1 | Q2 | Q3 | Q4 |
| --- | --- | --- | --- | --- |
| Revenue | 10 | 12 | 13 | 15 |
| Costs | 8 | 8 | 9 | 9 |
