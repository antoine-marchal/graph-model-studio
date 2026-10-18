import type { ReactNode } from 'react';
import { isDiagramSrc, resolveSlide, round4, uniqueId, type DiffBaseKind, type ElementStyle, type ShapeKind, type SlideElement, tr } from '@corporate-slides/core';
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
    addText: () => add({ type: 'text', ...center(5, 1), paragraphs: [{ runs: [{ text: tr('Nouveau texte', 'New text') }] }] } as never),
    addShape: (shape: ShapeKind) => add({ type: 'shape', shape, ...(shape === 'line' ? center(3, 0) : SQUARE.has(shape) ? center(2, 2) : shape === 'can' ? center(1.6, 2) : center(3, 1.5)) } as never),
    addTable: () => add({ type: 'table', ...center(8, 2), header: true, rows: [[tr('Colonne 1', 'Column 1'), tr('Colonne 2', 'Column 2'), tr('Colonne 3', 'Column 3')], ['', '', ''], ['', '', '']] } as never),
  };
}

/** Shapes drawn square by default. */
const SQUARE = new Set<ShapeKind>(['ellipse', 'star5', 'pentagon', 'hexagon', 'octagon', 'plus', 'donut', 'cube', 'diamond']);

function ShapesMenu({ big, disabled }: { big?: boolean; disabled?: boolean }) {
  const { addShape } = useActions();
  return (
    <ShapeGallery
      onPick={addShape}
      trigger={(open) => (big ? <Big icon="shape" label={tr("Formes", "Shapes")} caret testId="add-shape" disabled={disabled} onClick={open} /> : <Small icon="shape" label={tr("Formes", "Shapes")} testId="add-shape" disabled={disabled} onClick={open} />)}
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
      label={tr("Relier", "Connect")}
      testId="connect"
      active={connectFrom !== null}
      disabled={disabled}
      title={pair.length === 2 ? tr('Relier les deux éléments sélectionnés', 'Connect the two selected elements') : tr("Relier deux formes : cliquez sur la forme de départ puis sur celle d'arrivée (Échap pour annuler)", "Connect two shapes: click the start shape, then the end shape (Esc to cancel)")}
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
    <header className="titlebar" role="toolbar" aria-label={tr("Accès rapide", "Quick access")}>
      <div className="qat">
        <button type="button" className="ibtn" aria-label={tr("Enregistrer (Ctrl+S)", "Save (Ctrl+S)")} title={tr("Enregistrer (Ctrl+S)", "Save (Ctrl+S)")} disabled={readOnly} onClick={() => post({ type: 'save' })}><Icon name="save" /></button>
        <button type="button" className="ibtn" aria-label={tr("Annuler (Ctrl+Z)", "Undo (Ctrl+Z)")} title={tr("Annuler (Ctrl+Z)", "Undo (Ctrl+Z)")} data-testid="undo" disabled={readOnly} onClick={() => post({ type: 'undo' })}><Icon name="undo" /></button>
        <button type="button" className="ibtn" aria-label={tr("Rétablir (Ctrl+Y)", "Redo (Ctrl+Y)")} title={tr("Rétablir (Ctrl+Y)", "Redo (Ctrl+Y)")} data-testid="redo" disabled={readOnly} onClick={() => post({ type: 'redo' })}><Icon name="redo" /></button>
      </div>
      <div className="title">
        <span className="file-name" title={fileName}>{fileName}</span>
        {review && <span className={`chip chip-${review.side}`} title={tr("Révision ouverte depuis la merge request", "Revision opened from the merge request")}>{review.mr} · {review.side === 'new' ? tr('version modifiée', 'changed version') : tr('version de base', 'base version')}</span>}
        {readOnly && <span className="chip">{tr('Lecture seule', 'Read-only')}</span>}
      </div>
      <div className="title-actions">
        <div className="seg" role="group" aria-label={tr("Mode d'édition", "Editing mode")}>
          <button type="button" className="ibtn is-active" aria-pressed>{tr('Visuel', 'Visual')}</button>
          <button type="button" className="ibtn" title={tr("Ouvrir la source dans l'éditeur de texte", "Open the source in the text editor")} data-testid="open-source" onClick={() => post({ type: 'openSource' })}>Source</button>
        </div>
        <button type="button" className="ibtn is-primary has-label" data-testid="export" disabled={!doc || pending > 0} onClick={() => post({ type: 'export' })}>
          <Icon name="download" /> {tr('Exporter .pptx', 'Export .pptx')}
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
        <Big icon="paste" label={tr("Coller", "Paste")} testId="paste" disabled={!slide || readOnly} title={tr("Coller (Ctrl+V) : éléments, texte, image ou tableau Excel", "Paste (Ctrl+V): elements, text, picture or Excel table")} onClick={() => void pasteFromRibbon()} />
        <Col>
          <Small icon="cut" label={tr("Couper", "Cut")} testId="cut" disabled={!els.length || readOnly} title={tr("Couper (Ctrl+X)", "Cut (Ctrl+X)")} onClick={() => copyFromRibbon(true)} />
          <Small icon="copy" label={tr("Copier", "Copy")} testId="copy" disabled={!els.length} title={tr("Copier (Ctrl+C)", "Copy (Ctrl+C)")} onClick={() => copyFromRibbon(false)} />
          <Small
            icon="brush"
            label={tr("Reproduire la mise en forme", "Format painter")}
            testId="format-painter"
            active={!!painter}
            disabled={(els.length !== 1 && !painter) || readOnly}
            title={tr("Copier la mise en forme de l’élément sélectionné puis cliquer l’élément cible (Ctrl+Maj+C / Ctrl+Maj+V)", "Copy the formatting of the selected element, then click the target element (Ctrl+Shift+C / Ctrl+Shift+V)")}
            onClick={() => useEditor.getState().set({ painter: painter ? null : copyStyle() })}
          />
        </Col>
      </Group>
      <Group label={tr("Diapositives", "Slides")}>
        <AddSlideMenu trigger={(open) => <Big icon="plus" label={tr("Nouvelle diapositive", "New slide")} caret testId="add-slide" disabled={readOnly} onClick={open} />} />
        <Col>
          <Small icon="copy" label={tr("Dupliquer", "Duplicate")} disabled={!slide || readOnly} onClick={() => slide && doc && mutate([{ kind: 'duplicateSlide', slideId: slide.id, newSlideId: uniqueId(slide.id.replace(/-\d+$/, '') || 'slide', doc.slides.map((x) => x.id)) }])} />
          <Small icon="trash" label={tr("Supprimer", "Delete")} disabled={!slide || readOnly || (doc?.slides.length ?? 0) <= 1} onClick={() => slide && mutate([{ kind: 'deleteSlide', slideId: slide.id }])} />
        </Col>
      </Group>
      <Group label={tr("Dessin", "Drawing")}>
        <Big icon="text" label={tr("Zone de texte", "Text box")} testId="add-text" disabled={!slide || readOnly} onClick={addText} />
        <ShapesMenu big disabled={!slide || readOnly} />
        <ConnectButton disabled={!slide || readOnly} />
      </Group>
      <Group label={tr("Police", "Font")}>
        <Col>
          <Row>
            <Small iconOnly icon="bold" label={tr("Gras (Ctrl+B)", "Bold (Ctrl+B)")} active={all('bold')} disabled={noText} testId="bold" onClick={() => toggle('bold')} />
            <Small iconOnly icon="italic" label={tr("Italique (Ctrl+I)", "Italic (Ctrl+I)")} active={all('italic')} disabled={noText} testId="italic" onClick={() => toggle('italic')} />
            <Small iconOnly icon="underline" label={tr("Souligné (Ctrl+U)", "Underline (Ctrl+U)")} active={all('underline')} disabled={noText} testId="underline" onClick={() => toggle('underline')} />
            <span className="rb-count" data-testid="font-size">{size !== undefined ? `${size} pt` : '—'}</span>
            <Small iconOnly icon="fontGrow" label={tr("Augmenter la taille de police", "Increase font size")} disabled={readOnly || !textEls.length} testId="font-grow" onClick={() => resize(1)} />
            <Small iconOnly icon="fontShrink" label={tr("Réduire la taille de police", "Decrease font size")} disabled={readOnly || !textEls.length} testId="font-shrink" onClick={() => resize(-1)} />
          </Row>
          <Row>
            {(['left', 'center', 'right', 'justify'] as const).map((a) => (
              <Small key={a} iconOnly icon={a === 'left' ? 'alignLeft' : a === 'center' ? 'alignCenter' : a === 'right' ? 'alignRight' : 'alignJustify'} label={{ left: tr('Aligner à gauche', 'Align left'), center: tr('Centrer', 'Center'), right: tr('Aligner à droite', 'Align right'), justify: tr('Justifier', 'Justify') }[a]} active={textEls.length > 0 && textEls.every((e) => e.style?.align === a)} disabled={noText} onClick={() => style({ align: a })} />
            ))}
          </Row>
        </Col>
      </Group>
      <Group label={tr("Paragraphe", "Paragraph")}>
        <ParagraphTools disabled={readOnly} />
      </Group>
      <Group label={tr("Organiser", "Arrange")}>
        <Col>
          <Small icon="front" label={tr("Premier plan", "Bring to front")} disabled={readOnly || !els.length} onClick={() => order('front')} />
          <Small icon="back" label={tr("Arrière-plan", "Send to back")} disabled={readOnly || !els.length} onClick={() => order('back')} />
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
      <Group label={tr("Diapositives", "Slides")}>
        <AddSlideMenu trigger={(open) => <Big icon="plus" label={tr("Nouvelle diapositive", "New slide")} caret testId="add-slide" disabled={readOnly} onClick={open} />} />
      </Group>
      <Group label={tr("Éléments", "Elements")}>
        <Big icon="text" label={tr("Zone de texte", "Text box")} testId="add-text" disabled={off} onClick={addText} />
        <ShapesMenu big disabled={off} />
        <ConnectButton disabled={off} />
        <Big icon="image" label="Image" disabled={off} onClick={() => slide && post({ type: 'pickImage', slideId: slide.id })} />
        <Big icon="table" label={tr("Tableau", "Table")} disabled={off} onClick={addTable} />
      </Group>
      <Group label={tr("Diagrammes", "Diagrams")}>
        <Big icon="diagram" label={tr("Diagramme GMC", "GMC diagram")} testId="insert-gmc" disabled={off} title={tr("Créer ou insérer un diagramme Graph Model Studio (.gmc)", "Create or insert a Graph Model Studio diagram (.gmc)")} onClick={() => useEditor.getState().set({ gmcDialog: true })} />
      </Group>
    </>
  );
}

