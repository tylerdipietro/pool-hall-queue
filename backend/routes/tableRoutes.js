const express = require('express');
const router = express.Router();
const Table = require('../models/Table');
const Queue = require('../models/Queue');
const { processGameOver } = require('../services/gameOverService');
const assignUsersToTables = require('../services/assignUsersToTables');

// Middleware to check authentication (adjust as needed)
const ensureAuth = (req, res, next) => {
  if (req.isAuthenticated && req.isAuthenticated()) return next();
  res.status(401).json({ message: 'Unauthorized' });
};

// GET /api/tables - get all tables with players info
router.get('/', ensureAuth, async (req, res) => {
  try {
    const tables = await Table.find().populate('players', 'username');
    res.json(tables);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/tables/:tableId/gameover
router.post('/:tableId/gameover', ensureAuth, async (req, res) => {
  try {
    const { tableId } = req.params;
    const { winnerId, loserId } = req.body;

    await processGameOver(tableId, winnerId, loserId);
    res.json({ message: 'Game over processed' });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// POST /api/tables/:tableId/won
router.post('/:tableId/won', ensureAuth, async (req, res) => {
  const { tableId } = req.params;
  const { userId } = req.body;

  const io = req.app.locals.io;
  const userSockets = req.app.locals.userSockets;

  if (!userId) return res.status(400).json({ message: 'Missing userId in request body' });

  try {
    const table = await Table.findById(tableId);
    if (!table) return res.status(404).json({ message: 'Table not found' });

    // Add the winner to players if not already present
    if (!table.players.some(p => p.toString() === userId)) {
      if (table.players.length >= 2) {
        return res.status(400).json({ message: 'Table already has 2 players' });
      }
      table.players.push(userId);
    }

    // Clear pendingUser
    table.pendingUser = null;
    table.pendingUserTimestamp = null;
    await table.save();

    // Remove winner from the queue
    const queue = await Queue.findOne({});
    if (queue) {
      const initialLength = queue.users.length;
      queue.users = queue.users.filter(id => id.toString() !== userId);
      if (queue.users.length !== initialLength) {
        await queue.save();
        console.log(`Removed user ${userId} from queue after winning.`);
      }
    }

    // Invite next queued player if possible
    await assignUsersToTables(io, userSockets);

    res.json({ message: 'Winner reserved on table. Queue and invites updated.' });
  } catch (err) {
    console.error('Error in /won route:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = (io) => router;
