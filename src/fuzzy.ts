// Fuzzy matching for the area picker: forgiving of what a DM half remembers
// ("scar lake", "wstlk"), and still putting the obvious match first.
//
// A query is split on spaces and every word has to be found. A word found
// whole scores far above one found only as scattered letters in order, and
// one found at the start of a word in the text above one found inside a word,
// so "town" lists "Risenholm, Town" before "Ceaseless City, Downtown".

const isWordChar = (c: string | undefined) => c !== undefined && /[a-z0-9]/.test(c);

function wordScore(word: string, text: string): number | null {
  const at = text.indexOf(word);
  if (at >= 0) {
    return 100 + (isWordChar(text[at - 1]) ? 0 : 50) - at * 0.1;
  }

  // Its letters in order, with anything between them. Letters that follow on
  // from the one before, or start a word, count for more, and a match spread
  // across the whole text counts for less.
  let score = 0;
  let from = 0;
  let first = -1;
  let last = -1;

  for (const c of word) {
    const found = text.indexOf(c, from);
    if (found < 0) return null;
    score += (found === last + 1 ? 5 : 1) + (isWordChar(text[found - 1]) ? 0 : 3);
    if (first < 0) first = found;
    last = found;
    from = found + 1;
  }

  return score - (last - first) * 0.2;
}

// The score of `query` against `text`, higher for a better match, or null
// when it does not match. An empty query matches everything equally.
export function fuzzyScore(query: string, text: string): number | null {
  const haystack = text.toLowerCase();
  let total = 0;

  for (const word of query.toLowerCase().split(/\s+/)) {
    if (!word) continue;
    const score = wordScore(word, haystack);
    if (score === null) return null;
    total += score;
  }

  return total;
}

// The items that match, best first. Equal scores keep the order they came
// in, so an empty query returns the list as it was given.
export function fuzzyRank<T>(query: string, items: T[], textOf: (item: T) => string): T[] {
  return items
    .map((item, index) => ({ item, index, score: fuzzyScore(query, textOf(item)) }))
    .filter((entry): entry is { item: T, index: number, score: number } => entry.score !== null)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.item);
}
