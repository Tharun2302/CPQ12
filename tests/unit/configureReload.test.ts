// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { CONFIGURE_SESSION_KEYS, clearConfigureSessionOnReload, isPageReload } from '../../src/utils/configureReload';

const fakeWindow = (pathname: string, type: string | null) => ({
  location: { pathname } as Location,
  sessionStorage: window.sessionStorage,
  localStorage: window.localStorage,
  performance: {
    getEntriesByType: (kind: string) => (kind === 'navigation' && type ? [{ type } as PerformanceNavigationTiming] : []),
  } as Pick<Performance, 'getEntriesByType'>,
});

const NAV = {
  timestamp: 1,
  migrationType: 'Multi combination',
  combination: 'multi-combination',
  sessionState: {
    configuration: { migrationType: 'Multi combination' },
    selectedExhibits: ['box-to-dropbox'],
    calculations: [{ totalCost: 1 }],
    selectedTier: { totalCost: 1 },
    showPricing: true,
    configureContactInfo: { clientName: 'John Smith' },
    currentClientInfo: { clientName: 'John Smith' },
  },
};

function seed() {
  CONFIGURE_SESSION_KEYS.forEach((key) => sessionStorage.setItem(key, key === 'cpq_selected_exhibits' ? '["box-to-dropbox"]' : '{"x":1}'));
  sessionStorage.setItem('cpq_navigation_state', JSON.stringify(NAV));
  sessionStorage.setItem('cpq_configure_contact_info', '{"clientName":"John Smith"}');
  sessionStorage.setItem('cpq_discount_session_started', '1');
  localStorage.setItem('cpq_discount', '10');
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

describe('clearConfigureSessionOnReload', () => {
  it('a browser refresh on Configure clears the previous selection', () => {
    seed();
    expect(clearConfigureSessionOnReload(fakeWindow('/configure', 'reload'))).toBe(true);

    CONFIGURE_SESSION_KEYS.forEach((key) => expect(sessionStorage.getItem(key)).toBeNull());
    expect(localStorage.getItem('cpq_discount')).toBeNull();
    const nav = JSON.parse(sessionStorage.getItem('cpq_navigation_state')!);
    expect(nav.migrationType).toBeUndefined();
    expect(nav.combination).toBeUndefined();
    expect(nav.sessionState.selectedExhibits).toBeUndefined();
    expect(nav.sessionState.configuration).toBeUndefined();
    expect(nav.sessionState.selectedTier).toBeUndefined();
  });

  it('keeps the contact details and the session marker', () => {
    seed();
    clearConfigureSessionOnReload(fakeWindow('/configure', 'reload'));
    expect(sessionStorage.getItem('cpq_configure_contact_info')).toContain('John Smith');
    expect(JSON.parse(sessionStorage.getItem('cpq_navigation_state')!).sessionState.configureContactInfo.clientName).toBe('John Smith');
    expect(sessionStorage.getItem('cpq_discount_session_started')).toBe('1');
  });

  it('keeps everything when Configure is reached by navigation, not a refresh', () => {
    seed();
    expect(clearConfigureSessionOnReload(fakeWindow('/configure', 'navigate'))).toBe(false);
    expect(sessionStorage.getItem('cpq_selected_exhibits')).toBe('["box-to-dropbox"]');
    expect(localStorage.getItem('cpq_discount')).toBe('10');
  });

  it('keeps everything when another page, such as Quote, is refreshed', () => {
    seed();
    expect(clearConfigureSessionOnReload(fakeWindow('/quote', 'reload'))).toBe(false);
    expect(sessionStorage.getItem('cpq_configuration_session')).toBe('{"x":1}');
    expect(JSON.parse(sessionStorage.getItem('cpq_navigation_state')!).sessionState.selectedExhibits).toEqual(['box-to-dropbox']);
  });

  it('drops an unreadable navigation snapshot instead of restoring it', () => {
    seed();
    sessionStorage.setItem('cpq_navigation_state', '{not json');
    clearConfigureSessionOnReload(fakeWindow('/configure/', 'reload'));
    expect(sessionStorage.getItem('cpq_navigation_state')).toBeNull();
  });
});

describe('isPageReload', () => {
  it('reads the navigation type, and is false when it is unavailable', () => {
    expect(isPageReload(fakeWindow('/configure', 'reload'))).toBe(true);
    expect(isPageReload(fakeWindow('/configure', 'back_forward'))).toBe(false);
    expect(isPageReload(fakeWindow('/configure', null))).toBe(false);
    expect(isPageReload({ ...fakeWindow('/configure', 'reload'), performance: undefined })).toBe(false);
  });
});
