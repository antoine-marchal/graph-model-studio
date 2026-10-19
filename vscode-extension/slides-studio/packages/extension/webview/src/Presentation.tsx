import { useEffect, useRef, useState } from 'react';
import { PPI, SlideView } from '@corporate-slides/renderer';
import { tr } from '@corporate-slides/core';
import { useEditor } from './store';
import { useAssets } from './Canvas';
import { post } from './host';
import { Icon } from './icons';

/**
 * Slide show, as PowerPoint's F5: full screen, one slide at a time, hidden slides skipped.
 * Keys: → ↓ Space Enter PageDown N (next), ← ↑ Backspace PageUp P (previous), Home / End,
 * number + Enter (go to slide), B / . (black screen), W / , (white screen), Esc (end).
 */
export function Presentation() {
  const start = useEditor((s) => s.presenting);
  const doc = useEditor((s) => s.doc);
  const master = useEditor((s) => s.master);
  const assets = useAssets();
  const ref = useRef<HTMLDivElement>(null);
  const shown = doc?.slides.filter((s) => !s.hidden) ?? [];
  const [pos, setPos] = useState(0);
  const [blank, setBlank] = useState<'black' | 'white' | null>(null);
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [chrome, setChrome] = useState(true);
  const typed = useRef('');
  const hideTimer = useRef<number | undefined>(undefined);

  const exit = () => useEditor.getState().set({ presenting: null });

  // Enter: start slide, full screen (browser API when the webview allows it, else VS Code zen mode).
  useEffect(() => {
    if (!start) return;
    const i = shown.findIndex((s) => s.id === start.slideId);
    setPos(Math.max(0, i));
    setBlank(null);
    const el = ref.current;
    let native = false;
    if (el && document.fullscreenEnabled) {
      native = true;
      el.requestFullscreen().catch(() => post({ type: 'presentation', active: true }));
    } else post({ type: 'presentation', active: true });
    el?.focus();
    const onFs = () => !document.fullscreenElement && native && exit();
    document.addEventListener('fullscreenchange', onFs);
    return () => {
      document.removeEventListener('fullscreenchange', onFs);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
      else if (!native) post({ type: 'presentation', active: false });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start]);

  useEffect(() => {
    const on = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);

  if (!start || !doc || !master) return null;

  const last = shown.length; // index `last` = "end of slide show" screen
  const go = (i: number) => {
    setBlank(null);
    setPos(Math.max(0, Math.min(last, i)));
  };
  const next = () => (pos >= last ? exit() : go(pos + 1));
  const prev = () => go(pos - 1);

  const onKey = (e: React.KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const k = e.key;
    if (/^\d$/.test(k)) return void (typed.current += k);
    if (k === 'Enter' && typed.current) {
      const n = Number(typed.current);
      typed.current = '';
      return go(n - 1);
    }
    typed.current = '';
    if (k === 'Escape') return exit();
    if (blank && !['b', 'B', '.', 'w', 'W', ','].includes(k)) return setBlank(null);
    if (['ArrowRight', 'ArrowDown', ' ', 'Enter', 'PageDown', 'n', 'N'].includes(k)) next();
    else if (['ArrowLeft', 'ArrowUp', 'Backspace', 'PageUp', 'p', 'P'].includes(k)) prev();
    else if (k === 'Home') go(0);
    else if (k === 'End') go(last - 1);
    else if (k === 'b' || k === 'B' || k === '.') setBlank((b) => (b === 'black' ? null : 'black'));
    else if (k === 'w' || k === 'W' || k === ',') setBlank((b) => (b === 'white' ? null : 'white'));
  };

  const slide = shown[pos];
  const W = master.dimensions.width * PPI, H = master.dimensions.height * PPI;
  const scale = Math.min(size.w / W, size.h / H);
  const showChrome = () => {
    setChrome(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setChrome(false), 2500);
  };

  return (
    <div
      ref={ref}
      className={`slideshow${chrome ? '' : ' no-cursor'}`}
      role="dialog"
      aria-modal
      aria-label={tr('Diaporama', 'Slide show')}
      tabIndex={-1}
      data-testid="slideshow"
      onKeyDown={onKey}
      onPointerMove={showChrome}
      onClick={(e) => (e.button === 0 && !(e.target as HTMLElement).closest('.slideshow-bar') ? next() : undefined)}
      onContextMenu={(e) => (e.preventDefault(), prev())}
      onWheel={(e) => (e.deltaY > 0 ? next() : prev())}
    >
      {slide ? (
        <div key={slide.id} className="slideshow-slide" style={{ width: W * scale, height: H * scale }}>
          <div style={{ transform: `scale(${scale})`, transformOrigin: '0 0', width: W, height: H }}>
            <SlideView slide={slide} master={master} assets={assets} metadata={doc.metadata} slideNumber={doc.slides.indexOf(slide) + 1} />
          </div>
        </div>
      ) : (
        <p className="slideshow-end">{tr('Fin du diaporama. Cliquez pour quitter.', 'End of slide show. Click to exit.')}</p>
      )}
      {blank && <div className={`slideshow-blank is-${blank}`} />}
      <div className={`slideshow-bar${chrome ? ' is-visible' : ''}`} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="ibtn" aria-label={tr('Précédente', 'Previous')} onClick={prev} disabled={pos === 0}><Icon name="prev" /></button>
        <span className="slideshow-count" data-testid="slideshow-count">{Math.min(pos + 1, last)} / {last}</span>
        <button type="button" className="ibtn" aria-label={tr('Suivante', 'Next')} onClick={next}><Icon name="next" /></button>
        <button type="button" className="ibtn" aria-label={tr('Écran noir (B)', 'Black screen (B)')} title={tr('Écran noir (B)', 'Black screen (B)')} onClick={() => setBlank((b) => (b === 'black' ? null : 'black'))}><Icon name="eyeOff" /></button>
        <button type="button" className="ibtn" aria-label={tr('Arrêter le diaporama (Échap)', 'End slide show (Esc)')} title={tr('Arrêter le diaporama (Échap)', 'End slide show (Esc)')} onClick={exit}><Icon name="close" /></button>
      </div>
    </div>
  );
}

/** Start the slide show from the first visible slide, or from the current one. */
export function startSlideShow(fromCurrent: boolean) {
  const st = useEditor.getState();
  const slides = st.doc?.slides.filter((s) => !s.hidden) ?? [];
  if (!slides.length) return st.notify('info', tr('Aucune diapositive visible à présenter.', 'No visible slide to present.'));
  const cur = fromCurrent ? slides.find((s) => s.id === st.slideId) : undefined;
  st.setEditing(null);
  st.set({ presenting: { slideId: (cur ?? slides[0]!).id }, contextMenu: null });
}
