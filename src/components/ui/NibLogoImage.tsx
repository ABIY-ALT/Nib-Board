import { getImageProps } from 'next/image';
import { preload } from 'react-dom';

/**
 * The NIB mark, as a plain <img> built from getImageProps().
 *
 * Not <Image>: it always writes style="color:transparent" onto the element,
 * and the production CSP refuses inline style attributes in server-rendered
 * HTML (security assessment VA-005) — the sign-in and set-password screens are
 * server-rendered. The optimized src/srcSet are the same. Every placement is
 * above the fold, so it is preloaded, as <Image priority> did.
 */
export function NibLogoImage({
  size,
  alt = '',
  className,
}: {
  size: number;
  alt?: string;
  className?: string;
}) {
  const { style: _inlineStyle, ...img } = getImageProps({
    src: '/nib-logo.png',
    alt,
    width: size,
    height: size,
    preload: true,
  }).props;

  preload(img.src, { as: 'image', imageSrcSet: img.srcSet, fetchPriority: 'high' });

  return <img {...img} className={className} />;
}
