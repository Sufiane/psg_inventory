// e2e-only test data. `scripts/seed-e2e.ts` duplicates these values (not
// imported — see docs/plans/2026-09-24-e2e-critical-path-tests-implementation-plan.md
// "Placement decision") rather than reaching across into this directory from
// the backend's tsconfig-included scripts/ tree. Keep both in sync by hand.
export const E2E_USER_EMAIL = 'e2e@psg-inventory.test';
export const E2E_USER_PASSWORD = 'e2e-password-change-me';
export const E2E_OPPONENT_NAME = 'E2E Test FC';
export const E2E_SEASON_PASS_LABEL = 'E2E Tribune';
