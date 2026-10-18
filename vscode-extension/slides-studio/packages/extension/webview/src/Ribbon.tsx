import type { ReactNode } from 'react';
import { isDiagramSrc, resolveSlide, round4, uniqueId, type DiffBaseKind, type ElementStyle, type ShapeKind, type SlideElement } from '@corporate-slides/core';
import { Icon, type IconName } from './icons';
import { post } from './host';
import { currentSlide, useEditor, type RibbonTab } from './store';
import { AddSlideMenu } from './Panels';
import { connectMutation, deleteMutations, keepFocus, ParagraphTools, ShapeGallery, stepFontSize } from './Format';
import { copyFromRibbon, copyStyle, pasteFromRibbon } from './clipboard';
import { useAnchors, useDiff } from './Review';

/* ------------------------------------------------------------------ */
/* Ribbon primitives                                                   */
/* ------------------------------------------------------------------ */

interface BtnProps {
  icon: IconName;
  label: string;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  testId?: string;
  title?: string;
  caret?: boolean;
}

/** Large ribbon command: 20px icon over a (two-line max) label. */
function Big({ icon, label, onClick, active, disabled, testId, title, caret }: BtnProps) {
  return (
    <button type="button" className={`rb-big${active ? ' is-active' : ''}`} onMouseDown={keepFocus} onClick={onClick} disabled={disabled} aria-pressed={active} data-testid={testId} title={title ?? label}>
      <Icon name={icon} size={20} />
      <span>
        {label.replace(/\S+$/, '')}
        {/* the caret stays glued to the last word, as in Office */}
        <span className="nowrap">{/\S+$/.exec(label)?.[0]}{caret && <Icon name="chevronDown" size={10} className="caret" />}</span>
      </span>
    </button>
  );
}

/** Small ribbon command: icon + optional inline label, stacked three per column. */
function Small({ icon, label, onClick, active, disabled, testId, title, iconOnly }: BtnProps & { iconOnly?: boolean }) {
  return (
    <button type="button" className={`rb-small${active ? ' is-active' : ''}${iconOnly ? ' icon-only' : ''}`} onMouseDown={keepFocus} onClick={onClick} disabled={disabled} aria-pressed={active} aria-label={label} data-testid={testId} title={title ?? label}>
      <Icon name={icon} />
      {!iconOnly && <span>{label}</span>}
    </button>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="rb-group" aria-label={label}>
      <div className="rb-group-body">{children}</div>
      <h3>{label}</h3>
    </section>
  );
}

const Col = ({ children }: { children: ReactNode }) => <div className="rb-col">{children}</div>;
const Row = ({ children }: { children: ReactNode }) => <div className="rb-row">{children}</div>;

/* ------------------------------------------------------------------ */
/* Shared actions                                                      */
/* ------------------------------------------------------------------ */

function useActions() {
  const master = useEditor((s) => s.master);
  const slide = useEditor(currentSlide);
  const { mutate, select } = useEditor.getState();
  const W = master?.dimensions.width ?? 13.33;
  const H = master?.dimensions.height ?? 7.5;
  const center = (w: number, h: number) => ({ x: round4((W - w) / 2), y: round4((H - h) / 2), w, h });
  const add = (el: Omit<SlideElement, 'id'> & { type: SlideElement['type'] }) => {
    if (!slide || !master) return;
    const id = uniqueId(el.type, slide.elements.map((e) => e.id));
    mutate([{ kind: 'addElement', slideId: slide.id, element: { ...el, id } as SlideElement }]);
    select(slide.id, [id]);
  };
  return {
    addText: () => add({ type: 'text', ...center(5, 1), paragraphs: [{ runs: [{ text: 'Nouveau texte' }] }] } as never),
    addShape: (shape: ShapeKind) => add({ type: 'shape', shape, ...(shape === 'line' ? center(3, 0) : SQUARE.has(shape) ? center(2, 2) : shape === 'can' ? center(1.6, 2) : center(3, 1.5)) } as never),
    addTable: () => add({ type: 'table', ...center(8, 2), header: true, rows: [['Colonne 1', 'Colonne 2', 'Colonne 3'], ['', '', ''], ['', '', '']] } as never),
  };
}

