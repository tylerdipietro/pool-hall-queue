//backend/models/Queue.js
const mongoose = require('mongoose');

const queueSchema = new mongoose.Schema({
  users: { type: [mongoose.Schema.Types.ObjectId], ref: 'User', default: [] },
});

module.exports = mongoose.model('Queue', queueSchema);

