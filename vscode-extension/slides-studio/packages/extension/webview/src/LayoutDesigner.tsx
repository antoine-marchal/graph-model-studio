import { useState } from 'react';
import { placeholderTable, placeholderTypeOf, resolveColor, tr, uniqueId, type LayoutDef, type PlaceholderDef, type SlideElement } from '@corporate-slides/core';
import { SlideView } from '@corporate-slides/renderer';
import { useAssets } from './Canvas';
import { currentSlide, updateDesignLayout, useEditor } from './store';
import { post } from './host';
import { Icon } from './icons';
import { ColorPicker, EditableId, IconButton, Section, Thumb } from './Panels';

/*
 * Layout designer (Design › Edit master › All slides): the layout is a virtual slide, so the whole
 * ribbon applies to it. This module holds what only makes sense for a layout: its identity and
 * background, and its placeholders (the zones slides fill in).
 */

export const PLACEHOLDER_KINDS: { type: PlaceholderDef['type']; label: string }[] = [
  { type: 'title', label: tr('Titre', 'Title') },
  { type: 'subtitle', label: tr('Sous-titre', 'Subtitle') },
  { type: 'body', label: tr('Contenu', 'Content') },
  { type: 'pic', label: tr('Image', 'Picture') },
  { type: 'tbl', label: tr('Tableau', 'Table') },
  { type: 'chart', label: tr('Graphique', 'Chart') },
];

/** New placeholder zone (key `<type>-<n>`, as PowerPoint names them), centred and selected. */
export function addPlaceholder(type: PlaceholderDef['type']) {
  const st = useEditor.getState();
  const slide = currentSlide(st);
  if (!slide || !st.master) return;
  const taken = slide.elements.flatMap((e) => [e.id, e.placeholder ?? '']);
  const id = taken.includes(type) ? uniqueId(type, taken) : type;
  const { width: W, height: H } = st.master.dimensions;
  const [w, h] = type === 'title' ? [W * 0.8, 1] : type === 'subtitle' ? [W * 0.8, 0.6] : [W * 0.4, H * 0.4];
  const box = { x: Math.round(((W - w) / 2) * 100) / 100, y: Math.round(((H - h) / 2) * 100) / 100, w, h };
  // A table zone is drawn as its starting grid (header labels, empty cells to fill in slides).
  const el: SlideElement = type === 'tbl'
    ? { id, type: 'table', placeholder: id, ...box, ...placeholderTable(undefined) }
    : { id, type: 'text', placeholder: id, ...box, paragraphs: [{ runs: [{ text: id }] }] };
  st.mutate([{ kind: 'addElement', slideId: slide.id, element: el }]);
  st.select(slide.id, [id]);
}

