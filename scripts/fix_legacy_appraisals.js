import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

async function fix() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB.');

  const result = await mongoose.connection.db.collection('appraisals').updateMany(
    {
      $or: [
        { department: { $exists: false } },
        { department: null },
        { department: '' },
        { department: 'undefined' }
      ]
    },
    {
      $set: {
        department: 'CSE',
        departmentName: 'Computer Science and Engineering'
      }
    }
  );

  console.log('Updated legacy appraisal records:', result.modifiedCount);

  const all = await mongoose.connection.db.collection('appraisals').find({}).toArray();
  console.log(`Total appraisals in database: ${all.length}`);
  all.forEach((a, i) => {
    console.log(`[${i + 1}] Email: ${a.email} | Name: ${a.facultyName} | Dept: ${a.department} | Timeline: ${a.timeline} | Score: ${a.convertedScore} | Status: ${a.appraisalStatus}`);
  });

  process.exit(0);
}

fix().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
