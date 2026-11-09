let testingStorageAvailabilityOverride: boolean | null = null;

export function _setStorageAvailableForTesting(available: boolean | null): void {
  testingStorageAvailabilityOverride = available;
}

export function getTestingStorageOverride(): boolean | null {
  return testingStorageAvailabilityOverride;
}
