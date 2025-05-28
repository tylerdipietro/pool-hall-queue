// backend/routes/authRoutes.js
const router = require('express').Router();
const passport = require('passport');
const Queue = require('../models/Queue');
const Table = require('../models/Table');

// Redirect to Google OAuth
router.get('/google', passport.authenticate('google', { scope: ['profile'] }));

// Google OAuth callback
router.get(
  '/google/callback',
  passport.authenticate('google', {
    failureRedirect: '/login',
    session: true,
  }),
  (req, res) => {
    console.log('Logged in user:', req.user);
    console.log('Session:', req.session);
    res.redirect('http://localhost:3000');
  }
);

// Logout route
router.post('/logout', async (req, res) => {
  try {
    const userId = req.user?._id;
    const io = req.app.get('io');

    console.log('Logging out user:', userId);

    if (userId) {
      // Remove user from queue
      const queue = await Queue.findOne({});
      if (queue) {
        const beforeCount = queue.users.length;
        queue.users = queue.users.filter(u =>
          (u._id ? u._id.toString() : u.toString()) !== userId.toString()
        );
        await queue.save();
        console.log(`Queue updated: ${beforeCount} → ${queue.users.length}`);

        const updatedQueue = await Queue.findOne({}).populate('users', 'username');
        io.emit('queueUpdated', updatedQueue.users);
      }

      // Remove user from any tables they're part of
      const tables = await Table.find({ players: userId });
      for (const table of tables) {
        table.players = table.players.filter(p =>
          (p._id ? p._id.toString() : p.toString()) !== userId.toString()
        );
        await table.save();
      }
    }

    // Logout and destroy session
    req.logout((err) => {
      if (err) {
        console.error('Logout error:', err);
        return res.status(500).json({ message: 'Logout failed' });
      }
      req.session.destroy((err) => {
        if (err) {
          console.error('Session destroy error:', err);
          return res.status(500).json({ message: 'Failed to destroy session' });
        }
        res.clearCookie('connect.sid');
        res.status(200).json({ message: 'Logged out and removed from queue/tables' });
      });
    });
  } catch (err) {
    console.error('Logout route error:', err);
    res.status(500).json({ message: 'Server error on logout' });
  }
});

// Get current authenticated user
router.get('/current_user', (req, res) => {
  if (req.user) {
    res.json({ user: req.user });
  } else {
    res.status(401).json({ user: null });
  }
});

module.exports = router;
