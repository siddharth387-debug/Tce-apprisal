import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const mongoUri = process.env.MONGO_URI;
if (!mongoUri) {
  console.error("No MONGO_URI configured");
  process.exit(1);
}

async function runCleanup() {
  await mongoose.connect(mongoUri);
  console.log("✓ Connected to MongoDB Atlas cluster");

  const db = mongoose.connection.db;
  const appraisalsCol = db.collection('appraisals');
  const userSessionsCol = db.collection('usersessions');
  const facultyCol = db.collection('facultymembers');

  console.log("\n=======================================================");
  console.log("1. APPRAISALS CLEANUP (ALL student.tce.edu EXCEPT siddharthk)");
  console.log("=======================================================");

  // Delete all appraisals from student.tce.edu
  const delAppResult = await appraisalsCol.deleteMany({
    $or: [
      { email: /student\.tce\.edu/i },
      { facultyEmail: /student\.tce\.edu/i }
    ]
  });
  console.log(`=> DELETED ${delAppResult.deletedCount} student appraisal record(s) from database.`);

  console.log("\n=======================================================");
  console.log("2. USER SESSIONS CLEANUP");
  console.log("=======================================================");

  const delSessResult = await userSessionsCol.deleteMany({
    email: { $regex: /@student\.tce\.edu$/i, $ne: 'siddharthk@student.tce.edu' }
  });
  console.log(`=> DELETED ${delSessResult.deletedCount} non-master student session(s).`);

  console.log("\n=======================================================");
  console.log("3. FACULTY DIRECTORY CLEANUP");
  console.log("=======================================================");

  // Delete any non-master student from facultymembers
  const delFacResult = await facultyCol.deleteMany({
    email: { $regex: /@student\.tce\.edu$/i, $ne: 'siddharthk@student.tce.edu' }
  });
  console.log(`=> DELETED ${delFacResult.deletedCount} student record(s) from facultymembers.`);

  // Clean alternateEmails across all faculty records
  const pullResult = await facultyCol.updateMany(
    { alternateEmails: { $elemMatch: { $regex: /@student\.tce\.edu$/i, $ne: 'siddharthk@student.tce.edu' } } },
    { $pull: { alternateEmails: { $regex: /@student\.tce\.edu$/i, $ne: 'siddharthk@student.tce.edu' } } }
  );
  console.log(`=> Cleaned student alternateEmails across ${pullResult.modifiedCount} faculty record(s).`);

  // Ensure siddharthk@student.tce.edu master faculty record
  let masterRecord = await facultyCol.findOne({ email: 'siddharthk@student.tce.edu' });
  if (!masterRecord) {
    await facultyCol.insertOne({
      staffId: 'SIDDHARTHK',
      name: 'Dr. Siddharth K (Master)',
      designation: 'Registrar / Master Admin',
      email: 'siddharthk@student.tce.edu',
      personalEmail: 'siddharthk@student.tce.edu',
      hodEmail: 'hodcse@tce.edu',
      alternateEmails: ['siddharthk@student.tce.edu', 'deansiddharth@gmail.com'],
      department: 'ALL',
      departmentName: 'All Academic Departments',
      role: 'Registrar',
      active: true,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    console.log("=> Created/ensured master faculty record for siddharthk@student.tce.edu");
  } else {
    console.log("=> Verified master faculty record for siddharthk@student.tce.edu");
  }

  await mongoose.disconnect();
  console.log("\n✓ Cleanup finished.");
}

runCleanup().catch(console.error);
