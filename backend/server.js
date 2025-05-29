// backend/server.js
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const passport = require('passport');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const Table = require('./models/Table');
const authRoutes = require('./routes/authRoutes');
const tableRoutes = require('./routes/tableRoutes');
const queueRoutes = require('./routes/queueRoutes');
const { processGameOver } = require('./services/gameOverService');
const { recordMatch } = require('./utils/matchHistory');


const assignUsersToTables = require('./services/assignUsersToTables');
require('./services/passport');

const PORT = process.env.PORT || 5000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:3000';
const SKIP_TIMEOUT = 30 * 1000; // 30 seconds

const app = express();
console.log('__dirname:', __dirname);
console.log('Serving static files from:', path.join(__dirname, '../frontend/build'));
// Always serve frontend build
const frontendBuildPath = path.join(__dirname, '../frontend/build');
app.use(express.static(frontendBuildPath));

// Fallback: send index.html for any unmatched route
app.get('/*', function (req, res) {
  console.debug(`[DEBUG] Fallback hit: serving index.html`);
  res.sendFile(path.join(frontendBuildPath, 'index.html'));
});

console.log(`[DEBUG] Serving static files from: ${frontendBuildPath}`);

const originalUse = app.use.bind(app);
app.use = function (...args) {
  console.log('[DEBUG] app.use() called with:', args[0]);
  return originalUse(...args);
};

const server = http.createServer(app);

// Initialize Socket.IO server with CORS
const io = new Server(server, {
  cors: {
    origin: CLIENT_ORIGIN,
    credentials: true,
  },
});

// In-memory map of userId -> socketId for direct messaging
const userSockets = new Map();

// Make io and userSockets accessible in routes (if needed)
app.set('io', io);
app.set('userSockets', userSockets);

// Middleware setup
app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'your_secret_key_here',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    },
  })
);



app.use(passport.initialize());
app.use(passport.session());

// API routes
app.use('/auth', authRoutes);
app.use('/api/tables', tableRoutes(io));
app.use('/api/queue', queueRoutes(io, userSockets));



if (process.env.NODE_ENV === 'production') {
  const frontendBuildPath = path.join(__dirname, '../frontend/build');
  app.use(express.static(frontendBuildPath));

  ;
}

// Connect to MongoDB and start server
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
  });

// Periodic cleanup for pending user invites that timed out
setInterval(async () => {
  try {
    const now = Date.now();
    const tablesWithPending = await Table.find({ pendingUser: { $ne: null } });

    for (const table of tablesWithPending) {
      if (now - table.pendingUserTimestamp > SKIP_TIMEOUT) {
        console.log(`Pending invite timeout for table ${table._id}. Clearing invite.`);

        table.pendingUser = null;
        table.pendingUserTimestamp = null;
        await table.save();

        // Re-run assignment logic after clearing invites
        await assignUsersToTables(io, userSockets);
        io.emit('queueUpdated');
        io.emit('tableInviteTimeout', { tableId: table._id });
      }
    }
  } catch (err) {
    console.error('Error in pending invite timeout handler:', err);
  }
}, 5000);

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Register user socket mapping
  socket.on('registerUser', (userId) => {
    userSockets.set(userId, socket.id);
    console.log(`Registered user ${userId} with socket ${socket.id}`);
  });

  // New: user joins queue
  socket.on('joinQueue', async (userId) => {
    try {
      // TODO: Add userId to your queue collection or DB here
      // Example: await QueueModel.addUser(userId);

      // Then assign users to tables, emits invites if needed
      await assignUsersToTables(io, userSockets);

      console.log(`User ${userId} joined queue and tables assigned`);
    } catch (err) {
      console.error('Error in joinQueue handler:', err);
    }
  });

  // Accept a table invite
  socket.on('acceptInvite', async ({ tableId, userId }) => {
  try {
    const table = await Table.findById(tableId).populate('players pendingUser');
    if (!table) {
      console.log(`Table not found: ${tableId}`);
      return;
    }
    if (table.pendingUser?._id.toString() !== userId) {
      console.log(`User ${userId} is not the pendingUser for table ${tableId}`);
      return;
    }

    table.players.push(table.pendingUser);
    table.pendingUser = null;
    table.pendingUserTimestamp = null;
    table.inUse = true;
    await table.save();
    await table.populate('players');

    // Fetch updated queue and tables from DB
    const updatedQueue = await getUpdatedQueue();  // implement this
    const updatedTables = await getUpdatedTables(); // implement this

    io.emit('queueUpdated', updatedQueue);
    io.emit('tablesUpdated', updatedTables);

    console.log(`User ${userId} accepted invite for table ${tableId}`);
  } catch (error) {
    console.error('Error in acceptInvite:', error);
  }
});


  // Reject a table invite
  socket.on('rejectInvite', async ({ tableId, userId }) => {
    try {
      const table = await Table.findById(tableId).populate('pendingUser');
      if (!table) {
        console.log(`Table not found: ${tableId}`);
        return;
      }
      if (table.pendingUser?._id.toString() !== userId) {
        console.log(`User ${userId} is not the pendingUser for table ${tableId}`);
        return;
      }

      table.pendingUser = null;
      table.pendingUserTimestamp = null;
      await table.save();

      io.emit('tableUpdated', table);
      console.log(`User ${userId} rejected invite for table ${tableId}`);
    } catch (error) {
      console.error('Error in rejectInvite:', error);
    }
  });

  // Player claims a win → notify the opponent
