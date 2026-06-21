# Graph Model Studio DSL

The DSL is a small, brace-delimited language. A document has two top-level
blocks: `model { … }` (elements + relationships) and `views { … }` (diagrams).
The DSL is the source of truth for structure; node positions live in views and
are preserved across re-parses.

```text
model {
  <elements and relationships>
}

views {
  <view declarations>
}
```

---

## Elements

```text
id = type "Label"

id = type "Label" {
  description "Free text"
  technology  "React"
  tags "domain" "core"
  <child elements…>
}
```

- **`id`** — unique identifier, used to reference the element in relationships and
  views. Dotted paths (`banking.web`) address nested elements.
- **`type`** — one of the notation element types (see the tables below).
- **`"Label"`** — the display name.
- **Body directives** (all optional):
  - `description "…"`
  - `technology "…"` — shown as `[tech]` under the label (C4-style).
  - `tags "a" "b"` — free-form tags.
  - `size <w> <h>` — a manual node size (e.g. `size 300 180`). For containers
    this is a *minimum*; they still grow to fit their children.
  - Nested element declarations — make this element a **container**. Containers
    auto-size around their children on the canvas.

A shorthand `type "Label"` (no `id =`) is accepted; an id is generated.

---

## Relationships

```text
source -> target
source -> target "label"
source -> target : relationType
source -> target : relationType "label"
```

- `source` / `target` are element ids (dotted paths allowed).
- `: relationType` selects a notation-specific edge; omit it for a plain
  directed relationship (`rel`).
- A trailing `"string"` is the edge label.
- `anchor <source> <target>` pins the endpoints to node sides, where each is
  `t`/`b`/`l`/`r` (or `_` to leave it floating), e.g. `a -> b anchor r l`.

Direction (`directed` / `bidirectional` / `undirected`) is editable in the
Properties panel and controls which arrow heads are drawn.

---

## Views

```text
views {
  view systemContext "Optional Title" {
    include *
    autolayout lr
  }
}
```

- `view <id> "Title"` — declares a view. The title is optional.
- `include *` — include every element. `include some.id` / `include some.*`
  include a subset (and their ancestor containers).
- `autolayout <dir>` — `tb` (top→bottom), `bt`, `lr` (left→right), or `rl`.
- `<id> at <x> <y>` — a pinned node position for this view (e.g. `web at 120 40`).
  These are written automatically when you drag or auto-arrange nodes, so saving
  a `.gmc` file and re-opening it restores the exact layout. Child positions are
  relative to their container.

Each view stores its own node positions, so the same model can be arranged
differently per diagram.

---

## Element types by notation

### C4
`person`, `softwareSystem`, `container`, `component`, `codeElement`

### ArchiMate (grouped by layer)
- **Strategy** — `resource`, `capability`, `courseOfAction`, `valueStream`
- **Business** — `businessActor`, `businessRole`, `businessCollaboration`,
  `businessInterface`, `businessProcess`, `businessFunction`,
  `businessInteraction`, `businessEvent`, `businessService`, `businessObject`,
  `contract`, `representation`, `product`
- **Application** — `applicationComponent`, `applicationCollaboration`,
  `applicationInterface`, `applicationFunction`, `applicationInteraction`,
  `applicationProcess`, `applicationEvent`, `applicationService`, `dataObject`
- **Technology** — `technologyNode`, `device`, `systemSoftware`,
  `technologyCollaboration`, `technologyInterface`, `path`,
  `communicationNetwork`, `technologyFunction`, `technologyProcess`,
  `technologyInteraction`, `technologyEvent`, `technologyService`, `artifact`
- **Physical** — `equipment`, `facility`, `distributionNetwork`, `material`
- **Motivation** — `stakeholder`, `driver`, `assessment`, `goal`, `outcome`,
  `principle`, `requirement`, `constraint`, `meaning`, `archimateValue`
- **Implementation** — `workPackage`, `deliverable`, `implementationEvent`,
  `plateau`, `gap`
- **Other** — `location`, `grouping` (container), `junctionAnd`, `junctionOr`

### BPMN
- **Events** — `startEvent`, `endEvent`, `intermediateEvent`
- **Activities** — `task`, `userTask`, `serviceTask`, `subProcess` (container)
- **Gateways** — `gateway`, `exclusiveGateway`, `parallelGateway`
- **Swimlanes** — `pool` (container), `lane` (container)
- **Data** — `dataObjectBpmn`

### Flowchart
`start`, `end`, `process`, `decision`, `inputOutput`, `connector`

### Generic
`node`, `group` (container), `external`

---

## Relation types

| Type | Notation | Rendering |
|------|----------|-----------|
| `rel` | generic | open arrow |
| `association` | generic | plain line |
| `composition` | ArchiMate | filled diamond (source) |
| `aggregation` | ArchiMate | hollow diamond (source) |
| `assignment` | ArchiMate | ball (source) + filled arrow |
| `realization` | ArchiMate | dashed + hollow triangle |
| `serving` | ArchiMate | open arrow |
| `access` | ArchiMate | dotted + open arrow |
| `influence` | ArchiMate | dashed + open arrow |
| `triggering` | ArchiMate | filled arrow |
| `flow` | ArchiMate | dashed + filled arrow |
| `specialization` | ArchiMate | hollow triangle |
| `sequenceFlow` | BPMN | filled arrow |
| `messageFlow` | BPMN | dashed, open circle (source) + open arrow |
| `flowArrow` | Flowchart | filled arrow |

---

## Notes & limitations

- Relationships are declared at the top level of `model { … }`. Relationships
  written inside an element body are currently skipped by the parser.
- Element `properties` round-trip through the serializer but have no dedicated
  DSL keyword beyond `description` / `technology` / `tags`.
- Comments use `//`.
