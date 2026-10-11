// What's switched on in this release. The first release is for worship leads:
// the planner, the Sunday page (songs and running order), the master schedule
// and swaps. Turning a flag back on restores the screen, its route and its nav
// link — nothing has been deleted.
export const FEATURES = {
  /** members answering availability in the app (we use the MS Form instead) */
  availability: false,
  /** "My stats" / serving history */
  myStats: false,
  /** frequency and instrument preferences on the Preferences page — the
   *  planner uses the Team list instead, so these would only confuse */
  servingPreferences: false,
  swaps: true,
} as const;