/** Shapes drawn square by default. */
const SQUARE = new Set<ShapeKind>(['ellipse', 'star5', 'pentagon', 'hexagon', 'octagon', 'plus', 'donut', 'cube', 'diamond']);

function ShapesMenu({ big, disabled }: { big?: boolean; disabled?: boolean }) {
  const { addShape } = useActions();
  return (
    <ShapeGallery
      onPick={addShape}
      trigger={(open) => (big ? <Big icon="shape" label="Formes" caret testId="add-shape" disabled={disabled} onClick={open} /> : <Small icon="shape" label="Formes" testId="add-shape" disabled={disabled} onClick={open} />)}
    />
  );
}

/** Connector tool: links the two selected elements, or starts the click-source-then-target mode. */
function ConnectButton({ disabled }: { disabled?: boolean }) {
  const slide = useEditor(currentSlide);
  const selected = useEditor((s) => s.selected);
  const connectFrom = useEditor((s) => s.connectFrom);
  const { mutate, select, set } = useEditor.getState();
  const pair = slide ? selected.filter((id) => slide.elements.some((e) => e.id === id && e.type !== 'connector')) : [];
  return (
    <Big
      icon="connector"
      label="Relier"
      testId="connect"
      active={connectFrom !== null}
      disabled={disabled}
      title={pair.length === 2 ? 'Relier les deux éléments sélectionnés' : "Relier deux formes : cliquez sur la forme de départ puis sur celle d'arrivée (Échap pour annuler)"}
      onClick={() => {
        if (!slide) return;
        if (connectFrom !== null) return set({ connectFrom: null });
        if (pair.length === 2) {
          const { m, id } = connectMutation(slide, pair[0]!, pair[1]!);
          mutate([m]);
          select(slide.id, [id]);
        } else set({ connectFrom: '' });
      }}
    />
  );
}

/** Bold/italic/underline: on the selected text while editing, else on the whole elements. */
function useCharFormat(textEls: SlideElement[], style: (p: Partial<ElementStyle>) => void) {
  const editingId = useEditor((s) => s.editingId);
  const every = (k: keyof ElementStyle) => textEls.length > 0 && textEls.every((e) => !!e.style?.[k]);
  const toggle = (k: 'bold' | 'italic' | 'underline') => {
    // execCommand is deprecated but remains the only native way to format a contentEditable selection.
    if (editingId) document.execCommand(k);
    else style({ [k]: every(k) ? null : true } as never);
  };
  return { all: (k: keyof ElementStyle) => !editingId && every(k), toggle, editing: !!editingId };
}

/* ------------------------------------------------------------------ */
/* Title bar (quick access toolbar)                                    */
/* ------------------------------------------------------------------ */

