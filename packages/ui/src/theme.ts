import { createTheme, type TabsProps } from '@mantine/core';

export const segmentedTabsStyles: TabsProps['styles'] = {
  list: {
    display: 'inline-flex',
    gap: 0,
    padding: 3,
    width: 'fit-content',
    border: '1px solid var(--mantine-color-default-border)',
    borderRadius: 'var(--mantine-radius-md)',
    background: 'var(--mantine-color-default-hover)',
  },
  tab: {
    borderRadius: 'calc(var(--mantine-radius-md) - 3px)',
    fontWeight: 600,
  },
};

export const theme = createTheme({
  autoContrast: true,
  luminanceThreshold: 0.4,
  primaryColor: 'indigo',
  primaryShade: 7,
  defaultRadius: 'md',
  fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
  colors: {
    green: [
      '#ebfbee',
      '#d3f9d8',
      '#b2f2bb',
      '#8ce99a',
      '#69db7c',
      '#51cf66',
      '#40c057',
      '#37b24d',
      '#2f9e44',
      '#1f6b2a',
    ],
    orange: [
      '#fff4e6',
      '#ffe8cc',
      '#ffd8a8',
      '#ffc078',
      '#ffa94d',
      '#ff922b',
      '#fd7e14',
      '#f76707',
      '#e8590c',
      '#8a3200',
    ],
  },
  headings: {
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
  },
  components: {
    Modal: {
      styles: {
        title: { fontWeight: 700 },
      },
    },
  },
});
