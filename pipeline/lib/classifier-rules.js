import { guessType, cleanTitle } from './text.js';

// ---------------------------------------------------------------------------
// Title-level junk filters (applied AFTER extractTitle, before keeping a row)
// ---------------------------------------------------------------------------

// Well-known app, platform, browser, and social-media names that should never
// be treated as a media title on their own.
const APP_NAMES = new Set([
  'reddit', 'facebook', 'instagram', 'twitter', 'x', 'chrome', 'safari',
  'firefox', 'google', 'youtube', 'tiktok', 'snapchat', 'linkedin', 'pinterest',
  'spotify', 'apple music', 'apple tv', 'apple tv+', 'netflix', 'hbo', 'hbo max',
  'max', 'hulu', 'disney+', 'peacock', 'peacock tv', 'prime video', 'paramount+',
  'starz', 'showtime', 'crunchyroll', 'funimation', 'plex', 'tubi', 'pluto tv',
  'kindle', 'gmail', 'outlook', 'messages', 'imessage', 'whatsapp', 'signal',
  'telegram', 'slack', 'discord', 'zoom', 'teams', 'figma', 'notion', 'todoist',
  'letterboxd', 'imdb', 'tmdb', 'rotten tomatoes', 'decider', 'collider', 'inverse',
  'polygon', 'io9', 'gizmodo', 'ign', 'gamespot', 'kotaku', 'fansided', 'esquire',
  'berkeleyside', 'houston chronicle', 'tv',
]);

// UI labels that can appear as the "largest text" on a page — they should never
// be media titles.
const UI_LABELS = new Set([
  'unread items', 'comment', 'comments', 'see all', 'search', 'charging',
  'reply', 'like', 'share', 'follow', 'following', 'sponsored', 'see more',
  'view all', 'show more', 'load more', 'read more', 'sign in', 'sign up',
  'log in', 'log out', 'menu', 'settings', 'notifications', 'home', 'profile',
  'others worth watching', 'continue watching', 'watch now', 'play now',
  'new to', 'trending now', 'because you watched', 'top picks',
  'advertisement', 'skip ad', 'ad choices', 'open', 'close', 'back',
  'stream it or skip it', 'log in', 'sign up', 'download',
]);

