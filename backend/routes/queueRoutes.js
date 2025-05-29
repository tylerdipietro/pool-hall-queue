// queueRoutes.js
const express = require('express');
const router = express.Router();
const queueControllerFactory = require('../controllers/queueController');
const Queue = require('../models/Queue');
const QueueEntry = require('../models/QueueEntry');
const Table = require('../models/Table');
const User = require('../models/User');
const assignUsersToTables = require('../services/assignUsersToTables');
const { processGameOver } = require('../services/gameOverService');
// Middleware to ensure user is authenticated
const ensureAuth = (req, res, next) => {
  if (req.isAuthenticated && req.isAuthenticated()) return next();
  res.status(401).json({ message: 'Unauthorized' });
};

// Helper: Emit updated queue to all clients
async function emitQueueUpdate(io) {
  const queue = await Queue.findOne({}).populate('users', 'username');
  io.emit('queueUpdated', queue?.users || []);
}

// Helper: Remove user from queue
async function removeFromQueue(userId) {
  const queue = await Queue.findOne({});
  if (!queue) return;
  queue.users = queue.users.filter(u => u.toString() !== userId.toString());
  await queue.save();
}

// Helper: Remove user from any tables they are on
async function removeFromTables(userId) {
  const tables = await Table.find({ players: userId });
  for (const table of tables) {
    table.players = table.players.filter(p => p.toString() !== userId.toString());
    await table.save();
  }
}

