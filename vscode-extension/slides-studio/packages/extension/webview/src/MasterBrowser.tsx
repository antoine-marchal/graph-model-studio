import { useEffect, useMemo, useState } from 'react';
import { paletteTokens, type CorporateMaster, type HostMessage, tr } from '@corporate-slides/core';
import { LayoutPreview, PPI, type AssetResolver } from '@corporate-slides/renderer';
import { post } from './host';

type Data = Extract<HostMessage, { type: 'masters' }>;

/** "Masques corporate": layouts, placeholders, theme and extraction warnings. */
export function MasterBrowser({ data }: { data: Data }) {
  const master = data.master as CorporateMaster;
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'internal' | 'reference'>('internal');
  const [selected, setSelected] = useState<string | null>(data.focusLayout ?? null);
  useEffect(() => setSelected(data.focusLayout ?? null), [data.focusLayout]);
  const assets: AssetResolver = useMemo(() => ({ masterAsset: (id) => data.assetUrls[`master:${id}`] ?? null, image: () => null }), [data.assetUrls]);
  const layouts = master.layouts.filter((l) => !query || `${l.name} ${l.id} ${l.aliases.join(' ')}`.toLowerCase().includes(query.toLowerCase()));
  const current = master.layouts.find((l) => l.id === selected);
  const W = master.dimensions.width * PPI;
  const H = master.dimensions.height * PPI;
  const hasRef = Object.keys(data.thumbnails).length > 0;

  return (
    <div className="masters">
      <header className="toolbar">
        <div className="toolbar-group">
          <strong className="file-name">{master.name}</strong>
          <span className="hint">
            {master.layouts.length} {tr('dispositions', 'layouts')} · {master.masters.length} {tr('masques', 'masters')} · {tr('méthode', 'method')} : {master.fidelity.method === 'reconstructed' ? tr('définitions reconstruites', 'reconstructed definitions') : master.fidelity.method}
          </span>
        </div>
        <div className="toolbar-group">
          <input className="search" placeholder={tr("Filtrer les dispositions…", "Filter layouts…")} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={tr("Filtrer les dispositions", "Filter layouts")} />
          <div className="seg" role="group" aria-label={tr("Aperçu", "Preview")}>
            <button className={`ibtn has-label${view === 'internal' ? ' is-active' : ''}`} onClick={() => setView('internal')}>{tr('Rendu éditeur', 'Editor rendering')}</button>
            <button className={`ibtn has-label${view === 'reference' ? ' is-active' : ''}`} disabled={!hasRef} title={hasRef ? '' : tr('PowerPoint indisponible lors de l’import', 'PowerPoint unavailable during import')} onClick={() => setView('reference')}>{tr('Référence PowerPoint', 'PowerPoint reference')}</button>
          </div>
        </div>
      </header>
      <div className="masters-body">
        <div className="masters-grid">
          {master.masters.map((m) => {
            const ls = layouts.filter((l) => l.masterId === m.id);
            if (!ls.length) return null;
            return (
              <section key={m.id}>
                <h2>{m.name}{m.primary ? ' — principal' : ''} <span className="hint">{m.part}</span></h2>
                <div className="layout-grid big">
                  {ls.map((l) => (
                    <button key={l.id} className={`layout-card${l.id === selected ? ' is-selected' : ''}`} onClick={() => setSelected(l.id)} data-testid={`master-layout-${l.id}`}>
                      <div className="thumb" style={{ width: 220, height: (H * 220) / W }}>
                        {view === 'reference' && data.thumbnails[l.id] ? (
                          <img src={data.thumbnails[l.id]} alt={tr(`Rendu PowerPoint de ${l.name}`, `PowerPoint rendering of ${l.name}`)} style={{ width: '100%', height: '100%' }} />
                        ) : (
                          <div style={{ transform: `scale(${220 / W})`, transformOrigin: '0 0', width: W, height: H }}>
                            <LayoutPreview layout={l} master={master} assets={assets} />
                          </div>
                        )}
                      </div>
                      <span className="layout-name">{l.name}</span>
                      <span className="layout-alias">{[l.id, ...l.aliases].join(' · ')}</span>
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
        <aside className="inspector">
          {current ? (
            <>
              <div className="insp-head"><span className="insp-kind">{current.name}</span></div>
              <section className="insp-section">
                <header><h3>{tr('Identifiants', 'Identifiers')}</h3></header>
                <p><code>{current.id}</code>{current.aliases.map((a) => <code key={a}> {a}</code>)}</p>
                <p className="hint">{current.sourcePart}{current.ooxmlType ? ` · type ${current.ooxmlType}` : ''}</p>
                <button className="ibtn has-label is-primary" onClick={() => post({ type: 'newFromLayout', layout: current.aliases[0] ?? current.id })}>{tr('Nouvelle présentation avec cette disposition', 'New presentation with this layout')}</button>
              </section>
              <section className="insp-section">
                <header><h3>{tr('Espaces réservés', 'Placeholders')}</h3></header>
                <table className="data">
                  <thead><tr><th>{tr('Clé', 'Key')}</th><th>Type</th><th>x</th><th>y</th><th>l</th><th>h</th></tr></thead>
                  <tbody>
                    {current.placeholders.map((p) => (
                      <tr key={p.key}><td><code>{p.key}</code></td><td>{p.type}</td><td>{p.x.toFixed(2)}</td><td>{p.y.toFixed(2)}</td><td>{p.w.toFixed(2)}</td><td>{p.h.toFixed(2)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </section>
              {current.warnings.length > 0 && (
                <section className="insp-section">
                  <header><h3>{tr('Avertissements', 'Warnings')}</h3></header>
                  <ul className="diag-list">{current.warnings.map((w, i) => <li key={i} className="warning">{w}</li>)}</ul>
                </section>
              )}
            </>
          ) : (
            <ThemePanel master={master} />
          )}
        </aside>
      </div>
    </div>
  );
}

function ThemePanel({ master }: { master: CorporateMaster }) {
  const tokens = paletteTokens(master).filter((t) => t.token.split('.').length === 2);
  return (
    <>
      <div className="insp-head"><span className="insp-kind">{tr('Thème', 'Theme')}</span></div>
      <section className="insp-section">
        <header><h3>{tr('Couleurs', 'Colors')}</h3></header>
        <ul className="theme-colors">
          {tokens.map((t) => (
            <li key={t.token}><span className="swatch" style={{ background: `#${t.hex}` }} /><code>{t.token}</code><span className="hint">#{t.hex}</span></li>
          ))}
        </ul>
      </section>
      <section className="insp-section">
        <header><h3>{tr('Typographie', 'Typography')}</h3></header>
        <p><code>theme.heading</code> {master.theme.fonts.heading}</p>
        <p><code>theme.body</code> {master.theme.fonts.body}</p>
        <p className="hint">Titres {master.constraints.fontSizes.title.join('–')} pt · corps {master.constraints.fontSizes.body.join('–')} pt</p>
      </section>
      <section className="insp-section">
        <header><h3>{tr('Fonctionnalités non reproduites', 'Unsupported features')}</h3></header>
        <ul className="diag-list">
          {master.unsupported.map((u) => <li key={u.feature} className="warning"><strong>{u.feature}</strong> ({u.count}) — {u.impact}</li>)}
        </ul>
      </section>
    </>
  );
}
