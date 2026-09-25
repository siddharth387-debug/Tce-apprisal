import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { OAuth2Client } from 'google-auth-library';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { computeEffectiveScores } from '../src/scoringEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 5000);
const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const jwtSecret = process.env.JWT_SECRET;
const mongoUri = process.env.MONGO_URI;
const timelines = ['2025-2026', '2026-2027', '2027-2028'];
const mentoringBatchOptions = [
  '2021 - 2025', '2022 - 2026', '2023 - 2027', '2024 - 2028', '2025 - 2029',
  '2023 - 2025', '2024 - 2026', '2025 - 2027', '2026 - 2028',
  '2020 - 2025', '2021 - 2026', '2022 - 2027', '2023 - 2028', '2024 - 2029', '2025 - 2030'
];
const semesterOptions = [
  'Semester I',
  'Semester II',
  'Semester III',
  'Semester IV',
  'Semester V',
  'Semester VI',
  'Semester VII',
  'Semester VIII',
  'Semester IX',
  'Semester X',
];
const courseCodeRegex = /^[A-Z0-9]{5,7}$/i;

if (!googleClientId) {
  throw new Error('Missing GOOGLE_CLIENT_ID in environment configuration.');
}

if (!jwtSecret || jwtSecret === 'replace-with-a-long-random-secret') {
  throw new Error(
    'Set JWT_SECRET in your environment before starting the backend server.'
  );
}

if (!mongoUri) {
  throw new Error('Missing MONGO_URI in environment configuration.');
}

// ── Global process crash monitors ────────────────────────────────────────────
process.on('unhandledRejection', (reason, promise) => {
  console.error('⚠️ Unhandled Promise Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception thrown:', err);
});

// ── MongoDB connection event listeners ───────────────────────────────────────
mongoose.connection.on('disconnected', () => {
  console.warn('⚠️ MongoDB connection lost. Attempting auto-reconnect...');
});

mongoose.connection.on('reconnected', () => {
  console.log('✓ MongoDB reconnected successfully to Atlas cluster!');
});

mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB runtime connection error:', err);
});


// ── Faculty Directory schema & model ─────────────────────────────────────────
const FacultyMemberSchema = new mongoose.Schema({
  staffId: { type: String, trim: true },
  name: { type: String, required: true, trim: true },
  designation: { type: String, default: 'Assistant Professor', trim: true },
  email: { type: String, required: true, lowercase: true, trim: true, unique: true, index: true },
  personalEmail: { type: String, lowercase: true, trim: true, default: '' },
  hodEmail: { type: String, lowercase: true, trim: true, default: '' },
  alternateEmails: [{ type: String, lowercase: true, trim: true }],
  department: { type: String, required: true, trim: true, index: true },
  departmentName: { type: String, trim: true },
  role: { type: String, enum: ['Faculty', 'HOD', 'Registrar', 'Principal', 'Admin'], default: 'Faculty', index: true },
  photo: { type: String, default: '' },
  profileUrl: { type: String, default: '' },
  joiningDate: { type: Date, default: () => new Date(Date.now() - 400 * 24 * 60 * 60 * 1000) },
  active: { type: Boolean, default: true }
}, { timestamps: true });

FacultyMemberSchema.index({ department: 1, role: 1 });
FacultyMemberSchema.index({ hodEmail: 1 });
FacultyMemberSchema.index({ personalEmail: 1 });
FacultyMemberSchema.index({ alternateEmails: 1 });

const FacultyMember = mongoose.model('FacultyMember', FacultyMemberSchema);

// ── Appraisal schema & model ─────────────────────────────────────────────────
const AppraisalSchema = new mongoose.Schema({
  timeline: { type: String, required: true },
  facultyName: { type: String, default: "Faculty Member" },
  designation: { type: String, default: 'Assistant Professor', trim: true },
  email: { type: String, required: true, lowercase: true, index: true },
  department: { type: String, default: 'MCA', index: true },
  departmentName: { type: String, default: 'Computer Applications' },
  convertedScore: { type: Number, default: 0 },
  systemScore: { type: Number, default: 0 },
  appraisalStatus: { type: String, default: 'Pending' },
  hodRemarks: { type: String, default: '' },
  subsectionRemarks: { type: Object, default: {} },
  hodSubsectionScores: { type: Object, default: {} },
  principalApprovalStatus: { type: String, default: 'Pending' },
  principalEndorsedAt: { type: Date, default: null },
  principalRemarks: { type: String, default: '' },
  iqacStatus: { type: String, default: 'Pending' },
  iqacExcluded: { type: Boolean, default: false },
  iqacAuditRemarks: { type: String, default: '' },
  iqacEvaluatedAt: { type: Date, default: null },
  isLocked: { type: Boolean, default: false },
  section1Data: {
    coursesHandled: { type: Array, default: [] },
    courseFiles: { type: Array, default: [] },
    coursesDesigned: { type: Array, default: [] },
    valueAdded: { type: Array, default: [] },
    innovativeMethods: { type: Array, default: [] },
    academicCollaborations: { type: Array, default: [] },
    mentoring: {
      menteeCount: { type: String, default: '' },
      batch: { type: String, default: '2024-28' },
      description: { type: String, default: '' },
      evidenceLink: { type: String, default: '' }
    },
    certifications: { type: Array, default: [] },
    studentFeedback: { type: Array, default: [] },
    resultAnalysis: { type: Array, default: [] },
    coAttainment: { type: Array, default: [] }
  },
  section2Data: {
    journalPapers: { type: Array, default: [] },
    citationsReceived: { totalCount: { type: String, default: '' } },
    q1Citations: { totalCount: { type: String, default: '' } },
    bookPublications: { type: Array, default: [] },
    conferencePapers: { type: Array, default: [] },
    researchCollaborations: { type: Array, default: [] },
    phdRegistered: { type: Array, default: [] },
    phdAwarded: { type: Array, default: [] }
  },
  section3Data: {
    patentsPublished: { type: Array, default: [] },
    patentsGranted: { type: Array, default: [] },
    transferOfTechnology: { type: Array, default: [] },
    prototypesDeveloped: { type: Array, default: [] },
    hackathonPrizes: { type: Array, default: [] }
  },
  section4Data: {
    researchProjects: { type: Array, default: [] },
    consultancyProjects: { type: Array, default: [] }
  },
  section5Data: {
    internationalEngagement: { type: Array, default: [] },
    visitingPositions: { type: Array, default: [] },
    foreignFaculty: { type: Array, default: [] },
    reputationSurvey: { type: Array, default: [] },
    nirfSurvey: { type: Array, default: [] }
  },
  section6Data: {
    fdpAttended: { type: Array, default: [] },
    programsOrganized: { type: Array, default: [] },
    resourcePerson: { type: Array, default: [] },
    professionalMembership: { type: Array, default: [] },
    editorialBoard: { type: Array, default: [] },
    moocDeveloped: { type: Array, default: [] }
  },
  section7Data: {
    partialDelivery: { type: Array, default: [] },
    industrialVisits: { type: Array, default: [] },
    facultyInternships: { type: Array, default: [] },
    employerEngagement: { type: Array, default: [] }
  },
  section8Data: {
    projectPublications: { type: Array, default: [] },
    hackathonMentoring: { type: Array, default: [] },
    startupSupport: { type: Array, default: [] }
  },
  section9Data: {
    deptActivities: { type: Array, default: [] },
    collegeActivities: { type: Array, default: [] },
    adminResponsibilities: { type: Array, default: [] }
  }
}, { timestamps: true });

// Prevent a faculty member from submitting twice for the same academic year.
AppraisalSchema.index({ email: 1, timeline: 1 }, { unique: true });

const Appraisal = mongoose.model('Appraisal', AppraisalSchema);

// Helper to seed faculty master directory from JSON file using high-performance bulkWrite
async function seedFacultyDirectory(force = false) {
  try {
    const existingCount = await FacultyMember.countDocuments();
    if (existingCount > 0 && !force) {
      console.log(`✓ Faculty master directory already populated (${existingCount} records).`);
      return existingCount;
    }

    const dataPath = path.join(__dirname, 'data', 'tce_faculty_directory.json');
    if (!fs.existsSync(dataPath)) {
      console.warn(`⚠️ Faculty directory JSON not found at ${dataPath}.`);
      return 0;
    }

    const rawData = fs.readFileSync(dataPath, 'utf-8');
    const facultyList = JSON.parse(rawData);

    const bulkOps = facultyList
      .filter(item => item.email && item.name)
      .map(item => ({
        updateOne: {
          filter: { email: item.email.toLowerCase().trim() },
          update: {
            $set: {
              staffId: item.staffId || '',
              name: item.name,
              designation: item.designation || 'Faculty',
              email: item.email.toLowerCase().trim(),
              personalEmail: item.personalEmail?.toLowerCase().trim() || item.email.toLowerCase().trim(),
              hodEmail: item.hodEmail ? item.hodEmail.toLowerCase().trim() : (item.role === 'HOD' ? `hod${(item.department || 'cse').toLowerCase()}@tce.edu` : ''),
              alternateEmails: item.alternateEmails || [item.email.toLowerCase().trim()],
              department: item.department || 'CSE',
              departmentName: item.departmentName || '',
              role: item.role || 'Faculty',
              photo: item.photo || '',
              profileUrl: item.profileUrl || '',
              active: true
            }
          },
          upsert: true
        }
      }));

    if (bulkOps.length > 0) {
      await FacultyMember.bulkWrite(bulkOps, { ordered: false });
    }
    await refreshDirectoryFiles();

    const totalNow = await FacultyMember.countDocuments();
    console.log(`✅ Faculty Master Directory Seeded: ${totalNow} records synchronized to MongoDB Atlas.`);
    return totalNow;
  } catch (err) {
    console.error('❌ Failed to seed faculty directory:', err.message);
    return 0;
  }
}

const googleClient = new OAuth2Client(googleClientId);

function isFilledString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isValidCourseCode(value) {
  return typeof value === 'string' && courseCodeRegex.test(value.trim());
}

function isValidEvidenceLink(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
}

function validateRows(rows, key, config) {
  if (!Array.isArray(rows)) {
    return [`${key} must be an array.`];
  }

  const errors = [];
  rows.forEach((row, index) => {
    const rowPath = `${key}[${index}]`;

    if (config.requiresCourseCode && !isValidCourseCode(row.courseCode)) {
      errors.push(`${rowPath}.courseCode is invalid.`);
    }

    config.requiredTextFields.forEach((field) => {
      if (!isFilledString(row[field])) {
        errors.push(`${rowPath}.${field} is required.`);
      }
    });

    config.selectFieldRules.forEach(({ field, allowedValues }) => {
      if (!allowedValues.includes(row[field])) {
        errors.push(`${rowPath}.${field} has an invalid selection.`);
      }
    });

    if (!isValidEvidenceLink(row.evidenceLink)) {
      errors.push(`${rowPath}.evidenceLink must start with http:// or https://.`);
    }
  });

  return errors;
}

