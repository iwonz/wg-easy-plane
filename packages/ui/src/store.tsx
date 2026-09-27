'use client';

import { createContext, useContext } from 'react';
import { makeAutoObservable } from 'mobx';

import type { AppLocale, UiStore } from './types';

class RootUiStore implements UiStore {
  locale: AppLocale;

  constructor(locale: AppLocale) {
    this.locale = locale;
    makeAutoObservable(this, {}, { autoBind: true });
  }

  setLocale(locale: AppLocale) {
    this.locale = locale;
  }
}

export function createUiStore(locale: AppLocale): UiStore {
  return new RootUiStore(locale);
}

export const UiStoreContext = createContext<UiStore | null>(null);

export function useUiStore(): UiStore {
  const store = useContext(UiStoreContext);
  if (!store) {
    throw new Error('UiStoreContext is missing');
  }
  return store;
}
