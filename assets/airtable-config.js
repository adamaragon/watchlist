/* Public site config. The Airtable token is intentionally NOT here — it lives
 * server-side as a Cloudflare Worker secret (watchlist-votes). This Worker URL
 * is public and safe to commit; the Worker holds the token, enforces CORS, and
 * proxies guest votes. Leave WORKER_URL empty to disable voting (no calls). */
export const AIRTABLE = {
  WORKER_URL: 'https://watchlist-votes.threesided.workers.dev',
};