function validateSectionOneData(section1Data) {
  if (!section1Data || typeof section1Data !== 'object') {
    return ['section1Data must be an object.'];
  }

  const errors = [
    ...validateRows(section1Data.coursesHandled, 'coursesHandled', {
      requiresCourseCode: true,
      requiredTextFields: ['courseName'],
      selectFieldRules: [
        { field: 'type', allowedValues: ['Theory', 'Lab', 'Integrated', 'Integrated/TCP'] },
        { field: 'semester', allowedValues: semesterOptions },
      ],
    }),
    ...validateRows(section1Data.courseFiles, 'courseFiles', {
      requiresCourseCode: true,
      requiredTextFields: ['courseName'],
      selectFieldRules: [
        { field: 'compliance', allowedValues: ['Full', 'Partial', 'No'] },
      ],
    }),
    ...validateRows(section1Data.coAttainment, 'coAttainment', {
      requiresCourseCode: true,
      requiredTextFields: ['courseName', 'attainmentPct'],
      selectFieldRules: [],
    }),
    ...validateRows(section1Data.coursesDesigned, 'coursesDesigned', {
      requiresCourseCode: true,
      requiredTextFields: ['courseName', 'remarks'],
      selectFieldRules: [],
    }),
    ...validateRows(section1Data.valueAdded, 'valueAdded', {
      requiresCourseCode: false,
      requiredTextFields: ['courseName', 'particulars', 'studentCount'],
      selectFieldRules: [],
    }),
    ...validateRows(section1Data.resultAnalysis, 'resultAnalysis', {
      requiresCourseCode: true,
      requiredTextFields: ['courseName', 'passPercentage'],
      selectFieldRules: [],
    }),
    ...validateRows(section1Data.innovativeMethods, 'innovativeMethods', {
      requiresCourseCode: true,
      requiredTextFields: ['method'],
      selectFieldRules: [],
    }),
    ...validateRows(section1Data.academicCollaborations, 'academicCollaborations', {
      requiresCourseCode: false,
      requiredTextFields: ['organization', 'collaborationType'],
      selectFieldRules: [],
    }),
    ...validateRows(section1Data.certifications, 'certifications', {
      requiresCourseCode: false,
      requiredTextFields: ['courseName', 'platform', 'certType'],
      selectFieldRules: [],
    }),
    ...validateRows(section1Data.studentFeedback, 'studentFeedback', {
      requiresCourseCode: true,
      requiredTextFields: ['feedbackPct'],
      selectFieldRules: [],
    }),
  ];

  if (!section1Data.mentoring || typeof section1Data.mentoring !== 'object') {
    errors.push('mentoring must be an object.');
  } else {
    const mentoringTouched =
      isFilledString(section1Data.mentoring.menteeCount) ||
      isFilledString(section1Data.mentoring.batch) ||
      isFilledString(section1Data.mentoring.description) ||
      isFilledString(section1Data.mentoring.evidenceLink);

    if (mentoringTouched) {
      if (!isFilledString(section1Data.mentoring.menteeCount)) {
        errors.push('mentoring.menteeCount is required.');
      }
      if (!mentoringBatchOptions.includes(section1Data.mentoring.batch)) {
        errors.push('mentoring.batch has an invalid selection.');
      }
      if (!isFilledString(section1Data.mentoring.description)) {
        errors.push('mentoring.description is required.');
      }
      if (!isValidEvidenceLink(section1Data.mentoring.evidenceLink)) {
        errors.push('mentoring.evidenceLink must start with http:// or https://.');
      }
    }
  }

  return errors;
}

const allowedOrigins = (process.env.FRONTEND_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      if (
        origin.endsWith('.vercel.app') || 
        origin.endsWith('.netlify.app') || 
        origin.endsWith('.tce.edu') || 
        origin.includes('localhost') || 
        origin.includes('127.0.0.1')
      ) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    credentials: true,
  })
);
app.use(express.json());

// ── JWT authentication middleware ────────────────────────────────────────────
function authenticateToken(request, response, next) {
  const authHeader = request.headers['authorization'];
  const token = (authHeader && authHeader.startsWith('Bearer '))
    ? authHeader.slice(7)
    : (request.query?.token || null);

  if (!token) {
    return response.status(401).json({ message: 'Authentication token is required.' });
  }

  try {
    request.user = jwt.verify(token, jwtSecret, { issuer: 'tce-auth-server' });
    next();
  } catch {
    return response.status(403).json({ message: 'Invalid or expired token.' });
  }
}

app.get('/api/health', (_request, response) => {
  response.status(200).json({ status: 'ok' });
});

// ── Department Mapping Helper ────────────────────────────────────────────────
const DEPARTMENT_NAME_MAP = {
  MCA: 'Computer Applications',
  CSE: 'Computer Science and Engineering',
  ECE: 'Electronics and Communication Engineering',
  EEE: 'Electrical and Electronics Engineering',
  MECH: 'Mechanical Engineering',
  CIVIL: 'Civil Engineering',
  IT: 'Information Technology',
  DS: 'Data Science',
  MATHS: 'Mathematics',
  PHYSICS: 'Physics',
  CHEMISTRY: 'Chemistry',
  HUMANITIES: 'Humanities & Social Sciences',
  ALL: 'All Academic Departments'
};

// ── Secure Enterprise ERP Webhook Endpoint ──────────────────────────────────
async function handleFacultyWebhook(req, res) {
  const secretHeader = req.headers['x-webhook-secret'] || req.headers['x-api-key'] || req.query.secret;
  const expectedSecret = process.env.WEBHOOK_SECRET || 'tce-appraisal-webhook-secret-2026';

  if (!secretHeader || secretHeader !== expectedSecret) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized: Invalid or missing webhook security token.'
    });
  }

  try {
    const {
      staffId,
      name,
      email,
      personalEmail,
      hodEmail,
      alternateEmails = [],
      department,
      departmentName,
      role = 'Faculty',
      designation = 'Faculty',
      joiningDate,
      active = true
    } = req.body ?? {};

    if (!email || !department) {
      return res.status(400).json({
        success: false,
        message: 'Missing required webhook fields: email and department are mandatory.'
      });
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanDept = department.toUpperCase().trim();
    const cleanDeptName = departmentName || DEPARTMENT_NAME_MAP[cleanDept] || `${cleanDept} Department`;
    const cleanRole = ['Faculty', 'HOD', 'Registrar', 'Principal', 'Admin'].includes(role) ? role : 'Faculty';

    let userAliases = Array.isArray(alternateEmails) ? alternateEmails.map(e => e.toLowerCase().trim()) : [];
    if (!userAliases.includes(cleanEmail)) userAliases.push(cleanEmail);
    if (personalEmail && !userAliases.includes(personalEmail.toLowerCase().trim())) userAliases.push(personalEmail.toLowerCase().trim());
    if (hodEmail && !userAliases.includes(hodEmail.toLowerCase().trim())) userAliases.push(hodEmail.toLowerCase().trim());

    // Find existing faculty member by any email alias or staffId
    let facultyRecord = await FacultyMember.findOne({
      $or: [
        { email: cleanEmail },
        { personalEmail: cleanEmail },
        { hodEmail: cleanEmail },
        { alternateEmails: cleanEmail },
        ...(staffId ? [{ staffId }] : [])
      ]
    });

    const updateFields = {
      name: name || facultyRecord?.name || 'Faculty Member',
      department: cleanDept,
      departmentName: cleanDeptName,
      role: cleanRole,
      designation,
      active: Boolean(active),
      alternateEmails: userAliases
    };

    if (staffId) updateFields.staffId = staffId;
    if (personalEmail) updateFields.personalEmail = personalEmail.toLowerCase().trim();
    if (hodEmail) updateFields.hodEmail = hodEmail.toLowerCase().trim();
    if (joiningDate) updateFields.joiningDate = new Date(joiningDate);

    if (facultyRecord) {
      Object.assign(facultyRecord, updateFields);
      await facultyRecord.save();
    } else {
      facultyRecord = await FacultyMember.create({
        email: cleanEmail,
        ...updateFields
      });
    }

    // Align active/pending appraisal records to the updated department
    const appraisalUpdateResult = await Appraisal.updateMany(
      {
        $or: [
          { email: cleanEmail },
          { facultyEmail: cleanEmail },
          { email: { $in: userAliases } }
        ]
      },
      {
        $set: {
          department: cleanDept,
          departmentName: cleanDeptName
        }
      }
    );

    return res.status(200).json({
      success: true,
      message: `Faculty record for ${facultyRecord.name} (${cleanEmail}) aligned to department ${cleanDept} successfully.`,
      faculty: facultyRecord,
      appraisalsUpdated: appraisalUpdateResult.modifiedCount
    });
  } catch (err) {
    console.error('❌ Webhook Processing Error:', err);
    return res.status(500).json({
      success: false,
      message: 'Internal server error processing webhook payload.',
      error: err.message
    });
  }
}

app.post('/api/v1/faculty/webhook', handleFacultyWebhook);
app.post('/api/directory/webhook', handleFacultyWebhook);


