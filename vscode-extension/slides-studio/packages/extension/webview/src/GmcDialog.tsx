import { useEffect, useRef, useState } from 'react';
import { Icon } from './icons';
import { onHostMessage, post } from './host';
import { currentSlide, useEditor } from './store';
import { tr } from '@corporate-slides/core';

type Template = 'context' | 'flow' | 'blank';

const TEMPLATES: { id: Template; label: string; hint: string; art: string }[] = [
  { id: 'context', label: tr('Contexte', 'Context'), hint: tr('Acteur, système, système externe (C4)', 'Actor, system, external system (C4)'), art: 'M4 14h12v8H4zM24 14h12v8H24zM44 14h12v8H44zM16 18h8M36 18h8' },
  { id: 'flow', label: tr('Processus', 'Process'), hint: tr('Événement → étapes → résultat', 'Event → steps → outcome'), art: 'M6 18a3 3 0 1 0 0.1 0M14 14h10v8H14zM30 14h10v8H30zM50 18a3 3 0 1 0 0.1 0M9 18h5M24 18h6M40 18h7' },
  { id: 'blank', label: tr('Vierge', 'Blank'), hint: tr('Modèle et vue vides', 'Empty model and view'), art: 'M6 8h48v20H6z' },
];

const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Insert → Diagramme GMC: create a Graph Model Studio source (or pick one) rendered as a PNG on the slide. */
export function GmcDialog() {
  const open = useEditor((s) => s.gmcDialog);
  const slide = useEditor(currentSlide);
  const { set } = useEditor.getState();
  const ref = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [name, setName] = useState('architecture');
  const [folder, setFolder] = useState('diagrams');
  const [template, setTemplate] = useState<Template>('context');
  const [files, setFiles] = useState<string[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const d = ref.current!;
    if (open && !d.open) {
      d.showModal();
      setFiles(null);
      post({ type: 'listGmc' });
    } else if (!open && d.open) d.close();
  }, [open]);

  useEffect(
    () =>
      onHostMessage((m) => {
        if (m.type !== 'gmcFiles') return;
        setFiles(m.files);
      }),
    [],
  );

  const file = `${folder.replace(/^[./\\]+|[/\\]+$/g, '') || '.'}/${slug(name) || 'diagramme'}.gmc`.replace(/^\.\//, '');
  const exists = files?.includes(file);
  const ready = mode === 'new' ? !!slug(name) && !exists : !!picked;
  const close = () => set({ gmcDialog: false });
  const submit = (pick = picked) => {
    if (!slide || (mode === 'new' ? !ready : !pick)) return;
    post(mode === 'new' ? { type: 'insertGmc', slideId: slide.id, path: file, create: true, template } : { type: 'insertGmc', slideId: slide.id, path: pick!, create: false });
    close();
  };
  const list = (files ?? []).filter((f) => f.toLowerCase().includes(query.toLowerCase()));

  return (
    <dialog ref={ref} className="dialog" aria-labelledby="gmc-title" onClose={close} onCancel={close} data-testid="gmc-dialog" onKeyDown={(e) => e.stopPropagation()}>
      <form method="dialog" onSubmit={(e) => (e.preventDefault(), submit())}>
        <header className="dialog-head">
          <Icon name="diagram" size={20} />
          <div>
            <h2 id="gmc-title">{tr('Diagramme Graph Model Studio', 'Graph Model Studio diagram')}</h2>
            <p className="hint">{tr('La source reste dans un fichier', 'The source stays in a')} <code>.gmc</code> {tr('versionné ; la diapositive et le PowerPoint affichent son rendu PNG.', 'file under version control; the slide and the PowerPoint show its PNG rendering.')}</p>
          </div>
        </header>

        <div className="seg seg-wide" role="tablist" aria-label={tr("Origine du diagramme", "Diagram source")}>
          <button type="button" role="tab" aria-selected={mode === 'new'} className={`ibtn${mode === 'new' ? ' is-active' : ''}`} onClick={() => setMode('new')}>{tr('Nouveau diagramme', 'New diagram')}</button>
          <button type="button" role="tab" aria-selected={mode === 'existing'} className={`ibtn${mode === 'existing' ? ' is-active' : ''}`} onClick={() => setMode('existing')}>{tr('Fichier existant', 'Existing file')}</button>
        </div>

        {mode === 'new' ? (
          <div className="dialog-body">
            <div className="field-row">
              <label className="field">
                <span>{tr('Nom', 'Name')}</span>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus data-testid="gmc-name" />
              </label>
              <label className="field">
                <span>{tr('Dossier', 'Folder')}</span>
                <input className="input" value={folder} onChange={(e) => setFolder(e.target.value)} />
              </label>
            </div>
            <fieldset className="templates">
              <legend>{tr('Modèle de départ', 'Starting template')}</legend>
              {TEMPLATES.map((t) => (
                <label key={t.id} className={`template${template === t.id ? ' is-selected' : ''}`}>
                  <input type="radio" name="tpl" value={t.id} checked={template === t.id} onChange={() => setTemplate(t.id)} />
                  <svg viewBox="0 0 60 36" aria-hidden><path d={t.art} /></svg>
                  <strong>{t.label}</strong>
                  <span className="hint">{t.hint}</span>
                </label>
              ))}
            </fieldset>
            <p className={`path-preview${exists ? ' is-error' : ''}`}>
              <code>{file}</code> <Icon name="next" /> <code>{file.replace(/\.gmc$/, '.png')}</code>
              {exists && <span> {tr('— ce fichier existe déjà, choisissez « Fichier existant ».', '— this file already exists, choose “Existing file”.')}</span>}
            </p>
          </div>
        ) : (
          <div className="dialog-body">
            <input className="input" placeholder={tr("Rechercher un fichier .gmc…", "Search a .gmc file…")} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={tr("Rechercher un fichier .gmc", "Search a .gmc file")} />
            <ul className="file-list" role="listbox" aria-label={tr("Diagrammes du projet", "Project diagrams")}>
              {files === null && <li className="hint">{tr('Recherche des diagrammes…', 'Looking for diagrams…')}</li>}
              {files && list.length === 0 && <li className="hint">{tr('Aucun fichier .gmc dans l’espace de travail.', 'No .gmc file in the workspace.')}</li>}
              {list.map((f) => (
                <li key={f} role="option" aria-selected={picked === f} className={picked === f ? 'is-selected' : ''} onClick={() => setPicked(f)} onDoubleClick={() => submit(f)}>
                  <Icon name="diagram" /> <code>{f}</code>
                </li>
              ))}
            </ul>
          </div>
        )}


        <footer className="dialog-actions">
          <button type="button" className="btn" onClick={close}>{tr('Annuler', 'Cancel')}</button>
          <button type="submit" className="btn btn-primary" disabled={!ready} data-testid="gmc-submit">
            {mode === 'new' ? tr('Créer et modifier', 'Create and edit') : tr('Insérer le diagramme', 'Insert diagram')}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
