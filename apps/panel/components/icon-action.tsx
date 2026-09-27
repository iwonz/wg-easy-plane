'use client';

import { ActionIcon, Tooltip, type ActionIconProps } from '@mantine/core';
import type { MouseEventHandler, ReactNode } from 'react';

type IconActionProps = Pick<
  ActionIconProps,
  'color' | 'disabled' | 'loading' | 'size' | 'variant'
> & {
  children: ReactNode;
  label: string;
  onClick?: MouseEventHandler<HTMLButtonElement>;
};

export function IconAction({
  children,
  label,
  size = 'lg',
  variant = 'subtle',
  ...props
}: IconActionProps) {
  return (
    <Tooltip label={label} withArrow>
      <ActionIcon
        aria-label={label}
        size={size}
        type="button"
        variant={variant}
        {...props}
      >
        {children}
      </ActionIcon>
    </Tooltip>
  );
}

type IconLinkActionProps = {
  children: ReactNode;
  download?: boolean;
  href: string;
  label: string;
};

export function IconLinkAction({
  children,
  download,
  href,
  label,
}: IconLinkActionProps) {
  return (
    <Tooltip label={label} withArrow>
      <ActionIcon
        aria-label={label}
        component="a"
        download={download}
        href={href}
        size="lg"
        variant="subtle"
      >
        {children}
      </ActionIcon>
    </Tooltip>
  );
}