app.post('/api/auth/google', async (request, response) => {
  const { credential } = request.body ?? {};

  if (!credential || typeof credential !== 'string') {
    return response.status(400).json({
      message: 'Google credential token is required.',
    });
  }

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: googleClientId,
    });

    const payload = ticket.getPayload();

    if (!payload) {
      return response.status(401).json({
        message: 'Unable to read the Google account payload.',
      });
    }

    if (!payload.email || !payload.sub) {
      return response.status(401).json({
        message: 'The Google account payload is missing required fields.',
      });
    }

    if (!payload.email_verified) {
      return response.status(403).json({
        message: 'Only verified Google accounts can sign in.',
      });
    }

    const verifiedEmail = payload.email.toLowerCase().trim();

    // Look up in master faculty directory (matches personal email, HoD departmental email, or aliases)
    let facultyRecord = await FacultyMember.findOne({
      $or: [
        { email: verifiedEmail },
        { personalEmail: verifiedEmail },
        { hodEmail: verifiedEmail },
        { alternateEmails: verifiedEmail }
      ]
    });

    // Determine Role, Department & Designation (Dynamic lookup by email entry)
    const isGmailLogin = verifiedEmail.endsWith('@gmail.com');
    let assignedRole = 'Faculty';
    let assignedDept = isGmailLogin ? 'MCA' : 'CSE';
    let assignedDeptName = isGmailLogin ? 'Computer Applications' : 'Computer Science and Engineering';
    let assignedDesignation = 'Assistant Professor';

    if (verifiedEmail === 'registrar@tce.edu' || verifiedEmail === 'siddharthk@student.tce.edu') {
      assignedRole = 'Registrar';
      assignedDept = 'ALL';
      assignedDeptName = 'All Academic Departments';
      assignedDesignation = 'Registrar';
    } else if (verifiedEmail === 'principal@tce.edu') {
      assignedRole = 'Principal';
      assignedDept = 'ALL';
      assignedDeptName = 'All Academic Departments';
      assignedDesignation = 'Principal';
    } else if (verifiedEmail === 'iqac@tce.edu' || verifiedEmail.includes('iqac')) {
      assignedRole = 'IQAC';
      assignedDept = 'ALL';
      assignedDeptName = 'All Academic Departments';
      assignedDesignation = 'IQAC Quality Coordinator';
    } else if (facultyRecord) {
      assignedRole = facultyRecord.role || 'Faculty';
      assignedDept = (assignedRole === 'IQAC' || assignedRole === 'Registrar' || assignedRole === 'Principal') ? 'ALL' : (isGmailLogin ? 'MCA' : (facultyRecord.department || 'CSE'));
      assignedDeptName = (assignedRole === 'IQAC' || assignedRole === 'Registrar' || assignedRole === 'Principal') ? 'All Academic Departments' : (isGmailLogin ? 'Computer Applications' : (facultyRecord.departmentName || ''));
      assignedDesignation = facultyRecord.designation || (assignedRole === 'HOD' ? 'Professor & Head (HOD)' : assignedRole === 'IQAC' ? 'IQAC Quality Coordinator' : 'Assistant Professor');
    } else if (verifiedEmail.startsWith('hod') || verifiedEmail.includes('hod')) {
      assignedRole = 'HOD';
      assignedDesignation = 'Professor & Head (HOD)';
      const hodMatch = verifiedEmail.match(/hod([a-z]+)/i);
      if (hodMatch && hodMatch[1]) {
        assignedDept = hodMatch[1].toUpperCase();
      }
    }

    const canonicalPersonalEmail = facultyRecord?.personalEmail || facultyRecord?.email || verifiedEmail;
    const canonicalHodEmail = facultyRecord?.hodEmail || (assignedRole === 'HOD' ? `hod${assignedDept.toLowerCase()}@tce.edu` : '');
    const userAliases = facultyRecord?.alternateEmails || [verifiedEmail];
    if (!userAliases.includes(verifiedEmail)) userAliases.push(verifiedEmail);
    if (canonicalPersonalEmail && !userAliases.includes(canonicalPersonalEmail)) userAliases.push(canonicalPersonalEmail);
    if (canonicalHodEmail && !userAliases.includes(canonicalHodEmail)) userAliases.push(canonicalHodEmail);

    // Calculate 1-Year Service Eligibility (365 Days) — Controlled by feature flag ENABLE_PROBATION_GATE
    const enableProbationGate = process.env.ENABLE_PROBATION_GATE === 'true';
    const rawDOJ = facultyRecord?.joiningDate || new Date(Date.now() - 400 * 24 * 60 * 60 * 1000);
    const dojDate = new Date(rawDOJ);
    const now = new Date();
    const serviceMs = Math.max(0, now - dojDate);
    const serviceDays = Math.floor(serviceMs / (1000 * 60 * 60 * 24));
    const monthsOfService = Math.floor(serviceDays / 30.44);
    const isEligibleForAppraisal = enableProbationGate ? (serviceDays >= 365) : true;

    const unlockDateObj = new Date(dojDate);
    unlockDateObj.setFullYear(unlockDateObj.getFullYear() + 1);
    const formattedUnlockDate = unlockDateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const formattedDOJ = dojDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

    const userPayload = {
      sub: payload.sub,
      email: verifiedEmail,
      personalEmail: canonicalPersonalEmail,
      hodEmail: canonicalHodEmail,
      alternateEmails: userAliases,
      name: facultyRecord ? facultyRecord.name : payload.name,
      picture: payload.picture,
      role: assignedRole,
      department: assignedDept,
      departmentName: assignedDeptName,
      designation: assignedDesignation,
      joiningDate: formattedDOJ,
      serviceDays,
      monthsOfService,
      isEligibleForAppraisal,
      unlockDate: formattedUnlockDate
    };

    const token = jwt.sign(
      userPayload,
      jwtSecret,
      {
        expiresIn: '7d',
        issuer: 'tce-auth-server',
      }
    );

    return response.status(200).json({
      token,
      user: {
        id: payload.sub,
        ...userPayload
      },
    });
  } catch (error) {
    console.error('Google authentication failed:', error);

    return response.status(401).json({
      message: 'Google authentication failed. Please try again.',
    });
  }
});

app.post('/api/appraisals', authenticateToken, async (req, res) => {
  // ── 1. Diagnostic payload inspection ──────────────────────────────────────
  console.log('📥 INCOMING NETWORK DATA PACKET RECEIVED FOR VALIDATION:');
  console.log('Faculty Identifier Email:', req.body?.email ?? '(not in body — will use JWT identity)');
  console.log('JWT-Verified Email:', req.user?.email);
  console.log('Academic Timeline Selected:', req.body?.timeline);
  console.log('Payload Section 1 Sub-Keys:',
    req.body?.section1Data ? Object.keys(req.body.section1Data) : 'Missing completely');

  try {
    const { timeline, facultyName, convertedScore, department, departmentName, section1Data, section2Data, section3Data, section4Data, section5Data, section6Data, section7Data, section8Data, section9Data } = req.body ?? {};

    // Always use the JWT-verified identity as the authoritative email — never trust
    // the client-supplied body field to prevent email spoofing.
    const verifiedEmail = req.user.email.toLowerCase().trim();

    if (!timeline || typeof timeline !== 'string' || !timelines.includes(timeline.trim())) {
      console.log('❌ REJECTED: Timeline missing or invalid:', timeline);
      return res.status(400).json({ success: false, message: 'Email and Timeline fields are strictly required.' });
    }

    if (!section1Data || typeof section1Data !== 'object') {
      console.log('❌ REJECTED: section1Data missing or not an object.');
      return res.status(400).json({ success: false, message: 'section1Data is required and must be an object.' });
    }

    // Resolve authoritative department from master directory (or fallback to body / JWT)
    const facultyRecord = await FacultyMember.findOne({
      $or: [
        { email: verifiedEmail },
        { personalEmail: verifiedEmail },
        { hodEmail: verifiedEmail },
        { alternateEmails: verifiedEmail }
      ]
    });
    const canonicalEmail = facultyRecord?.personalEmail || facultyRecord?.email || req.user?.personalEmail || verifiedEmail;
    const targetDept = facultyRecord?.department || department || req.user?.department || 'CSE';
    const targetDeptName = facultyRecord?.departmentName || departmentName || req.user?.departmentName || 'Computer Science and Engineering';

    const targetedFilter = { email: canonicalEmail, timeline: timeline.trim() };
    const existingDoc = await Appraisal.findOne(targetedFilter);

    // ── 2. Atomic upsert — overwrites historical entries instead of crashing on E11000 ──
    const replacementPayload = {
      timeline: timeline.trim(),
      facultyName: facultyName || facultyRecord?.name || req.user.name || 'Faculty Member',
      designation: facultyRecord?.designation || req.user?.designation || (req.user?.role === 'HOD' ? 'Professor & Head (HOD)' : 'Assistant Professor'),
      email: canonicalEmail,
      department: targetDept,
      departmentName: targetDeptName,
      convertedScore: Number(convertedScore) || 0,
      systemScore: Number(convertedScore) || 0,
      hodSubsectionScores: req.body?.hodSubsectionScores || {},
      subsectionRemarks: req.body?.subsectionRemarks || {},
      section1Data: section1Data,
      section2Data: section2Data || {},
      section3Data: section3Data || {},
      section4Data: section4Data || {},
      section5Data: section5Data || {},
      section6Data: section6Data || {},
      section7Data: section7Data || {},
      section8Data: section8Data || {},
      section9Data: section9Data || {},
      iqacStatus: existingDoc?.iqacStatus || 'Pending',
      iqacAuditRemarks: existingDoc?.iqacAuditRemarks || '',
      iqacExcluded: Boolean(existingDoc?.iqacExcluded),
      iqacEvaluatedAt: existingDoc?.iqacEvaluatedAt || null,
      principalApprovalStatus: existingDoc?.principalApprovalStatus || 'Pending',
      principalRemarks: existingDoc?.principalRemarks || '',
      principalEndorsedAt: existingDoc?.principalEndorsedAt || null,
      appraisalStatus: existingDoc?.iqacStatus === 'IQAC Approved' ? 'IQAC Approved' : (existingDoc?.appraisalStatus || 'Pending'),
    };

    const options = { upsert: true, new: true, runValidators: false, setDefaultsOnInsert: true };

    console.log('💾 Executing atomic Mongoose findOneAndReplace query tracking filter criteria...');
    const finalizedDocument = await Appraisal.findOneAndReplace(targetedFilter, replacementPayload, options);

    console.log('✅ DATABASE SAVE TRANSACTION SECURED FOR:',
      finalizedDocument.email, '[Timeline:', finalizedDocument.timeline, '| Dept:', finalizedDocument.department, ']');
    return res.status(201).json({
      success: true,
      message: 'Appraisal synchronized cleanly to cloud cluster.',
      data: finalizedDocument,
    });

  } catch (mongooseCrashError) {
    // ── 3. Expose exact schema mismatch in the VS Code terminal window ────────
    console.error('=================== ❌ CRITICAL DATABASE TRANSACTION DROPPED ===================');
    console.error('Mongoose Exception Error Name:', mongooseCrashError.name);
    console.error('Error Message String Node:', mongooseCrashError.message);

    if (mongooseCrashError.errors) {
      console.error('--- 🔎 DETAILED SCHEMA VALIDATION BREAKDOWNPOINTS ---');
      Object.keys(mongooseCrashError.errors).forEach((fieldKey) => {
        const e = mongooseCrashError.errors[fieldKey];
        console.error(`📍 Field Target: [${fieldKey}] | Issue Type: [${e.kind}] | Reason: ${e.message}`);
      });
      console.error('-----------------------------------------------------');
    }
    console.error('=========================================================================');

    return res.status(500).json({
      success: false,
      message: `Database validation rejected: ${mongooseCrashError.message}. Check your running terminal window for details.`,
    });
  }
});

