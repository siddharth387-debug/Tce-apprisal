import 'dotenv/config';
import mongoose from 'mongoose';

async function revertVennilaToDraft() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');
  const collection = mongoose.connection.collection('appraisals');

  const id = new mongoose.Types.ObjectId('6ac35ed4c42ea8ebb1bc42ee');
  const docBefore = await collection.findOne({ _id: id });
  if (!docBefore) {
    console.error('Document not found!');
    await mongoose.disconnect();
    return;
  }

  console.log('Document BEFORE update:');
  console.log({
    _id: docBefore._id,
    facultyName: docBefore.facultyName,
    email: docBefore.email,
    timeline: docBefore.timeline,
    department: docBefore.department,
    appraisalStatus: docBefore.appraisalStatus,
    principalApprovalStatus: docBefore.principalApprovalStatus,
    iqacStatus: docBefore.iqacStatus,
    convertedScore: docBefore.convertedScore,
    hasSection1: Boolean(docBefore.section1Data),
    hasSection2: Boolean(docBefore.section2Data),
    hasSection3: Boolean(docBefore.section3Data)
  });

  const updateResult = await collection.updateOne(
    { _id: id },
    {
      $set: {
        appraisalStatus: 'Draft',
        isDraft: true,
        isLocked: false,
        principalApprovalStatus: 'Draft',
        iqacStatus: 'Draft',
        submittedAt: null,
        updatedAt: new Date()
      }
    }
  );

  console.log('Update result:', updateResult);

  const docAfter = await collection.findOne({ _id: id });
  console.log('Document AFTER update:');
  console.log({
    _id: docAfter._id,
    facultyName: docAfter.facultyName,
    email: docAfter.email,
    timeline: docAfter.timeline,
    department: docAfter.department,
    appraisalStatus: docAfter.appraisalStatus,
    isDraft: docAfter.isDraft,
    isLocked: docAfter.isLocked,
    principalApprovalStatus: docAfter.principalApprovalStatus,
    iqacStatus: docAfter.iqacStatus,
    submittedAt: docAfter.submittedAt,
    convertedScore: docAfter.convertedScore,
    hasSection1: Boolean(docAfter.section1Data),
    hasSection2: Boolean(docAfter.section2Data),
    hasSection3: Boolean(docAfter.section3Data)
  });

  await mongoose.disconnect();
  console.log('Disconnected from MongoDB. Reversion to Draft complete!');
}

revertVennilaToDraft().catch(console.error);
