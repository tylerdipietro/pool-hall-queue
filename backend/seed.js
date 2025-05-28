// backend/seed.js
const mongoose = require('mongoose');
require('dotenv').config();
const Table = require('./models/Table');
const Queue = require('./models/Queue');

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    console.log('Connected to DB');

    // Clear tables and queue
    await Table.deleteMany({});
    await Queue.deleteMany({});

    // Create 3 tables with no players
    await Table.insertMany([
      { tableNumber: 1, players: [] },
      { tableNumber: 2, players: [] },
      { tableNumber: 3, players: [] },
    ]);

    // Create empty queue
    await Queue.create({ users: [] });

    console.log('Seed complete');
    process.exit();
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