const BASES: { id: DiffBaseKind; label: string }[] = [
  { id: 'none', label: tr('Aucune', 'None') },
  { id: 'head', label: 'HEAD' },
  { id: 'mr', label: tr('Base MR', 'MR base') },
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
      <Group label={tr("Comparer", "Compare")}>
        <Big icon="diff" label={tr("Modifications", "Changes")} active={showDiff} disabled={!baseLoaded} testId="toggle-diff" title={baseLoaded ? tr(`Comparer avec ${diffState.label} — ${diff?.count ?? 0} modification(s)`, `Compare with ${diffState.label} — ${diff?.count ?? 0} change(s)`) : diffState.error ?? tr('Choisissez une version de référence', 'Choose a reference version')} onClick={() => set({ showDiff: !showDiff })} />
        <Big icon="history" label={tr("Version de référence", "Reference version")} active={showBase} disabled={!baseLoaded} testId="toggle-base" onClick={() => set({ showBase: !showBase })} />
        <Col>
          <div className="seg seg-compact" role="radiogroup" aria-label={tr("Version de référence", "Reference version")}>
            {BASES.filter((b) => diffState.available.includes(b.id)).map((b) => (
              <button key={b.id} type="button" role="radio" aria-checked={diffState.base === b.id} className={`ibtn${diffState.base === b.id ? ' is-active' : ''}`} data-testid={`diff-base-${b.id}`} onClick={() => post({ type: 'setDiffBase', base: b.id })}>
                {b.label}
              </button>
            ))}
          </div>
          <Row>
            <Small iconOnly icon="prev" label={tr("Modification précédente", "Previous change")} disabled={!changed.length} onClick={() => step(-1)} />
            <Small iconOnly icon="next" label={tr("Modification suivante", "Next change")} disabled={!changed.length} onClick={() => step(1)} />
            <span className="rb-count" data-testid="diff-count">{diff ? `${diff.count} ${tr('modif.', 'changes')}` : '—'}</span>
          </Row>
        </Col>
      </Group>
      <Group label={tr("Commentaires", "Comments")}>
        <Big icon="commentPlus" label={tr("Nouveau commentaire", "New comment")} disabled={!reviewData?.canCreate} title={reviewData ? undefined : tr('Disponible sur une révision ouverte depuis une merge request GitLab', 'Available on a revision opened from a GitLab merge request')} onClick={() => set({ pane: 'comments' })} />
        <Col>
          <Small icon="comment" label={tr("Volet Commentaires", "Comments pane")} active={pane === 'comments'} testId="toggle-comments" onClick={() => set({ pane: pane === 'comments' ? 'format' : 'comments' })} />
          <Row>
            <Small iconOnly icon="prev" label={tr("Commentaire précédent", "Previous comment")} disabled={!anchors.length} onClick={() => stepComment(-1)} />
            <Small iconOnly icon="next" label={tr("Commentaire suivant", "Next comment")} disabled={!anchors.length} onClick={() => stepComment(1)} />
            <span className="rb-count">{anchors.length} {anchors.length > 1 ? tr('fils', 'threads') : tr('fil', 'thread')}</span>
          </Row>
        </Col>
      </Group>
      <Group label={tr("Vérification", "Check")}>
        <Big icon="check" label={tr("Valider la charte", "Validate brand")} onClick={() => post({ type: 'validate' })} />
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
      <Group label={tr("Afficher", "Show")}>
        <Big icon="notes" label="Notes" active={notesOpen} onClick={() => set({ notesOpen: !notesOpen })} />
        <Col>
          <Small icon="grid" label={tr("Grille", "Grid")} active={showGrid} onClick={toggleGrid} />
          <Small icon="magnet" label={tr("Magnétisme", "Snap")} active={snap} title={tr("Magnétisme (Alt pour ignorer)", "Snap (Alt to ignore)")} onClick={toggleSnap} />
        </Col>
      </Group>
      <Group label="Zoom">
        <Big icon="fit" label={tr("Ajuster", "Fit")} active={zoom === 'fit'} onClick={() => setZoom('fit')} />
        <Big icon="zoomIn" label="100 %" active={zoom === 1} onClick={() => setZoom(1)} />
      </Group>
      <Group label="Source">
        <Big icon="code" label={tr("Ouvrir la source", "Open source")} onClick={() => post({ type: 'openSource' })} />
        <Col>
          <Small icon="external" label={tr("Source côte à côte", "Source side by side")} disabled={!slide} onClick={() => slide && post({ type: 'reveal', slideId: slide.id })} />
          <Small icon="render" label={tr("Rendu PowerPoint", "PowerPoint rendering")} title={tr("Rendu de référence par PowerPoint (fait foi ; l'aperçu navigateur est approximatif)", "Reference rendering by PowerPoint (authoritative; the browser preview is approximate)")} onClick={() => post({ type: 'renderReference', slideIndex: Math.max(0, index) })} />
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
          <Big icon="diagram" label={tr("Modifier le diagramme", "Edit diagram")} testId="edit-gmc" title={tr("Éditeur interactif Graph Model Studio (double-clic sur le diagramme)", "Interactive Graph Model Studio editor (double-click the diagram)")} onClick={() => useEditor.getState().set({ gmcEdit: diagram.src })} />
          <Col>
            <Small icon="refresh" label={tr("Actualiser le rendu", "Refresh rendering")} onClick={() => post({ type: 'refreshGmc', src: diagram.src })} />
            <Small icon="external" label={tr("Ouvrir à côté", "Open to the side")} onClick={() => post({ type: 'editGmc', src: diagram.src })} />
            <span className="rb-note"><code>{diagram.src}</code></span>
          </Col>
        </Group>
      )}
      <Group label={tr("Organiser", "Arrange")}>
        <Col>
          <Small icon="front" label={tr("Premier plan", "Bring to front")} disabled={readOnly} onClick={() => order('front')} />
          <Small icon="forward" label={tr("Avancer", "Bring forward")} disabled={readOnly} onClick={() => order('forward')} />
        </Col>
        <Col>
          <Small icon="backward" label={tr("Reculer", "Send backward")} disabled={readOnly} onClick={() => order('backward')} />
          <Small icon="back" label={tr("Arrière-plan", "Send to back")} disabled={readOnly} onClick={() => order('back')} />
        </Col>
      </Group>
      {one && (
        <Group label={tr("Élément", "Element")}>
          <Col>
            <Small icon={one.locked ? 'lock' : 'unlock'} label={one.locked ? tr('Déverrouiller', 'Unlock') : tr('Verrouiller', 'Lock')} active={one.locked} disabled={readOnly} onClick={() => mutate([{ kind: 'updateElement', slideId: slide.id, elementId: one.id, patch: { locked: !one.locked } }])} />
            <Small icon={one.hidden ? 'eyeOff' : 'eye'} label={one.hidden ? tr('Afficher', 'Show') : tr('Masquer', 'Hide')} active={one.hidden} disabled={readOnly} onClick={() => mutate([{ kind: 'updateElement', slideId: slide.id, elementId: one.id, patch: { hidden: !one.hidden } }])} />
          </Col>
          <Col>
            <Small icon="code" label={tr("Voir dans la source", "Show in source")} onClick={() => post({ type: 'reveal', slideId: slide.id, elementId: one.id })} />
            <Small icon="trash" label={tr("Supprimer", "Delete")} disabled={readOnly} onClick={() => (mutate(deleteMutations(slide, [one.id])), select(slide.id, []))} />
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
    { id: 'home', label: tr('Accueil', 'Home') },
    { id: 'insert', label: tr('Insertion', 'Insert') },
    { id: 'review', label: tr('Révision', 'Review'), badge: open || diff?.count || undefined },
    { id: 'view', label: tr('Affichage', 'View') },
  ];

  return (
    <div className="ribbon-wrap">
      <TitleBar />
      <nav className="tabs" role="tablist" aria-label={tr("Ruban", "Ribbon")}>
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
            {isDiagram ? tr('Diagramme', 'Diagram') : 'Format'}
          </button>
        )}
        <span className="grow" />
        <button type="button" className="ibtn tabs-collapse" aria-label={collapsed ? tr('Afficher le ruban', 'Show the ribbon') : tr('Réduire le ruban', 'Collapse the ribbon')} title={collapsed ? tr('Afficher le ruban', 'Show the ribbon') : tr('Réduire le ruban', 'Collapse the ribbon')} onClick={() => set({ ribbonCollapsed: !collapsed })}>
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
