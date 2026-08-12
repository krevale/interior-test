import { useEffect, useState } from 'react';

/**
 * Konva needs a loaded HTMLImageElement rather than a URL. Results are cached
 * per URL because a sprite set shares one bitmap across every object using it,
 * and remounting on every depth-sort reorder would otherwise thrash decoding.
 */
const cache = new Map<string, HTMLImageElement>();

export function useImage(url: string | undefined): HTMLImageElement | undefined {
  const [image, setImage] = useState<HTMLImageElement | undefined>(() =>
    url ? cache.get(url) : undefined,
  );

  useEffect(() => {
    if (!url) {
      setImage(undefined);
      return;
    }

    const cached = cache.get(url);
    if (cached) {
      setImage(cached);
      return;
    }

    let cancelled = false;
    const element = new Image();
    element.onload = () => {
      cache.set(url, element);
      if (!cancelled) setImage(element);
    };
    element.src = url;

    return () => {
      cancelled = true;
    };
  }, [url]);

  return image;
}
