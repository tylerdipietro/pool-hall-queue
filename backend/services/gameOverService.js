const Table = require('../models/Table');
const Queue = require('../models/Queue');
const assignUsersToTables = require('./assignUsersToTables');

/**
 * Handles the game over process:
 * - Removes loser from table
 * - Adds loser back to queue
 * - Refills tables from queue
 *
 * @param {Object} io - Socket.IO server instance
 * @param {Object} table - Mongoose Table document
 * @param {String} winnerId - ID of the winner
 * @param {String} loserId - ID of the loser
 */
async function processGameOver(io, table, winnerId, loserId) {
  if (!table) throw new Error('Table not found');

  if (!Array.isArray(table.players)) {
    throw new Error('Table has no players array');
  }

  if (
    !table.players.some((p) => p._id.toString() === winnerId) ||
    !table.players.some((p) => p._id.toString() === loserId)
  ) {
    throw new Error('Winner and loser must be players on the table');
  }

  // Remove loser
  table.players = table.players.filter((p) => p._id.toString() !== loserId);
  await table.save();

  // Add loser to queue
  const queue = await Queue.findOne({});
  if (!queue) throw new Error('Queue not found');

  queue.users.push(loserId);
  await queue.save();

  // Refill from queue
  await assignUsersToTables(io);

  return table;
}

module.exports = { processGameOver };