module.exports = (io, userSockets) => {

   const queueController = queueControllerFactory(io, userSockets);
  
  // GET /api/queue - get current user, queue, and table states
  router.get('/', ensureAuth, async (req, res) => {
    try {
      const queue = await Queue.findOne({}).populate('users', 'username');
      const tables = await Table.find({}).populate('players', 'username');
      res.json({
        user: {
          _id: req.user._id,
          username: req.user.username,
          isAdmin: req.user.isAdmin,
        },
        queue: queue?.users || [],
        tables: tables || [],
      });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });

  // POST /api/queue/checkin - user requests to join queue or get invited immediately
  router.post('/checkin', ensureAuth, async (req, res) => {
    
    const userId = req.user._id;
    const username = req.user.username;

    console.log(`User checking in: ${username} (${userId})`);

    try {
      // Get or create the queue
      let queue = await Queue.findOne({});
      if (!queue) {
        queue = new Queue({ users: [] });
        await queue.save();
      }

      console.log(`User checking in: ${username} (${userId})`);
      console.log('Current queue users:', queue.users);

      // Check if user is already playing on any table
      const playingTables = await Table.find({ players: userId });
      if (playingTables.length > 0) {
        return res.status(400).json({ message: 'User already playing on a table' });
      }

      // Check if user is already in the queue
      if (queue.users.some(u => u.toString() === userId.toString())) {
        return res.status(400).json({ message: 'User already in queue' });
      }

      // Find available table with exactly one player waiting for an opponent
      const availableTable = await Table.findOne({
        'players.1': { $exists: false },
        'players.0': { $exists: true }
      }).populate('players');

      console.log('Available table:', availableTable);

      // If available table exists and queue is empty, invite user immediately
      if (availableTable && queue.users.length === 0) {
        const currentPlayer = availableTable.players[0];
        const socketId = userSockets.get(userId.toString());

        if (socketId) {
          io.to(socketId).emit('tableInvite', {
            tableId: availableTable._id,
            tableNumber: availableTable.tableNumber,
            opponent: currentPlayer.username,
            invitedUsername: username,
          });
          console.log(`Inviting ${username} to table ${availableTable.tableNumber} against ${currentPlayer.username}`);
          console.log(`SocketId for ${username}:`, socketId);

          return res.json({ message: 'Table invite sent immediately' });
        } else {
          console.warn(`Socket not found for user ${username}`);
          return res.status(500).json({ message: 'User socket not found for invite' });
        }
      }

      // Otherwise, add user to the queue
      queue.users.push(userId);
      console.log(`Added ${username} to queue. Saving...`);
      await queue.save();
      console.log('Queue saved.');

      // Try to assign users to tables if possible
      await assignUsersToTables(io, userSockets);

      // Broadcast updated queue state
      await emitQueueUpdate(io);
      const updatedQueue = await Queue.findOne({}).populate('users', 'username');
      console.log('Queue AFTER:', updatedQueue.users.map(u => u.username));

      return res.json({ message: 'Checked in and added to queue' });
    } catch (err) {
      console.error('Checkin Error:', err);
      res.status(500).json({ message: 'Server error during check-in' });
    }

  });

  // POST /api/queue/leave - user leaves queue and any tables
  router.post('/leave', ensureAuth, async (req, res) => {
    try {
      const userId = req.user._id;
      await removeFromQueue(userId);
      await removeFromTables(userId);
      await assignUsersToTables(io, userSockets);
      await emitQueueUpdate(io);
      res.json({ message: 'User removed from queue and tables' });
    } catch (err) {
      console.error('Leave Error:', err);
      res.status(500).json({ message: err.message });
    }
  });

  // POST /api/queue/endgame - finalize game results and free table
  // POST /api/queue/endgame
  const getNextPlayersFromQueue = async () => {
  const queue = await Queue.findOne({}).populate('users');
  if (!queue || queue.users.length < 2) return [];

  const nextPlayers = queue.users.slice(0, 2);

  // Remove first 2 users directly in the DB (atomic update)
  await Queue.findOneAndUpdate(
    { _id: queue._id },
    { $pull: { users: { $in: nextPlayers.map(u => u._id) } } },
    {new: true }
  );

  return nextPlayers;
};

router.post('/endgame', async (req, res) => {
  try {
    const { tableId, winnerId, loserId } = req.body;
    const io = req.app.get('io');

    const table = await Table.findById(tableId);
    if (!table) return res.status(404).json({ message: 'Table not found' });

    // Remove the loser from the table
    if (table.playerOne?.toString() === loserId) {
      table.playerOne = null;
    } else if (table.playerTwo?.toString() === loserId) {
      table.playerTwo = null;
    }

    const winner = await User.findById(winnerId);
    if (!winner) return res.status(404).json({ message: 'Winner not found' });

    const queueDoc = await Queue.findOne(); // assuming singleton queue

    if (queueDoc && queueDoc.users.length > 0) {
      // Peek at the next player (don't remove yet)
      const nextUserId = queueDoc.users[0];
      const nextUser = await User.findById(nextUserId);

      if (nextUser) {
        // Assign player slot temporarily (we'll confirm on acceptance)
        if (!table.playerOne) {
          table.playerOne = null; // wait for acceptance
        } else if (!table.playerTwo) {
          table.playerTwo = null; // wait for acceptance
        }

        await table.save();

        // Send invite to next user
        io.to(nextUser.socketId).emit('tableInvite', {
          tableId: table._id,
          tableNumber: table.number,
          opponent: winner.username,
          invitedUsername: nextUser.username,
        });

        // Emit updated tables and queue (queue not changed yet)
        const updatedTables = await Table.find().populate('playerOne playerTwo');
        io.emit('queueUpdated', queueDoc.users);
        io.emit('tablesUpdated', updatedTables);
      } else {
        console.warn(`Next user in queue not found: ${nextUserId}`);
      }
    } else {
      // Just save and emit updates if no one in queue
      await table.save();
      const updatedTables = await Table.find().populate('playerOne playerTwo');
      io.emit('tablesUpdated', updatedTables);
    }

    return res.status(200).json({ message: 'Endgame processed' });
  } catch (error) {
    console.error('Error in /endgame:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});


  // POST /api/queue/clear - Admin clears entire queue
  router.post('/clear', ensureAuth, async (req, res) => {
    if (!req.user?.isAdmin) return res.status(403).json({ message: 'Forbidden' });

    try {
      const queue = await Queue.findOne({});
      if (!queue) return res.status(404).json({ message: 'Queue not found' });

      queue.users = [];
      await queue.save();
      await emitQueueUpdate(io);

      res.json({ message: 'Queue cleared successfully' });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });

  // POST /api/queue/accept - user accepts a table invite and joins table
  // POST /api/queue/accept - user accepts a table invite and joins table
router.post('/accept', ensureAuth, async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const { tableId } = req.body;

    const table = await Table.findById(tableId);
    if (!table) return res.status(404).json({ message: 'Table not found' });

   // Check if the logged-in user is the pendingUser for this table
    if (!table.pendingUser || table.pendingUser.toString() !== userId.toString()) {
      console.log('❌ Invite rejection debug:');
      console.log('➡️ Table.pendingUser:', table.pendingUser?.toString());
      console.log('➡️ Logged-in userId:', userId);
      return res.status(403).json({ message: 'You were not invited to this table' });
    }

    // Validate table isn't full
    if (table.players.length >= 2) {
      return res.status(400).json({ message: 'Table already has two players' });
    }

    // Assign user to table
    table.players.push(userId);
    table.pendingUser = null;
    table.pendingUserTimestamp = null;
    await table.save();

    // Remove user from queue
    await removeFromQueue(userId);

    // Emit updates
    await assignUsersToTables(io, userSockets);
    await emitQueueUpdate(io);
    io.emit('tablesUpdated');

    return res.json({ message: 'Successfully joined the table' });
  } catch (err) {
    console.error('Accept Error:', err);
    return res.status(500).json({ message: err.message });
  }
});


  // POST /api/queue/skip - user skips their turn in the queue
  router.post('/skip', ensureAuth, async (req, res) => {
    try {
      const userId = req.user._id;
      const { tableId } = req.body;

      let queue = await Queue.findOne({});
      if (!queue) {
        queue = new Queue({ users: [] });
        await queue.save();
      }

      const index = queue.users.findIndex(u => u.toString() === userId.toString());
      if (index !== -1 && index < queue.users.length - 1) {
        // Swap current user with next user in the queue
        [queue.users[index], queue.users[index + 1]] = [queue.users[index + 1], queue.users[index]];
        await queue.save();
      }

      await emitQueueUpdate(io);

      // Notify the skipping user about invite timeout
      const socketId = userSockets.get(userId.toString());
      if (socketId) {
        io.to(socketId).emit('tableInviteTimeout', { tableId });
      }

      // Invite the next user in queue if the table has exactly one player
      const table = await Table.findById(tableId).populate('players');
      if (table?.players.length === 1 && queue.users.length > 0) {
        const nextUserId = queue.users[0];
        if (nextUserId.toString() !== userId.toString()) {
          const nextUser = await User.findById(nextUserId);
          if (nextUser) {
            const nextSocketId = userSockets.get(nextUserId.toString());
            if (nextSocketId) {
              io.to(nextSocketId).emit('tableInvite', {
                tableId: table._id,
                tableNumber: table.number,
                opponent: table.players[0].username,
                invitedUsername: nextUser.username,
              });
            }
          }
        }
      }

      res.json({ message: 'Skipped turn in queue' });
    } catch (err) {
      console.error('Skip Error:', err);
      res.status(500).json({ message: err.message });
    }
  });

  const inviteNextOpponentToTable = async (table, io, userSockets) => {
  const queue = await Queue.findOne({}).populate('users');
  if (!queue || queue.users.length === 0 || table.players.length !== 1) return;

  const newOpponent = queue.users[0];
  table.players.push(newOpponent._id);
  await table.save();

  queue.users = queue.users.slice(1);
  await queue.save();

  const winner = await User.findById(table.players[0]);

  // Send invites
  const opponentSocket = userSockets.get(newOpponent._id.toString());
  if (opponentSocket) {
    io.to(opponentSocket).emit('tableInvite', {
      tableId: table._id,
      tableNumber: table.tableNumber,
      opponent: winner.username,
      invitedUsername: newOpponent.username,
    });

    console.log(`Invited ${newOpponent.username} to table ${table.tableNumber} with ${winner.username}`);
  }
};
const emitQueueUpdate = async (io) => {
  const updatedQueue = await Queue.findOne({}).populate('users', 'username');
  io.emit('queueUpdated', updatedQueue?.users || []);
};


  return router;
};
