import { z } from 'zod';
import { Transaction } from './mutations.js';
import { LayoutDef, MasterOverride } from './schema.js';
import { tr } from './i18n.js';

/** Which revision the visual diff compares the document with. */
export const DiffBaseKind = z.enum(['none', 'head', 'mr']);
export type DiffBaseKind = z.infer<typeof DiffBaseKind>;

/** GitLab review payload relayed from the Project Integration companion. Lines are 1-based source lines. */
export interface ReviewThread {
  id: string;
  line: number;
  resolved: boolean;
  resolvable: boolean;
  notes: { id: number; author: string; body: string; created: string }[];
}
export interface ReviewData {
  mr: string;
  side: 'old' | 'new';
  canComment: boolean;
  canCreate: boolean;
  focus?: { noteId: number; line: number };
  threads: ReviewThread[];
  /** Shown above the threads (local copy reviewed against its merge request revision). */
  notice?: string;
}

/** Messages webview → extension host. Every message is validated by the host before use. */
export const WebviewMessage = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ready') }),
  z.object({ type: z.literal('mutate'), tx: Transaction }),
  z.object({ type: z.literal('undo') }),
  z.object({ type: z.literal('redo') }),
  z.object({ type: z.literal('save') }),
  z.object({ type: z.literal('export') }),
  z.object({ type: z.literal('validate') }),
  /** The slide shown changed: other editors of the same file (diff view) follow. */
  z.object({ type: z.literal('slideShown'), slideId: z.string().max(64) }),
  z.object({ type: z.literal('reveal'), slideId: z.string().max(64), elementId: z.string().max(64).optional() }),
  z.object({ type: z.literal('pickImage'), slideId: z.string().max(64) }),
  /** Image pasted from the clipboard (base64), saved under `images/` next to the presentation. */
  z.object({ type: z.literal('pasteImage'), slideId: z.string().max(64), mime: z.enum(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml']), data: z.string().max(30_000_000) }),
  z.object({ type: z.literal('readClipboard') }),
  /** PowerPoint objects on the clipboard: the host reads PowerPoint's own drawing format. */
  z.object({ type: z.literal('pastePowerPoint'), slideId: z.string().max(64) }),
  z.object({ type: z.literal('renderReference'), slideIndex: z.number().int().min(0) }),
  z.object({ type: z.literal('newFromLayout'), layout: z.string().max(120) }),
  z.object({ type: z.literal('openSource') }),
  /** Master editing for every slide: change one static object of a layout in the corporate master. */
  z.object({ type: z.literal('editMaster'), layoutId: z.string().max(120), index: z.number().int().min(0).max(9999), patch: MasterOverride }),
  /** New layout in the corporate master (blank, copy of the slide's layout, or from the slide's rendering). */
  z.object({ type: z.literal('createLayout'), slideId: z.string().max(64), from: z.enum(['blank', 'duplicate', 'slide']), name: z.string().min(1).max(80) }),
  /** Rename a layout of the corporate master (the old id stays as an alias for other decks). */
  z.object({ type: z.literal('renameLayout'), layoutId: z.string().max(120), newId: z.string().regex(/^[A-Za-z0-9][\w-]{0,119}$/) }),
  /** Layout designer: replace a layout of the corporate master; `indexMap` re-keys this deck's master overrides. */
  z.object({ type: z.literal('saveLayout'), layout: LayoutDef, indexMap: z.record(z.string(), z.number().int().min(0).nullable()) }),
  /** Delete a slide master and all its layouts, after a confirmation by the host (name typed). */
  z.object({ type: z.literal('deleteMaster'), masterId: z.string().max(120) }),
  /** Delete a layout of the corporate master, after a confirmation by the host. */
  z.object({ type: z.literal('deleteLayout'), layoutId: z.string().max(120) }),
  /** Slide show started / ended: the host hides the workbench (zen mode) when the webview cannot go full screen. */
  z.object({ type: z.literal('presentation'), active: z.boolean() }),
  z.object({ type: z.literal('setDiffBase'), base: DiffBaseKind }),
  z.object({
    type: z.literal('review'),
    action: z.enum(['load', 'create', 'reply', 'resolve']),
    requestId: z.number().int(),
    line: z.number().int().min(1).optional(),
    text: z.string().max(20_000).optional(),
    discussionId: z.string().max(200).optional(),
    resolved: z.boolean().optional(),
  }),
  z.object({ type: z.literal('listGmc') }),
  z.object({
    type: z.literal('insertGmc'),
    slideId: z.string().max(64),
    /** Path of the `.gmc` source relative to the presentation folder. */
    path: z.string().min(5).max(260).regex(/^[^:*?"<>|]+\.gmc$/i, tr('chemin .gmc invalide', 'invalid .gmc path')),
    create: z.boolean(),
  }),
  z.object({ type: z.literal('editGmc'), src: z.string().max(260) }),
  z.object({ type: z.literal('refreshGmc'), src: z.string().max(260) }),
  /** Inline Graph Model Studio editor: load the source, write edits, re-render on close. */
  z.object({ type: z.literal('gmcOpen'), src: z.string().max(260) }),
  z.object({ type: z.literal('gmcWrite'), src: z.string().max(260), source: z.string().max(2_000_000) }),
  z.object({ type: z.literal('gmcClose'), src: z.string().max(260), changed: z.boolean() }),
]);
export type WebviewMessage = z.infer<typeof WebviewMessage>;

/** Messages extension host → webview (typed only; the host is trusted). */
export type HostMessage =
  | {
      type: 'document';
      version: number;
      fileName: string;
      sourceKind: 'markdown' | 'dsl';
      doc: unknown;
      master: unknown;
      assetUrls: Record<string, string>;
      diagnostics: unknown[];
      parseErrors: string[];
      /** Revision documents (merge request sides) cannot be edited. */
      readOnly?: boolean;
      /** Set when the document is one side of a GitLab merge request diff. */
      review?: { mr: string; side: 'old' | 'new' };
    }
  | { type: 'diffBase'; base: DiffBaseKind; label: string; doc: unknown | null; available: DiffBaseKind[]; error?: string }
  | { type: 'review'; requestId?: number; action?: string; data?: ReviewData; error?: string }
  | { type: 'revealReviewComment'; noteId: number }
  | { type: 'gmcFiles'; files: string[] }
  | { type: 'gmcEditor'; src: string; name: string; source?: string; editorJs?: string; editorCss?: string; version?: string; error?: string }
  | { type: 'select'; slideId: string; elementId?: string }
  | { type: 'clipboard'; text: string }
  /** PowerPoint objects converted by the host, pasted like copied elements. */
  | { type: 'pasteElements'; elements: unknown[]; warnings: string[] }
  /** No PowerPoint drawing readable: the webview pastes the HTML / image / text itself. */
  | { type: 'pasteFallback' }
  | { type: 'gmcEdit'; src: string }
  | { type: 'ack'; txId: string; version: number }
  | { type: 'rejected'; txId: string; reason: string; conflict: boolean }
  | { type: 'notice'; level: 'info' | 'warning' | 'error'; message: string }
  | { type: 'reference'; slideIndex: number; url: string | null; message?: string }
  | { type: 'masters'; master: unknown; assetUrls: Record<string, string>; thumbnails: Record<string, string>; focusLayout?: string };
