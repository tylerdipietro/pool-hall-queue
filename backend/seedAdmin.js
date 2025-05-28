// seedAdmin.js
require('dotenv').config(); // Load .env variables

const mongoose = require('mongoose');
const User = require('./models/User'); // Adjust path as needed

const mongoUri = process.env.MONGO_URI;  // Use env variable

// Replace with the actual user ID string to make admin
const adminUserId = '6833fe651e93e4ad42e16bd2';

async function makeAdmin() {
  try {
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    const result = await User.updateOne(
      { _id: adminUserId },
      { $set: { isAdmin: true } }
    );

    if (result.modifiedCount === 1) {
      console.log(`User ${adminUserId} is now an admin.`);
    } else {
      console.log(`No user updated. Check if user with id ${adminUserId} exists.`);
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    mongoose.disconnect();
  }
}

makeAdmin();
