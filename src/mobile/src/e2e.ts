// True only in end-to-end builds (MIRAI_E2E=1, inlined at bundle time by
// babel). Used to sidestep simulator-only limitations; never set for store
// builds.
export const IS_E2E_BUILD = process.env.MIRAI_E2E === '1'
