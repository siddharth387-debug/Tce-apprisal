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
  console.log("1. APPRAISALS AUDIT & CLEANUP");
  console.log("=======================================================");

  // Find all appraisals with @gmail.com
  const allGmailAppraisals = await appraisalsCol.find({
    $or: [
      { email: /@gmail\.com$/i },
      { facultyEmail: /@gmail\.com$/i }
    ]
  }).toArray();

  console.log(`Found ${allGmailAppraisals.length} appraisal(s) with @gmail.com:`);
  const toDeleteAppraisalIds = [];
  const toKeepAppraisalIds = [];

  for (const app of allGmailAppraisals) {
    const em = (app.email || app.facultyEmail || '').toLowerCase().trim();
    if (em === 'deansiddharth@gmail.com') {
      toKeepAppraisalIds.push(app._id);
      console.log(`  [KEEP EXCEPTION] ID: ${app._id} | Faculty: ${app.facultyName} | Email: ${em} | Timeline: ${app.timeline}`);
    } else {
      toDeleteAppraisalIds.push(app._id);
      console.log(`  [TO DELETE]      ID: ${app._id} | Faculty: ${app.facultyName} | Email: ${em} | Timeline: ${app.timeline}`);
    }
  }

  if (toDeleteAppraisalIds.length > 0) {
    const delResult = await appraisalsCol.deleteMany({
      _id: { $in: toDeleteAppraisalIds }
    });
    console.log(`=> DELETED ${delResult.deletedCount} non-whitelisted gmail appraisal(s) successfully.`);
  } else {
    console.log("=> No appraisals to delete.");
  }

  console.log("\n=======================================================");
  console.log("2. USER SESSIONS AUDIT & CLEANUP");
  console.log("=======================================================");

  const allGmailSessions = await userSessionsCol.find({
    email: /@gmail\.com$/i
  }).toArray();

  console.log(`Found ${allGmailSessions.length} user session(s) with @gmail.com:`);
  const toDeleteSessionIds = [];

  for (const sess of allGmailSessions) {
    const em = (sess.email || '').toLowerCase().trim();
    if (em === 'deansiddharth@gmail.com') {
      console.log(`  [KEEP EXCEPTION] Session ID: ${sess._id} | Email: ${em}`);
    } else {
      toDeleteSessionIds.push(sess._id);
    }
  }

  if (toDeleteSessionIds.length > 0) {
    const sessDelResult = await userSessionsCol.deleteMany({
      _id: { $in: toDeleteSessionIds }
    });
    console.log(`=> DELETED ${sessDelResult.deletedCount} non-whitelisted gmail session(s) successfully.`);
  } else {
    console.log("=> No sessions to delete.");
  }

  console.log("\n=======================================================");
  console.log("3. FACULTY MASTER DIRECTORY CLEANUP");
  console.log("=======================================================");

  // Find faculty members with @gmail.com
  const gmailFaculty = await facultyCol.find({
    $or: [
      { email: /@gmail\.com$/i },
      { personalEmail: /@gmail\.com$/i },
      { alternateEmails: /@gmail\.com$/i }
    ]
  }).toArray();

  console.log(`Found ${gmailFaculty.length} faculty record(s) referencing @gmail.com:`);
  for (const fac of gmailFaculty) {
    console.log(`  Faculty ID: ${fac._id} | Name: ${fac.name} | Email: ${fac.email} | Alt: ${JSON.stringify(fac.alternateEmails)}`);
  }

  // Remove test faculty 'kabilesh' if exists
  const kabDel = await facultyCol.deleteOne({ email: 'kabilesh@gmail.com' });
  if (kabDel.deletedCount > 0) {
    console.log(`=> Removed test faculty 'kabilesh@gmail.com' from faculty directory.`);
  }

  // Clean alternateEmails that have non-deansiddharth @gmail.com
  const pullResult = await facultyCol.updateMany(
    { alternateEmails: { $elemMatch: { $regex: /@gmail\.com$/i, $ne: 'deansiddharth@gmail.com' } } },
    { $pull: { alternateEmails: { $regex: /@gmail\.com$/i, $ne: 'deansiddharth@gmail.com' } } }
  );
  console.log(`=> Cleaned alternateEmails across ${pullResult.modifiedCount} faculty record(s).`);

  // Restore Dr. L. Ashok Kumar (Principal)
  await facultyCol.updateOne(
    { staffId: 'PRINCIPAL' },
    {
      $set: {
        role: 'Principal',
        department: 'EEE',
        departmentName: 'Electrical and Electronics Engineering',
        designation: 'Principal',
        email: 'principal@tce.edu',
        personalEmail: 'principal@tce.edu'
      }
    }
  );
  console.log("=> Verified Principal (Dr. L. Ashok Kumar) master directory record.");

  // Update Dr. D. Nelson Jayakumar and Dr. M. S. Govardhanan to official @tce.edu emails
  await facultyCol.updateOne(
    { staffId: 'DNJEYAKUMAR' },
    {
      $set: {
        email: 'dnjeee@tce.edu',
        personalEmail: 'dnjeee@tce.edu',
        department: 'EEE',
        departmentName: 'Electrical and Electronics Engineering',
        alternateEmails: ['dnjeee@tce.edu']
      }
    }
  );
  await facultyCol.updateOne(
    { staffId: 'GOVARDHANANS07' },
    {
      $set: {
        email: 'msgmech@tce.edu',
        personalEmail: 'msgmech@tce.edu',
        department: 'MECH',
        departmentName: 'Mechanical Engineering',
        alternateEmails: ['msgmech@tce.edu']
      }
    }
  );
  console.log("=> Restored official @tce.edu directory records for EEE and MECH faculty.");

  // Check Siddharth Dean record
  let deansiddharthRecord = await facultyCol.findOne({
    $or: [
      { email: 'deansiddharth@gmail.com' },
      { personalEmail: 'deansiddharth@gmail.com' },
      { alternateEmails: 'deansiddharth@gmail.com' }
    ]
  });

  if (!deansiddharthRecord) {
    console.log("=> Creating / ensuring faculty record for deansiddharth@gmail.com");
    await facultyCol.insertOne({
      staffId: 'DEANSIDDHARTH',
      name: 'Dr. Siddharth',
      designation: 'Dean / Registrar',
      email: 'deansiddharth@gmail.com',
      personalEmail: 'deansiddharth@gmail.com',
      hodEmail: 'hodcse@tce.edu',
      alternateEmails: ['deansiddharth@gmail.com', 'siddharthk@student.tce.edu'],
      department: 'ALL',
      departmentName: 'All Academic Departments',
      role: 'Registrar',
      photo: '',
      profileUrl: '',
      active: true,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    console.log("=> Created Dean Siddharth faculty record.");
  } else {
    console.log(`=> Existing Dean Siddharth faculty record verified: ID ${deansiddharthRecord._id}`);
  }

  console.log("\n=======================================================");
  console.log("VERIFICATION AFTER CLEANUP");
  console.log("=======================================================");

  const remainingAppraisals = await appraisalsCol.find({
    $or: [
      { email: /@gmail\.com$/i },
      { facultyEmail: /@gmail\.com$/i }
    ]
  }).toArray();
  console.log(`Remaining @gmail.com appraisals: ${remainingAppraisals.length}`);
  for (const a of remainingAppraisals) {
    console.log(`  - [${a.timeline}] ${a.facultyName} (${a.email || a.facultyEmail})`);
  }

  const remainingSessions = await userSessionsCol.find({
    email: /@gmail\.com$/i
  }).toArray();
  console.log(`Remaining @gmail.com sessions: ${remainingSessions.length}`);
  for (const s of remainingSessions) {
    console.log(`  - ${s.email}`);
  }

  await mongoose.disconnect();
  console.log("\n✓ Cleanup finished and disconnected.");
}

runCleanup().catch(console.error);
