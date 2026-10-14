import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function check() {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;

  const col = db.collection('appraisals');
  const docs = await col.find({
    $or: [
      { email: /student\.tce\.edu/i },
      { facultyEmail: /student\.tce\.edu/i }
    ]
  }).toArray();
  console.log(`\n=== Collection [appraisals]: ${docs.length} record(s) matching student.tce.edu ===`);
  for (const d of docs) {
    console.log(`  ID: ${d._id} | email: ${d.email} | facultyName: ${d.facultyName} | dept: ${d.department} | timeline: ${d.timeline} | status: ${d.appraisalStatus}`);
  }

  await mongoose.disconnect();
}

check().catch(console.error);
