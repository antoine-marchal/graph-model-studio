import { useMemo } from 'react';
import type { AssetResolver } from '@corporate-slides/renderer';
import { useEditor } from './store';

/** Webview URLs of master assets and images, resolved through the host-provided map. */
export function useAssets(): AssetResolver {
  const assetUrls = useEditor((s) => s.assetUrls);
  return useMemo(
    () => ({
      masterAsset: (id: string) => assetUrls[`master:${id}`] ?? null,
      image: (src: string) => assetUrls[`image:${src}`] ?? null,
    }),
    [assetUrls],
  );
}
