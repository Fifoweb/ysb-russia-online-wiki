/** Optical backdrop only; foreground text is never filtered. */
export default function GlassFilters() {
  return <svg className="glass-filter-definitions" width="0" height="0" aria-hidden="true" focusable="false">
    <defs>
      <filter id="portal-refraction" x="-10%" y="-10%" width="120%" height="120%" colorInterpolationFilters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.012 0.018" numOctaves="2" seed="9" result="glassNoise" />
        <feDisplacementMap in="SourceGraphic" in2="glassNoise" scale="7" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </defs>
  </svg>;
}
