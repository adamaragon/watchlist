import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreOcrText, extractTitle, isJunkTitle } from './classifier-rules.js';

test('keeps clear media cues', () => {
  const r = scoreOcrText('Severance\nApple TV+\nSeason 2 premieres Jan 17');
  assert.equal(r.keep, true);
  assert.ok(r.score >= 2);
  assert.equal(r.type, 'show');
});

test('skips obvious noise (text message)', () => {
  const r = scoreOcrText('haha lol see u at 8\nReply\nMessages');
  assert.equal(r.keep, false);
});

test('skips receipts', () => {
  const r = scoreOcrText('Subtotal $12.40\nTax $1.08\nTotal $13.48\nVisa ****4242');
  assert.equal(r.keep, false);
});

test('keeps game listings', () => {
  const r = scoreOcrText('Hades II\nAvailable on Steam — Early Access');
  assert.equal(r.keep, true);
  assert.equal(r.type, 'game');
});

// ---- New: reject UI-chrome titles ----

test('rejects weekday+date titles like "Tue Mar 7"', () => {
  assert.equal(isJunkTitle('Tue Mar 7'), true);
  assert.equal(isJunkTitle('Sat May 20'), true);
  assert.equal(isJunkTitle('Mon Jan 1'), true);
  assert.equal(isJunkTitle('Tue Sep 12'), true);
});

test('rejects subreddit names', () => {
  assert.equal(isJunkTitle('r/Piracy'), true);
  assert.equal(isJunkTitle('r/claude'), true);
  assert.equal(isJunkTitle('r/anime'), true);
});

test('rejects all-caps UI tokens (app names, UI elements)', () => {
  assert.equal(isJunkTitle('STEAM GUARD'), true);
  assert.equal(isJunkTitle('FORM ON FACEBOOK'), true);
  assert.equal(isJunkTitle('NINTENDO'), true);
  assert.equal(isJunkTitle('SWITCH'), true);
  assert.equal(isJunkTitle('DECIDER'), true);
  assert.equal(isJunkTitle('COLLIDER'), true);
  assert.equal(isJunkTitle('INVERSE'), true);
});

test('keeps legitimate all-caps movie titles', () => {
  // These are real Howard Hawks / classic films with positive OCR cues
  assert.equal(isJunkTitle('BRINGING UP BABY'), false);
  assert.equal(isJunkTitle('HIS GIRL FRIDAY'), false);
  assert.equal(isJunkTitle('RIO BRAVO'), false);
  assert.equal(isJunkTitle('THE BIG SLEEP'), false);
  assert.equal(isJunkTitle('SYNCHRONIC'), false);
});

test('rejects known app/browser/platform names as standalone titles', () => {
  assert.equal(isJunkTitle('Chrome'), true);
  assert.equal(isJunkTitle('Facebook'), true);
  assert.equal(isJunkTitle('Reddit'), true);
  assert.equal(isJunkTitle('Spotify'), true);
  assert.equal(isJunkTitle('Apple TV'), true);
  assert.equal(isJunkTitle('HBO'), true);
  assert.equal(isJunkTitle('Peacock TV'), true);
  assert.equal(isJunkTitle('Netflix'), true);
  assert.equal(isJunkTitle('Kindle'), true);
});

test('rejects UI label fragments as titles', () => {
  assert.equal(isJunkTitle('Unread Items'), true);
  assert.equal(isJunkTitle('Comment'), true);
  assert.equal(isJunkTitle('See all'), true);
  assert.equal(isJunkTitle('Others worth watching'), true);
  assert.equal(isJunkTitle('Search'), true);
  assert.equal(isJunkTitle('Charging'), true);
});

test('rejects sentence fragments ending mid-sentence', () => {
  assert.equal(isJunkTitle('now on HBO Max'), true);
  assert.equal(isJunkTitle('sci-fi TV shows you can stream right now on'), true);
  assert.equal(isJunkTitle('Taking inspiration from everything from Star'), true);
});

test('rejects URL-like titles', () => {
  assert.equal(isJunkTitle('google.com'), true);
  assert.equal(isJunkTitle('activecampaign.com'), true);
  assert.equal(isJunkTitle('io9.gizmodo.com'), true);
});

test('does not reject real short media titles', () => {
  assert.equal(isJunkTitle('Devs'), false);
  assert.equal(isJunkTitle('Hanna'), false);
  assert.equal(isJunkTitle('Spider'), false);
  assert.equal(isJunkTitle('Zodiac'), false);
  assert.equal(isJunkTitle('Sneakers'), false);
  assert.equal(isJunkTitle('Commando'), false);
});

// ---- New: title extraction prefers real media name ----

test('extractTitle skips "now on HBO Max" and finds actual show title', () => {
  const text = '12:42\nnow on HBO Max.\nThe Leftovers (2014-2017)\nThe Leftovers, based on Tom Perotta\'s 2011 novel';
  const title = extractTitle(text);
  assert.ok(!title.toLowerCase().includes('now on'), `got junk title: ${title}`);
  assert.match(title, /Leftovers/i);
});

test('extractTitle skips subreddit header and finds media in body', () => {
  const text = '1:30\nr/Piracy\nI never realized how good streaming has gotten.\nStremio';
  const title = extractTitle(text);
  assert.ok(!title.startsWith('r/'), `got subreddit as title: ${title}`);
});

// ---- Integration: scoreOcrText rejects junk when title is junk ----

test('scoreOcrText rejects STEAM GUARD screenshot', () => {
  const r = scoreOcrText('11:25\n100\nSTEAM GUARD\nYou might need this code someday.\nThis code will let you recover your account if you lose access.');
  assert.equal(r.keep, false);
});

test('scoreOcrText rejects weekday-date screenshot', () => {
  const r = scoreOcrText('10:08 AM\nTue Mar 7\n= 44%\n100 Supported Languages\nMacWhisper can transcribe audio');
  assert.equal(r.keep, false);
});

test('scoreOcrText rejects r/Piracy screenshot', () => {
  const r = scoreOcrText('1:30\nr/Piracy\ny/Anubex • 7h\nI never realized how good Piracy streaming has gotten.');
  assert.equal(r.keep, false);
});
