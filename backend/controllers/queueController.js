//queueController.js
const QueueEntry = require('../models/QueueEntry');
const Table = require('../models/Table');
const User = require('../models/User');
const assignUsersToTables = require('../services/assignUsersToTables'); // adjust path if needed


function createQueueController(io, userSockets) {
  return {
    async checkInUser(req, res) {
      const userId = req.user._id;
      try {
        const tablesWithUser = await Table.findOne({ players: userId });
        if (tablesWithUser) {
          return res.status(400).json({ message: 'User already playing on a table' });
        }
        const queueEntry = await QueueEntry.findOne({ user: userId });
        if (queueEntry) {
          return res.status(400).json({ message: 'User already in queue' });
        }
        const availableTable = await Table.findOne({
          $or: [
            { players: { $size: 0 } },
            { players: { $size: 1 } }
          ],
          gameActive: false
        });
        if (availableTable) {
          availableTable.players.push(userId);
          await availableTable.save();
          return res.json({ message: 'User assigned to table', table: availableTable });
        } else {
          const newEntry = new QueueEntry({ user: userId });
          await newEntry.save();
          return res.json({ message: 'User added to queue', queuePosition: await QueueEntry.countDocuments() });
        }
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error during check-in' });
      }
    },

    async leaveQueue(req, res) {
      const userId = req.user._id;
      try {
        await QueueEntry.deleteOne({ user: userId });
        const table = await Table.findOne({ players: userId });
        if (table) {
          table.players = table.players.filter(p => !p.equals(userId));
          if (table.players.length === 0) {
            table.gameActive = false;
          }
          await table.save();
        }
        res.json({ message: 'User left queue or table' });
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error during leave queue' });
      }
    },

    async endGame(req, res) {
      const { tableId, winnerId, loserId } = req.body;
      try {
        const table = await Table.findById(tableId);
        if (!table) return res.status(404).json({ message: 'Table not found' });
        table.players = [];
        if (winnerId) {
          table.players.push(winnerId);
          table.gameActive = true;
        } else {
          table.gameActive = false;
        }
        if (loserId) {
          await QueueEntry.create({ user: loserId });
        }
        if (table.players.length < 2) {
          const nextInQueue = await QueueEntry.findOne().sort({ checkedInAt: 1 });
          if (nextInQueue) {
            table.players.push(nextInQueue.user);
            await nextInQueue.deleteOne();
            table.gameActive = true;
          }
        }
        await table.save();
        await assignUsersToTables(io, userSockets);
        res.json({ message: 'Game ended and queue updated', table });
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error during ending game' });
      }
    },

    async getStatus(req, res) {
      try {
        const tables = await Table.find().populate('players', 'username');
        const queueEntries = await QueueEntry.find().populate('user', 'username').sort({ checkedInAt: 1 });
        res.json({ tables, queue: queueEntries });
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error fetching status' });
      }
    }
  };
}

module.exports = createQueueController;
