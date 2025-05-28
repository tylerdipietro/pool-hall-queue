//models/QueueEntry.js
const mongoose = require('mongoose');

const queueEntrySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  checkedInAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('QueueEntry', queueEntrySchema);
