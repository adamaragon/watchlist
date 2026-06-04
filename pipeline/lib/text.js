import { createHash } from 'node:crypto';

export function slugify(s) {
  return s.toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function idFor(title) {
  const key = slugify(title.trim());
  return key || createHash('sha1').update(title).digest('hex').slice(0, 10);
}

const CUES = [
  ['show',    /\b(season|episode|apple tv\+?|netflix|hbo|max|hulu|disney\+?|prime video|paramount\+?|peacock)\b/i],
  ['movie',   /\b(in theaters|now playing|directed by|a24|coming soon|trailer|letterboxd)\b/i],
  ['game',    /\b(steam|playstation|xbox|nintendo|epic games|switch|ps5|ps4)\b/i],
  ['book',    /\b(hardcover|paperback|kindle|audiobook|goodreads|by [A-Z][a-z]+ [A-Z][a-z]+)\b/i],
  ['project', /\b(github|open source|repo|library|framework|kickstarter)\b/i],
  ['music',   /\b(spotify|apple music|album|single|bandcamp|soundcloud)\b/i],
  ['recipe',  /\b(ingredients?|preheat|tablespoons?|teaspoons?|prep time|cook time|servings?|yield|nyt cooking|allrecipes|smitten kitchen|serious eats|bon app[ée]tit)\b/i],
  ['venue',   /\b(yelp|opentable|resy|tock|tripadvisor|google maps|directions|hours of operation|reservation|menu|restaurant|cafe|café|bar|brewery|bakery|coffee shop)\b/i],
  ['purchase',/\b(add to (cart|bag|wishlist)|buy now|in stock|out of stock|free shipping|free delivery|msrp|amazon|etsy|ebay|shopify|wayfair|target|best buy|costco|home depot|lowe'?s|nordstrom|sephora|backcountry|rei|patagonia|uniqlo)\b/i],
];

export function guessType(text) {
  for (const [type, rx] of CUES) if (rx.test(text)) return type;
  return 'other';
}

export function cleanTitle(s) {
  return s.replace(/\s*[—\-\|·•]\s*(Apple TV\+?|Netflix|HBO( Max)?|Max|Hulu|Disney\+?|Prime Video|Paramount\+?|Peacock|Steam|Spotify|Apple Music)\s*$/i, '')
    .trim();
}