socket.on('claim_win', async ({ tableId, winnerId }) => {
  try {
    const table = await Table.findById(tableId).populate('players');
    if (!table) {
      console.error(`Table not found: ${tableId}`);
      return;
    }

    // Normalize IDs as strings for comparison
    const winnerIdStr = winnerId.toString();

    // Find the loser (player that is NOT the winner)
    const loser = table.players.find(p => p._id.toString() !== winnerIdStr);

    if (!loser) {
      console.error(`Loser not found on table ${tableId}. Players: ${table.players.map(p => p._id.toString())}`);
      return;
    }

    const loserIdStr = loser._id.toString();
    const loserSocketId = userSockets.get(loserIdStr);
    const winnerSocketId = userSockets.get(winnerIdStr);

    if (loserSocketId) {
      io.to(loserSocketId).emit('confirm_win_request', {
        tableId,
        winnerId: winnerIdStr,
        loserId: loserIdStr,
      });
    } else {
      console.warn(`Socket not found for loser ${loserIdStr}`);
    }

    if (winnerSocketId) {
      io.to(winnerSocketId).emit('waiting_for_verification', { tableId });
    } else {
      console.warn(`Socket not found for winner ${winnerIdStr}`);
    }

    console.log(`Win claim sent to loser (${loserIdStr}) and waiting status sent to winner (${winnerIdStr})`);
  } catch (err) {
    console.error('Error in claim_win:', err);
  }
});

// Loser confirms the win → finalize the game
socket.on('confirm_win_response', async ({ tableId, winnerId, confirmed }) => {
  if (!confirmed) return;

  try {
    const winnerIdStr = winnerId.toString();
    const matchKey = `${tableId}-${winnerIdStr}`;

    if (activeConfirmations.has(matchKey)) {
      console.warn('Duplicate confirmation ignored');
      return;
    }
    activeConfirmations.add(matchKey);

    const table = await Table.findById(tableId).populate('players');
    if (!table) {
      console.error(`Table not found: ${tableId}`);
      activeConfirmations.delete(matchKey);
      return;
    }

    const loser = table.players.find(p => p._id.toString() !== winnerIdStr);
    if (!loser) {
      console.error(`Loser not found on table ${tableId}. Players:`, table.players.map(p => p._id.toString()));
      activeConfirmations.delete(matchKey);
      return;
    }

    const loserIdStr = loser._id.toString();

    recordMatch(winnerIdStr, loserIdStr);

    await processGameOver(io, table, winnerIdStr, loserIdStr);

    // Notify both players
    [winnerIdStr, loserIdStr].forEach(playerId => {
      const socketId = userSockets.get(playerId);
      if (socketId) {
        io.to(socketId).emit('matchConfirmed', { tableId, winnerId: winnerIdStr });
        const loserSocketId = userSockets.get(loserIdStr);
        const winnerSocketId = userSockets.get(winnerIdStr);
        if (winnerSocketId) io.to(winnerSocketId).emit('matchConfirmed', { tableId, winnerId: winnerIdStr });
        if (loserSocketId) io.to(loserSocketId).emit('matchConfirmed', { tableId, winnerId: winnerIdStr });
      } else {
        console.warn(`Socket not found for player ${playerId}`);
      }
    });

    console.log(`Match confirmed and processed for table ${tableId}`);

    // Remove from activeConfirmations after delay
    setTimeout(() => activeConfirmations.delete(matchKey), 10000);

  } catch (err) {
    console.error('Error in confirm_win_response:', err);
  }

  await assignUsersToTables(io, userSockets); // 👈 This must run immediately

});


  // Handle client disconnect: cleanup userSockets
  socket.on('disconnect', () => {
     console.log(`Socket ${socket.id} disconnected:`);
    for (const [userId, sockId] of userSockets.entries()) {
      if (sockId === socket.id) {
        userSockets.delete(userId);
        console.log(`Cleaned up socket for user ${userId}`);
        break;
      }
    }
  });
});

module.exports = { io };
