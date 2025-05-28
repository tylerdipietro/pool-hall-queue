const Queue = require('../models/Queue');
const Table = require('../models/Table');
const User = require('../models/User');
const { haveRecentlyPlayed } = require('../utils/matchHistory');


/**
 * Assigns users from the queue to available tables and emits invitations.
 * 
 * @param {Object} io - Socket.IO instance
 * @param {Map} userSockets - Map of userId => socketId
 */
async function assignUsersToTables(io, userSockets) {
  console.log('[Assign] assignUsersToTables called');

  const queue = await Queue.findOne({}).populate('users', 'username');
  if (!queue) {
    console.error('[Assign] Queue not initialized');
    return;
  }

  const tables = await Table.find();
  let queueUsers = [...queue.users];
  let queueChanged = false;

  console.log(`[Assign] Queue has ${queueUsers.length} user(s)`);
  console.log(`[Assign] Found ${tables.length} table(s)`);

  for (const table of tables) {
    try {
      console.log(`[Assign] Checking table ${table.tableNumber}: players=${table.players.length}, pendingUser=${table.pendingUser}`);

      // Replace all uses of .shift() that remove users from queueUsers
// Instead, just peek without removing

// Example for case: one player at table
if (table.players.length === 1 && queueUsers.length >= 1) {
  const pendingUser = queueUsers[0]; // 👈 DO NOT shift()

  // Skip if they've played recently
  if (haveRecentlyPlayed(table.players[0].toString(), pendingUser._id.toString())) {
    console.log(`[Assign] Skipping invitation: ${table.players[0]} and ${pendingUser.username} played recently`);
    continue;
  }

  table.pendingUser = pendingUser._id;
  table.pendingUserTimestamp = new Date();
  await table.save();

  const opponentUser = await User.findById(table.players[0], 'username');
  const socketId = userSockets?.get?.(pendingUser._id.toString());

  if (socketId) {
    io.to(socketId).emit('tableInvite', {
      tableId: table._id,
      tableNumber: table.tableNumber,
      opponent: opponentUser?.username || 'Opponent',
      invitedUsername: pendingUser.username,
      message: 'You have been invited to join a table. Please accept or decline.',
    });
  } else {
    console.warn(`[Assign] No socket found for invited user: ${pendingUser.username} (${pendingUser._id})`);
  }

  continue;
}

// Example for case: table empty, assign one, invite one
if (table.players.length === 0 && queueUsers.length >= 2) {
  const player1 = queueUsers[0]; // 👈 Peek only
  const pendingUser = queueUsers[1]; // 👈 Peek only

  if (haveRecentlyPlayed(player1._id.toString(), pendingUser._id.toString())) {
    console.log(`[Assign] Skipping match: ${player1.username} and ${pendingUser.username} played recently`);
    continue;
  }

  table.players = [player1._id];
  table.pendingUser = pendingUser._id;
  table.pendingUserTimestamp = new Date();
  await table.save();

  const socketId = userSockets?.get?.(pendingUser._id.toString());

  if (socketId) {
    io.to(socketId).emit('tableInvite', {
      tableId: table._id,
      tableNumber: table.tableNumber,
      opponent: player1.username,
      invitedUsername: pendingUser.username,
      message: 'You have been invited to join a table. Please accept or decline.',
    });
  } else {
    console.warn(`[Assign] No socket found for invited user: ${pendingUser.username} (${pendingUser._id})`);
  }

  continue;
}


        // then continue as normal
      



    } catch (err) {
      console.error(`[Assign] Error processing table ${table.tableNumber}:`, err);
    }
  }



  // Update queue in DB if it changed
  if (queueChanged) {
    queue.users = queueUsers.map(u => u._id);
    try {
      await queue.save();
      console.log('[Assign] Queue updated after table assignments');
      io.emit('queueUpdated'); // 👈 Emit update so frontend can refresh
      io.emit('tablesUpdated')
    } catch (err) {
      console.error('[Assign] Failed to save updated queue:', err);
    }
  }
}

module.exports = assignUsersToTables;
