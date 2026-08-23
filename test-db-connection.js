const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://skcoderains_db_user:U.%2F6d3RC_bQiqAV@cluster0.ltf5au1.mongodb.net/monitor_db?retryWrites=true&w=majority&appName=Cluster0';
const DB_NAME = process.env.DB_NAME || 'monitor_db';

async function testConnection() {
  console.log('Connecting to MongoDB Atlas Cluster0...');
  console.log('Target Database:', DB_NAME);

  try {
    await mongoose.connect(MONGODB_URI, { dbName: DB_NAME, serverSelectionTimeoutMS: 8000 });
    console.log(' Successfully connected to MongoDB Atlas!');

    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('Existing collections in database:', collections.map(c => c.name));

    await mongoose.disconnect();
    console.log('Disconnected cleanly. Database test PASSED!');
  } catch (err) {
    console.error(' MongoDB Atlas connection test failed:', err.message);
    process.exit(1);
  }
}

testConnection();
