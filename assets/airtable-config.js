/* Airtable config for guest voting (client-side, no proxy).
 *
 * Fill these to switch voting ON. The PAT is embedded in the page (public) —
 * scope it to ONLY this base with data.records:read + data.records:write so a
 * leaked token can at most touch this one base.
 *
 * Create:
 *   1) A base (or reuse your backup base) with a table named "Votes" and fields:
 *        item_id (single line text)   Title (single line text)   Vote (single line text)
 *   2) A Personal Access Token scoped to that base (records read+write).
 *
 * Leave PAT or BASE empty to keep voting disabled (no network calls).
 */
export const AIRTABLE = {
  PAT: '',                       // NOT committed — GitHub secret-scanning blocks a token in-repo
  BASE: 'appiRs5WrwZtOds9u',     // "Media Library" base id (not sensitive)
  VOTES_TABLE: 'Votes',
};
