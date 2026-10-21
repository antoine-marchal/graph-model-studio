import React, { useEffect, useReducer, useState } from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import { ExternalLink, Presentation } from "lucide-react";
import { vscodeApi } from "../vscode-api";

/**
 * A Slides Studio deck shown by the thumbnail of its first slide:
 * `[![Title](./talk.deck.png)](./talk.deck)` in Markdown (a linked image,
 * so any renderer shows the picture and links to the deck). Slides Studio
 * writes `<deck>.png` next to the deck when it saves it. Double-click opens
 * the deck in the Slides Studio editor.
 */

const THUMB_EVENT = "btrmk:deck-thumbnail";
/** Bumped when the host reports a rewritten thumbnail: the image URL stays the same. */
let thumbVersion = 0;
window.addEventListener("message", (e) => {
  if (e.data?.type !== "deckThumbnailChanged") return;
  thumbVersion++;
  window.dispatchEvent(new Event(THUMB_EVENT));
});

export const isDeckHref = (href: string | null | undefined) => !!href && /\.deck$/i.test(href.split(/[?#]/)[0]);
/** Thumbnail written by Slides Studio for a deck: `talk.deck` → `talk.deck.png`. */
export const deckThumbnail = (href: string) => `${href.split(/[?#]/)[0]}.png`;

/** Deck block from a pick: the host replies with the deck path, its thumbnail URL and title. */
export function pickDeck(editor: any): void {
  const requestId = `deck-${Math.random().toString(36).slice(2)}`;
  const receive = (e: MessageEvent) => {
    if (e.data?.type !== "pickDeckResult" || e.data.requestId !== requestId) return;
    window.removeEventListener("message", receive);
    if (!e.data.href) return;
    editor.chain().focus().insertContent({ type: "deckBlock", attrs: { href: e.data.href, src: e.data.src, alt: e.data.title ?? "" } }).run();
  };
  window.addEventListener("message", receive);
  vscodeApi.postMessage({ type: "pickDeck", requestId });
}

function DeckBlockView({ node, selected }: any) {
  const { href, src, alt } = node.attrs as { href: string; src: string; alt: string };
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    const bump = () => (setMissing(false), rerender());
    window.addEventListener(THUMB_EVENT, bump);
    return () => window.removeEventListener(THUMB_EVENT, bump);
  }, []);
  useEffect(() => setMissing(false), [src]);
  const open = () => vscodeApi.postMessage({ type: "openDeck", href });
  const name = href.split("/").pop() ?? href;
  const shown = src && thumbVersion ? `${src}${src.includes("?") ? "&" : "?"}v=${thumbVersion}` : src;
  return (
    <NodeViewWrapper className={"deck-block" + (selected ? " selected" : "")} data-drag-handle="">
      <figure contentEditable={false} onDoubleClick={open} title="Double-click to open the deck in Slides Studio">
        {src && !missing ? (
          <img src={shown} alt={alt} draggable={false} onError={() => setMissing(true)} />
        ) : (
          <div className="deck-block-empty">
            <Presentation size={28} />
            <span>No thumbnail yet — double-click to open the deck; Slides Studio writes it on save.</span>
          </div>
        )}
        <figcaption>
          <Presentation size={13} />
          <span className="deck-block-title">{alt || name}</span>
          <span className="deck-block-file">{name}</span>
          <button type="button" className="directive-btn" title="Open in Slides Studio" aria-label="Open in Slides Studio" onClick={open}>
            <ExternalLink size={12} />
          </button>
        </figcaption>
      </figure>
    </NodeViewWrapper>
  );
}

export const DeckBlock = Node.create({
  name: "deckBlock",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      // Written as data-* by renderHTML below.
      href: { default: "", rendered: false },
      src: { default: "", rendered: false },
      alt: { default: "", rendered: false },
    };
  },

  parseHTML() {
    return [{
      tag: 'div[data-type="deckBlock"]',
      getAttrs: (el: HTMLElement) => ({
        href: el.getAttribute("data-href") ?? "",
        src: el.querySelector("img")?.getAttribute("src") ?? el.getAttribute("data-src") ?? "",
        alt: el.getAttribute("data-alt") ?? el.querySelector("img")?.getAttribute("alt") ?? "",
      }),
    }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return ["div", mergeAttributes({ "data-type": "deckBlock", "data-href": node.attrs.href, "data-src": node.attrs.src, "data-alt": node.attrs.alt }, HTMLAttributes)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(DeckBlockView);
  },
});