function TitleBar() {
  const fileName = useEditor((s) => s.fileName);
  const doc = useEditor((s) => s.doc);
  const pending = useEditor((s) => s.pending.size);
  const readOnly = useEditor((s) => s.readOnly);
  const review = useEditor((s) => s.review);
  return (
    <header className="titlebar" role="toolbar" aria-label="Accès rapide">
      <div className="qat">
        <button type="button" className="ibtn" aria-label="Enregistrer (Ctrl+S)" title="Enregistrer (Ctrl+S)" disabled={readOnly} onClick={() => post({ type: 'save' })}><Icon name="save" /></button>
        <button type="button" className="ibtn" aria-label="Annuler (Ctrl+Z)" title="Annuler (Ctrl+Z)" data-testid="undo" disabled={readOnly} onClick={() => post({ type: 'undo' })}><Icon name="undo" /></button>
        <button type="button" className="ibtn" aria-label="Rétablir (Ctrl+Y)" title="Rétablir (Ctrl+Y)" data-testid="redo" disabled={readOnly} onClick={() => post({ type: 'redo' })}><Icon name="redo" /></button>
      </div>
      <div className="title">
        <span className="file-name" title={fileName}>{fileName}</span>
        {review && <span className={`chip chip-${review.side}`} title="Révision ouverte depuis la merge request">{review.mr} · {review.side === 'new' ? 'version modifiée' : 'version de base'}</span>}
        {readOnly && <span className="chip">Lecture seule</span>}
      </div>
      <div className="title-actions">
        <div className="seg" role="group" aria-label="Mode d'édition">
          <button type="button" className="ibtn is-active" aria-pressed>Visuel</button>
          <button type="button" className="ibtn" title="Ouvrir la source dans l'éditeur de texte" data-testid="open-source" onClick={() => post({ type: 'openSource' })}>Source</button>
        </div>
        <button type="button" className="ibtn is-primary has-label" data-testid="export" disabled={!doc || pending > 0} onClick={() => post({ type: 'export' })}>
          <Icon name="download" /> Exporter .pptx
        </button>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Tabs                                                                */
/* ------------------------------------------------------------------ */

function HomeTab() {
  const slide = useEditor(currentSlide);
  const doc = useEditor((s) => s.doc);
  const selected = useEditor((s) => s.selected);
  const readOnly = useEditor((s) => s.readOnly);
  const { mutate } = useEditor.getState();
  const { addText } = useActions();
  const els = slide?.elements.filter((e) => selected.includes(e.id)) ?? [];
  const textEls = els.filter((e) => e.type === 'text' || (e.type === 'shape' && e.shape !== 'line') || e.type === 'table');
  const style = (patch: Partial<ElementStyle>) => slide && mutate(textEls.map((e) => ({ kind: 'updateElement' as const, slideId: slide.id, elementId: e.id, patch: { style: patch } })));
  const { all, toggle, editing } = useCharFormat(textEls, style);
  const order = (direction: 'front' | 'back') => slide && mutate(els.map((e) => ({ kind: 'reorderElement' as const, slideId: slide.id, elementId: e.id, direction })));
  const noText = readOnly || (!textEls.length && !editing);
  const master = useEditor((s) => s.master);
  const painter = useEditor((s) => s.painter);
  const sizes = slide && master ? new Map(resolveSlide(slide, master).elements.map((r) => [r.element.id, r.style.fontSize])) : new Map<string, number>();
  const size = textEls.length && textEls.every((e) => sizes.get(e.id) === sizes.get(textEls[0]!.id)) ? sizes.get(textEls[0]!.id) : undefined;
  const resize = (dir: 1 | -1) => slide && mutate(textEls.map((e) => ({ kind: 'updateElement' as const, slideId: slide.id, elementId: e.id, patch: { style: { fontSize: stepFontSize(sizes.get(e.id) ?? 18, dir) } } })));
  return (
    <>
      <Group label="Presse-papiers">
        <Big icon="paste" label="Coller" testId="paste" disabled={!slide || readOnly} title="Coller (Ctrl+V) : éléments, texte, image ou tableau Excel" onClick={() => void pasteFromRibbon()} />
        <Col>
          <Small icon="cut" label="Couper" testId="cut" disabled={!els.length || readOnly} title="Couper (Ctrl+X)" onClick={() => copyFromRibbon(true)} />
          <Small icon="copy" label="Copier" testId="copy" disabled={!els.length} title="Copier (Ctrl+C)" onClick={() => copyFromRibbon(false)} />
          <Small
            icon="brush"
            label="Reproduire la mise en forme"
            testId="format-painter"
            active={!!painter}
            disabled={(els.length !== 1 && !painter) || readOnly}
            title="Copier la mise en forme de l’élément sélectionné puis cliquer l’élément cible (Ctrl+Maj+C / Ctrl+Maj+V)"
            onClick={() => useEditor.getState().set({ painter: painter ? null : copyStyle() })}
          />
        </Col>
      </Group>
      <Group label="Diapositives">
        <AddSlideMenu trigger={(open) => <Big icon="plus" label="Nouvelle diapositive" caret testId="add-slide" disabled={readOnly} onClick={open} />} />
        <Col>
          <Small icon="copy" label="Dupliquer" disabled={!slide || readOnly} onClick={() => slide && doc && mutate([{ kind: 'duplicateSlide', slideId: slide.id, newSlideId: uniqueId(slide.id.replace(/-\d+$/, '') || 'slide', doc.slides.map((x) => x.id)) }])} />
          <Small icon="trash" label="Supprimer" disabled={!slide || readOnly || (doc?.slides.length ?? 0) <= 1} onClick={() => slide && mutate([{ kind: 'deleteSlide', slideId: slide.id }])} />
        </Col>
      </Group>
      <Group label="Dessin">
        <Big icon="text" label="Zone de texte" testId="add-text" disabled={!slide || readOnly} onClick={addText} />
        <ShapesMenu big disabled={!slide || readOnly} />
        <ConnectButton disabled={!slide || readOnly} />
      </Group>
      <Group label="Police">
        <Col>
          <Row>
            <Small iconOnly icon="bold" label="Gras (Ctrl+B)" active={all('bold')} disabled={noText} testId="bold" onClick={() => toggle('bold')} />
            <Small iconOnly icon="italic" label="Italique (Ctrl+I)" active={all('italic')} disabled={noText} testId="italic" onClick={() => toggle('italic')} />
            <Small iconOnly icon="underline" label="Souligné (Ctrl+U)" active={all('underline')} disabled={noText} testId="underline" onClick={() => toggle('underline')} />
            <span className="rb-count" data-testid="font-size">{size !== undefined ? `${size} pt` : '—'}</span>
            <Small iconOnly icon="fontGrow" label="Augmenter la taille de police" disabled={readOnly || !textEls.length} testId="font-grow" onClick={() => resize(1)} />
            <Small iconOnly icon="fontShrink" label="Réduire la taille de police" disabled={readOnly || !textEls.length} testId="font-shrink" onClick={() => resize(-1)} />
          </Row>
          <Row>
            {(['left', 'center', 'right', 'justify'] as const).map((a) => (
              <Small key={a} iconOnly icon={a === 'left' ? 'alignLeft' : a === 'center' ? 'alignCenter' : a === 'right' ? 'alignRight' : 'alignJustify'} label={{ left: 'Aligner à gauche', center: 'Centrer', right: 'Aligner à droite', justify: 'Justifier' }[a]} active={textEls.length > 0 && textEls.every((e) => e.style?.align === a)} disabled={noText} onClick={() => style({ align: a })} />
            ))}
          </Row>
        </Col>
      </Group>
      <Group label="Paragraphe">
        <ParagraphTools disabled={readOnly} />
      </Group>
      <Group label="Organiser">
        <Col>
          <Small icon="front" label="Premier plan" disabled={readOnly || !els.length} onClick={() => order('front')} />
          <Small icon="back" label="Arrière-plan" disabled={readOnly || !els.length} onClick={() => order('back')} />
        </Col>
      </Group>
    </>
  );
}

function InsertTab() {
  const slide = useEditor(currentSlide);
  const readOnly = useEditor((s) => s.readOnly);
  const { addText, addTable } = useActions();
  const off = !slide || readOnly;
  return (
    <>
      <Group label="Diapositives">
        <AddSlideMenu trigger={(open) => <Big icon="plus" label="Nouvelle diapositive" caret testId="add-slide" disabled={readOnly} onClick={open} />} />
      </Group>
      <Group label="Éléments">
        <Big icon="text" label="Zone de texte" testId="add-text" disabled={off} onClick={addText} />
        <ShapesMenu big disabled={off} />
        <ConnectButton disabled={off} />
        <Big icon="image" label="Image" disabled={off} onClick={() => slide && post({ type: 'pickImage', slideId: slide.id })} />
        <Big icon="table" label="Tableau" disabled={off} onClick={addTable} />
      </Group>
      <Group label="Diagrammes">
        <Big icon="diagram" label="Diagramme GMC" testId="insert-gmc" disabled={off} title="Créer ou insérer un diagramme Graph Model Studio (.gmc)" onClick={() => useEditor.getState().set({ gmcDialog: true })} />
      </Group>
    </>
  );
}

const BASES: { id: DiffBaseKind; label: string }[] = [
  { id: 'none', label: 'Aucune' },
  { id: 'head', label: 'HEAD' },
  { id: 'mr', label: 'Base MR' },
];

function ReviewTab() {
  const doc = useEditor((s) => s.doc);
  const slideId = useEditor((s) => s.slideId);
  const diffState = useEditor((s) => s.diff);
  const showDiff = useEditor((s) => s.showDiff);
  const showBase = useEditor((s) => s.showBase);
  const pane = useEditor((s) => s.pane);
  const reviewData = useEditor((s) => s.reviewData);
  const focus = useEditor((s) => s.focusThread);
  const { set, select } = useEditor.getState();
  const diff = useDiff();
  const anchors = useAnchors();
  const changed = doc?.slides.filter((s) => diff?.slides.has(s.id)).map((s) => s.id) ?? [];
  const index = doc?.slides.findIndex((s) => s.id === slideId) ?? -1;
  const step = (dir: 1 | -1) => {
    const ids = doc?.slides.map((s) => s.id) ?? [];
    const next = dir > 0 ? ids.slice(index + 1).find((id) => changed.includes(id)) : ids.slice(0, Math.max(0, index)).reverse().find((id) => changed.includes(id));
    if (next) (select(next, []), set({ showDiff: true }));
  };
  const stepComment = (dir: 1 | -1) => {
    if (!anchors.length) return;
    const i = anchors.findIndex((a) => a.thread.id === focus);
    const a = anchors[(i + dir + anchors.length) % anchors.length]!;
    if (a.slideId) select(a.slideId, a.elementId ? [a.elementId] : []);
    set({ focusThread: a.thread.id, pane: 'comments' });
  };
  const baseLoaded = !!diffState.doc;
  return (
    <>
      <Group label="Comparer">
        <Big icon="diff" label="Modifications" active={showDiff} disabled={!baseLoaded} testId="toggle-diff" title={baseLoaded ? `Comparer avec ${diffState.label} — ${diff?.count ?? 0} modification(s)` : diffState.error ?? 'Choisissez une version de référence'} onClick={() => set({ showDiff: !showDiff })} />
        <Big icon="history" label="Version de référence" active={showBase} disabled={!baseLoaded} testId="toggle-base" onClick={() => set({ showBase: !showBase })} />
        <Col>
          <div className="seg seg-compact" role="radiogroup" aria-label="Version de référence">
            {BASES.filter((b) => diffState.available.includes(b.id)).map((b) => (
              <button key={b.id} type="button" role="radio" aria-checked={diffState.base === b.id} className={`ibtn${diffState.base === b.id ? ' is-active' : ''}`} data-testid={`diff-base-${b.id}`} onClick={() => post({ type: 'setDiffBase', base: b.id })}>
                {b.label}
              </button>
            ))}
          </div>
          <Row>
            <Small iconOnly icon="prev" label="Modification précédente" disabled={!changed.length} onClick={() => step(-1)} />
            <Small iconOnly icon="next" label="Modification suivante" disabled={!changed.length} onClick={() => step(1)} />
            <span className="rb-count" data-testid="diff-count">{diff ? `${diff.count} modif.` : '—'}</span>
          </Row>
        </Col>
      </Group>
      <Group label="Commentaires">
        <Big icon="commentPlus" label="Nouveau commentaire" disabled={!reviewData?.canCreate} title={reviewData ? undefined : 'Disponible sur une révision ouverte depuis une merge request GitLab'} onClick={() => set({ pane: 'comments' })} />
        <Col>
          <Small icon="comment" label="Volet Commentaires" active={pane === 'comments'} testId="toggle-comments" onClick={() => set({ pane: pane === 'comments' ? 'format' : 'comments' })} />
          <Row>
            <Small iconOnly icon="prev" label="Commentaire précédent" disabled={!anchors.length} onClick={() => stepComment(-1)} />
            <Small iconOnly icon="next" label="Commentaire suivant" disabled={!anchors.length} onClick={() => stepComment(1)} />
            <span className="rb-count">{anchors.length} fil{anchors.length > 1 ? 's' : ''}</span>
          </Row>
        </Col>
      </Group>
      <Group label="Vérification">
        <Big icon="check" label="Valider la charte" onClick={() => post({ type: 'validate' })} />
      </Group>
    </>
  );
}

function ViewTab() {
  const slide = useEditor(currentSlide);
  const showGrid = useEditor((s) => s.showGrid);
  const snap = useEditor((s) => s.snap);
  const notesOpen = useEditor((s) => s.notesOpen);
  const zoom = useEditor((s) => s.zoom);
  const doc = useEditor((s) => s.doc);
  const { toggleGrid, toggleSnap, set, setZoom } = useEditor.getState();
  const index = doc?.slides.findIndex((s) => s.id === slide?.id) ?? -1;
  return (
    <>
      <Group label="Afficher">
        <Big icon="notes" label="Notes" active={notesOpen} onClick={() => set({ notesOpen: !notesOpen })} />
        <Col>
          <Small icon="grid" label="Grille" active={showGrid} onClick={toggleGrid} />
          <Small icon="magnet" label="Magnétisme" active={snap} title="Magnétisme (Alt pour ignorer)" onClick={toggleSnap} />
        </Col>
      </Group>
      <Group label="Zoom">
        <Big icon="fit" label="Ajuster" active={zoom === 'fit'} onClick={() => setZoom('fit')} />
        <Big icon="zoomIn" label="100 %" active={zoom === 1} onClick={() => setZoom(1)} />
      </Group>
      <Group label="Source">
        <Big icon="code" label="Ouvrir la source" onClick={() => post({ type: 'openSource' })} />
        <Col>
          <Small icon="external" label="Source côte à côte" disabled={!slide} onClick={() => slide && post({ type: 'reveal', slideId: slide.id })} />
          <Small icon="render" label="Rendu PowerPoint" title="Rendu de référence par PowerPoint (fait foi ; l'aperçu navigateur est approximatif)" onClick={() => post({ type: 'renderReference', slideIndex: Math.max(0, index) })} />
        </Col>
      </Group>
    </>
  );
}

function FormatTab() {
  const slide = useEditor(currentSlide);
  const selected = useEditor((s) => s.selected);
  const readOnly = useEditor((s) => s.readOnly);
  const { mutate, select } = useEditor.getState();
  const els = slide?.elements.filter((e) => selected.includes(e.id)) ?? [];
  const one = els.length === 1 ? els[0]! : null;
  const diagram = one?.type === 'image' && isDiagramSrc(one.src) ? one : null;
  if (!slide || !els.length) return null;
  const order = (direction: 'front' | 'forward' | 'backward' | 'back') => mutate(els.map((e) => ({ kind: 'reorderElement' as const, slideId: slide.id, elementId: e.id, direction })));
  return (
    <>
      {diagram && (
        <Group label="Graph Model Studio">
          <Big icon="diagram" label="Modifier le diagramme" testId="edit-gmc" title="Éditeur interactif Graph Model Studio (double-clic sur le diagramme)" onClick={() => useEditor.getState().set({ gmcEdit: diagram.src })} />
          <Col>
            <Small icon="refresh" label="Actualiser le rendu" onClick={() => post({ type: 'refreshGmc', src: diagram.src })} />
            <Small icon="external" label="Ouvrir à côté" onClick={() => post({ type: 'editGmc', src: diagram.src })} />
            <span className="rb-note"><code>{diagram.src}</code></span>
          </Col>
        </Group>
      )}
      <Group label="Organiser">
        <Col>
          <Small icon="front" label="Premier plan" disabled={readOnly} onClick={() => order('front')} />
          <Small icon="forward" label="Avancer" disabled={readOnly} onClick={() => order('forward')} />
        </Col>
        <Col>
          <Small icon="backward" label="Reculer" disabled={readOnly} onClick={() => order('backward')} />
          <Small icon="back" label="Arrière-plan" disabled={readOnly} onClick={() => order('back')} />
        </Col>
      </Group>
      {one && (
        <Group label="Élément">
          <Col>
            <Small icon={one.locked ? 'lock' : 'unlock'} label={one.locked ? 'Déverrouiller' : 'Verrouiller'} active={one.locked} disabled={readOnly} onClick={() => mutate([{ kind: 'updateElement', slideId: slide.id, elementId: one.id, patch: { locked: !one.locked } }])} />
            <Small icon={one.hidden ? 'eyeOff' : 'eye'} label={one.hidden ? 'Afficher' : 'Masquer'} active={one.hidden} disabled={readOnly} onClick={() => mutate([{ kind: 'updateElement', slideId: slide.id, elementId: one.id, patch: { hidden: !one.hidden } }])} />
          </Col>
          <Col>
            <Small icon="code" label="Voir dans la source" onClick={() => post({ type: 'reveal', slideId: slide.id, elementId: one.id })} />
            <Small icon="trash" label="Supprimer" disabled={readOnly} onClick={() => (mutate(deleteMutations(slide, [one.id])), select(slide.id, []))} />
          </Col>
        </Group>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Ribbon                                                              */
/* ------------------------------------------------------------------ */

export function Ribbon() {
  const tab = useEditor((s) => s.tab);
  const collapsed = useEditor((s) => s.ribbonCollapsed);
  const slide = useEditor(currentSlide);
  const selected = useEditor((s) => s.selected);
  const diff = useDiff();
  const anchors = useAnchors();
  const { set } = useEditor.getState();
  const els = slide?.elements.filter((e) => selected.includes(e.id)) ?? [];
  const contextual = els.length > 0;
  const isDiagram = els.length === 1 && els[0]!.type === 'image' && isDiagramSrc(els[0]!.src);
  const active: RibbonTab = tab === 'format' && !contextual ? 'home' : tab;
  const open = anchors.filter((a) => !a.thread.resolved).length;

  const tabs: { id: RibbonTab; label: string; badge?: number }[] = [
    { id: 'home', label: 'Accueil' },
    { id: 'insert', label: 'Insertion' },
    { id: 'review', label: 'Révision', badge: open || diff?.count || undefined },
    { id: 'view', label: 'Affichage' },
  ];

  return (
    <div className="ribbon-wrap">
      <TitleBar />
      <nav className="tabs" role="tablist" aria-label="Ruban">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active === t.id}
            className={`tab${active === t.id ? ' is-active' : ''}`}
            data-testid={`tab-${t.id}`}
            onClick={() => set({ tab: t.id, ribbonCollapsed: collapsed && active === t.id ? false : collapsed })}
            onDoubleClick={() => set({ ribbonCollapsed: !collapsed })}
          >
            {t.label}
            {t.badge ? <span className="tab-badge">{t.badge}</span> : null}
          </button>
        ))}
        {contextual && (
          <button type="button" role="tab" aria-selected={active === 'format'} className={`tab tab-contextual${active === 'format' ? ' is-active' : ''}`} data-testid="tab-format" onClick={() => set({ tab: 'format' })} onDoubleClick={() => set({ ribbonCollapsed: !collapsed })}>
            {isDiagram ? 'Diagramme' : 'Format'}
          </button>
        )}
        <span className="grow" />
        <button type="button" className="ibtn tabs-collapse" aria-label={collapsed ? 'Afficher le ruban' : 'Réduire le ruban'} title={collapsed ? 'Afficher le ruban' : 'Réduire le ruban'} onClick={() => set({ ribbonCollapsed: !collapsed })}>
          <Icon name="chevronDown" style={{ transform: collapsed ? undefined : 'rotate(180deg)' }} />
        </button>
      </nav>
      {!collapsed && (
        <div className="ribbon" role="tabpanel" aria-label={tabs.find((t) => t.id === active)?.label ?? 'Format'}>
          {active === 'home' && <HomeTab />}
          {active === 'insert' && <InsertTab />}
          {active === 'review' && <ReviewTab />}
          {active === 'view' && <ViewTab />}
          {active === 'format' && <FormatTab />}
        </div>
      )}
    </div>
  );
}
