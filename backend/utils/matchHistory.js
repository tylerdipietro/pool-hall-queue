// utils/matchHistory.js

const recentMatches = new Map();

/**
 * Records a match between two users by storing the current timestamp.
 * @param {string} id1 - User ID of player 1
 * @param {string} id2 - User ID of player 2
 */
function recordMatch(id1, id2) {
  const key = createKey(id1, id2);
  recentMatches.set(key, Date.now());
}

/**
 * Checks if two users have played recently within the grace period.
 * @param {string} id1 - User ID of player 1
 * @param {string} id2 - User ID of player 2
 * @param {number} gracePeriod - Optional cooldown period in ms (default: 30 seconds)
 * @returns {boolean}
 */
function haveRecentlyPlayed(id1, id2, gracePeriod = 30000) {
  const key = createKey(id1, id2);
  const lastMatch = recentMatches.get(key);
  if (!lastMatch) return false;
  return Date.now() - lastMatch < gracePeriod;
}

/**
 * Creates a consistent key regardless of order (A-B is the same as B-A).
 */
function createKey(id1, id2) {
  return [id1, id2].sort().join('-');
}

module.exports = {
  recordMatch,
  haveRecentlyPlayed,
};
