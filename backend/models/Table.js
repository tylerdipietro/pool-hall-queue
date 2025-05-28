//models/Table.js
const mongoose = require('mongoose');

const tableSchema = new mongoose.Schema({
  tableNumber: { type: Number, required: true, unique: true },
  players: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // max length 2
  gameActive: { type: Boolean, default: false },
  pendingUser: {
  type: mongoose.Schema.Types.ObjectId,
  ref: 'User',
  default: null
},
pendingUserTimestamp: {
  type: Date,
  default: null,
},
});

module.exports = mongoose.model('Table', tableSchema);
