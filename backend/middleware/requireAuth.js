// backend/middleware/requireAuth.js
module.exports = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ msg: 'You must be logged in to perform this action.' });
  }
  next();
};