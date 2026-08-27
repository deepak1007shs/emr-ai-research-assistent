/**
 * The stroke icons the design calls for.
 *
 * Lucide geometry on a 24 viewBox, stroke 1.75 except where the design says 2,
 * currentColor, round caps and joins. Inline rather than a dependency: five
 * icons is not a library, and a library is a download.
 */

type IconProps = { size?: number; className?: string };

function Icon({
  size = 15,
  className,
  strokeWidth = 1.75,
  children,
}: IconProps & { strokeWidth?: number; children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
      style={{ display: "block", flex: "0 0 auto" }}
    >
      {children}
    </svg>
  );
}

export const MoonIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
  </Icon>
);

export const SunIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Icon>
);

export const DownloadIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="M7 10l5 5 5-5" />
    <path d="M12 15V3" />
  </Icon>
);

export const ChevronRightIcon = (p: IconProps) => (
  <Icon {...p} strokeWidth={2}>
    <path d="m9 6 6 6-6 6" />
  </Icon>
);

export const AlertTriangleIcon = (p: IconProps) => (
  <Icon {...p} strokeWidth={2}>
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
  </Icon>
);

export const PlusIcon = (p: IconProps) => (
  <Icon {...p} strokeWidth={2}>
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </Icon>
);
