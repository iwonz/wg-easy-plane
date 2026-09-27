import type { ReactNode } from 'react';

type IconProps = { size?: number };

function IconBase({
  children,
  size = 18,
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
    >
      <g
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      >
        {children}
      </g>
    </svg>
  );
}

export function IconActivity(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M3 12h4l2.2-5 4.1 10 2.2-5H21" />
    </IconBase>
  );
}

export function IconDownload(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" />
    </IconBase>
  );
}

export function IconInspect(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="11" cy="11" r="6" />
      <path d="m16 16 4 4M8.5 11h5M11 8.5v5" />
    </IconBase>
  );
}

export function IconKey(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="8" cy="15" r="4" />
      <path d="m11 12 8-8m-2 2 2 2m-5 1 2 2" />
    </IconBase>
  );
}

export function IconLink(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m9.5 14.5 5-5M7.5 17.5l-1 1a3.5 3.5 0 0 1-5-5l4-4a3.5 3.5 0 0 1 5 0M16.5 6.5l1-1a3.5 3.5 0 0 1 5 5l-4 4a3.5 3.5 0 0 1-5 0" />
    </IconBase>
  );
}

export function IconLogout(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M10 5H5v14h5M13 8l4 4-4 4m4-4H9" />
    </IconBase>
  );
}

export function IconPencil(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z" />
      <path d="m14 8 3 3" />
    </IconBase>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 5v14M5 12h14" />
    </IconBase>
  );
}

export function IconPower(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 3v9" />
      <path d="M7.1 5.8a8 8 0 1 0 9.8 0" />
    </IconBase>
  );
}

export function IconQrCode(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v6h-4v-2M12 12h2" />
    </IconBase>
  );
}

export function IconRefresh(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M20 7v5h-5M4 17v-5h5" />
      <path d="M6.1 9a7 7 0 0 1 11.5-2L20 9M4 15l2.4 2a7 7 0 0 0 11.5-2" />
    </IconBase>
  );
}

export function IconSliders(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="8" cy="17" r="2" />
    </IconBase>
  );
}

export function IconTrash(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" />
    </IconBase>
  );
}

export function IconUnlink(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m9.5 14.5 5-5M7.5 17.5l-1 1a3.5 3.5 0 0 1-5-5l2-2M16.5 6.5l1-1a3.5 3.5 0 0 1 5 5l-2 2M4 4l16 16" />
    </IconBase>
  );
}