// Regex tests for junk title patterns
const JUNK_TITLE_RX = [
  // iOS status-bar date: "Tue Mar 7", "Sat May 20", "Mon Jan 1" etc.
  /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+\w{3,9}\s+\d{1,2}$/i,
  // Subreddit names
  /^r\//,
  // URL fragments that snuck in as titles
  /^[a-z0-9.-]+\.(com|org|net|io|co|tv|fm|app|gov|edu)(\/\S*)?$/i,
  // Trailing preposition / obvious sentence fragment:
  //   "now on HBO Max"  "right now on"  "you can stream right now on"
  /\b(now\s+on|right\s+now\s+on|streaming\s+on|available\s+on|watch\s+on)\b/i,
  // Fragment ending mid-phrase: "...from Star", "...inspiration from"
  // Sentence ends with a preposition or conjunction
  /\b(from|on|in|at|to|of|and|or|but|for|with|into|by|as|about|up)\s*$/i,
  // Bullet/social chrome: "Sci-fi Movie Zone • Join", "Grindhaus Selektor • 6d"
  /[•·]\s*(join|follow|6d|7d|1d|2d|3d|4d|5d|\d+[hmd])\s*$/i,
  // Social membership counts: "• 17 people here"
  /\d+\s+people\s+here/i,
  // Angle-bracket navigation: "‹ Google", "< Back"
  /^[‹<›>]\s*\w/,
  // Platform marketing copy: "The home of Apple TV+", "HBO Max: Stream TV & Movies"
  /\bthe\s+home\s+of\b/i,
  /\bstream\s+tv\b.*\bmovies\b/i,
  // Obviously truncated or fragment
  /^(as\s+is|taking\s+inspiration|behind\s+the\s+scenes\s+on|they'?re\b|i\s+really\s+like\b|i'm\s+gonna\b|i've\s+been\b)/i,
  // Social timestamp chrome: "y/Anubex • 7h •", "Username • 4h"
  /^[a-zA-Z0-9_/]+\s*[•·]\s*\d+[hmd]\s*[•·]?\s*$/,
  // Video/ad chrome lines
  /^video\s+clip\b/i,
  /^no\s+negative\s+guidance/i,
  // Ad / social chrome
  /^adchoices\b/i,
  /^join\s+the\s+conversation/i,
  /^sending\s+this\s+post/i,
  /^comments?\s+\d/i,
  // Sentence fragments starting with lowercase
  /^(i\s+never\s+realized|it'?s\s+been\s+about|i\s+saw\s+this\s+as\s+a\s+kid)/i,
  // Obvious sentence-body fragments (long, starts with lowercase or mid-sentence word)
  /^(encounter\s+baddies|tissue,\s+and|ne\s+wipiast|you\s+might\s+need\s+this\s+code)/i,
  // Truncated browser tab names (end with " - W" or similar single char after dash)
  /\s+-\s+[A-Z]\s*$/,
  /\s+[A-Z]\s*X\s*$/,  // truncated tab title ending "... W X"
  // Timestamps as titles: "JUNE7, 2022 AT 12:10 PM", "Jun 7, 2022"
  /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s*\d/i,
  // Platform taglines / app store descriptions
  /\bstream\s+(tv|movies|shows)\b/i,
  // Social engagement metrics: "1.9k upvotes • 114 comments"
  /\d+\.?\d*k?\s+upvotes?/i,
  /\d+\s+comments?\s*$/i,
  // OCR noise: very-short-token + very-short-token (no real words)
  // "I BO", "AA O", "AA M" — but NOT "IT" or "US"
  /^[A-Z]{1,2}\s+[A-Z]{1,3}(\s+[A-Z]{1,2})?$/,
  // Isolated conjunctions or prepositions that sneak through
  /^&\s+\w/,  // "& Movies"
  // Sentence fragment starting with preposition/conjunction
  /^(but|and|or|nor|so|yet|for)\s+\w/i,
  // Ordinal fragments: "25th!", "2nd!", "1st!" etc
  /^\d+(st|nd|rd|th)[!.,]?\s*$/i,
  // Security code / recovery instructions
  /\bkeep\s+it\s+safe\b/i,
  /\brecover\s+your\s+account\b/i,
  // Bylines / author credits
  /^(polygon|petrana|radulovic)\s*[/|]/i,
  /^[A-Z][a-z]+ [A-Z][a-z]+ [•·] \d+[hmd]/,  // "Lance Lewis • 4h"
];

/**
 * Returns true when a candidate title string is clearly UI chrome, a social-
 * media username/subreddit, a sentence fragment, or a known app name — and
 * therefore should never become a watchlist entry.
 *
 * Exported so it can be unit-tested directly.
 */
export function isJunkTitle(title) {
  const t = title.trim();
  if (!t) return true;

  // Subreddit names (fast path before lower-casing destroys the slash)
  if (/^r\//.test(t)) return true;

  const lower = t.toLowerCase();

  // Exact-match against known app / platform / UI-label names
  if (APP_NAMES.has(lower)) return true;
  if (UI_LABELS.has(lower)) return true;

  // Regex patterns
  for (const rx of JUNK_TITLE_RX) if (rx.test(t)) return true;

  // All-caps "words" that are known UI tokens, not real titles.
  // Strategy: if EVERY word is ALL-CAPS and it matches a known-bad set, reject.
  // We deliberately allow recognised all-caps classic films (they'll have
  // positive OCR cues and won't match these tokens).
  const allCapsWords = t.match(/\b[A-Z]{2,}\b/g) || [];
  const totalWords = (t.match(/\b\w+\b/g) || []).length;
  if (allCapsWords.length === totalWords && totalWords <= 3) {
    const CAPS_UI = new Set([
      'STEAM', 'GUARD', 'FORM', 'FACEBOOK', 'NINTENDO', 'SWITCH', 'DECIDER',
      'COLLIDER', 'INVERSE', 'CRYPT', 'BCRR', 'BUFEB', 'GRUNGE', 'PURA', 'MAX',
      'AD', 'OU', 'WEB', 'HBO', 'STARZ', 'NEWS', 'OPEN', 'BACK', 'SEARCH',
      'COMMENT', 'SHARE', 'LIKE', 'FOLLOW', 'PLAY', 'STOP', 'MORE', 'ALL',
      'AA', 'BCR', 'CONNOR', 'BUFEB', 'BCRR',
    ]);
    if (allCapsWords.some(w => CAPS_UI.has(w))) return true;
  }

  return false;
}

const POSITIVE = [
  /\b(apple tv\+?|netflix|hbo|max|hulu|disney\+?|prime video|paramount\+?|peacock|letterboxd|imdb|tmdb|rotten tomatoes)\b/i,
  /\bseason\s+\d+|episode\s+\d+\b/i,
  /\b(in theaters|now playing|directed by|starring|cast:?|trailer|watch on|streaming on)\b/i,
  /\b(steam|playstation|xbox|nintendo|epic games|switch|ps5|game pass|itch\.io)\b/i,
  /\b(hardcover|paperback|kindle|audiobook|goodreads|storygraph)\b/i,
  /\b(github\.com|open source|kickstarter)\b/i,
  /\b(spotify|apple music|bandcamp|soundcloud)\b/i,
  /\b(ingredients?|preheat|tablespoons?|teaspoons?|prep time|cook time|servings?|nyt cooking|allrecipes|smitten kitchen|serious eats|bon app[ée]tit)\b/i,
  /\b(yelp|opentable|resy|tock|tripadvisor|reservation|restaurant|cafe|café|brewery|bakery)\b/i,
  /\b(add to (cart|bag|wishlist)|buy now|in stock|free shipping|msrp|amazon\.com|etsy\.com|ebay|wayfair|backcountry|patagonia|uniqlo|nordstrom|sephora)\b/i,
  // Explicit media tagging on social posts
  /\b(movie|film|show|series|book|recipe|venue|game)\s*:/i,
  /\b(title|genre|director|author|chef)\s*:/i,
  // A "Name (YYYY)" pattern strongly suggests a movie/show/game/book
  /\b[A-Z][\w' .:-]{2,}\s*\((19|20)\d{2}\)/,
];
const NEGATIVE = [
  /\b(subtotal|tax|total\s*\$|receipt|visa\s*\*+|mastercard\s*\*+|amex\s*\*+)\b/i,
  /\b(imessage|messages|delivered|read \d+:\d+|sms|whatsapp|signal|telegram)\b/i,
  /\b(verification code|two-factor|otp|one-time|6-digit)\b/i,
  /\bunsubscribe\b/i,
  /\b(reply all|reply|forward|inbox|drafts|spam|trash)\b/i,
  // Firearms-shop screenshots
  /\b(pistol|rifle|shotgun|firearm|sbr|bullpup|rd\b)\b/i,
  // Steam Guard / security code screenshots
  /\bsteam\s+guard\b/i,
  /\bwrite\s+it\s+down\s+and\s+keep\s+it\s+safe\b/i,
  /\baccount\s+recovery\s+(code|key)\b/i,
  // Browser tab bars (many truncated tab titles)
  /[A-Za-z ]+\s+X\s+[A-Za-z ]+\s+X\b/,
  // Reddit posts / social feed (not media curation)
  /\b(upvotes?|downvotes?)\s*[•·]\s*\d+\s+comments?\b/i,
  /\d+\.?\d*k\s+upvotes?\s*[•·]/i,
];

// Lines we never want to treat as a title. iOS chrome, social-post chrome,
// pure numeric noise.
const CHROME_LINE = [
  /^\d{1,2}:\d{2}\s*(am|pm)?\s*[a-z]?$/i,  // time
  /^[•·]+ll\s*$/i,                          // signal bars
  /^\d{1,3}\s*%?\s*$/,                      // battery
  /^[0-9,]+\s*$/,                            // like-count, comment count
  /^[\W]{1,4}$/,                             // pure punctuation
  /^(follow|following|share|like|comment|sponsored|see more)\s*$/i,
  /^[a-z0-9_.]+ \s*[•·]?\s*follow\s*$/i,    // "username · Follow"
  /^[a-z0-9_.]+\s*$/,                       // bare lowercase IG handle (case-sensitive — keep "Severance")
  /^(\d+[hms]|\d+d|\d+w|\d+y)\b/i,          // age stamps like "21h", "1d"
];

function isChrome(s) {
  return CHROME_LINE.some(rx => rx.test(s));
}

function cleanLines(text) {
  return text.split(/\r?\n/)
    .map(s => s.trim())
    .filter(s => s.length >= 2 && !isChrome(s));
}

function wordCount(text) {
  return (text.match(/[A-Za-z][A-Za-z']{1,}/g) || []).length;
}

function looksLikeConversation(text) {
  const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  if (lines.length < 3) return false;
  const shortLines = lines.filter(l => l.length > 0 && l.length < 40).length;
  const hasTimeStamps = /\b\d{1,2}:\d{2}\s*(AM|PM)?\b/i.test(text);
  const hasReplyHints = /\b(haha|lol|lmao|omg|yeah|nah|brb|wyd|hbu|ttyl)\b/i.test(text);
  return (shortLines / lines.length > 0.7) && (hasTimeStamps || hasReplyHints);
}

// Strip leading punctuation/quotes; keep meaningful Title-Case run.
function trimTitle(s) {
  return s
    .replace(/^[\s"'`«»“”‘’.,;:!?\-–—•·]+/, '')
    .replace(/[\s"'`«»“”‘’.,;:\-–—]+$/, '')
    .trim();
}

// Extract title with priority:
//   1. Explicit "Title:/Movie:/Show:/Book:/Recipe:/Venue:/Game: X" anywhere
//   2. "X (YYYY)" pattern — take X
//   3. Longest meaningful non-chrome line that contains 2+ alphabetic words
//   4. First non-chrome line (fallback)
export function extractTitle(text) {
  const labelRx = /\b(?:title|movie|show|series|film|book|recipe|venue|game|restaurant)\s*[:\-]\s*([^\n]{2,80})/i;
  const labelMatch = text.match(labelRx);
  if (labelMatch) return trimTitle(labelMatch[1].split(/[,;]/)[0]);

  const yearRx = /([A-Z][\w' .:&-]{2,60})\s*\((19|20)\d{2}[,)]/ ;
  const yearMatch = text.match(yearRx);
  if (yearMatch) return trimTitle(yearMatch[1]);

  const lines = cleanLines(text);
  if (!lines.length) return '';

  // Prefer lines that look like a title: short-ish, Title Case, no
  // terminal punctuation, and appear early (titles are usually at top).
  // We first try only non-junk lines. If none qualify, fall back to any line
  // so we don't accidentally promote a junk title to the top slot.
  const scoreLine = (l, idx) => {
    const words = (l.match(/[A-Za-z][A-Za-z']{1,}/g) || []).length;
    return (
      (idx === 0 ? 3 : idx === 1 ? 2 : idx === 2 ? 1 : 0) +  // earlier wins
      (words >= 1 ? 1 : 0) +
      (/^[A-Z]/.test(l) ? 1 : 0) +
      (!/[.!?]$/.test(l) ? 1 : 0) +
      (l.length >= 3 && l.length <= 50 ? 1 : 0) +
      (l.length <= 70 ? 1 : 0)
    );
  };

  // First pass: consider only non-junk lines
  const nonJunk = lines.filter(l => !isJunkTitle(l));
  const pool = nonJunk.length ? nonJunk : lines;

  const scored = pool.map((l, idx) => ({ l, score: scoreLine(l, idx) }));
  scored.sort((a, b) => b.score - a.score);
  return trimTitle(scored[0].l);
}

export function scoreOcrText(text) {
  let score = 0;
  for (const rx of POSITIVE) if (rx.test(text)) score += 1;
  for (const rx of NEGATIVE) if (rx.test(text)) score -= 2;

  const wc = wordCount(text);
  // Photo-only screenshots: almost no readable text.
  if (wc < 4) score -= 3;
  // Conversation screenshots: many short lines + time stamps or chat slang.
  if (looksLikeConversation(text)) score -= 3;

  const type = guessType(text);
  const titleGuess = cleanTitle(extractTitle(text));
  // Reject if the best title we could extract is still a junk/chrome token.
  const keep = score >= 1 && titleGuess.length >= 2 && wordCount(titleGuess) >= 1
    && !isJunkTitle(titleGuess);
  return { keep, score, type, title: titleGuess };
}
