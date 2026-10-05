import React from 'react';

/**
 * The hexagon relief behind the application shell, from the NIB design kit.
 * The image and its dark-mode treatment live in the kit's `.hex-relief` class;
 * these components only place it, at the strengths the kit's --nib-relief-*
 * tokens set for each theme.
 *
 * The two layers stack differently, on purpose:
 *   RailRelief   sits at z -10, so the rail (a stacking context) paints its
 *                content over it.
 *   GroundRelief has no z-index. The content column must not be a stacking
 *                context — the user, announcement and reminder dialogs render
 *                inside it and have to cover the rail — so this layer goes
 *                first in the column and everything after it is positioned,
 *                which paints it over the texture.
 *
 * The masks are inline styles rather than arbitrary utilities so the -webkit-
 * form ships alongside the standard one for older Chromium builds.
 */

const fade = (gradient: string): React.CSSProperties => ({
  WebkitMaskImage: gradient,
  maskImage: gradient,
});

/**
 * The full honeycomb behind the navigation rail, faded out under the logo.
 *
 * Deliberately faint (0.3 light, 0.15 dark; the kit was 0.9 and 0.45 until
 * 5 October 2026): stronger, the cell shadows competed with the menu labels,
 * and the rail's job is to be read. Kept just strong enough to show the
 * texture is there.
 */
export const RailRelief: React.FC = () => (
  <div
    aria-hidden="true"
    className="hex-relief pointer-events-none absolute inset-0 -z-10 bg-cover bg-top opacity-(--nib-relief-rail)"
    style={fade('linear-gradient(to bottom, transparent, #000 7rem)')}
  />
);

/**
 * The content ground: two fragments of the honeycomb at opposite corners, each
 * dissolving towards the middle, so the texture frames the page rather than
 * running under the tables an officer is reading. The second is turned half a
 * circle, so it reads as the same wall seen from the other end; it is dropped
 * below 1024px, where there is no room for it to frame anything.
 */
export const GroundRelief: React.FC = () => (
  <div aria-hidden="true" className="no-print pointer-events-none absolute inset-0 overflow-hidden">
    <div
      className="hex-relief absolute -right-[6%] -top-[8%] h-[116%] w-[min(62vh,640px)] bg-contain bg-center opacity-(--nib-relief-ground)"
      style={fade('linear-gradient(to left, #000 30%, transparent)')}
    />
    <div
      className="hex-relief absolute -bottom-[30%] -left-[10%] hidden h-[90%] w-[min(48vh,480px)] rotate-180 bg-contain bg-center opacity-(--nib-relief-ground-2) lg:block"
      style={fade('linear-gradient(to left, #000 20%, transparent 90%)')}
    />
  </div>
);