// ── Role-Based Dynamic ExcelJS Export Engine Endpoint ────────────────────────
app.get('/api/appraisals/:id/export', authenticateToken, async (req, res) => {
  try {
    const appraisalId = req.params.id;
    const appraisal = await Appraisal.findById(appraisalId);

    if (!appraisal) {
      return res.status(404).json({ message: 'Appraisal record not found in database.' });
    }

    // Extract userRole context (supports token role, or role override for HOD/Principal review mode)
    const userRole = (req.query.role || req.user?.role || 'Faculty').trim();
    const facultyName = appraisal.facultyName || appraisal.name || 'Faculty Member';
    const timeline = appraisal.timeline || '2024-2025';
    const sectionData = appraisal.sectionData || appraisal;
    const hodScores = appraisal.hodSubsectionScores || {};

    // Compute scores using the shared scoring engine
    const effectiveScoreObj = computeEffectiveScores(sectionData, hodScores);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'TCE Appraisal System';
    workbook.created = new Date();

    const isPrincipalOrAdmin = userRole === 'Principal' || userRole === 'Admin';
    const isHod = userRole === 'HOD';

    // ─────────────────────────────────────────────────────────────────────────
    // TAB 1: SUMMARY REPORT (Printable & Role-Adapted Layout)
    // ─────────────────────────────────────────────────────────────────────────
    const wsSummary = workbook.addWorksheet('Appraisal Summary', {
      pageSetup: {
        paperSize: 9, // A4
        orientation: 'portrait',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 1, // Rule 3: Prevents spillage onto a 2nd page on portrait printing
        margins: { left: 0.4, right: 0.4, top: 0.4, bottom: 0.4 }
      }
    });

    wsSummary.getColumn(1).width = 25; // A (Labels)
    wsSummary.getColumn(2).width = 45; // B (Domain / Values)
    wsSummary.getColumn(3).width = 22; // C (Max Marks / Signatures)
    wsSummary.getColumn(4).width = 25; // D (Evaluated Score / Signatures)

    // Header Title
    wsSummary.mergeCells('A1:D1');
    const title1 = wsSummary.getCell('A1');
    title1.value = 'THIAGARAJAR COLLEGE OF ENGINEERING, MADURAI - 625 015';
    title1.font = { bold: true, size: 13 };
    title1.alignment = { horizontal: 'center' };

    wsSummary.mergeCells('A2:D2');
    const title2 = wsSummary.getCell('A2');
    title2.value = `FACULTY PERFORMANCE APPRAISAL SYSTEM - SUMMARY REPORT (${userRole.toUpperCase()} VIEW)`;
    title2.font = { bold: true, size: 11, color: { argb: 'FF800000' } }; // Maroon
    title2.alignment = { horizontal: 'center' };

    wsSummary.addRow([]); // Blank

    // Rule 1 & 2: Metadata Block with Live Status
    const liveStatus = appraisal.appraisalStatus || 'Pending';
    wsSummary.addRow(['Faculty Name:', facultyName, 'Academic Year:', timeline]);
    wsSummary.addRow(['Email Address:', appraisal.email || appraisal.facultyEmail || '—', 'Date Generated:', new Date().toLocaleDateString('en-GB')]);
    wsSummary.addRow(['Designation:', appraisal.designation || 'Faculty', 'Status:', liveStatus]);
    wsSummary.addRow(['Grand Total Score:', `${effectiveScoreObj.grandTotal} / 200 Marks`, 'Percentage:', `${((effectiveScoreObj.grandTotal / 200) * 100).toFixed(1)}%`]);

    [4, 5, 6, 7].forEach(r => {
      wsSummary.getCell(`A${r}`).font = { bold: true, color: { argb: 'FF475569' } };
      wsSummary.getCell(`C${r}`).font = { bold: true, color: { argb: 'FF475569' } };
    });

    wsSummary.addRow([]); // Blank

    // Matrix Header
    const matrixTitleRow = wsSummary.addRow(['EXECUTIVE SCORE SUMMARY MATRIX' + (effectiveScoreObj.hasAdjustments ? ' (Includes HoD Evaluated Marks)' : '')]);
    wsSummary.mergeCells('A9:D9');
    matrixTitleRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    matrixTitleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF800000' } };
    matrixTitleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };

    const headerRow = wsSummary.addRow(['Section', 'Assessment Domain', 'Maximum Marks', 'Evaluated Score']);
    headerRow.font = { bold: true };
    headerRow.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' } };
    });

    const addSummaryRow = (sec, domain, max, score) => {
      const r = wsSummary.addRow([sec, domain, max, score]);
      r.getCell(3).alignment = { horizontal: 'center' };
      r.getCell(4).alignment = { horizontal: 'center' };
      return r;
    };

    addSummaryRow('Section I', 'Teaching & Learning', 50, effectiveScoreObj.section1Total);
    addSummaryRow('Section II', 'Research Publications', 55, effectiveScoreObj.section2Total);
    addSummaryRow('Section III', 'Patents & Innovation', 15, effectiveScoreObj.section3Total);
    addSummaryRow('Section IV', 'Sponsored Research & Consultancy', 15, effectiveScoreObj.section4Total);
    addSummaryRow('Section V', 'International Engagement & Rankings', 10, effectiveScoreObj.section5Total);
    addSummaryRow('Section VI', 'Faculty Development & Professional Activities', 20, effectiveScoreObj.section6Total);
    addSummaryRow('Section VII', 'Industry Interaction & Internship', 10, effectiveScoreObj.section7Total);
    addSummaryRow('Section VIII', 'Student Development Activities', 5, effectiveScoreObj.section8Total);
    addSummaryRow('Section IX', 'Institutional Development', 20, effectiveScoreObj.section9Total);

    const totalRow = addSummaryRow('TOTAL SCORE', 'Cumulative Score (Sections I - IX)', 200, effectiveScoreObj.grandTotal);
    totalRow.font = { bold: true };
    totalRow.eachCell(c => {
      c.border = { top: { style: 'thin' }, bottom: { style: 'double' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFBEB' } };
    });

    wsSummary.addRow([]);

    // Rule 2: Populate HoD Remarks text box directly from database evaluation collection data
    const remarkTitle = wsSummary.addRow(['Head of Department (HoD) Remarks:']);
    remarkTitle.getCell(1).font = { bold: true };

    const hodRemarksText = (isHod || isPrincipalOrAdmin)
      ? (appraisal.hodRemarks || 'Evaluation verified. No additional remarks.')
      : (appraisal.hodRemarks || '— (Pending HoD Review)');

    const remarkValue = wsSummary.addRow([hodRemarksText]);
    wsSummary.mergeCells(`A${remarkValue.number}:D${remarkValue.number}`);
    remarkValue.getCell(1).alignment = { wrapText: true, vertical: 'top' };

    wsSummary.addRow([]);

    // ── Signature Blocks Logic ────────────────────────────────────────────────
    const sigRow1 = wsSummary.addRow(['Faculty Member Signature', '', 'Head of Department Signature', '']);
    sigRow1.getCell(1).font = { bold: true };
    sigRow1.getCell(3).font = { bold: true };

    // Rule 1: Blank for Faculty
    let hodSigDateText = 'Date: ______________________';
    let hodSigNameText = 'Name: ______________________';

    // Rule 2: IF HoD, Principal or Admin, append automatic uneditable timestamp/verification date
    if (isHod || isPrincipalOrAdmin) {
      const verifiedDate = appraisal.updatedAt || appraisal.submittedAt ? new Date(appraisal.updatedAt || appraisal.submittedAt).toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB');
      hodSigDateText = `Verified Date: ${verifiedDate}`;
      hodSigNameText = `Status: Verified by HoD (${liveStatus})`;
    }

    wsSummary.addRow(['Name: ______________________', '', hodSigNameText, '']);
    wsSummary.addRow(['Date: ______________________', '', hodSigDateText, '']);

    // Rule 3: IF Principal or Admin, add 3rd Signature Pad block spanning C & D
    if (isPrincipalOrAdmin) {
      wsSummary.addRow([]);
      const princTitleRow = wsSummary.addRow(['', '', 'Principal / Institutional Approval Signature', '']);
      princTitleRow.getCell(3).font = { bold: true, color: { argb: 'FF800000' } };
      
      const princStatus = (appraisal.principalApprovalStatus || 'RATIFIED').toUpperCase();
      const endAt = appraisal.principalEndorsedAt ? new Date(appraisal.principalEndorsedAt).toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB');

      wsSummary.addRow(['', '', `Endorsement: ${princStatus}`, '']);
      wsSummary.addRow(['', '', `Date: ${endAt}`, '']);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TAB 2: RAW DATA EXPORT (Database Format)
    // ─────────────────────────────────────────────────────────────────────────
    const wsData = workbook.addWorksheet('Raw Data Export');
    wsData.views = [{ state: 'frozen', ySplit: 1 }];

    const dataHeaders = [
      'Category', 'Sub-Category', 'Detail 1', 'Detail 2', 'Detail 3', 'Detail 4', 'Detail 5', 'Evidence Link'
    ];
    wsData.columns = dataHeaders.map(h => ({ header: h, key: h, width: 25 }));
    const rawDataHeaderRow = wsData.getRow(1);
    rawDataHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    rawDataHeaderRow.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
    });

    const pushFlatRows = (category, subCategory, dataArray, keys) => {
      if (!dataArray || !Array.isArray(dataArray)) return;
      dataArray.forEach(item => {
        const row = [category, subCategory];
        keys.forEach(key => {
          row.push(item[key] || '');
        });
        while (row.length < 7) row.push('');
        row.push(item.evidenceLink || '');
        wsData.addRow(row);
      });
    };

    const sd = sectionData;
    pushFlatRows('Teaching', '1.1 Courses Handled', sd.coursesHandled, ['courseCode', 'courseName', 'type', 'semester']);
    pushFlatRows('Teaching', '1.2 Course File', sd.courseFiles, ['courseCode', 'courseName', 'compliance']);
    pushFlatRows('Teaching', '1.3 Course Design', sd.coursesDesigned, ['courseCode', 'courseName', 'remarks']);
    pushFlatRows('Teaching', '1.4 Value-Added', sd.valueAdded, ['courseName', 'particulars', 'studentCount']);
    pushFlatRows('Teaching', '1.5 Innovative Methods', sd.innovativeMethods, ['courseCode', 'method']);
    pushFlatRows('Teaching', '1.8 Certifications', sd.certifications, ['courseName', 'platform', 'certType']);
    pushFlatRows('Teaching', '1.9 Student Feedback', sd.studentFeedback, ['courseCode', 'feedbackPct']);
    pushFlatRows('Teaching', '1.10 Result Analysis', sd.resultAnalysis, ['courseCode', 'courseName', 'passPercentage']);
    pushFlatRows('Teaching', '1.11 CO Attainment', sd.coAttainment, ['courseCode', 'courseName', 'attainmentPct']);

    pushFlatRows('Research', '2.1 Journal Papers', sd.journalPapers, ['paperTitle', 'journalName', 'tier']);
    pushFlatRows('Research', '2.4 Books', sd.bookPublications, ['title', 'type']);
    pushFlatRows('Research', '2.5 Conferences', sd.conferencePapers, ['paperTitle', 'proceedingName']);
    pushFlatRows('Research', '3.1 Patents Pub', sd.patentsPublished, ['appNumber', 'title', 'inventors', 'datePublished']);
    pushFlatRows('Research', '3.2 Patents Grant', sd.patentsGranted, ['refNumber', 'title', 'inventors', 'dateGranted']);
    pushFlatRows('Research', '4.1 Sponsored Proj', sd.researchProjects, ['projectName', 'fundingAgency', 'amount', 'role', 'status']);
    pushFlatRows('Research', '4.2 Consultancy', sd.consultancyProjects, ['title', 'clientDetails', 'amount', 'facultyInvolved']);

    wsData.autoFilter = { from: 'A1', to: `H${wsData.rowCount}` };

    // ─────────────────────────────────────────────────────────────────────────
    // STREAM WORKBOOK DIRECTLY TO EXPRESS RESPONSE
    // ─────────────────────────────────────────────────────────────────────────
    const cleanName = facultyName.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `TCE_Appraisal_${cleanName}_${timeline}_${userRole.toUpperCase()}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();

  } catch (error) {
    console.error('Error generating role-based Excel export:', error);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Failed to generate Excel export.', error: error.message });
    }
  }
});

// ── Read appraisals (Registrar, HOD & Faculty dashboards) ────────────────────
app.get(['/api/appraisals', '/appraisals'], async (req, res) => {
  try {
    let requestEmail = (req.query.email || req.user?.email || "").toLowerCase().trim();
    const requestRole = (req.query.role || "").toUpperCase().trim();
    
    // Check if token was supplied in header
    let tokenRole = '';
    let tokenDept = '';
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const decoded = jwt.verify(authHeader.split(' ')[1], jwtSecret);
        if (decoded?.role) tokenRole = decoded.role.toUpperCase();
        if (decoded?.department) tokenDept = decoded.department.toUpperCase();
        if (decoded?.email && !requestEmail) requestEmail = decoded.email.toLowerCase().trim();
      } catch (e) {
        // ignore token verify in optional read
      }
    }

    // Also check FacultyMember master directory if requestEmail belongs to an active HOD
    let masterRecord = null;
    if (requestEmail) {
      masterRecord = await FacultyMember.findOne({
        $or: [
          { email: requestEmail },
          { personalEmail: requestEmail },
          { hodEmail: requestEmail },
          { alternateEmails: requestEmail }
        ]
      });
    }

    // Dynamic Role Check: If user is HOD, Registrar, Principal, IQAC, or Admin, retrieve departmental/campus queue
    const isElevated = requestRole === 'HOD' || 
                  requestRole === 'REGISTRAR' ||
                  requestRole === 'PRINCIPAL' ||
                  requestRole === 'IQAC' ||
                  requestRole === 'ADMIN' ||
                  tokenRole === 'HOD' ||
                  tokenRole === 'REGISTRAR' ||
                  tokenRole === 'PRINCIPAL' ||
                  tokenRole === 'IQAC' ||
                  tokenRole === 'ADMIN' ||
                  masterRecord?.role === 'HOD' ||
                  masterRecord?.role === 'Registrar' ||
                  masterRecord?.role === 'Principal' ||
                  masterRecord?.role === 'IQAC' ||
                  masterRecord?.role === 'Admin' ||
                  requestEmail === 'siddharthk@student.tce.edu' || 
                  requestEmail === 'registrar@tce.edu' ||
                  requestEmail === 'principal@tce.edu' ||
                  requestEmail === 'iqac@tce.edu' ||
                  requestEmail.includes('iqac') ||
                  requestEmail.startsWith('hod') ||
                  requestEmail.includes('hod');

    let queryFilter = {};

    if (isElevated) {
      // Determine department scoping
      const deptQuery = (req.query.department || '').toUpperCase().trim();
      const userDept = (tokenDept || masterRecord?.department || '').toUpperCase().trim();
      const isSuperAdminOrRegistrar = requestEmail === 'siddharthk@student.tce.edu' ||
                                     requestEmail === 'registrar@tce.edu' ||
                                     requestEmail === 'principal@tce.edu' ||
                                     requestEmail === 'iqac@tce.edu' ||
                                     requestEmail.includes('iqac') ||
                                     requestRole === 'REGISTRAR' ||
                                     requestRole === 'PRINCIPAL' ||
                                     requestRole === 'IQAC' ||
                                     tokenRole === 'REGISTRAR' ||
                                     tokenRole === 'PRINCIPAL' ||
                                     tokenRole === 'IQAC';

      if (deptQuery === 'ALL' || (!deptQuery && isSuperAdminOrRegistrar)) {
        console.log("🏛️ Registrar/Broad Access: Fetching across all 16 departments.");
        queryFilter = {};
      } else {
        const targetDept = deptQuery || userDept;
        if (targetDept && targetDept !== 'ALL') {
          console.log(`🏢 Scoped Access: Fetching submissions for department [${targetDept}]`);
          queryFilter = {
            $or: [
              { department: targetDept },
              { department: { $exists: false } },
              { department: null },
              { department: '' }
            ]
          };
        } else {
          queryFilter = {};
        }
      }
    } else {
      console.log(`🔎 Faculty Authentication matched: Restricting search queries to aliases for: ${requestEmail}`);
      const allAliases = [
        requestEmail,
        masterRecord?.email,
        masterRecord?.personalEmail,
        masterRecord?.hodEmail,
        ...(masterRecord?.alternateEmails || [])
      ].filter(Boolean).map(e => e.toLowerCase().trim());

      queryFilter = {
        $or: [
          { email: { $in: allAliases } },
          { facultyEmail: { $in: allAliases } }
        ]
      };
    }

    const rawRecords = await Appraisal.find(queryFilter).sort({ updatedAt: -1, createdAt: -1 });
    const seenMap = new Map();
    const records = [];
    for (const doc of rawRecords) {
      const emailKey = (doc.email || doc.facultyEmail || '').toLowerCase().trim();
      const tlKey = (doc.timeline || '').trim();
      const compositeKey = `${emailKey}_${tlKey}`;
      if (emailKey && !seenMap.has(compositeKey)) {
        seenMap.set(compositeKey, true);
        records.push(doc);
      }
    }
    console.log(`✅ Database retrieval sync complete. Total rows returned: ${records.length} (deduplicated from ${rawRecords.length} raw docs) for filter:`, JSON.stringify(queryFilter));
    return res.status(200).json({ success: true, count: records.length, data: records });

  } catch (error) {
    console.error("❌ CRITICAL BACKEND FETCH ERROR:", error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ── Master Directory Endpoints ───────────────────────────────────────────────

// 1. Get all departments with HOD & counts
app.get('/api/directory/departments', async (req, res) => {
  try {
    const departments = await FacultyMember.aggregate([
      { $match: { active: true } },
      {
        $group: {
          _id: '$department',
          departmentName: { $first: '$departmentName' },
          totalFaculty: { $sum: 1 },
          hod: {
            $push: {
              $cond: [
                { $eq: ['$role', 'HOD'] },
                { name: '$name', email: '$email', designation: '$designation', photo: '$photo' },
                '$$REMOVE'
              ]
            }
          }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    return res.status(200).json({
      success: true,
      data: departments.map(d => ({
        code: d._id,
        name: d.departmentName || d._id,
        facultyCount: d.totalFaculty,
        hod: d.hod && d.hod.length > 0 ? d.hod[0] : null
      }))
    });
  } catch (err) {
    console.error('❌ Failed to fetch departments:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// 2. Query faculty members by department or search term
app.get('/api/directory/faculty', async (req, res) => {
  try {
    const { department, role, q } = req.query;
    const filter = { active: true };

    if (department && department !== 'ALL') {
      filter.department = department.toUpperCase().trim();
    }
    if (role) {
      filter.role = role.trim();
    }
    if (q) {
      const searchRegex = new RegExp(q.trim(), 'i');
      filter.$or = [
        { name: searchRegex },
        { email: searchRegex },
        { designation: searchRegex },
        { staffId: searchRegex }
      ];
    }

    const faculty = await FacultyMember.find(filter).sort({ role: -1, name: 1 });
    return res.status(200).json({ success: true, count: faculty.length, data: faculty });
  } catch (err) {
    console.error('❌ Failed to query faculty directory:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// 3. Faculty Lookup by Email
app.get('/api/directory/lookup', async (req, res) => {
  try {
    const email = (req.query.email || '').toLowerCase().trim();
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email query parameter is required.' });
    }

    const member = await FacultyMember.findOne({
      $or: [
        { email },
        { personalEmail: email },
        { hodEmail: email },
        { alternateEmails: email }
      ]
    });
    if (!member) {
      return res.status(404).json({ success: false, message: 'Faculty member not found in directory.' });
    }

    return res.status(200).json({ success: true, data: member });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// 4. Department Transfer API (Reassigns faculty department e.g. Anderson from CSE to ECE)
app.post('/api/directory/transfer', async (req, res) => {
  try {
    const { email, newDepartment, newDepartmentName, newRole } = req.body;
    if (!email || !newDepartment) {
      return res.status(400).json({ success: false, message: 'email and newDepartment are required.' });
    }

    const updated = await FacultyMember.findOneAndUpdate(
      { email: email.toLowerCase().trim() },
      {
        $set: {
          department: newDepartment.toUpperCase().trim(),
          ...(newDepartmentName ? { departmentName: newDepartmentName } : {}),
          ...(newRole ? { role: newRole } : {})
        }
      },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ success: false, message: 'Faculty member not found to update.' });
    }

    // Also update any pending appraisals to reflect new department
    await Appraisal.updateMany(
      { email: email.toLowerCase().trim(), appraisalStatus: 'Pending' },
      { $set: { department: newDepartment.toUpperCase().trim() } }
    );

    console.log(`✓ Transferred ${email} to ${newDepartment}`);
    return res.status(200).json({
      success: true,
      message: `Faculty member ${updated.name} transferred to ${newDepartment} successfully.`,
      data: updated
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Helper to export up-to-date directory to JSON, XLSX, and CSV
async function refreshDirectoryFiles() {
  try {
    const allFaculty = await FacultyMember.find({ active: true }).sort({ department: 1, role: -1, name: 1 });
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // 1. JSON
    fs.writeFileSync(path.join(dataDir, 'tce_faculty_directory.json'), JSON.stringify(allFaculty, null, 2), 'utf8');

    // 2. XLSX
    const excelRows = allFaculty.map((f, idx) => ({
      'S.No': idx + 1,
      'Staff ID': f.staffId,
      'Faculty Name': f.name,
      'Designation': f.designation,
      'Department Code': f.department,
      'Department Name': f.departmentName,
      'Personal / Faculty Email': f.personalEmail || f.email,
      'Department HoD Email': f.hodEmail || '—',
      'Active Role': f.role,
      'Profile URL': f.profileUrl
    }));

    const ws = XLSX.utils.json_to_sheet(excelRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'TCE Faculty Directory');

    ws['!cols'] = [
      { wch: 6 },
      { wch: 12 },
      { wch: 32 },
      { wch: 35 },
      { wch: 16 },
      { wch: 40 },
      { wch: 32 },
      { wch: 26 },
      { wch: 14 },
      { wch: 45 }
    ];

    XLSX.writeFile(wb, path.join(dataDir, 'tce_faculty_directory.xlsx'));

    // 3. CSV
    const csvContent = XLSX.utils.sheet_to_csv(ws);
    fs.writeFileSync(path.join(dataDir, 'tce_faculty_directory.csv'), csvContent, 'utf8');

    console.log(`✓ Master directory files refreshed (${allFaculty.length} records)`);
  } catch (err) {
    console.warn('⚠️ Error refreshing directory files:', err.message);
  }
}

// 5. Change HoD / Leadership Handover API
app.post('/api/directory/change-hod', async (req, res) => {
  try {
    const { department, newHodEmail } = req.body;
    if (!department || !newHodEmail) {
      return res.status(400).json({ success: false, message: 'department and newHodEmail are required.' });
    }

    const deptCode = department.toUpperCase().trim();
    const targetEmail = newHodEmail.toLowerCase().trim();
    const genericHodEmail = `hod${deptCode.toLowerCase()}@tce.edu`;

    // 1. Find the incoming new HoD
    const incomingFaculty = await FacultyMember.findOne({
      $or: [
        { email: targetEmail },
        { personalEmail: targetEmail },
        { alternateEmails: targetEmail }
      ],
      department: deptCode
    });

    if (!incomingFaculty) {
      return res.status(404).json({
        success: false,
        message: `Faculty member with email ${targetEmail} not found in department ${deptCode}.`
      });
    }

    // 2. Demote the outgoing HoD for this department (if any)
    const outgoingHod = await FacultyMember.findOne({
      department: deptCode,
      role: 'HOD',
      _id: { $ne: incomingFaculty._id }
    });

    if (outgoingHod) {
      outgoingHod.role = 'Faculty';
      outgoingHod.hodEmail = '';
      outgoingHod.alternateEmails = (outgoingHod.alternateEmails || []).filter(e => e !== genericHodEmail);
      if (outgoingHod.designation.toLowerCase().includes('head')) {
        outgoingHod.designation = outgoingHod.designation.replace(/\s*(?:&|,|\/)\s*Head\s*(?:I\/c)?/i, '').trim() || 'Professor';
      }
      await outgoingHod.save();
      console.log(`✓ Demoted outgoing HoD: ${outgoingHod.name} (${outgoingHod.email}) to Faculty role`);
    }

    // 3. Promote the incoming faculty to HOD
    incomingFaculty.role = 'HOD';
    incomingFaculty.hodEmail = genericHodEmail;
    if (!incomingFaculty.alternateEmails) incomingFaculty.alternateEmails = [];
    if (!incomingFaculty.alternateEmails.includes(genericHodEmail)) {
      incomingFaculty.alternateEmails.push(genericHodEmail);
    }
    if (!incomingFaculty.alternateEmails.includes(incomingFaculty.email)) {
      incomingFaculty.alternateEmails.push(incomingFaculty.email);
    }
    if (!incomingFaculty.designation.toLowerCase().includes('head')) {
      incomingFaculty.designation = `${incomingFaculty.designation} & Head`;
    }
    await incomingFaculty.save();
    console.log(`✓ Promoted incoming HoD: ${incomingFaculty.name} (${incomingFaculty.email}) with ${genericHodEmail}`);

    // 4. Synchronize local JSON, XLSX, and CSV files
    await refreshDirectoryFiles();

    return res.status(200).json({
      success: true,
      message: `Leadership handover complete. ${incomingFaculty.name} is now Head of Department for ${deptCode}.`,
      data: {
        department: deptCode,
        incomingHod: {
          name: incomingFaculty.name,
          email: incomingFaculty.email,
          personalEmail: incomingFaculty.personalEmail || incomingFaculty.email,
          hodEmail: incomingFaculty.hodEmail,
          designation: incomingFaculty.designation,
          role: incomingFaculty.role
        },
        outgoingHod: outgoingHod ? {
          name: outgoingHod.name,
          email: outgoingHod.email,
          designation: outgoingHod.designation,
          role: outgoingHod.role
        } : null
      }
    });

  } catch (err) {
    console.error('❌ Error in HoD Handover API:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// 6. Force Re-seed Master Directory
app.post('/api/directory/seed', async (req, res) => {
  try {
    const count = await seedFacultyDirectory(true);
    return res.status(200).json({ success: true, message: `Master directory synced (${count} faculty records).` });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// 7. Register / Onboard New Faculty Member
app.post('/api/directory/register', async (req, res) => {
  try {
    const { name, email, department, designation, staffId } = req.body;
    if (!name || !email || !department) {
      return res.status(400).json({ success: false, message: 'Name, email, and department are required.' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const deptCode = department.toUpperCase().trim();

    // Check if already registered
    let existing = await FacultyMember.findOne({
      $or: [
        { email: cleanEmail },
        { personalEmail: cleanEmail },
        { alternateEmails: cleanEmail }
      ]
    });

    if (existing) {
      return res.status(200).json({
        success: true,
        isExisting: true,
        message: `Faculty record already exists for ${cleanEmail} (${existing.name}, ${existing.department}).`,
        data: existing
      });
    }

    const deptNames = {
      CSE: 'Computer Science and Engineering',
      ECE: 'Electronics and Communication Engineering',
      EEE: 'Electrical and Electronics Engineering',
      MECH: 'Mechanical Engineering',
      CIVIL: 'Civil Engineering',
      IT: 'Information Technology',
      MECT: 'Mechatronics',
      CSBS: 'Computer Science and Business Systems',
      MCA: 'Computer Applications',
      ARCH: 'Architecture',
      MATH: 'Mathematics',
      AMCS: 'Applied Mathematics and Computational Science',
      PHY: 'Physics',
      CHEM: 'Chemistry',
      ENG: 'English',
      AI: 'Artificial Intelligence and Data Science'
    };

    const newMember = await FacultyMember.create({
      staffId: staffId ? staffId.trim() : `TCE-${Date.now().toString().slice(-4)}`,
      name: name.trim(),
      designation: designation ? designation.trim() : 'Assistant Professor',
      department: deptCode,
      departmentName: deptNames[deptCode] || deptCode,
      email: cleanEmail,
      personalEmail: cleanEmail,
      hodEmail: `hod${deptCode.toLowerCase()}@tce.edu`,
      role: 'Faculty',
      active: true
    });

    await refreshDirectoryFiles();

    console.log(`✓ Registered new faculty member: ${name} (${cleanEmail}) in ${deptCode}`);
    return res.status(201).json({
      success: true,
      isExisting: false,
      message: `Faculty member ${name} registered successfully in Department of ${deptCode}!`,
      data: newMember
    });
  } catch (err) {
    console.error('❌ Error in Faculty Registration API:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});


// Helper to robustly locate an appraisal document without matching empty strings
function findAppraisalRecordInDb(allDocs, targetId, email = '', timeline = '') {
  const cleanId = targetId ? String(targetId).trim() : '';
  const cleanEmail = email ? String(email).toLowerCase().trim() : '';
  const cleanTimeline = timeline ? String(timeline).trim() : '';

  // 1. Direct MongoDB ObjectId match (24 hex characters)
  if (cleanId.length === 24) {
    const found = allDocs.find(doc => doc._id && doc._id.toString() === cleanId);
    if (found) return found;
  }

  // 2. Exact Email + timeline match (if specific timeline given)
  if (cleanEmail && cleanTimeline && cleanTimeline.toUpperCase() !== 'ALL') {
    const found = allDocs.find(doc => {
      const dbEmail = (doc.email || doc.facultyEmail || "").toLowerCase().trim();
      const dbTimeline = (doc.timeline || "").trim();
      return dbEmail === cleanEmail && dbTimeline === cleanTimeline;
    });
    if (found) return found;
  }

  // 3. Email-only match (most recent document for faculty)
  if (cleanEmail) {
    const found = allDocs.find(doc => {
      const dbEmail = (doc.email || doc.facultyEmail || "").toLowerCase().trim();
      return dbEmail === cleanEmail;
    });
    if (found) return found;
  }

  // 4. Fallback composite match
  if (cleanId) {
    const found = allDocs.find(doc => {
      if (doc._id && doc._id.toString() === cleanId) return true;
      const dbEmail = (doc.email || doc.facultyEmail || "").toLowerCase().trim();
      if (!dbEmail) return false;
      return cleanId.toLowerCase().includes(dbEmail);
    });
    if (found) return found;
  }

  return null;
}


app.post(['/api/appraisals/review', '/appraisals/review'], async (req, res) => {
  try {
    const { id, appraisalStatus, hodRemarks, subsectionRemarks, hodSubsectionScores, finalScore, email, timeline } = req.body;
    
    if (!id || !appraisalStatus) {
      return res.status(400).json({ success: false, message: "Missing required identifier or status parameters." });
    }

    console.log(`📡 Inbound Verification ID: ${id}`);

    const allAppraisals = await Appraisal.find({}).sort({ updatedAt: -1, createdAt: -1 });
    const targetRecord = findAppraisalRecordInDb(allAppraisals, id, email, timeline);

    if (!targetRecord) {
      console.error(`❌ Mismatch: No database record contains the substrings or matches the ID: ${id}`);
      return res.status(404).json({ success: false, message: "No matching appraisal record found in database cluster templates." });
    }

    // Determine evaluated final score
    const evaluatedConvertedScore = finalScore !== undefined && finalScore !== null
      ? Number(finalScore)
      : (req.body.convertedScore !== undefined && req.body.convertedScore !== null
          ? Number(req.body.convertedScore)
          : targetRecord.convertedScore);

    // Execute update using targetRecord._id
    await Appraisal.findByIdAndUpdate(
      targetRecord._id,
      { 
        $set: { 
          appraisalStatus: appraisalStatus, 
          hodRemarks: hodRemarks || "",
          subsectionRemarks: typeof subsectionRemarks === 'object' && subsectionRemarks !== null ? subsectionRemarks : {},
          hodSubsectionScores: typeof hodSubsectionScores === 'object' && hodSubsectionScores !== null ? hodSubsectionScores : {},
          convertedScore: evaluatedConvertedScore,
          updatedAt: new Date()
        } 
      },
      { new: true }
    );

    console.log(`✅ Success: Status updated to [${appraisalStatus}] with Score [${evaluatedConvertedScore}] for ${targetRecord.email}`);
    return res.status(200).json({ success: true, message: "Evaluation status and scores recorded successfully." });

  } catch (err) {
    console.error("❌ CRITICAL BACKEND RUNTIME FAULT:", err.message);
    return res.status(500).json({ success: false, message: `Database processing crash: ${err.message}` });
  }
});

// ── IQAC Verification & Quality Audit Endpoint ────────────────────────────
app.post(['/api/appraisals/iqac-verify', '/appraisals/iqac-verify'], async (req, res) => {
  try {
    const { id, iqacStatus, iqacAuditRemarks, iqacExcluded, email, timeline } = req.body;
    if (!id) {
      return res.status(400).json({ success: false, message: "Appraisal ID is required." });
    }

    const allAppraisals = await Appraisal.find({}).sort({ updatedAt: -1, createdAt: -1 });
    const targetRecord = findAppraisalRecordInDb(allAppraisals, id, email, timeline);

    if (!targetRecord) {
      return res.status(404).json({ success: false, message: "No matching appraisal record found." });
    }

    const newStatus = iqacStatus || 'IQAC Approved';
    const updateFields = {
      iqacStatus: newStatus,
      appraisalStatus: newStatus === 'Needs Clarification' ? (targetRecord.appraisalStatus || 'Pending') : 'IQAC Approved',
      iqacAuditRemarks: iqacAuditRemarks !== undefined ? iqacAuditRemarks : (targetRecord.iqacAuditRemarks || ''),
      ...(iqacExcluded !== undefined ? { iqacExcluded: Boolean(iqacExcluded) } : {}),
      iqacEvaluatedAt: new Date(),
      updatedAt: new Date()
    };

    const updatedRecord = await Appraisal.findByIdAndUpdate(
      targetRecord._id,
      { $set: updateFields },
      { new: true }
    );

    const targetEmail = (targetRecord.email || targetRecord.facultyEmail || email || '').toLowerCase().trim();
    if (targetEmail) {
      await Appraisal.updateMany(
        {
          $or: [{ email: targetEmail }, { facultyEmail: targetEmail }]
        },
        { $set: updateFields }
      );
    }

    console.log(`✅ IQAC Verified: ID [${id}] updated to status [${newStatus}]`);
    return res.status(200).json({
      success: true,
      message: `Appraisal successfully marked as ${newStatus} by IQAC Quality Audit.`,
      updatedRecord
    });
  } catch (err) {
    console.error('❌ Error in IQAC Verification API:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ── IQAC Soft Curation Toggle Endpoint ──────────────────────────────────
app.patch(['/api/appraisals/:id/iqac-status', '/appraisals/:id/iqac-status'], async (req, res) => {
  try {
    const { id } = req.params;
    const { iqacExcluded, iqacAuditRemarks, email, timeline } = req.body;
    
    const allAppraisals = await Appraisal.find({}).sort({ updatedAt: -1, createdAt: -1 });
    const targetRecord = findAppraisalRecordInDb(allAppraisals, id, email, timeline);

    if (!targetRecord) {
      return res.status(404).json({ success: false, message: "No matching appraisal record found." });
    }

    const updateFields = {
      ...(iqacExcluded !== undefined ? { iqacExcluded: Boolean(iqacExcluded) } : {}),
      ...(iqacAuditRemarks !== undefined ? { iqacAuditRemarks } : {}),
      updatedAt: new Date()
    };

    const updatedRecord = await Appraisal.findByIdAndUpdate(
      targetRecord._id,
      { $set: updateFields },
      { new: true }
    );

    const targetEmail = (targetRecord.email || targetRecord.facultyEmail || email || '').toLowerCase().trim();
    if (targetEmail) {
      await Appraisal.updateMany(
        {
          $or: [{ email: targetEmail }, { facultyEmail: targetEmail }]
        },
        { $set: updateFields }
      );
    }

    return res.status(200).json({
      success: true,
      message: `IQAC curation status updated successfully (Excluded: ${updateFields.iqacExcluded}).`,
      updatedRecord
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ── Principal Institutional Endorsement Endpoint ────────────────────────────
app.post(['/api/appraisals/endorse', '/appraisals/endorse'], async (req, res) => {
  try {
    const { id, remarks, email, timeline } = req.body;
    if (!id && !email) {
      return res.status(400).json({ success: false, message: "Missing appraisal identifier (id or email)." });
    }

    console.log(`🎓 Inbound Endorsement Request: ID=${id}, Email=${email}, Timeline=${timeline}`);

    const allAppraisals = await Appraisal.find({}).sort({ updatedAt: -1, createdAt: -1 });
    const targetRecord = findAppraisalRecordInDb(allAppraisals, id, email, timeline);

    if (!targetRecord) {
      console.error(`❌ Mismatch: No database record found for ID: ${id} / Email: ${email}`);
      return res.status(404).json({ success: false, message: "Appraisal record not found in database." });
    }

    const now = new Date();
    await Appraisal.collection.updateOne(
      { _id: targetRecord._id },
      {
        $set: {
          appraisalStatus: 'Ratified',
          principalApprovalStatus: 'Ratified',
          principalEndorsedAt: now,
          principalRemarks: (remarks || '').trim(),
          isLocked: true,
          updatedAt: now
        }
      }
    );

    console.log(`🎓 Institutional Endorsement Secured: Appraisal for ${targetRecord.email} [Timeline: ${targetRecord.timeline}] ratified by Principal.`);
    return res.status(200).json({
      success: true,
      message: "Appraisal institutionally ratified and locked for audit.",
      data: {
        id: targetRecord._id,
        appraisalStatus: 'Ratified',
        principalApprovalStatus: 'Ratified',
        principalEndorsedAt: now,
        principalRemarks: (remarks || '').trim(),
        isLocked: true
      }
    });
  } catch (err) {
    console.error("❌ Endorsement processing error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

app.post(['/api/appraisals/delete', '/delete'], async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ success: false, message: "Missing row identification criteria." });

    let result;
    if (typeof id === 'string' && id.includes('-')) {
      const lastHyphenIndex = id.lastIndexOf('-');
      const parsedEmail = id.substring(0, lastHyphenIndex).toLowerCase().trim();
      const parsedTimeline = id.substring(lastHyphenIndex + 1).trim();
      result = await Appraisal.collection.deleteOne({ email: parsedEmail, timeline: parsedTimeline });
    } else {
      result = await Appraisal.deleteOne({ _id: id });
    }

    return res.status(200).json({ success: true, message: "Document removed permanently." });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ── AI Suggestion Engine (Google Gemini + Academic Heuristic Fallback) ─────────

function generateHeuristicSuggestion({ mode, subKey, subLabel, score, maxMarks, sectionScores, facultyName }) {
  if (mode === 'subsection') {
    const s = Number(score) || 0;
    const m = Number(maxMarks) || 10;
    const ratio = m > 0 ? (s / m) : 1;

    switch (subKey) {
      case '1.1':
        return ratio >= 0.8
          ? 'Comprehensive course delivery completed on schedule with exemplary curriculum execution.'
          : ratio >= 0.5
          ? 'Course teaching requirements fulfilled satisfactorily; maintain uniform lecture pacing across semesters.'
          : 'Course portfolio coverage is below benchmark; ensure full allocation compliance in the coming semester.';
      case '1.2':
        return ratio >= 0.8
          ? 'Course files meticulously maintained with complete pedagogical plans and course artifacts.'
          : 'Ensure timely completion of course file audits and outcome attainment mappings.';
      case '1.3':
        return ratio >= 0.8
          ? 'Commendable initiative in modern curriculum design and industry-relevant syllabus revision.'
          : 'Consider incorporating more contemporary industry-relevant modules into course design.';
      case '1.4':
        return ratio >= 0.8
          ? 'Strong student participation recorded in value-added skill development courses.'
          : 'Encourage offering niche value-added technical training programs for students.';
      case '1.5':
        return ratio >= 0.8
          ? 'Effective deployment of active learning methods and digital pedagogical tools observed.'
          : 'Incorporate more interactive learning methodologies, flipped classrooms, and ICT tools.';
      case '1.6':
        return ratio >= 0.8
          ? 'Excellent cross-institutional and academic collaboration established.'
          : 'Explore collaborative academic exchanges and joint initiatives with reputed institutions.';
      case '1.7':
        return ratio >= 0.8
          ? 'Proactive mentoring system maintained with regular mentee guidance and counseling records.'
          : 'Maintain closer follow-ups and documentation on student academic progress and mentoring.';
      case '1.8':
        return ratio >= 0.8
          ? 'Commendable performance in NPTEL/SWAYAM certification courses with elite grades.'
          : ratio >= 0.5
          ? 'NPTEL/SWAYAM certification completed; target higher honors/elite grade certifications.'
          : 'Prioritize completing at least one relevant 8-to-12-week NPTEL/SWAYAM certification.';
      case '1.9':
        return ratio >= 0.8
          ? 'Outstanding student feedback ratings demonstrating excellent classroom engagement.'
          : ratio >= 0.6
          ? 'Good student feedback received; focus on student interaction and continuous doubt resolution.'
          : 'Student feedback indicates need for improved classroom delivery and pedagogical refinement.';
      case '1.10':
        return ratio >= 0.8
          ? 'High student pass percentage achieved across all assigned theory and practical courses.'
          : 'Analyze failure patterns in low-performing subjects and conduct remedial sessions.';
      case '1.11':
        return ratio >= 0.8
          ? 'High Course Outcome (CO) attainment achieved across all target competency levels.'
          : 'Review direct assessment rubrics to elevate CO attainment in upcoming semester examinations.';
      case '2.1':
        return ratio >= 0.8
          ? 'Exemplary high-impact research contributions published in indexed SCI/Scopus journals.'
          : ratio >= 0.4
          ? 'Good research activity noted; recommended to target Q1/Q2 indexed peer-reviewed journals.'
          : 'Research publication output is below department expectations; prioritize publishing in indexed journals.';
      case '2.2':
      case '2.3':
        return ratio >= 0.8
          ? 'Strong citation count and high-quality Q1 citations reflecting substantial research visibility.'
          : 'Target publishing in high-impact factor journals to further enhance global citation metrics.';
      case '2.4':
        return ratio >= 0.8
          ? 'Valuable academic contribution through authorship of textbooks and book chapters.'
          : 'Encouraged to contribute book chapters with reputed international academic publishers.';
      case '2.5':
        return ratio >= 0.8
          ? 'Active conference dissemination with peer-reviewed proceeding publications.'
          : 'Target presenting research at IEEE/ACM or premier national/international conferences.';
      case '2.7':
      case '2.8':
        return ratio >= 0.8
          ? 'Commendable research supervision provided to PhD research scholars.'
          : 'Encourage actively guiding full-time/part-time doctoral research scholars.';
      case '3.1':
      case '3.2':
        return ratio >= 0.8
          ? 'Impressive intellectual property generation with published and granted patents.'
          : 'Focus on translating student/research projects into patentable intellectual property.';
      case '4.1':
      case '4.2':
        return ratio >= 0.8
          ? 'Substantial sponsored research and corporate consultancy funding mobilized.'
          : ratio >= 0.4
          ? 'Research funding initiatives noted; pursue industry consultancy and DST/SERB proposals.'
          : 'Prioritize submitting external grant proposals to government agencies (DST, SERB, AICTE).';
      case '5.1':
      case '5.2':
        return ratio >= 0.8
          ? 'Strong international engagement and foreign university collaborative tie-ups established.'
          : 'Explore international collaborative research, virtual lectures, or joint publications.';
      case '6.1':
      case '6.2':
        return ratio >= 0.8
          ? 'Active commitment to continuous faculty development by attending and organizing FDPs/STTPs.'
          : 'Participate in at least two national-level ATAL/AICTE Faculty Development Programs.';
      case '7.1':
      case '7.2':
      case '7.3':
        return ratio >= 0.8
          ? 'Robust industry interaction, industrial visits, and corporate immersion successfully organized.'
          : 'Strengthen industry connections through faculty internships and expert lecture sessions.';
      case '8.1':
      case '8.2':
      case '8.3':
        return ratio >= 0.8
          ? 'Exemplary mentorship provided for student project publications and hackathon prizes.'
          : 'Encourage students to participate in national hackathons and publish final-year projects.';
      case '9.1':
      case '9.2':
      case '9.3':
        return ratio >= 0.8
          ? 'Commendable leadership and active participation in institutional and departmental governance.'
          : 'Take on more active roles in departmental committees and institutional accreditation tasks.';
      default:
        return ratio >= 0.8
          ? `Performance in ${subLabel || subKey} meets the highest standards with commendable output.`
          : ratio >= 0.5
          ? `Performance in ${subLabel || subKey} is satisfactory; continue consistent contributions.`
          : `Contributions in ${subLabel || subKey} need improvement; set concrete milestones for next cycle.`;
    }
  }

  // Overall Mode: Structured 3-point Evaluation
  const s = sectionScores || {};
  const s1 = Number(s.section1Total) || 0;
  const s2 = Number(s.section2Total) || 0;
  const s4 = Number(s.section4Total) || 0;
  const s6 = Number(s.section6Total) || 0;

  const strengths = [];
  const focusAreas = [];

  if (s1 >= 38) strengths.push('Strong pedagogical execution and student feedback (Section I)');
  else focusAreas.push('Teaching & learning compliance and feedback enhancement');

  if (s2 >= 25) strengths.push('Consistent peer-reviewed research publications (Section II)');
  else focusAreas.push('Research velocity in SCI/Scopus indexed journals');

  if (s4 >= 5) strengths.push('Active pursuit of sponsored research and consultancy grants');
  else focusAreas.push('Mobilizing external research funding (DST/SERB/AICTE)');

  if (s6 >= 12) strengths.push('Proactive participation in Faculty Development Programs (FDPs)');
  else focusAreas.push('Attending specialized domain-specific STTPs and FDPs');

  const strengthText = strengths.length > 0
    ? strengths.join(', ')
    : 'Demonstrated consistent baseline instructional and academic duties throughout the evaluation year';
  const focusText = focusAreas.length > 0
    ? focusAreas.join(', ')
    : 'Accelerating high-impact international collaborative publications and patents';

  return `• Key Strengths: ${strengthText}.\n• Growth Focus: Needs targeted acceleration in ${focusText}.\n• Next Cycle Recommendation: Prioritize submitting at least one sponsored project proposal, publishing in Q1/Q2 journals, and driving innovative student mentoring initiatives.`;
}

app.post(['/api/ai/suggest-feedback', '/ai/suggest-feedback'], authenticateToken, async (req, res) => {
  try {
    const {
      mode = 'subsection',
      subKey = '',
      subLabel = '',
      score = 0,
      maxMarks = 10,
      sectionScores = {},
      facultyName = 'Faculty Member',
      subData = [],
    } = req.body || {};

    const apiKey = process.env.GEMINI_API_KEY;

    if (apiKey) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        let systemInstruction = 'You are an academic Head of Department (HoD) at Thiagarajar College of Engineering, an autonomous institution. Write concise, constructive, professional, and encouraging feedback adhering to AICTE and NBA standards. Do not use markdown headers or special markdown formatting (use plain text and clean bullet points if needed). Do not invent facts not in the data.';

        let promptText = '';
        if (mode === 'subsection') {
          promptText = `Evaluate Subsection ${subKey} (${subLabel}).\nFaculty Name: ${facultyName}\nEvaluated Score: ${score} / ${maxMarks} Marks.\nWrite a 1-to-2 sentence constructive observation for the HoD remark box explaining the rationale or recommendation.`;
        } else {
          promptText = `Provide an overall performance appraisal review summary for ${facultyName}.\nScores:\n- Teaching & Learning (Sec I): ${sectionScores.section1Total || 0}/50\n- Research Publications (Sec II): ${sectionScores.section2Total || 0}/55\n- Patents & Innovation (Sec III): ${sectionScores.section3Total || 0}/15\n- Sponsored Research & Consultancy (Sec IV): ${sectionScores.section4Total || 0}/15\n- Total Evaluated Score: ${sectionScores.grandTotal || 0}/200\n\nGenerate exactly 3 clean bullet points:\n• Key Strengths: ...\n• Growth Focus: ...\n• Next Cycle Recommendation: ...`;
        }

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: promptText }] }],
              systemInstruction: { parts: [{ text: systemInstruction }] },
              generationConfig: {
                temperature: 0.3,
                maxOutputTokens: mode === 'subsection' ? 120 : 300,
              },
            }),
            signal: controller.signal,
          }
        );
        clearTimeout(timeoutId);

        if (response.ok) {
          const data = await response.json();
          const candidateText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          if (candidateText) {
            return res.status(200).json({
              success: true,
              suggestion: candidateText.replace(/\*\*/g, '').replace(/###/g, ''),
              source: 'gemini-1.5-flash',
            });
          }
        }
      } catch (geminiErr) {
        console.warn('⚠️ Gemini API call failed or timed out, using heuristic fallback:', geminiErr.message);
      }
    }

    // Heuristic fallback (fast, zero external dependency, high quality)
    const heuristicResult = generateHeuristicSuggestion({
      mode,
      subKey,
      subLabel,
      score,
      maxMarks,
      sectionScores,
      facultyName,
    });

    return res.status(200).json({
      success: true,
      suggestion: heuristicResult,
      source: 'academic-heuristic-engine',
    });
  } catch (err) {
    console.error('❌ AI Suggestion Engine Error:', err.message);
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

// One-time database migration helper to update existing gmail.com logins to MCA department
async function migrateGmailLoginsToMca() {
  try {
    const gmailFilter = {
      $or: [
        { email: /@gmail\.com$/i },
        { personalEmail: /@gmail\.com$/i },
        { alternateEmails: /@gmail\.com$/i }
      ]
    };

    const facultyResult = await FacultyMember.updateMany(
      gmailFilter,
      {
        $set: {
          department: 'MCA',
          departmentName: 'Computer Applications',
          hodEmail: 'hodmca@tce.edu'
        }
      }
    );

    const appraisalFilter = {
      $or: [
        { email: /@gmail\.com$/i },
        { facultyEmail: /@gmail\.com$/i }
      ]
    };

    const appraisalResult = await Appraisal.updateMany(
      appraisalFilter,
      {
        $set: {
          department: 'MCA',
          departmentName: 'Computer Applications'
        }
      }
    );

    if (facultyResult.modifiedCount > 0 || appraisalResult.modifiedCount > 0) {
      console.log(`✅ Gmail Migration Complete: Updated ${facultyResult.modifiedCount} faculty record(s) and ${appraisalResult.modifiedCount} appraisal record(s) to MCA department.`);
    }
  } catch (err) {
    console.warn('⚠️ Gmail to MCA migration warning:', err.message);
  }
}

// ── Asynchronous Server Initialization ───────────────────────────────────────
async function startServer() {
  try {
    console.log('⏳ Connecting to MongoDB Atlas Cloud Cluster...');
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 15000,
      socketTimeoutMS: 45000,
    });
    console.log('✓ Connected securely to MongoDB Atlas Cloud Cluster!');

    // Auto-seed/verify faculty master directory
    await seedFacultyDirectory(false);

    // Auto-migrate existing gmail.com logins to MCA department
    await migrateGmailLoginsToMca();

    app.listen(port, () => {
      console.log(`✓ Auth server listening on http://localhost:${port}`);
    });
  } catch (err) {
    console.error('❌ FATAL DATABASE STARTUP ERROR:', err.message);
    process.exit(1);
  }
}

startServer();

