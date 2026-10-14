import 'dotenv/config';
import mongoose from 'mongoose';

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');
  const collection = mongoose.connection.collection('appraisals');
  
  // Search by email, name, or IT department
  const docs = await collection.find({
    $or: [
      { email: { $regex: 'gvait', $options: 'i' } },
      { facultyEmail: { $regex: 'gvait', $options: 'i' } },
      { facultyName: { $regex: 'Vennila', $options: 'i' } },
      { name: { $regex: 'Vennila', $options: 'i' } }
    ]
  }).toArray();

  console.log(`Found ${docs.length} matching appraisal(s)`);
  for (const doc of docs) {
    console.log({
      _id: doc._id,
      facultyName: doc.facultyName || doc.name,
      email: doc.email || doc.facultyEmail,
      department: doc.department,
      timeline: doc.timeline,
      appraisalStatus: doc.appraisalStatus,
      status: doc.status,
      isDraft: doc.isDraft,
      submittedAt: doc.submittedAt,
      sectionsCount: doc.sections ? Object.keys(doc.sections).length : 0,
      coursesHandledCount: doc.coursesHandled ? doc.coursesHandled.length : (doc.sections?.coursesHandled?.length || 0)
    });
  }

  await mongoose.disconnect();
}

run().catch(console.error);
