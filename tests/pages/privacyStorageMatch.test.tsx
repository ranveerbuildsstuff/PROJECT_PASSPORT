import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { PrivacyPage } from '../../src/pages/PrivacyPage';
import { db } from '../../src/storage/db';

describe('Privacy Page Storage Specification Match', () => {
  it('strictly matches the real IndexedDB database name, store names, and localStorage keys', () => {
    const { container } = render(<PrivacyPage />);

    // 1. Database name check
    const textContent = container.textContent || '';
    expect(textContent).toContain(`Database: ${db.name}`);

    // 2. Real Dexie store names
    const realStoreNames = db.tables.map((t) => t.name).sort();
    expect(realStoreNames).toEqual([
      'checkpoints',
      'conversations',
      'files',
      'passports',
      'projects',
    ]);

    // Extract all code elements inside the storage list
    const storageList = container.querySelector('#stored-where-heading')?.parentElement;
    expect(storageList).not.toBeNull();

    const codeElements = Array.from(storageList!.querySelectorAll('code')).map(
      (el) => el.textContent?.trim() || ''
    );

    // Verify all real store names are listed in the Privacy Page
    for (const storeName of realStoreNames) {
      expect(codeElements).toContain(storeName);
    }

    // Filter store-like code elements (excluding the localStorage key 'theme')
    const listedStores = codeElements
      .filter((c) => c !== 'theme')
      .sort();
    expect(listedStores).toEqual(realStoreNames);

    // 3. LocalStorage keys: verify exactly and only 'theme' is documented
    expect(codeElements).toContain('theme');
    const localStorageSection = storageList!.textContent || '';
    expect(localStorageSection).toContain('localStorage');
    expect(localStorageSection).toContain('theme');

    // Verify no unexpected extra localStorage keys are documented
    const localStorageKeysInDoc = codeElements.filter(
      (c) => !realStoreNames.includes(c)
    );
    expect(localStorageKeysInDoc).toEqual(['theme']);
  });
});