/** Inspector when nothing is selected in the designer: the layout itself. */
export function LayoutInspector() {
  const design = useEditor((s) => s.design);
  const master = useEditor((s) => s.master);
  const slide = useEditor(currentSlide);
  if (!design || !master || !slide) return null;
  const { exitDesign, select } = useEditor.getState();
  const base = design.base;
  const placeholders = slide.elements.filter((e) => e.placeholder);
  return (
    <>
      <div className="insp-head">
        <span className="insp-kind">{tr('Disposition', 'Layout')}</span>
        <EditableId
          value={base.id}
          title={base.name}
          testId="layout-id"
          onRename={(newId) => {
            exitDesign();
            post({ type: 'renameLayout', layoutId: base.id, newId });
          }}
        />
        <span className="grow" />
        <IconButton
          icon="trash"
          label={tr('Supprimer la disposition', 'Delete layout')}
          testId="layout-delete"
          onClick={() => {
            exitDesign();
            post({ type: 'deleteLayout', layoutId: base.id });
          }}
        />
      </div>
      <p className="hint insp-hint">
        {tr('Dessinez la disposition comme une diapositive : formes, textes, images, tableaux, diagrammes… Les modifications s’appliquent à toutes les diapositives qui l’utilisent.', 'Design the layout like a slide: shapes, texts, pictures, tables, diagrams… Changes apply to every slide using it.')}
      </p>
      <Section title={tr('Nom', 'Name')}>
        <input
          key={base.name}
          className="input"
          defaultValue={base.name}
          aria-label={tr('Nom de la disposition', 'Layout name')}
          data-testid="layout-name"
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
          onBlur={(e) => {
            const name = e.target.value.trim();
            if (name && name !== base.name) updateDesignLayout({ name });
            else e.target.value = base.name;
          }}
        />
      </Section>
      <Section title={tr('Arrière-plan', 'Background')}>
        <ColorPicker label={tr('Couleur', 'Color')} value={base.background.color} testId="layout-background" onChange={(v) => updateDesignLayout({ background: { ...base.background, color: resolveColor(v ?? undefined, master) ?? 'FFFFFF' } })} />
      </Section>
      <Section title={tr('Espaces réservés', 'Placeholders')}>
        <div className="ph-add">
          {PLACEHOLDER_KINDS.map((k) => (
            <button key={k.type} type="button" className="btn" data-testid={`add-placeholder-${k.type}`} onClick={() => addPlaceholder(k.type)}>
              <Icon name="plus" /> {k.label}
            </button>
          ))}
        </div>
        <ul className="ph-list">
          {placeholders.map((e) => (
            <li key={e.id}>
              <button type="button" className="linklike" onClick={() => select(slide.id, [e.id])}><code>{e.placeholder}</code></button>{' '}
              <span className="hint">{design.base.placeholders.find((p) => p.key === e.placeholder)?.type ?? placeholderTypeOf(e.placeholder!)}</span>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}

/** Element inspector section of a placeholder zone. */
export function PlaceholderSection({ el }: { el: SlideElement }) {
  const design = useEditor((s) => s.design);
  if (!design || !el.placeholder) return null;
  const type = design.base.placeholders.find((p) => p.key === el.placeholder)?.type ?? placeholderTypeOf(el.placeholder);
  return (
    <Section title={tr('Espace réservé', 'Placeholder')}>
      <p className="hint">
        <code>{el.placeholder}</code> · {PLACEHOLDER_KINDS.find((k) => k.type === type)?.label ?? type} —{' '}
        {type === 'tbl'
          ? tr('la grille est celle de départ des diapositives : en-têtes (1re ligne ou 1re colonne, double-cliquez pour les éditer) et cellules à remplir ; les diapositives ajoutent ou suppriment des lignes.', 'the grid is what slides start from: headers (first row or first column; double-click to edit) and cells to fill in; slides add or delete rows.')
          : tr('le texte affiché est l’invite montrée dans PowerPoint ; police, couleurs et position sont héritées par les diapositives.', 'the text shown is the prompt PowerPoint displays; font, colors and position are inherited by slides.')}
      </p>
    </Section>
  );
}

/** Design ribbon: every layout of every master, to design or delete. */
export function LayoutsGallery({ close }: { close: () => void }) {
  const master = useEditor((s) => s.design?.real.master ?? s.master);
  const designing = useEditor((s) => s.design?.layoutId);
  const assets = useAssets();
  const [query, setQuery] = useState('');
  if (!master) return null;
  const { enterDesign, exitDesign } = useEditor.getState();
  const match = (l: LayoutDef) => !query || `${l.name} ${l.id} ${l.aliases.join(' ')}`.toLowerCase().includes(query.toLowerCase());
  return (
    <div className="layout-picker layouts-gallery" onKeyDown={(e) => e.stopPropagation()}>
      <input className="search" placeholder={tr('Rechercher une disposition…', 'Search layouts…')} value={query} onChange={(e) => setQuery(e.target.value)} autoFocus aria-label={tr('Rechercher une disposition', 'Search layouts')} />
      {master.masters.map((m) => {
        const layouts = master.layouts.filter((l) => l.masterId === m.id && match(l));
        if (!layouts.length) return null;
        return (
          <section key={m.id}>
            <h4 className="layout-group">
              {m.name}{m.primary ? ` · ${tr('principal', 'primary')}` : ''} <span className="hint">({layouts.length})</span>
              <IconButton
                icon="trash"
                label={tr('Supprimer le masque et toutes ses dispositions', 'Delete the master and all its layouts')}
                testId={`gallery-delete-master-${m.id}`}
                onClick={() => {
                  close();
                  if (master.layouts.some((l) => l.masterId === m.id && l.id === designing)) exitDesign();
                  post({ type: 'deleteMaster', masterId: m.id });
                }}
              />
            </h4>
            <div className="layout-grid">
              {layouts.map((l) => (
                <div key={l.id} className={`layout-card${l.id === designing ? ' is-current' : ''}`} data-testid={`gallery-${l.id}`} title={`${l.name} (${l.id})`}>
                  <button type="button" className="linklike" onClick={() => (close(), enterDesign(l.id))} aria-label={`${tr('Modifier', 'Edit')} ${l.name}`}>
                    <Thumb width={132}>
                      <SlideView slide={{ id: 'p', layout: l.id, elements: [] }} master={master} assets={assets} showPlaceholders />
                    </Thumb>
                  </button>
                  <span className="layout-card-row">
                    <span className="layout-name">{l.name}</span>
                    <IconButton icon="edit" label={tr('Modifier', 'Edit')} testId={`gallery-edit-${l.id}`} onClick={() => (close(), enterDesign(l.id))} />
                    <IconButton
                      icon="trash"
                      label={tr('Supprimer', 'Delete')}
                      testId={`gallery-delete-${l.id}`}
                      onClick={() => {
                        close();
                        if (l.id === designing) exitDesign();
                        post({ type: 'deleteLayout', layoutId: l.id });
                      }}
                    />
                  </span>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
