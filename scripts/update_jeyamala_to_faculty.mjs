import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const mongoUri = process.env.MONGO_URI;
if (!mongoUri) {
  console.error('❌ No MONGO_URI configured in environment.');
  process.exit(1);
}

async function updateJeyamalaToFaculty() {
  try {
    console.log('⏳ Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✓ Connected to MongoDB cluster');

    const db = mongoose.connection.db;
    const facultyCol = db.collection('facultymembers');
    const appraisalsCol = db.collection('appraisals');

    console.log('\n--- 1. Updating facultymembers collection for Dr. C. Jeyamala ---');
    const facultyUpdateRes = await facultyCol.updateMany(
      {
        $or: [
          { email: 'jeyamala@tce.edu' },
          { personalEmail: 'jeyamala@tce.edu' },
          { alternateEmails: 'jeyamala@tce.edu' },
          { staffId: 'JEYAMALA' }
        ]
      },
      {
        $set: {
          role: 'Faculty',
          designation: 'Associate Professor',
          hodEmail: ''
        }
      }
    );
    console.log(`=> Matched: ${facultyUpdateRes.matchedCount}, Modified: ${facultyUpdateRes.modifiedCount}`);

    console.log('\n--- 2. Updating appraisals collection for Dr. C. Jeyamala ---');
    const appraisalUpdateRes = await appraisalsCol.updateMany(
      {
        $or: [
          { email: 'jeyamala@tce.edu' },
          { facultyEmail: 'jeyamala@tce.edu' }
        ]
      },
      {
        $set: {
          isHodSubmission: false,
          isDeanSubmission: false,
          designation: 'Associate Professor'
        }
      }
    );
    console.log(`=> Matched: ${appraisalUpdateRes.matchedCount}, Modified: ${appraisalUpdateRes.modifiedCount}`);

    console.log('\n✓ Dr. C. Jeyamala successfully updated to regular Faculty in MongoDB.');
  } catch (err) {
    console.error('❌ Error updating Dr. C. Jeyamala in MongoDB:', err.message);
  } finally {
    await mongoose.disconnect();
    console.log('✓ Disconnected from MongoDB');
  }
}

updateJeyamalaToFaculty();
