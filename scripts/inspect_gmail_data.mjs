import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const mongoUri = process.env.MONGO_URI;
if (!mongoUri) {
  console.error("No MONGO_URI in environment");
  process.exit(1);
}

async function inspectGmailData() {
  await mongoose.connect(mongoUri);
  console.log("Connected to MongoDB Atlas!");

  const db = mongoose.connection.db;
  const collections = await db.listCollections().toArray();
  console.log("\nExisting collections:", collections.map(c => c.name));

  for (const col of collections) {
    const cName = col.name;
    const collection = db.collection(cName);
    
    // Search for documents containing @gmail.com
    // Specifically checking common fields: email, personalEmail, facultyEmail, alternateEmails, or full text
    const query = {
      $or: [
        { email: /@gmail\.com/i },
        { personalEmail: /@gmail\.com/i },
        { facultyEmail: /@gmail\.com/i },
        { alternateEmails: /@gmail\.com/i },
        { hodEmail: /@gmail\.com/i }
      ]
    };

    const count = await collection.countDocuments(query);
    console.log(`\nCollection [${cName}]: ${count} document(s) matching @gmail.com`);

    if (count > 0) {
      const docs = await collection.find(query).project({
        email: 1,
        personalEmail: 1,
        facultyEmail: 1,
        facultyName: 1,
        name: 1,
        timeline: 1,
        department: 1,
        alternateEmails: 1
      }).toArray();

      for (const d of docs) {
        console.log(`  ID: ${d._id}`, JSON.stringify(d));
      }
    }
  }

  await mongoose.disconnect();
}

inspectGmailData().catch(console.error);
