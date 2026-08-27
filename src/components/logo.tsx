/**
 * The mark, for use inside the page.
 *
 * The same drawing as `app/icon.svg`, which is the browser tab's copy. Two
 * files rather than one because Next.js reads the icon from a file at a fixed
 * path and a React component cannot be that file. When one changes, change the
 * other: they are the same mark and must not drift.
 */
export function Logo({ className = "size-6" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      role="img"
      aria-label="EMR AI Research Assistant"
    >
      <rect width="64" height="64" rx="14" fill="#3059c9" />
      <rect
        x="8.2"
        y="8.2"
        width="47.6"
        height="47.6"
        rx="10.5"
        fill="none"
        stroke="#ffffff"
        strokeWidth="3.8"
      />
      <g fill="#ffffff">
        <rect x="17.3" y="25.7" width="3.4" height="12.6" rx="1.5" />
        <rect x="43.3" y="25.7" width="3.4" height="12.6" rx="1.5" />
        <rect x="19.1" y="30.3" width="25.8" height="3.4" rx="1.5" />
        <rect x="27.4" y="27.4" width="9.2" height="9.2" rx="1.9" />
      </g>
    </svg>
  );
}
