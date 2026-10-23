import { useEffect } from 'react';
import type { HostMessage } from '@corporate-slides/core';
import { openGmcEditor } from '../../../../../shared/gmc-editor-shell';
import { onHostMessage, post } from './host';
import { useEditor } from './store';
import { tr } from '@corporate-slides/core';

/*
 * Graph Model Studio's interactive editor on a slide's diagram (the shared maximized shell, same as
 * Markdown Studio's). Edits are written to the .gmc file as you go (an open text editor of it gets
 * them instead); closing flushes the last write, then the host re-renders the PNG on the slide.
 */
type EditorInfo = Extract<HostMessage, { type: 'gmcEditor' }>;

export function GmcEditor() {
  const src = useEditor((s) => s.gmcEdit);
  return src ? <GmcSession key={src} src={src} /> : null;
}

function GmcSession({ src }: { src: string }) {
  useEffect(() => {
    const readOnly = useEditor.getState().readOnly;
    let changed = false;
    let pending: { timer: ReturnType<typeof setTimeout>; source: string } | null = null;
    const flush = () => {
      if (!pending) return;
      clearTimeout(pending.timer);
      post({ type: 'gmcWrite', src, source: pending.source });
      pending = null;
    };
    const close = () => {
      flush();
      // The host handles this after the write above: the render reads the last edit.
      post({ type: 'gmcClose', src, changed });
      useEditor.getState().set({ gmcEdit: null });
    };
    let stop = () => {};
    const start = new Promise<{ js: string; css: string; render: Record<string, unknown> }>((resolve, reject) => {
      stop = onHostMessage((m) => {
        if (m.type !== 'gmcEditor' || m.src !== src) return;
        stop();
        const info: EditorInfo = m;
        if (info.error || !info.editorJs || !info.editorCss) return reject(new Error(info.error ?? tr('Éditeur indisponible.', 'Editor unavailable.')));
        const theme = document.body.classList.contains('vscode-light') ? 'light' : 'dark';
        resolve({ js: info.editorJs, css: info.editorCss, render: { renderId: 'slides', editable: !readOnly, version: info.version, source: info.source, name: info.name, theme, target: { uri: 'corporate-slides', kind: 'file' } } });
      });
    });
    const session = openGmcEditor({
      name: src.split('/').pop() ?? src,
      hint: readOnly ? tr('Lecture seule', 'Read-only') : tr('Les modifications sont enregistrées dans le fichier .gmc ; le rendu de la diapositive est actualisé à la fermeture.', 'Changes are saved to the .gmc file; the slide rendering refreshes on close.'),
      start,
      onChange: (source) => {
        changed = true;
        if (pending) clearTimeout(pending.timer);
        pending = { source, timer: setTimeout(flush, 400) };
      },
      onSave: flush,
      onClose: close,
      onOpenBeside: () => (close(), post({ type: 'editGmc', src })),
      labels: {
        beside: tr('À côté', 'To the side'),
        besideTitle: tr('Ouvrir Graph Model Studio dans un onglet à côté', 'Open Graph Model Studio in a tab to the side'),
        close: tr('Fermer (Échap)', 'Close (Esc)'),
        loading: tr("Chargement de l'éditeur de diagramme…", 'Loading the diagram editor…'),
        notStarted: tr("L'éditeur de diagramme n'a pas démarré.", 'The diagram editor did not start.'),
        failed: (m) => m,
        openBeside: tr('Ouvrir à côté', 'Open to the side'),
      },
    });
    post({ type: 'gmcOpen', src });
    return () => {
      stop();
      // Unmounted without closing (panel disposed, diagram switched): keep the last edit.
      flush();
      session.dispose();
    };
  }, [src]);
  return null;
}
