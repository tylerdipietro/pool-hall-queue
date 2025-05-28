const mongoose = require('mongoose');
require('dotenv').config();

const User = require('./models/User');
const Queue = require('./models/Queue');
const Table = require('./models/Table');

mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(async () => {
    await User.deleteMany({});
    await Queue.deleteMany({});
    await Table.deleteMany({});

    const users = await User.create([
      { googleId: 'test_google_1', username: 'TestUser1' },
      { googleId: 'test_google_2', username: 'TestUser2' },
    ]);

    await Queue.create({
      users: users.map(u => u._id),
    });

    await Table.create([
      {
        tableNumber: 1,
        players: [users[0]._id, users[1]._id],
        gameActive: true,
      },
      {
        tableNumber: 2,
        players: [],
        gameActive: false,
      },
      {
        tableNumber: 3,
        players: [],
        gameActive: false,
      },
    ]);

    console.log('Seeding complete');
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
