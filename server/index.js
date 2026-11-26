import crypto from 'crypto';
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
import { computeEffectiveScores, calculateInclusiveDays } from '../src/scoringEngine.js';
import { scheduleDailyAutoBackup, runDatabaseBackup } from './autoBackup.js';
import { sendRejectionEmail } from './mailer.js';

function buildNormalizedSectionDataForScoring(source = {}) {
  const raw = source || {};
  const rawSec = raw.sectionData || {};
  const ensureCourseSection = (rows) => {
    if (!Array.isArray(rows)) return [];
    return rows.map((r) => (r && typeof r === 'object' && r.courseCode && !r.section ? { ...r, section: 'A' } : r));
  };
  const s6Raw = { ...(rawSec.section6Data || {}), ...(raw.section6Data || {}) };
  const s6Fdp = (s6Raw.fdpAttended || raw.fdpAttended || []).map((r) => {
    if (r && r.dateRange && r.endDate) {
      const calc = calculateInclusiveDays(r.dateRange, r.endDate);
      if (calc) return { ...r, duration: calc };
    }
    return r;
  });
  const s6Prog = (s6Raw.programsOrganized || raw.programsOrganized || []).map((r) => {
    if (r && r.dateRange && r.endDate) {
      const calc = calculateInclusiveDays(r.dateRange, r.endDate);
      if (calc) return { ...r, days: calc };
    }
    return r;
  });

  const merged = {
    ...rawSec,
    ...(raw.section1Data || {}),
    ...(raw.section2Data || {}),
    ...(raw.section3Data || {}),
    ...(raw.section4Data || {}),
    ...(raw.section5Data || {}),
    ...s6Raw,
    ...(s6Fdp.length > 0 ? { fdpAttended: s6Fdp } : {}),
    ...(s6Prog.length > 0 ? { programsOrganized: s6Prog } : {}),
    ...(raw.section7Data || {}),
    ...(raw.section8Data || {}),
    ...(raw.section9Data || {}),
  };

  if (merged.coursesHandled) merged.coursesHandled = ensureCourseSection(merged.coursesHandled);
  if (merged.courseFiles) merged.courseFiles = ensureCourseSection(merged.courseFiles);
  if (merged.innovativeMethods) merged.innovativeMethods = ensureCourseSection(merged.innovativeMethods);
  if (merged.resultAnalysis) merged.resultAnalysis = ensureCourseSection(merged.resultAnalysis);
  if (merged.coAttainment) merged.coAttainment = ensureCourseSection(merged.coAttainment);
  if (raw.department) merged.department = raw.department;

  return merged;
}

const KNOWN_REGISTRAR_PERSONAL_EMAILS = [
  'rajaram_siva@tce.edu',
  'srrece@tce.edu',
  'registrar@tce.edu',
];

const KNOWN_DEAN_PERSONAL_EMAILS = [
  'sbeee@tce.edu', 'deanacad@tce.edu',
  'shalinie@tce.edu', 'smscse@tce.edu', 'deanmis@tce.edu',
  'gkgmech@tce.edu', 'deancd@tce.edu',
  'smmroomi@tce.edu', 'smmrece@tce.edu', 'deaninfra@tce.edu',
  'khh@tce.edu', 'khhece@tce.edu', 'deanind@tce.edu',
  'gbarch@tce.edu', 'deanstud@tce.edu',
  'spcse@tce.edu', 'sps@tce.edu', 'deancce@tce.edu',
  'pccse@tce.edu', 'pchitracse@tce.edu',
  'deaneca@tce.edu', 'rvchem@tce.edu',
];

const FORMER_HOD_PERSONAL_EMAILS = [
  'jeyamala@tce.edu',
  'mseee@tce.edu',
  'gsjarch@tce.edu',
  'gkmech@tce.edu',
];

export function hasFullRegistrarDesignation(str) {
  return /\bregistrar\b/i.test(
    String(str || '').replace(/\b(?:deputy|dy|asst|assistant)\s*\.?\s*registrar\b/gi, '')
  );
}

export function hasFullDeanDesignation(str) {
  return /\b(dean|head\s*iqac)\b/i.test(
    String(str || '').replace(/\b(?:associate|assoc|asst|assistant|deputy|dy)\s*\.?\s*deans?\b/gi, '')
  );
}

export function isRegistrarPersonalSubmission(email, record = null) {
  const clean = String(email || record?.email || record?.facultyEmail || '').toLowerCase().trim();
  if (clean === 'siddharthk@student.tce.edu' || clean.endsWith('@student.tce.edu') || clean.endsWith('@gmail.com')) {
    return false;
  }
  if (clean && KNOWN_REGISTRAR_PERSONAL_EMAILS.includes(clean)) return true;
  if (record?.isRegistrarSubmission === true) return true;
  if (hasFullRegistrarDesignation(record?.designation)) return true;
  const adminRows = record?.section9Data?.adminResponsibilities || [];
  if (Array.isArray(adminRows) && adminRows.some((a) => hasFullRegistrarDesignation(a?.role || ''))) {
    return true;
  }
  return false;
}

export function isDeanPersonalSubmission(email, record = null) {
  const clean = String(email || record?.email || record?.facultyEmail || '').toLowerCase().trim();
  if (clean === 'siddharthk@student.tce.edu' || clean.endsWith('@student.tce.edu') || clean.endsWith('@gmail.com')) {
    return false;
  }
  if (clean === 'gkmech@tce.edu') return false;
  if (isRegistrarPersonalSubmission(clean, record)) return false;
  if (clean && KNOWN_DEAN_PERSONAL_EMAILS.includes(clean)) return true;
  if (record?.isDeanSubmission === true) return true;
  if (hasFullDeanDesignation(record?.designation)) return true;
  return false;
}

export const isHodApprovedOrLater = (recordOrStatus) => {
  if (!recordOrStatus) return false;
  if (typeof recordOrStatus === 'object') {
    const emailKey = String(recordOrStatus.email || recordOrStatus.facultyEmail || '').toLowerCase().trim();
    const isReg = isRegistrarPersonalSubmission(emailKey, recordOrStatus);
    const isDean = !isReg && isDeanPersonalSubmission(emailKey, recordOrStatus);
    const isHod = !isReg && !isDean && !FORMER_HOD_PERSONAL_EMAILS.includes(emailKey) && (
      recordOrStatus.isHodSubmission === true || isHodDesignation(recordOrStatus.designation)
    );
    if (isReg || isDean || isHod) {
      return true;
    }
  }
  const status = typeof recordOrStatus === 'string'
    ? recordOrStatus
    : (recordOrStatus.appraisalStatus || '');
  const normStatus = String(status).toUpperCase().trim();
  const PENDING_STATUSES = [
    'PENDING',
    'SUBMITTED',
    'PENDING REVIEW',
    'PENDING HOD REVIEW',
    'FIX NEEDED',
    'NOT APPROVED',
    'DRAFT'
  ];
  if (PENDING_STATUSES.includes(normStatus)) return false;
  const HOD_APPROVED_OR_LATER_STATUSES = [
    'APPROVED',
    'HOD APPROVED',
    'IQAC APPROVED',
    'NOT APPROVED BY IQAC',
    'RATIFIED',
    'ENDORSED',
    'PRINCIPAL APPROVED'
  ];
  return HOD_APPROVED_OR_LATER_STATUSES.includes(normStatus);
};

export const isIqacApprovedRecord = (row) => {
  if (!row) return false;
  const iqStatus = String(row.iqacStatus || '').toUpperCase().trim();
  if (iqStatus === 'APPROVED' || iqStatus === 'IQAC APPROVED') {
    return true;
  }
  if (!iqStatus || iqStatus === 'PENDING' || iqStatus.includes('PENDING')) {
    const prStatus = String(row.principalApprovalStatus || '').toUpperCase().trim();
    const apStatus = String(row.appraisalStatus || '').toUpperCase().trim();
    if (['RATIFIED', 'ENDORSED', 'APPROVED', 'PRINCIPAL APPROVED'].includes(prStatus) ||
        ['RATIFIED', 'ENDORSED', 'IQAC APPROVED', 'PRINCIPAL APPROVED'].includes(apStatus)) {
      return true;
    }
    return false;
  }
  if (iqStatus.includes('NOT APPROVED') || ['NEEDS CLARIFICATION', 'REJECTED'].includes(iqStatus)) {
    return false;
  }
  return iqStatus === 'APPROVED' || iqStatus === 'IQAC APPROVED' || (iqStatus.includes('APPROVED') && !iqStatus.includes('NOT'));
};

export const isIqacNotApprovedRecord = (_row) => {
  // NEW RULE: "Not Approved" no longer exists anywhere in leadership roles.
  return false;
};

export const isIqacPendingRecord = (row) => {
  if (!row) return false;
  return !isIqacApprovedRecord(row);
};

export function applyLeadershipDecision({ targetRecord, decision, evaluatorRole, remarks = '', excluded = undefined, isRegistrarRecord = false }) {
  const normDecision = String(decision || '').toUpperCase().trim();
  const isPendingOrLegacyNotApproved = normDecision === 'PENDING' || ['NEEDS CLARIFICATION', 'NOT APPROVED', 'REJECTED', 'NOT APPROVED BY IQAC'].includes(normDecision) || normDecision.includes('NOT');
  const finalStatus = isPendingOrLegacyNotApproved ? 'Pending' : 'Approved';
  const now = new Date();

  const resolvedIsRegistrar = Boolean(
    isRegistrarRecord ||
    isRegistrarPersonalSubmission(targetRecord?.email || targetRecord?.facultyEmail, targetRecord)
  );

  if (resolvedIsRegistrar) {
    const regUpdateFields = {
      isRegistrarSubmission: true,
      ...(excluded !== undefined ? { iqacExcluded: Boolean(excluded) } : {}),
      principalApprovalStatus: finalStatus === 'Approved'
        ? (targetRecord?.principalApprovalStatus === 'Ratified' ? 'Ratified' : 'Approved')
        : 'Pending',
      principalEndorsedAt: finalStatus === 'Approved' ? now : null,
      appraisalStatus: finalStatus === 'Approved' ? 'Approved' : 'Pending',
      updatedAt: now
    };

    if (remarks !== undefined && remarks !== null && String(remarks).trim() !== '') {
      regUpdateFields.principalRemarks = String(remarks).trim();
    } else if (finalStatus === 'Pending' && remarks === '') {
      regUpdateFields.principalRemarks = '';
    }

    return { updateFields: regUpdateFields, finalStatus };
  }

  const updateFields = {
    iqacStatus: finalStatus,
    iqacAuditRemarks: remarks !== undefined && remarks !== null ? String(remarks) : (targetRecord?.iqacAuditRemarks || ''),
    ...(excluded !== undefined ? { iqacExcluded: Boolean(excluded) } : {}),
    iqacEvaluatedAt: finalStatus === 'Pending' ? null : now,
    iqacEvaluatedBy: finalStatus === 'Pending' ? '' : (evaluatorRole || 'IQAC'),
    updatedAt: now
  };

  if (finalStatus === 'Approved') {
    updateFields.appraisalStatus = 'Approved';
    updateFields.principalApprovalStatus = targetRecord?.principalApprovalStatus === 'Ratified' ? 'Ratified' : 'Approved';
  } else {
    // Moved back to Pending Review
    updateFields.appraisalStatus = 'Approved';
    updateFields.principalApprovalStatus = 'Pending';
  }

  return { updateFields, finalStatus };
}

export function normalizeAppraisalLeadershipDecision(doc) {
  if (!doc) return doc;
  const rawIq = String(doc.iqacStatus || '').toUpperCase().trim();
  const rawPr = String(doc.principalApprovalStatus || '').toUpperCase().trim();
  const rawAp = String(doc.appraisalStatus || '').toUpperCase().trim();

  if (isRegistrarPersonalSubmission(doc.email || doc.facultyEmail, doc)) {
    if (rawIq === 'APPROVED' || rawIq === 'IQAC APPROVED') {
      doc.iqacStatus = 'Approved';
      if (!doc.iqacEvaluatedBy) doc.iqacEvaluatedBy = 'IQAC';
    } else if (['NOT APPROVED', 'NOT APPROVED BY IQAC', 'REJECTED', 'NEEDS CLARIFICATION'].includes(rawIq)) {
      doc.iqacStatus = 'Pending';
      doc.iqacEvaluatedBy = '';
      doc.iqacEvaluatedAt = null;
    }

    if (rawPr === 'RATIFIED') {
      doc.principalApprovalStatus = 'Ratified';
    } else if (['APPROVED', 'ENDORSED', 'PRINCIPAL APPROVED'].includes(rawPr)) {
      doc.principalApprovalStatus = 'Approved';
    } else if (['NOT APPROVED', 'REJECTED', 'NEEDS CLARIFICATION'].includes(rawPr)) {
      doc.principalApprovalStatus = 'Pending';
    }

    if (['NOT APPROVED', 'FIX NEEDED', 'REJECTED', 'NOT APPROVED BY IQAC'].includes(rawAp)) {
      doc.appraisalStatus = 'Pending';
    }
    return doc;
  }

  if (rawIq === 'APPROVED' || rawIq === 'IQAC APPROVED') {
    doc.iqacStatus = 'Approved';
    if (!doc.iqacEvaluatedBy) {
      doc.iqacEvaluatedBy = rawPr === 'RATIFIED' ? 'Principal' : 'IQAC';
    }
    return doc;
  }
  // NEW RULE: Map any stored "Not Approved", "Rejected", "Needs Clarification" to "Pending" on read
  if (rawIq === 'NOT APPROVED' || rawIq === 'NOT APPROVED BY IQAC' || rawIq === 'REJECTED' || rawIq === 'NEEDS CLARIFICATION') {
    doc.iqacStatus = 'Pending';
    doc.principalApprovalStatus = 'Pending';
    doc.iqacEvaluatedBy = '';
    doc.iqacEvaluatedAt = null;
    return doc;
  }

  if (['RATIFIED', 'ENDORSED', 'APPROVED', 'PRINCIPAL APPROVED'].includes(rawPr) ||
      ['RATIFIED', 'ENDORSED', 'IQAC APPROVED', 'PRINCIPAL APPROVED'].includes(rawAp)) {
    doc.iqacStatus = 'Approved';
    if (!doc.iqacEvaluatedBy) {
      doc.iqacEvaluatedBy = (rawPr === 'RATIFIED' || rawAp === 'RATIFIED' || rawPr === 'APPROVED') ? 'Principal' : 'IQAC';
    }
  }
  if (rawAp === 'NOT APPROVED BY IQAC') {
    doc.appraisalStatus = 'Approved';
    doc.iqacStatus = 'Pending';
    doc.principalApprovalStatus = 'Pending';
    doc.iqacEvaluatedBy = '';
    doc.iqacEvaluatedAt = null;
  } else if (rawAp === 'NOT APPROVED' || rawAp === 'FIX NEEDED' || rawAp === 'REJECTED') {
    doc.appraisalStatus = 'Pending';
  } else if (rawPr === 'NOT APPROVED') {
    doc.iqacStatus = 'Pending';
    doc.principalApprovalStatus = 'Pending';
    doc.iqacEvaluatedBy = '';
    doc.iqacEvaluatedAt = null;
  }

  return doc;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 5000);
const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const jwtSecret = process.env.JWT_SECRET;
const mongoUri = process.env.MONGO_URI;
const distPath = path.join(__dirname, '..', 'dist');
const spaIndex = path.join(distPath, 'index.html');
// Dynamically generate academic timelines up to 2100 (e.g. 2020-2021 through 2099-2100)
const generateTimelines = (startYear = 2020, endYear = 2100) => {
  const list = [];
  for (let y = startYear; y < endYear; y++) {
    list.push(`${y}-${y + 1}`);
  }
  return list;
};
const timelines = generateTimelines(2020, 2100);

const isValidAcademicTimeline = (tl) => {
  if (!tl || typeof tl !== 'string') return false;
  const match = tl.trim().match(/^(\d{4})-(\d{4})$/);
  if (!match) return false;
  const start = parseInt(match[1], 10);
  const end = parseInt(match[2], 10);
  return end > start && end <= start + 15 && start >= 2000 && start <= 2100;
};

const normalizeDepartmentCode = (rawDept) => {
  if (!rawDept) return '';
  const d = String(rawDept).toUpperCase().trim();
  const map = {
    'CA': 'MCA',
    'CIV': 'CIVIL',
    'MATHS': 'MATH',
    'MAT': 'MATH',
    'CHEMISTRY': 'CHEM',
    'CHM': 'CHEM',
    'PHYSICS': 'PHY',
    'MCT': 'MECT',
    'AIDS': 'AI',
    'COMPUTER APPLICATIONS': 'MCA',
    'CIVIL ENGINEERING': 'CIVIL',
    'MATHEMATICS': 'MATH',
    'ARCHITECTURE': 'ARCH',
    "ARCHITECTURE (T'SEDA)": 'ARCH',
    'TSEDA': 'ARCH',
    'B.ARCH': 'ARCH',
    'BARCH': 'ARCH',
    'THIAGARAJAR SCHOOL OF ARCHITECTURE': 'ARCH',
    'FASHION TECHNOLOGY': 'FT',
  };
  if (map[d]) return map[d];
  if (d.includes('ARCH') || d.includes('TSEDA')) return 'ARCH';
  return d;
};

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
  role: { type: String, enum: ['Faculty', 'HOD', 'IQAC', 'Registrar', 'Principal', 'Admin'], default: 'Faculty', index: true },
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

// ── Single Active Window / Live Session schema & model ──────────────────────
const UserSessionSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true, index: true },
  sessionId: { type: String, required: true, unique: true, index: true },
  deviceInfo: { type: String, default: 'Desktop Browser' },
  ipAddress: { type: String, default: '' },
  isActive: { type: Boolean, default: true, index: true },
  lastActivity: { type: Date, default: Date.now, index: true },
  createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 7 } // Auto TTL: 7 days
}, { timestamps: true });

UserSessionSchema.index({ email: 1, isActive: 1, lastActivity: -1 });
const UserSession = mongoose.model('UserSession', UserSessionSchema);

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
  appraisalStatus: { type: String, default: 'Draft' },
  hodRemarks: { type: String, default: '' },
  hodEvaluatedAt: { type: Date, default: null },
  hodEvaluatedBy: { type: String, default: '' },
  subsectionRemarks: { type: Object, default: {} },
  hodSubsectionScores: { type: Object, default: {} },
  principalApprovalStatus: { type: String, default: 'Pending' },
  principalEndorsedAt: { type: Date, default: null },
  principalRemarks: { type: String, default: '' },
  iqacStatus: { type: String, default: 'Pending' },
  iqacExcluded: { type: Boolean, default: false },
  iqacAuditRemarks: { type: String, default: '' },
  iqacEvaluatedAt: { type: Date, default: null },
  iqacEvaluatedBy: { type: String, default: '' },
  isLocked: { type: Boolean, default: false },
  isHodSubmission: { type: Boolean, default: false },
  isDeanSubmission: { type: Boolean, default: false },
  isRegistrarSubmission: { type: Boolean, default: false },
  unlockedReleaseTag: { type: String, default: '' },
  section1Data: {
    coursesHandled: { type: Array, default: [] },
    courseFiles: { type: Array, default: [] },
    coursesDesigned: { type: Array, default: [] },
    valueAdded: { type: Array, default: [] },
    innovativeMethods: { type: Array, default: [] },
    academicCollaborations: { type: Array, default: [] },
    mentoring: { type: mongoose.Schema.Types.Mixed, default: [] },
    certifications: { type: Array, default: [] },
    studentFeedback: { type: Array, default: [] },
    resultAnalysis: { type: Array, default: [] },
    coAttainment: { type: Array, default: [] },
    studioPedagogy: { type: Array, default: [] },
    educationalTours: { type: Array, default: [] }
  },
  section2Data: {
    journalPapers: { type: Array, default: [] },
    citationsReceived: { totalCount: { type: String, default: '' }, evidenceLink: { type: String, default: '' } },
    q1Citations: { totalCount: { type: String, default: '' }, evidenceLink: { type: String, default: '' } },
    bookPublications: { type: Array, default: [] },
    conferencePapers: { type: Array, default: [] },
    researchCollaborations: { type: Array, default: [] },
    phdRegistered: { type: Array, default: [] },
    phdAwarded: { type: Array, default: [] },
    creativeScholarship: { type: Array, default: [] }
  },
  section3Data: {
    patentsPublished: { type: Array, default: [] },
    patentsGranted: { type: Array, default: [] },
    transferOfTechnology: { type: Array, default: [] },
    prototypesDeveloped: { type: Array, default: [] },
    hackathonPrizes: { type: Array, default: [] },
    designPatents: { type: Array, default: [] }
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
    nirfSurvey: { type: Array, default: [] },
    internationalDesignStudio: { type: Array, default: [] }
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
    startupSupport: { type: Array, default: [] },
    studentExhibitions: { type: Array, default: [] }
  },
  section9Data: {
    deptActivities: { type: Array, default: [] },
    collegeActivities: { type: Array, default: [] },
    adminResponsibilities: { type: Array, default: [] }
  }
}, { timestamps: true, strict: false });

// Prevent a faculty member from submitting twice for the same academic year and department.
AppraisalSchema.index({ email: 1, timeline: 1, department: 1 }, { unique: true });

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

  if (Array.isArray(section1Data.mentoring)) {
    errors.push(
      ...validateRows(section1Data.mentoring, 'mentoring', {
        requiresCourseCode: false,
        requiredTextFields: ['menteeCount', 'description'],
        selectFieldRules: [
          { field: 'batch', allowedValues: mentoringBatchOptions },
        ],
      })
    );
  } else if (!section1Data.mentoring || typeof section1Data.mentoring !== 'object') {
    errors.push('mentoring must be an object or array.');
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
        origin.endsWith('.tceapps.in') ||
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
app.use((_req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  next();
});
app.use(express.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));

// ── Fast In-Memory Session Cache (10s TTL) ──────────────────────────────────
const sessionCache = new Map(); // sessionId -> { isActive: boolean, lastChecked: number, email: string }

async function isSessionActive(sessionId, email) {
  if (!sessionId) return true; // Gracefully handle legacy tokens
  const now = Date.now();
  const cached = sessionCache.get(sessionId);
  if (cached && (now - cached.lastChecked < 10000)) {
    return cached.isActive;
  }

  try {
    let session = await UserSession.findOne({ sessionId, isActive: true });
    if (!session && email) {
      const cleanEmail = String(email).toLowerCase().trim();
      const activeCutoff = new Date(Date.now() - 15 * 60 * 1000);
      const otherActiveSession = await UserSession.findOne({
        email: cleanEmail,
        isActive: true,
        sessionId: { $ne: sessionId },
        lastActivity: { $gte: activeCutoff }
      });
      if (!otherActiveSession) {
        session = await UserSession.findOneAndUpdate(
          { sessionId },
          {
            $set: {
              email: cleanEmail,
              sessionId,
              isActive: true,
              lastActivity: new Date()
            }
          },
          { upsert: true, new: true }
        );
      }
    }
    const isActive = Boolean(session);
    sessionCache.set(sessionId, { isActive, lastChecked: now, email });
    if (session) {
      // Debounce updating lastActivity (every 30s)
      if (!session.lastActivity || (now - new Date(session.lastActivity).getTime() > 30000)) {
        UserSession.updateOne({ _id: session._id }, { $set: { lastActivity: new Date() } }).catch(() => {});
      }
    }
    return isActive;
  } catch (err) {
    console.error('Session verification error:', err.message);
    return true; // fail-open on DB connection hiccup to avoid unneeded lockouts
  }
}

const ALLOWED_GMAIL_EXCEPTIONS = new Set(['deansiddharth@gmail.com', 'tcetestingmail@gmail.com']);
const ALLOWED_STUDENT_EXCEPTION = 'siddharthk@student.tce.edu';

function getUnauthorizedDomainMessage(email) {
  const em = String(email || '').toLowerCase().trim();
  if (!em) return 'Email address is required.';

  // Whitelisted exceptions for developer / master admin accounts
  if (ALLOWED_GMAIL_EXCEPTIONS.has(em) || em === ALLOWED_STUDENT_EXCEPTION) {
    return null;
  }

  // Strictly block student accounts
  if (em.endsWith('@student.tce.edu')) {
    return 'Student accounts (@student.tce.edu) are not authorized to access the Faculty Appraisal Portal. Please sign in with your official faculty email (@tce.edu).';
  }

  // Strictly enforce institutional @tce.edu domain
  if (!em.endsWith('@tce.edu')) {
    return 'Unauthorized email domain. Only official institutional @tce.edu accounts are permitted to access the TCE Faculty Appraisal Portal.';
  }

  return null;
}

async function revokeUnauthorizedSession(decoded) {
  const email = String(decoded?.email || '').toLowerCase().trim();
  if (decoded?.sessionId) {
    sessionCache.delete(decoded.sessionId);
    await UserSession.updateOne(
      { sessionId: decoded.sessionId },
      { $set: { isActive: false } }
    ).catch(() => {});
  }
  if (email) {
    await UserSession.updateMany(
      { email, isActive: true },
      { $set: { isActive: false } }
    ).catch(() => {});
  }
}

// ── JWT & Live Window Authentication Middleware ─────────────────────────────
async function authenticateToken(request, response, next) {
  const authHeader = request.headers['authorization'];
  const token = (authHeader && authHeader.startsWith('Bearer '))
    ? authHeader.slice(7)
    : (request.query?.token || null);

  if (!token) {
    return response.status(401).json({ message: 'Authentication token is required.' });
  }

  try {
    let decoded;
    try {
      decoded = jwt.verify(token, jwtSecret, { issuer: 'tce-auth-server' });
    } catch (verifyErr) {
      // Allow cryptographically valid tokens issued by this server whose 7-day expiry elapsed while the faculty tab remained open
      decoded = jwt.verify(token, jwtSecret, { ignoreExpiration: true });
    }
    request.user = decoded;

    const domainMessage = getUnauthorizedDomainMessage(decoded.email);
    if (domainMessage) {
      await revokeUnauthorizedSession(decoded);
      return response.status(401).json({
        success: false,
        domainBlocked: true,
        message: domainMessage,
      });
    }

    // Single active window enforcement: verify session is still live
    if (decoded.sessionId) {
      const active = await isSessionActive(decoded.sessionId, decoded.email);
      if (!active) {
        return response.status(401).json({
          message: 'Your session was terminated because your account was logged into on another device/window.',
          sessionTerminated: true
        });
      }
    }

    next();
  } catch {
    return response.status(403).json({ message: 'Invalid or expired token.' });
  }
}

app.get('/api/health', (_request, response) => {
  response.status(200).json({ status: 'ok' });
});

app.get('/api/auth/heartbeat', authenticateToken, (req, res) => {
  res.status(200).json({
    status: 'ok',
    active: true,
    sessionId: req.user?.sessionId,
    user: req.user?.email
  });
});

app.post('/api/auth/logout', authenticateToken, async (req, res) => {
  try {
    if (req.user?.sessionId) {
      await UserSession.updateOne(
        { sessionId: req.user.sessionId },
        { $set: { isActive: false } }
      );
      sessionCache.delete(req.user.sessionId);
    }
    return res.status(200).json({ success: true, message: 'Signed out successfully.' });
  } catch (err) {
    return res.status(200).json({ success: true });
  }
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
  MECT: 'Mechatronics',
  CSBS: 'Computer Science and Business Systems',
  AMCS: 'Applied Mathematics and Computational Science',
  MATH: 'Mathematics',
  PHY: 'Physics',
  CHEM: 'Chemistry',
  ENG: 'English',
  AI: 'Artificial Intelligence',
  ARCH: "Architecture (T'SEDA)",
  FT: 'Fashion Technology',
  DS: 'Data Science',
  MATHS: 'Mathematics',
  PHYSICS: 'Physics',
  CHEMISTRY: 'Chemistry',
  HUMANITIES: 'Humanities & Social Sciences',
  ALL: 'All Academic Departments'
};

// ── Helper to infer department from email suffix ──────────────────────────────
export function inferDepartmentFromEmail(email) {
  const clean = String(email || '').toLowerCase().trim();
  if (!clean) return '';
  if (clean === 'gkmech@tce.edu') return 'MECT';
  if (clean === 'dnjayakumar@tce.edu') return 'EEE';
  if (/eee@tce\.edu$/i.test(clean)) return 'EEE';
  if (/ece@tce\.edu$/i.test(clean)) return 'ECE';
  if (/mech@tce\.edu$/i.test(clean)) return 'MECH';
  if (/civ@tce\.edu$/i.test(clean)) return 'CIVIL';
  if (/it@tce\.edu$/i.test(clean)) return 'IT';
  if (/mect@tce\.edu$/i.test(clean)) return 'MECT';
  if (/csbs@tce\.edu$/i.test(clean)) return 'CSBS';
  if (/ca@tce\.edu$/i.test(clean)) return 'MCA';
  if (/(?:amcs|ds)@tce\.edu$/i.test(clean)) return 'AMCS';
  if (/arch@tce\.edu$/i.test(clean)) return 'ARCH';
  if (/mat@tce\.edu$/i.test(clean)) return 'MATH';
  if (/phy@tce\.edu$/i.test(clean)) return 'PHY';
  if (/chem@tce\.edu$/i.test(clean)) return 'CHEM';
  if (/eng@tce\.edu$/i.test(clean)) return 'ENG';
  if (/ft@tce\.edu$/i.test(clean)) return 'FT';
  if (/cse@tce\.edu$/i.test(clean)) return 'CSE';
  return '';
}

// ── Helper to detect Principal, IQAC accounts and leadership emails ──────────
export function isOfficialRoleEmail(email) {
  const em = String(email || '').toLowerCase().trim();
  return (
    /^hod[a-z]{2,6}@tce\.edu$/i.test(em) ||
    em === 'iqac@tce.edu' ||
    em === 'headiqac@tce.edu' ||
    em === 'registrar@tce.edu' ||
    em === 'principal@tce.edu' ||
    em === 'tcetestingmail@gmail.com'
  );
}

export function isPrincipalEmail(email) {
  const em = String(email || '').toLowerCase().trim();
  return em === 'principal@tce.edu' || em === 'tcetestingmail@gmail.com';
}

export function isIqacAccount(email, record = null) {
  if (!email && !record) return false;
  const em = String(email || '').toLowerCase().trim();

  // Official departmental HOD accounts (e.g. hodca@tce.edu, hodcse@tce.edu) are strictly HOD accounts, never IQAC
  if (/^hod[a-z]{2,6}@tce\.edu$/i.test(em)) {
    return false;
  }

  // Personal Head IQAC faculty emails sign in to their personal Faculty appraisal workbench
  // (official IQAC audit login uses headiqac@tce.edu or iqac@tce.edu)
  if (em === 'pccse@tce.edu' || em === 'pchitracse@tce.edu') {
    return false;
  }

  // Generic / institutional IQAC accounts
  if (em === 'iqac@tce.edu' || em === 'headiqac@tce.edu' || em.includes('iqac')) {
    return true;
  }

  // Record-level inspection (only when not logging in via a personal non-IQAC faculty email)
  if (record && String(record.role || '').toUpperCase() === 'IQAC') {
    const recEmail = String(record.email || '').toLowerCase().trim();
    if ((!em || em.includes('iqac')) && (isOfficialRoleEmail(recEmail) || recEmail.includes('iqac'))) {
      return true;
    }
  }

  return false;
}

const KNOWN_HOD_PERSONAL_EMAILS = [
  'spmcse@tce.edu',
  'jjlkarch@tce.edu', 'jinujoshua@tce.edu', 'jjkarch@tce.edu',
  'vvchem@tce.edu', 'velkannan@tce.edu',
  'samciv@tce.edu',
  'mkkdit@tce.edu',
  'bmece@tce.edu', 'naveenmegaa@tce.edu',
  'r_rajanprakash@tce.edu', 'rrpeee@tce.edu',
  'gjjeng@tce.edu',
  'cdcse@tce.edu', 'cdit@tce.edu',
  'aaamat@tce.edu', 'anithavalli@tce.edu',
  'pmmech@tce.edu', 'psmeee@tce.edu',
  'mmphy@tce.edu', 'manickam-mahendran@tce.edu',
  'rpift@tce.edu',
];

const APEX_NON_HOD_EMAILS = new Set([
  'principal@tce.edu',
  'registrar@tce.edu',
  'siddharthk@student.tce.edu',
  'headiqac@tce.edu',
  'iqac@tce.edu',
  'tcetestingmail@gmail.com',
  'deansiddharth@gmail.com',
  'rhmech@tce.edu',
  ...FORMER_HOD_PERSONAL_EMAILS,
]);

export function isHodDesignation(designation) {
  const clean = String(designation || '').replace(/\bcent(?:er|re)\s+head\b/gi, '');
  return /\b(head|hod)\b/i.test(clean);
}

async function getHodEmailSet() {
  const hodMembers = await FacultyMember.find(
    {
      $or: [
        { role: 'HOD' },
        { designation: /\b(head|hod)\b/i }
      ]
    },
    { email: 1, personalEmail: 1, hodEmail: 1, alternateEmails: 1, designation: 1 }
  ).lean();
  const hodSet = new Set(KNOWN_HOD_PERSONAL_EMAILS);
  for (const m of hodMembers) {
    if (hasFullDeanDesignation(m.designation) || hasFullRegistrarDesignation(m.designation)) {
      continue;
    }
    [m.email, m.personalEmail, m.hodEmail, ...(m.alternateEmails || [])].forEach((e) => {
      const clean = String(e || '').toLowerCase().trim();
      if (
        clean &&
        !APEX_NON_HOD_EMAILS.has(clean) &&
        !KNOWN_DEAN_PERSONAL_EMAILS.includes(clean) &&
        !KNOWN_REGISTRAR_PERSONAL_EMAILS.includes(clean)
      ) {
        hodSet.add(clean);
      }
    });
  }
  return hodSet;
}

function isHodEmailInSet(email, hodSet) {
  const clean = String(email || '').toLowerCase().trim();
  if (!clean) return false;
  if (
    KNOWN_DEAN_PERSONAL_EMAILS.includes(clean) ||
    KNOWN_REGISTRAR_PERSONAL_EMAILS.includes(clean) ||
    FORMER_HOD_PERSONAL_EMAILS.includes(clean)
  ) {
    return false;
  }
  return hodSet.has(clean) || /^hod[a-z]{2,6}@tce\.edu$/i.test(clean);
}

// ── Protected Apex Leadership Accounts (Cannot be altered via Webhook) ──────
const PROTECTED_LEADERSHIP_EMAILS = new Set([
  'principal@tce.edu',
  'registrar@tce.edu',
  'iqac@tce.edu',
  'headiqac@tce.edu',
  'pccse@tce.edu',
  'siddharthk@student.tce.edu',
  'deansiddharth@gmail.com',
  'tcetestingmail@gmail.com'
]);

// ── Secure Enterprise ERP Webhook Endpoint (Zero-Trust Hardened) ─────────────
async function handleFacultyWebhook(req, res) {
  // Shield 1: Secret & Cryptographic Verification (No Hardcoded Fallback)
  const expectedSecret = process.env.WEBHOOK_SECRET;
  if (!expectedSecret || typeof expectedSecret !== 'string' || expectedSecret.trim().length < 16) {
    console.error('⛔ Webhook Error: WEBHOOK_SECRET is not configured in server environment.');
    return res.status(503).json({
      success: false,
      message: 'Service Unavailable: ERP Webhook endpoint is currently unconfigured or disabled.'
    });
  }

  const signatureHeader = req.headers['x-tce-signature'] || req.headers['x-hub-signature-256'];
  const tokenHeader = req.headers['x-webhook-secret'] || req.headers['x-api-key'] || 
    (req.headers['authorization']?.startsWith('Bearer ') ? req.headers['authorization'].slice(7) : null);

  let isAuthenticated = false;

  // Option A: HMAC SHA-256 Signature verification
  if (signatureHeader) {
    try {
      const rawPayload = req.rawBody || Buffer.from(JSON.stringify(req.body ?? {}));
      const computedHash = crypto.createHmac('sha256', expectedSecret).update(rawPayload).digest('hex');
      const expectedSig = signatureHeader.replace(/^sha256=/i, '').trim();
      if (computedHash.length === expectedSig.length && crypto.timingSafeEqual(Buffer.from(computedHash), Buffer.from(expectedSig))) {
        isAuthenticated = true;
      }
    } catch (sigErr) {
      console.warn('⚠️ Webhook HMAC signature verification error:', sigErr.message);
    }
  }

  // Option B: Timing-safe token comparison
  if (!isAuthenticated && tokenHeader) {
    try {
      const providedToken = String(tokenHeader).trim();
      const expectedBuf = Buffer.from(expectedSecret);
      const providedBuf = Buffer.from(providedToken);
      if (expectedBuf.length === providedBuf.length && crypto.timingSafeEqual(expectedBuf, providedBuf)) {
        isAuthenticated = true;
      }
    } catch (tokErr) {
      console.warn('⚠️ Webhook token comparison error:', tokErr.message);
    }
  }

  if (!isAuthenticated) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized: Invalid or missing webhook security token / signature.'
    });
  }

  // Shield 5: IP Whitelisting Guard (Activated if ERP_ALLOWED_IPS is configured)
  if (process.env.ERP_ALLOWED_IPS) {
    const allowedIps = process.env.ERP_ALLOWED_IPS.split(',').map(ip => ip.trim()).filter(Boolean);
    const clientIp = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
    if (allowedIps.length > 0 && !allowedIps.includes(clientIp)) {
      console.warn(`⛔ Webhook blocked unauthorized IP: ${clientIp}`);
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Webhook requests are restricted to authorized ERP gateway IP addresses.'
      });
    }
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
      designation = 'Assistant Professor',
      joiningDate,
      active = true
    } = req.body ?? {};

    if (!email || !department) {
      return res.status(400).json({
        success: false,
        message: 'Missing required webhook fields: email and department are mandatory.'
      });
    }

    const cleanEmail = String(email).toLowerCase().trim();

    // Shield 2: Strict Institutional Domain Validation
    if (!cleanEmail.endsWith('@tce.edu') || cleanEmail.endsWith('@student.tce.edu')) {
      return res.status(400).json({
        success: false,
        message: 'Rejected: Only institutional faculty accounts (@tce.edu) can be provisioned via ERP webhook. Personal and student accounts are prohibited.'
      });
    }

    // Shield 3: Apex Role Lockout (Never allow setting Principal, Registrar, Admin, or IQAC via webhook)
    const attemptedRole = String(role || '').toUpperCase().trim();
    if (['PRINCIPAL', 'REGISTRAR', 'ADMIN', 'IQAC'].includes(attemptedRole) || attemptedRole.includes('HOD')) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Apex institutional leadership roles (Principal, Registrar, IQAC, HOD) cannot be provisioned or modified via automated webhook.'
      });
    }

    // Shield 4: Protected Account Guard (Prevent modifying or hijacking existing leadership entities)
    if (PROTECTED_LEADERSHIP_EMAILS.has(cleanEmail) || /^hod[a-z]{2,6}@tce\.edu$/i.test(cleanEmail)) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Protected institutional leadership account cannot be modified via automated webhook.'
      });
    }

    // Sanitize aliases: Ensure aliases are valid @tce.edu and do not contain leadership accounts
    let userAliases = Array.isArray(alternateEmails) ? alternateEmails.map(e => String(e).toLowerCase().trim()) : [];
    userAliases = userAliases.filter(e => e && e.endsWith('@tce.edu') && !e.endsWith('@student.tce.edu') && !PROTECTED_LEADERSHIP_EMAILS.has(e) && !/^hod[a-z]{2,6}@tce\.edu$/i.test(e));
    if (!userAliases.includes(cleanEmail)) userAliases.push(cleanEmail);

    let cleanPersonal = personalEmail ? String(personalEmail).toLowerCase().trim() : '';
    if (cleanPersonal && (!cleanPersonal.endsWith('@tce.edu') || cleanPersonal.endsWith('@student.tce.edu') || PROTECTED_LEADERSHIP_EMAILS.has(cleanPersonal))) {
      cleanPersonal = cleanEmail;
    }

    const cleanDept = department.toUpperCase().trim();
    const cleanDeptName = departmentName || DEPARTMENT_NAME_MAP[cleanDept] || `${cleanDept} Department`;
    const cleanRole = 'Faculty'; // Strictly clamped to Faculty
    const cleanDesignation = designation && designation !== 'Principal' && designation !== 'Registrar' ? designation.trim() : 'Assistant Professor';

    // Find existing faculty member
    let facultyRecord = await FacultyMember.findOne({
      $or: [
        { email: cleanEmail },
        { personalEmail: cleanEmail },
        { alternateEmails: cleanEmail },
        ...(staffId ? [{ staffId: String(staffId).trim() }] : [])
      ]
    });

    if (facultyRecord) {
      if (['Principal', 'Registrar', 'IQAC', 'Admin'].includes(facultyRecord.role) || PROTECTED_LEADERSHIP_EMAILS.has(facultyRecord.email)) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: Cannot overwrite existing leadership profile via ERP webhook.'
        });
      }
    }

    const updateFields = {
      name: name ? String(name).trim() : (facultyRecord?.name || 'Faculty Member'),
      department: cleanDept,
      departmentName: cleanDeptName,
      role: cleanRole,
      designation: cleanDesignation,
      active: Boolean(active),
      alternateEmails: userAliases
    };

    if (staffId) updateFields.staffId = String(staffId).trim();
    if (cleanPersonal) updateFields.personalEmail = cleanPersonal;
    if (hodEmail && /^hod[a-z]{2,6}@tce\.edu$/i.test(hodEmail)) updateFields.hodEmail = hodEmail.toLowerCase().trim();
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

    console.log(`✅ ERP Webhook: Synchronized faculty profile for ${facultyRecord.name} (${cleanEmail}) in ${cleanDept}`);

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
  const { credential, forceTerminateOther = false } = request.body ?? {};

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

    // ── Email Domain Security Guard ──────────────────────────────────────────
    const domainMessage = getUnauthorizedDomainMessage(verifiedEmail);
    if (domainMessage) {
      console.warn(`⛔ Unauthorized login blocked for: ${verifiedEmail}`);
      return response.status(403).json({
        success: false,
        domainBlocked: true,
        message: domainMessage,
      });
    }

    // Look up in master faculty directory (prioritize exact personal/institutional email match)
    let facultyRecord = await FacultyMember.findOne({ email: verifiedEmail });
    if (!facultyRecord) {
      facultyRecord = await FacultyMember.findOne({ personalEmail: verifiedEmail });
    }
    const altUnderscoreEmail = verifiedEmail.includes('_')
      ? verifiedEmail.replace(/_/g, '[underscore]')
      : (verifiedEmail.includes('[underscore]') ? verifiedEmail.replace(/\[underscore\]/g, '_') : null);
    if (!facultyRecord && altUnderscoreEmail) {
      facultyRecord = await FacultyMember.findOne({
        $or: [
          { email: altUnderscoreEmail },
          { personalEmail: altUnderscoreEmail },
          { alternateEmails: altUnderscoreEmail }
        ]
      });
    }
    if (!facultyRecord && !isOfficialRoleEmail(verifiedEmail)) {
      facultyRecord = await FacultyMember.findOne({
        alternateEmails: verifiedEmail,
        email: { $not: /^hod[a-z]{2,6}@tce\.edu$/i },
        role: { $nin: ['HOD', 'IQAC', 'Principal', 'Registrar'] }
      });
    }
    if (!facultyRecord) {
      facultyRecord = await FacultyMember.findOne({
        $or: [
          { hodEmail: verifiedEmail },
          { alternateEmails: verifiedEmail }
        ]
      });
    }
    if (!facultyRecord && verifiedEmail.endsWith('@tce.edu')) {
      const emailPrefix = verifiedEmail.split('@')[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      facultyRecord = await FacultyMember.findOne({
        profileUrl: new RegExp(`/${emailPrefix}\\.html$`, 'i'),
        ...(!isOfficialRoleEmail(verifiedEmail) ? {
          email: { $not: /^hod[a-z]{2,6}@tce\.edu$/i },
          role: { $nin: ['HOD', 'IQAC', 'Principal', 'Registrar'] }
        } : {})
      });
    }

    // Auto-link alternate email in directory so cross-device logins share identical identity
    // (Strictly keep personal faculty emails separate from official institutional role accounts)
    const recordIsOfficial = Boolean(
      facultyRecord && (
        isOfficialRoleEmail(facultyRecord.email) ||
        ['HOD', 'IQAC', 'Principal', 'Registrar'].includes(facultyRecord.role)
      )
    );
    const canAutoLinkEmail = Boolean(
      facultyRecord &&
      verifiedEmail &&
      !facultyRecord.alternateEmails?.includes(verifiedEmail) &&
      !(recordIsOfficial && !isOfficialRoleEmail(verifiedEmail)) &&
      !(!recordIsOfficial && isOfficialRoleEmail(verifiedEmail))
    );
    if (canAutoLinkEmail) {
      try {
        await FacultyMember.updateOne(
          { _id: facultyRecord._id },
          { $addToSet: { alternateEmails: verifiedEmail } }
        );
        facultyRecord.alternateEmails = [...(facultyRecord.alternateEmails || []), verifiedEmail];
      } catch (linkErr) {
        console.warn('Auto-link alternate email warning:', linkErr.message);
      }
    }

    // Determine Role, Department & Designation (Dynamic lookup by email entry)
    let assignedRole = 'Faculty';
    const inferredDeptFromEmail = inferDepartmentFromEmail(verifiedEmail);
    let assignedDept = normalizeDepartmentCode(facultyRecord?.department) || inferredDeptFromEmail || 'CSE';
    let assignedDeptName = facultyRecord?.departmentName || DEPARTMENT_NAME_MAP[assignedDept] || 'Computer Science and Engineering';
    let assignedDesignation = facultyRecord?.designation || 'Assistant Professor';

    if (verifiedEmail === 'registrar@tce.edu' || verifiedEmail === 'siddharthk@student.tce.edu') {
      assignedRole = 'Registrar';
      assignedDept = 'ALL';
      assignedDeptName = 'All Academic Departments';
      assignedDesignation = 'Registrar / Master Admin';
    } else if (isPrincipalEmail(verifiedEmail)) {
      assignedRole = 'Principal';
      assignedDept = 'ALL';
      assignedDeptName = 'All Academic Departments';
      assignedDesignation = 'Principal';
    } else if (isIqacAccount(verifiedEmail, facultyRecord)) {
      assignedRole = 'IQAC';
      assignedDept = 'ALL';
      assignedDeptName = 'All Academic Departments';
      assignedDesignation = (facultyRecord?.designation && /iqac/i.test(facultyRecord.designation))
        ? facultyRecord.designation
        : (verifiedEmail === 'headiqac@tce.edu')
          ? 'Professor, Head IQAC'
          : 'IQAC Head';
    } else if (verifiedEmail === 'deansiddharth@gmail.com') {
      assignedRole = 'Faculty';
      assignedDept = normalizeDepartmentCode(facultyRecord?.department) || inferredDeptFromEmail || 'CSE';
      assignedDeptName = facultyRecord?.departmentName || DEPARTMENT_NAME_MAP[assignedDept] || 'Computer Science and Engineering';
      assignedDesignation = facultyRecord?.designation || 'Assistant Professor';
    } else if (/^hod[a-z]{2,6}@tce\.edu$/i.test(verifiedEmail)) {
      // Official generic departmental HOD account (e.g. hodca@tce.edu, hodcse@tce.edu, hodece@tce.edu)
      assignedRole = 'HOD';
      assignedDesignation = facultyRecord?.designation || 'Professor & Head (HOD)';
      const hodMatch = verifiedEmail.match(/^hod([a-z]+)@/i);
      let rawDept = facultyRecord?.department || (hodMatch ? hodMatch[1].toUpperCase() : inferredDeptFromEmail || 'CSE');
      assignedDept = normalizeDepartmentCode(rawDept);
      assignedDeptName = assignedDept === 'AI'
        ? 'Artificial Intelligence'
        : (facultyRecord?.departmentName || DEPARTMENT_NAME_MAP[assignedDept] || '');
    } else if (facultyRecord) {
      // Individual personal faculty/HOD-personal account (e.g. pccse@tce.edu, shalinie@tce.edu, gjjeng@tce.edu, etc.)
      assignedRole = (facultyRecord.role === 'HOD' || facultyRecord.role === 'IQAC')
        ? 'Faculty'
        : (facultyRecord.role || 'Faculty');
      const isPccsePersonal = verifiedEmail === 'pccse@tce.edu' || verifiedEmail === 'pchitracse@tce.edu';
      let rawDept = isPccsePersonal ? 'MCA' : (facultyRecord.department || inferredDeptFromEmail || 'CSE');
      assignedDept = (assignedRole === 'IQAC' || assignedRole === 'Registrar' || assignedRole === 'Principal') ? 'ALL' : normalizeDepartmentCode(rawDept);
      assignedDeptName = (assignedRole === 'IQAC' || assignedRole === 'Registrar' || assignedRole === 'Principal')
        ? 'All Academic Departments'
        : (assignedDept === 'AI'
            ? 'Artificial Intelligence'
            : (assignedDept === 'MCA' && isPccsePersonal ? 'Computer Applications' : (facultyRecord.departmentName || DEPARTMENT_NAME_MAP[assignedDept] || '')));
      assignedDesignation = facultyRecord.designation || 'Assistant Professor';
    }

    const isArchFacultyAccount =
      assignedDept === 'ARCH' ||
      /arch@tce\.edu$/i.test(verifiedEmail) ||
      verifiedEmail === 'crissindhu@tce.edu' ||
      /arch|tseda/i.test(facultyRecord?.department || '') ||
      /arch|tseda/i.test(facultyRecord?.departmentName || '') ||
      /\/BARCH\//i.test(facultyRecord?.profileUrl || '');
    if (isArchFacultyAccount && !['IQAC', 'Registrar', 'Principal'].includes(assignedRole)) {
      assignedDept = 'ARCH';
      assignedDeptName = "Architecture (T'SEDA)";
    }

    if (
      verifiedEmail === 'spmcse@tce.edu' ||
      verifiedEmail === 'hodai@tce.edu' ||
      String(facultyRecord?.staffId || '').toUpperCase() === 'SPMCSE'
    ) {
      assignedDesignation = 'Professor & Head I/C';
    }

    const isOfficialLogin = isOfficialRoleEmail(verifiedEmail) || ['HOD', 'IQAC', 'Principal', 'Registrar'].includes(assignedRole);
    const rawPersonalEmail = facultyRecord?.personalEmail || facultyRecord?.email || verifiedEmail;
    const canonicalPersonalEmail = (!isOfficialLogin && isOfficialRoleEmail(rawPersonalEmail))
      ? verifiedEmail
      : rawPersonalEmail;
    const canonicalHodEmail = facultyRecord?.hodEmail || (assignedRole === 'HOD' ? `hod${assignedDept.toLowerCase()}@tce.edu` : '');
    let userAliases = (facultyRecord?.alternateEmails || [verifiedEmail])
      .filter(Boolean)
      .map(e => String(e).toLowerCase().trim());
    if (isOfficialLogin) {
      userAliases = userAliases.filter(e => e === verifiedEmail || isOfficialRoleEmail(e));
    } else {
      userAliases = userAliases.filter(e => !isOfficialRoleEmail(e));
    }
    if (!userAliases.includes(verifiedEmail)) userAliases.push(verifiedEmail);
    const normCanonicalPersonal = String(canonicalPersonalEmail || '').toLowerCase().trim();
    if (normCanonicalPersonal && (!isOfficialLogin ? !isOfficialRoleEmail(normCanonicalPersonal) : isOfficialRoleEmail(normCanonicalPersonal)) && !userAliases.includes(normCanonicalPersonal)) {
      userAliases.push(normCanonicalPersonal);
    }
    const normCanonicalHod = String(canonicalHodEmail || '').toLowerCase().trim();
    if (assignedRole === 'HOD' && normCanonicalHod && !userAliases.includes(normCanonicalHod)) {
      userAliases.push(normCanonicalHod);
    }
    if (verifiedEmail === 'principal@tce.edu') {
      ['principal@tce.edu'].forEach(em => {
        if (!userAliases.includes(em)) userAliases.push(em);
      });
    }

    // ── Single Active Session / Live Window Lock ────────────────────────────
    const SESSION_IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes live window
    const activeCutoff = new Date(Date.now() - SESSION_IDLE_TIMEOUT_MS);
    const lookupEmails = Array.from(new Set([...userAliases.map(e => e.toLowerCase().trim()), verifiedEmail]));

    const existingLiveSession = await UserSession.findOne({
      email: { $in: lookupEmails },
      isActive: true,
      lastActivity: { $gte: activeCutoff }
    }).sort({ lastActivity: -1 });

    if (existingLiveSession && !forceTerminateOther) {
      const friendlyDevice = existingLiveSession.deviceInfo || 'another browser/device';
      const lastActiveTime = new Date(existingLiveSession.lastActivity).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return response.status(409).json({
        success: false,
        sessionConflict: true,
        message: `An active session is currently live on ${friendlyDevice} (Active at ${lastActiveTime}). Institutional policy permits only one active window per faculty account.`,
        lastActivity: existingLiveSession.lastActivity,
        deviceInfo: existingLiveSession.deviceInfo
      });
    }

    // If forcing login or clearing stale sessions, deactivate previous sessions
    if (existingLiveSession && forceTerminateOther) {
      await UserSession.updateMany(
        { email: { $in: lookupEmails } },
        { $set: { isActive: false } }
      );
      sessionCache.clear();
    }

    const newSessionId = crypto.randomUUID();
    const rawUserAgent = request.headers['user-agent'] || 'Web Browser';
    const isMobileDevice = /mobile|iphone|ipad|android|touch/i.test(rawUserAgent);
    const friendlyDevice = isMobileDevice
      ? `Mobile Device (${rawUserAgent.slice(0, 30)})`
      : `Desktop / Laptop (${rawUserAgent.slice(0, 30)})`;
    const clientIp = request.headers['x-forwarded-for'] || request.socket?.remoteAddress || '';

    await UserSession.create({
      email: verifiedEmail,
      sessionId: newSessionId,
      deviceInfo: friendlyDevice,
      ipAddress: String(clientIp).slice(0, 45),
      isActive: true,
      lastActivity: new Date()
    });

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
      sessionId: newSessionId,
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
      detail: error?.message || String(error),
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
    const userRole = (req.user?.role || '').toUpperCase().trim();

    const SUBMISSION_TESTING_WHITELIST = new Set([
      'siddharthk@student.tce.edu',
      'tcetestingmail@gmail.com',
      'testprof@tce.edu',
      'deansiddharth@gmail.com',
    ]);
    if (!SUBMISSION_TESTING_WHITELIST.has(verifiedEmail)) {
      console.log(`⛔ Self-appraisal submission temporarily closed for ${verifiedEmail}`);
      return res.status(403).json({
        success: false,
        message: 'Self-appraisal submission portal is temporarily closed.'
      });
    }

    // Institutional Governance Guard: Principal and official generic role accounts never submit self-appraisals
    if (userRole === 'PRINCIPAL' || isPrincipalEmail(verifiedEmail)) {
      console.log('⛔ Principal account is an apex administrative role and does not submit self-appraisals.');
      return res.status(403).json({ success: false, message: 'Principal account is for institutional review and governance only. Self-appraisal submission is disabled.' });
    }
    if (
      /^hod[a-z]{2,6}@tce\.edu$/i.test(verifiedEmail) ||
      verifiedEmail === 'headiqac@tce.edu' ||
      verifiedEmail === 'iqac@tce.edu' ||
      verifiedEmail === 'registrar@tce.edu'
    ) {
      return res.status(403).json({
        success: false,
        message: 'Official institutional role accounts are for review/governance only. Please sign in with your personal @tce.edu email to edit or submit your self-appraisal.'
      });
    }

    if (!timeline || !isValidAcademicTimeline(timeline)) {
      console.log('❌ REJECTED: Timeline missing or invalid:', timeline);
      return res.status(400).json({ success: false, message: 'Email and Timeline fields are strictly required.' });
    }

    if (!section1Data || typeof section1Data !== 'object') {
      console.log('❌ REJECTED: section1Data missing or not an object.');
      return res.status(400).json({ success: false, message: 'section1Data is required and must be an object.' });
    }

    // Resolve authoritative department from master directory (prioritize exact personal email match)
    let facultyRecord = await FacultyMember.findOne({ email: verifiedEmail });
    if (!facultyRecord) {
      facultyRecord = await FacultyMember.findOne({ personalEmail: verifiedEmail });
    }
    if (!facultyRecord && !isOfficialRoleEmail(verifiedEmail)) {
      facultyRecord = await FacultyMember.findOne({
        alternateEmails: verifiedEmail,
        email: { $not: /^hod[a-z]{2,6}@tce\.edu$/i },
        role: { $nin: ['HOD', 'IQAC', 'Principal', 'Registrar'] }
      });
    }
    if (!facultyRecord) {
      facultyRecord = await FacultyMember.findOne({
        $or: [
          { hodEmail: verifiedEmail },
          { alternateEmails: verifiedEmail }
        ]
      });
    }

    const rawCanonical = facultyRecord?.personalEmail || facultyRecord?.email || req.user?.personalEmail || verifiedEmail;
    const canonicalEmail = (!isOfficialRoleEmail(verifiedEmail) && isOfficialRoleEmail(rawCanonical))
      ? verifiedEmail
      : String(rawCanonical).toLowerCase().trim();

    const isPccsePersonal = verifiedEmail === 'pccse@tce.edu' || verifiedEmail === 'pchitracse@tce.edu';
    const recordDeptClean = (facultyRecord?.department && String(facultyRecord.department).toUpperCase() !== 'ALL')
      ? facultyRecord.department
      : '';
    const bodyDeptClean = (department && String(department).toUpperCase() !== 'ALL') ? department : '';
    const jwtDeptClean = (req.user?.department && String(req.user.department).toUpperCase() !== 'ALL') ? req.user.department : '';
    const targetDept = (req.body?.department === 'ARCH' || department === 'ARCH')
      ? 'ARCH'
      : (isPccsePersonal
          ? 'MCA'
          : (recordDeptClean || inferDepartmentFromEmail(verifiedEmail) || bodyDeptClean || jwtDeptClean || 'CSE'));
    const targetDeptName = targetDept === 'ARCH'
      ? 'Department of Architecture (TSEDA)'
      : (targetDept === 'MCA'
          ? 'Computer Applications'
          : (facultyRecord?.departmentName && !/all academic departments/i.test(facultyRecord.departmentName)
              ? facultyRecord.departmentName
              : (departmentName || req.user?.departmentName || DEPARTMENT_NAME_MAP[targetDept] || 'Computer Science and Engineering')));

    const candidateEmails = [
      canonicalEmail,
      verifiedEmail,
      req.user?.email,
      req.user?.personalEmail,
      ...(facultyRecord?.alternateEmails || [])
    ]
      .filter(Boolean)
      .map(e => String(e).toLowerCase().trim())
      .filter(e => isOfficialRoleEmail(verifiedEmail) || !isOfficialRoleEmail(e));
    const uniqueCandidateEmails = Array.from(new Set(candidateEmails));

    const existingFilter = {
      email: { $in: uniqueCandidateEmails },
      timeline: timeline.trim(),
    };

    const existingDoc = await Appraisal.findOne(existingFilter);
    const targetedFilter = existingDoc 
      ? { _id: existingDoc._id }
      : { email: canonicalEmail, timeline: timeline.trim() };

    // ── GUARD: Protect permanently-locked appraisals from draft overwrites ────
    // Only block auto-saves when the record is truly finalized (RATIFIED / isLocked).
    // Submitted-but-unlocked records (Pending, Approved, etc.) still receive section
    // updates so that in-progress marking edits are never silently dropped.
    const existingStatus = String(existingDoc?.appraisalStatus || '').toUpperCase().trim();
    const isPermanentlyLocked = existingDoc && (
      existingDoc.isLocked === true ||
      existingStatus === 'RATIFIED' ||
      existingStatus === 'ENDORSED' ||
      existingStatus === 'PRINCIPAL APPROVED'
    );

    const isIncomingDraft = (req.body?.appraisalStatus === 'Draft' || !req.body?.appraisalStatus) && !req.body?.isSubmitted;

    if (isPermanentlyLocked && isIncomingDraft) {
      console.log(`🛡️ Blocked draft overwrite: Appraisal for ${canonicalEmail} [${timeline}] is permanently locked (${existingDoc.appraisalStatus}). Preserving finalized state.`);
      return res.status(200).json({
        success: true,
        message: 'Appraisal is permanently locked (Ratified/Endorsed). Draft overwrite ignored.',
        data: existingDoc,
      });
    }

    // For already-submitted (but not locked) records arriving via auto-save draft,
    // preserve the existing appraisalStatus/isSubmitted so they don't get demoted to Draft.
    const isAlreadySubmitted = existingDoc && existingStatus !== 'DRAFT' && (
      existingDoc.isSubmitted === true ||
      ['PENDING', 'SUBMITTED', 'PENDING REVIEW', 'APPROVED', 'HOD APPROVED', 'IQAC APPROVED'].includes(existingStatus)
    );

    const hasMeaningfulSectionData = (sec) => {
      if (!sec || typeof sec !== 'object') return false;
      return Object.values(sec).some((val) => {
        if (Array.isArray(val)) return val.length > 0;
        if (val && typeof val === 'object') {
          return Object.values(val).some(v => v !== null && v !== undefined && String(v).trim() !== '');
        }
        return val !== null && val !== undefined && String(val).trim() !== '';
      });
    };

    const hodEmailSet = await getHodEmailSet();
    const resolvedDesignation = facultyRecord?.designation || req.user?.designation || (req.user?.role === 'HOD' ? 'Professor & Head (HOD)' : 'Assistant Professor');
    const submitterIsRegistrar = isRegistrarPersonalSubmission(canonicalEmail, {
      email: verifiedEmail,
      designation: resolvedDesignation,
      section9Data: req.body?.section9Data
    });
    const submitterIsDean = !submitterIsRegistrar && (
      isDeanPersonalSubmission(canonicalEmail, { email: verifiedEmail, designation: resolvedDesignation }) ||
      isDeanPersonalSubmission(verifiedEmail, { email: canonicalEmail, designation: resolvedDesignation })
    );
    const submitterIsHod = !submitterIsRegistrar && !submitterIsDean && Boolean(
      facultyRecord?.role === 'HOD' ||
      isHodEmailInSet(canonicalEmail, hodEmailSet) ||
      isHodEmailInSet(verifiedEmail, hodEmailSet) ||
      isHodDesignation(resolvedDesignation)
    );

    const mergedSection1Data = hasMeaningfulSectionData(section1Data) ? section1Data : (existingDoc?.section1Data || section1Data || {});
    const mergedSection2Data = hasMeaningfulSectionData(section2Data) ? section2Data : (existingDoc?.section2Data || section2Data || {});
    const mergedSection3Data = hasMeaningfulSectionData(section3Data) ? section3Data : (existingDoc?.section3Data || section3Data || {});
    const mergedSection4Data = hasMeaningfulSectionData(section4Data) ? section4Data : (existingDoc?.section4Data || section4Data || {});
    const mergedSection5Data = hasMeaningfulSectionData(section5Data) ? section5Data : (existingDoc?.section5Data || section5Data || {});
    const mergedSection6Data = hasMeaningfulSectionData(section6Data) ? section6Data : (existingDoc?.section6Data || section6Data || {});
    const mergedSection7Data = hasMeaningfulSectionData(section7Data) ? section7Data : (existingDoc?.section7Data || section7Data || {});
    const mergedSection8Data = hasMeaningfulSectionData(section8Data) ? section8Data : (existingDoc?.section8Data || section8Data || {});
    const mergedSection9Data = hasMeaningfulSectionData(section9Data) ? section9Data : (existingDoc?.section9Data || section9Data || {});

    const incomingHodScores = req.body?.hodSubsectionScores;
    const mergedHodSubsectionScores = (incomingHodScores && typeof incomingHodScores === 'object' && Object.keys(incomingHodScores).length > 0)
      ? incomingHodScores
      : (existingDoc?.hodSubsectionScores || {});

    const mergedSectionsForScoring = buildNormalizedSectionDataForScoring({
      department: targetDept,
      section1Data: mergedSection1Data,
      section2Data: mergedSection2Data,
      section3Data: mergedSection3Data,
      section4Data: mergedSection4Data,
      section5Data: mergedSection5Data,
      section6Data: mergedSection6Data,
      section7Data: mergedSection7Data,
      section8Data: mergedSection8Data,
      section9Data: mergedSection9Data,
    });
    const computedEffectiveScores = computeEffectiveScores(mergedSectionsForScoring, mergedHodSubsectionScores, targetDept);

    // ── 2. Atomic upsert — overwrites historical entries instead of crashing on E11000 ──
    const replacementPayload = {
      timeline: timeline.trim(),
      facultyName: facultyName || facultyRecord?.name || req.user.name || 'Faculty Member',
      designation: resolvedDesignation,
      email: canonicalEmail,
      department: targetDept,
      departmentName: targetDeptName,
      isHodSubmission: submitterIsHod,
      isDeanSubmission: submitterIsDean,
      isRegistrarSubmission: submitterIsRegistrar,
      isSubmitted: Boolean(req.body?.isSubmitted || (existingDoc?.isSubmitted && existingStatus !== 'DRAFT')),
      submittedAt: req.body?.isSubmitted
        ? (existingDoc?.submittedAt || new Date())
        : (existingDoc?.submittedAt || null),
      convertedScore: typeof computedEffectiveScores.grandTotal === 'number' ? computedEffectiveScores.grandTotal : (Number(convertedScore) || 0),
      systemScore: typeof computedEffectiveScores.autoGrandTotal === 'number' ? computedEffectiveScores.autoGrandTotal : (Number(convertedScore) || 0),
      hodRemarks: existingDoc?.hodRemarks || '',
      hodEvaluatedAt: existingDoc?.hodEvaluatedAt || null,
      hodEvaluatedBy: existingDoc?.hodEvaluatedBy || '',
      hodSubsectionScores: mergedHodSubsectionScores,
      subsectionRemarks: (req.body?.subsectionRemarks && typeof req.body.subsectionRemarks === 'object' && Object.keys(req.body.subsectionRemarks).length > 0)
        ? req.body.subsectionRemarks
        : (existingDoc?.subsectionRemarks || {}),
      section1Data: mergedSection1Data,
      section2Data: mergedSection2Data,
      section3Data: mergedSection3Data,
      section4Data: mergedSection4Data,
      section5Data: mergedSection5Data,
      section6Data: mergedSection6Data,
      section7Data: mergedSection7Data,
      section8Data: mergedSection8Data,
      section9Data: mergedSection9Data,
      iqacStatus: (req.body?.isSubmitted && String(existingDoc?.iqacStatus || '').toUpperCase().trim() === 'DRAFT') ? 'Pending' : (existingDoc?.iqacStatus || 'Pending'),
      iqacAuditRemarks: existingDoc?.iqacAuditRemarks || '',
      iqacExcluded: Boolean(existingDoc?.iqacExcluded),
      iqacEvaluatedAt: existingDoc?.iqacEvaluatedAt || null,
      iqacEvaluatedBy: existingDoc?.iqacEvaluatedBy || '',
      principalApprovalStatus: (req.body?.isSubmitted && String(existingDoc?.principalApprovalStatus || '').toUpperCase().trim() === 'DRAFT') ? 'Pending' : (existingDoc?.principalApprovalStatus || 'Pending'),
      principalRemarks: existingDoc?.principalRemarks || '',
      principalEndorsedAt: existingDoc?.principalEndorsedAt || null,
      unlockedReleaseTag: existingDoc?.unlockedReleaseTag || '',
      appraisalStatus: (!submitterIsRegistrar && isIqacApprovedRecord(existingDoc))
        ? 'IQAC Approved'
        : ((isAlreadySubmitted && isIncomingDraft)
            ? existingDoc.appraisalStatus
            : (req.body?.appraisalStatus || existingDoc?.appraisalStatus || 'Draft')),
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
    const sectionData = buildNormalizedSectionDataForScoring(appraisal);
    const hodScores = appraisal.hodSubsectionScores || {};

    // Compute scores using the shared scoring engine
    const effectiveScoreObj = computeEffectiveScores(sectionData, hodScores, appraisal.department);

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

    // Also check FacultyMember master directory
    let masterRecord = null;
    if (requestEmail) {
      masterRecord = await FacultyMember.findOne({ email: requestEmail });
      if (!masterRecord) {
        masterRecord = await FacultyMember.findOne({ personalEmail: requestEmail });
      }
      if (!masterRecord) {
        masterRecord = await FacultyMember.findOne({
          $or: [
            { hodEmail: requestEmail },
            { alternateEmails: requestEmail }
          ]
        });
      }
    }

    // Check if caller has legitimate elevated privileges (HOD, Registrar, Principal, IQAC, Admin)
    const hasElevatedPrivilege = (
      tokenRole === 'HOD' || 
      tokenRole === 'REGISTRAR' ||
      tokenRole === 'PRINCIPAL' ||
      tokenRole === 'IQAC' ||
      tokenRole === 'ADMIN' ||
      (masterRecord?.role === 'HOD') ||
      masterRecord?.role === 'Registrar' ||
      masterRecord?.role === 'Principal' ||
      masterRecord?.role === 'IQAC' ||
      masterRecord?.role === 'Admin' ||
      isIqacAccount(requestEmail, masterRecord) ||
      requestEmail === 'siddharthk@student.tce.edu' || 
      requestEmail === 'registrar@tce.edu' ||
      isPrincipalEmail(requestEmail) ||
      /^hod[a-z]{2,6}@tce\.edu$/i.test(requestEmail)
    );

    // Faculty mode check: If caller explicitly requests individual faculty mode (e.g. self-appraisal), or lacks elevated privileges
    const isExplicitFacultyRequest = requestRole === 'FACULTY' || !hasElevatedPrivilege;

    // Dynamic Role Check: If user has elevated privileges and is not in explicit faculty mode, retrieve departmental/campus queue
    const isElevated = !isExplicitFacultyRequest && hasElevatedPrivilege;

    let queryFilter = {};

    const isMasterOrRegistrarAccount =
      requestEmail === 'siddharthk@student.tce.edu' ||
      requestEmail === 'registrar@tce.edu';
    const isExplicitHodRequest = !isMasterOrRegistrarAccount && (
      requestRole === 'HOD' ||
      /^hod[a-z]{2,6}@tce\.edu$/i.test(requestEmail)
    );

    if (isElevated) {
      // Determine department scoping
      const deptQuery = (req.query.department || '').toUpperCase().trim();
      const userDept = (tokenDept || masterRecord?.department || '').toUpperCase().trim();
      const isSuperAdminOrRegistrar = !isExplicitHodRequest && (
                                     requestEmail === 'siddharthk@student.tce.edu' ||
                                     requestEmail === 'registrar@tce.edu' ||
                                     isPrincipalEmail(requestEmail) ||
                                     isIqacAccount(requestEmail, masterRecord) ||
                                     requestRole === 'REGISTRAR' ||
                                     requestRole === 'PRINCIPAL' ||
                                     requestRole === 'IQAC' ||
                                     tokenRole === 'REGISTRAR' ||
                                     tokenRole === 'PRINCIPAL' ||
                                     tokenRole === 'IQAC'
      );

      if (isSuperAdminOrRegistrar && (deptQuery === 'ALL' || !deptQuery)) {
        console.log("🏛️ Registrar/Broad Access: Fetching across all 16 departments.");
        queryFilter = {};
      } else {
        const hodMatch = requestEmail.match(/^hod([a-z]+)@/i);
        const inferredHodDept = hodMatch ? normalizeDepartmentCode(hodMatch[1].toUpperCase()) : '';
        const targetDept = isExplicitHodRequest
          ? ((masterRecord?.department && masterRecord.department.toUpperCase() !== 'ALL')
              ? masterRecord.department.toUpperCase()
              : (inferredHodDept || (deptQuery && deptQuery !== 'ALL' ? deptQuery : '') || (userDept && userDept !== 'ALL' ? userDept : 'MCA')))
          : ((deptQuery && deptQuery !== 'ALL') ? deptQuery : userDept);

        if (targetDept && targetDept !== 'ALL') {
          const normTarget = normalizeDepartmentCode(targetDept);
          const deptAliases = [targetDept, normTarget];
          if (normTarget === 'MCA') deptAliases.push('CA', 'Computer Applications');
          if (normTarget === 'CIVIL') deptAliases.push('CIV', 'Civil Engineering');
          if (normTarget === 'MATH') deptAliases.push('MAT', 'MATHS', 'Mathematics');
          if (normTarget === 'CHEM') deptAliases.push('CHEMISTRY', 'CHM');
          if (normTarget === 'PHY') deptAliases.push('PHYSICS');
          if (normTarget === 'AI') deptAliases.push('AIDS');
          if (normTarget === 'MECT') deptAliases.push('MCT');
          if (normTarget === 'ARCH') deptAliases.push('ARCHITECTURE', "Architecture (T'SEDA)", 'TSEDA');

          const deptRegexes = Array.from(new Set(deptAliases)).map(d => new RegExp(`^${d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'));
          console.log(`🏢 Scoped Access: Fetching submissions for department [${normTarget}] with aliases:`, deptAliases);
          queryFilter = {
            department: { $in: deptRegexes }
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
        ...(masterRecord?.alternateEmails || [])
      ]
        .filter(Boolean)
        .map(e => e.toLowerCase().trim())
        .filter(e => e === requestEmail || !isOfficialRoleEmail(e));

      queryFilter = {
        $or: [
          { email: { $in: allAliases } },
          { facultyEmail: { $in: allAliases } }
        ]
      };
    }

    const isIQACUser = !isExplicitHodRequest && (tokenRole === 'IQAC' || requestRole === 'IQAC' || masterRecord?.role === 'IQAC' || isIqacAccount(requestEmail, masterRecord));
    const isPrincipalUser = !isExplicitHodRequest && (tokenRole === 'PRINCIPAL' || requestRole === 'PRINCIPAL' || masterRecord?.role === 'Principal' || isPrincipalEmail(requestEmail));

    if (isElevated && (isIQACUser || isPrincipalUser)) {
      const allowedStatuses = [
        'Draft', 'DRAFT', 'draft',
        'Pending', 'PENDING', 'pending',
        'Submitted', 'SUBMITTED', 'submitted',
        'Pending Review', 'PENDING REVIEW',
        'Approved', 'APPROVED', 'approved',
        'HoD Approved', 'HOD APPROVED', 'hod approved',
        'IQAC Approved', 'IQAC APPROVED', 'iqac approved',
        'Not Approved by IQAC', 'NOT APPROVED BY IQAC',
        'Ratified', 'RATIFIED', 'ratified',
        'Endorsed', 'ENDORSED', 'endorsed',
        'Principal Approved', 'PRINCIPAL APPROVED'
      ];
      queryFilter = {
        ...queryFilter,
        $or: [
          { appraisalStatus: { $in: allowedStatuses } },
          { isSubmitted: true },
          { principalApprovalStatus: { $in: ['Ratified', 'RATIFIED', 'Endorsed', 'ENDORSED', 'Approved', 'APPROVED'] } },
          { iqacStatus: { $in: ['IQAC Approved', 'IQAC APPROVED', 'Not Approved by IQAC', 'NOT APPROVED BY IQAC', 'Approved', 'Not Approved'] } }
        ]
      };
    }

    // HoD, Leadership and Institutional Reviews must NEVER include test accounts (purely for testing) or student accounts
    if (isElevated) {
      queryFilter = {
        $and: [
          queryFilter,
          { email: { $not: /@student\.tce\.edu$/i } },
          { facultyEmail: { $not: /@student\.tce\.edu$/i } },
          { email: { $not: /@gmail\.com$/i } },
          { facultyEmail: { $not: /@gmail\.com$/i } },
          { email: { $nin: ['deansiddharth@gmail.com', 'siddharthk@student.tce.edu'] } },
          { facultyEmail: { $nin: ['deansiddharth@gmail.com', 'siddharthk@student.tce.edu'] } }
        ]
      };
    }

    const rawRecords = await Appraisal.find(queryFilter).sort({ updatedAt: -1, createdAt: -1 }).lean();
    const hodEmailSet = await getHodEmailSet();
    const isCallerOnlyHod = isExplicitHodRequest || (isElevated && !(
      requestEmail === 'siddharthk@student.tce.edu' ||
      requestEmail === 'registrar@tce.edu' ||
      isPrincipalEmail(requestEmail) ||
      isIqacAccount(requestEmail, masterRecord) ||
      requestRole === 'REGISTRAR' ||
      requestRole === 'PRINCIPAL' ||
      requestRole === 'IQAC' ||
      tokenRole === 'REGISTRAR' ||
      tokenRole === 'PRINCIPAL' ||
      tokenRole === 'IQAC'
    ));
    const seenMap = new Map();
    const records = [];
    for (const doc of rawRecords) {
      normalizeAppraisalLeadershipDecision(doc);
      const emailKey = (doc.email || doc.facultyEmail || '').toLowerCase().trim();
      const recordIsRegistrarSubmission = isRegistrarPersonalSubmission(emailKey, doc);
      const recordIsDeanSubmission = !recordIsRegistrarSubmission && isDeanPersonalSubmission(emailKey, doc);
      const recordIsHodSubmission = !recordIsRegistrarSubmission && !recordIsDeanSubmission && (
        Boolean(doc.isHodSubmission) || isHodEmailInSet(emailKey, hodEmailSet) || isHodDesignation(doc.designation)
      );
      doc.isRegistrarSubmission = recordIsRegistrarSubmission;
      doc.isDeanSubmission = recordIsDeanSubmission;
      doc.isHodSubmission = recordIsHodSubmission;
      if (isElevated) {
        if (
          emailKey === 'deansiddharth@gmail.com' ||
          emailKey === 'siddharthk@student.tce.edu' ||
          emailKey.endsWith('@student.tce.edu') ||
          emailKey.endsWith('@gmail.com') ||
          emailKey.endsWith('@googlemail.com')
        ) {
          continue; // Purely for testing — never return test accounts to HoD or higher authorities
        }
        if (isCallerOnlyHod && (recordIsHodSubmission || recordIsDeanSubmission || recordIsRegistrarSubmission)) {
          continue; // HOD, Dean & Registrar appraisals bypass HOD review
        }
        if (isCallerOnlyHod && String(doc.appraisalStatus || '').toUpperCase().trim() === 'DRAFT') {
          const tlKeyDraft = (doc.timeline || '').trim();
          const deptKeyDraft = (doc.department || '').toUpperCase() === 'ARCH' ? '_ARCH' : '';
          const compositeKeyDraft = `${emailKey}_${tlKeyDraft}${deptKeyDraft}`;
          if (emailKey && !seenMap.has(compositeKeyDraft)) {
            seenMap.set(compositeKeyDraft, true);
            records.push({
              _id: doc._id,
              email: doc.email,
              facultyEmail: doc.facultyEmail || doc.email,
              facultyName: doc.facultyName || doc.name || '',
              name: doc.name || doc.facultyName || '',
              department: doc.department,
              timeline: doc.timeline,
              appraisalStatus: 'Draft',
              isDraftPresenceOnly: true,
            });
          }
          continue; // Unsubmitted Drafts are never shown in HOD inbox/audit; stub preserves Non-Logged Users accuracy
        }
      }
      const liveScores = computeEffectiveScores(
        buildNormalizedSectionDataForScoring(doc),
        doc.hodSubsectionScores || {},
        doc.department
      );
      if (typeof liveScores.grandTotal === 'number') {
        doc.convertedScore = liveScores.grandTotal;
        doc.systemScore = liveScores.autoGrandTotal;
      }
      const tlKey = (doc.timeline || '').trim();
      const deptKey = (doc.department || '').toUpperCase() === 'ARCH' ? '_ARCH' : '';
      const compositeKey = `${emailKey}_${tlKey}${deptKey}`;
      if (emailKey && !seenMap.has(compositeKey)) {
        seenMap.set(compositeKey, true);
        records.push(doc);
      }
    }
    res.set('Cache-Control', 'no-store');
    console.log(`✅ Database retrieval sync complete. Total rows returned: ${records.length} (deduplicated from ${rawRecords.length} raw docs) for filter:`, JSON.stringify(queryFilter));
    return res.status(200).json({ success: true, count: records.length, data: records });

  } catch (error) {
    console.error("❌ CRITICAL BACKEND FETCH ERROR:", error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ── Master Directory Endpoints ───────────────────────────────────────────────

// 1. Get all departments with HOD & counts
app.get('/api/directory/departments', authenticateToken, async (req, res) => {
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
app.get('/api/directory/faculty', authenticateToken, async (req, res) => {
  try {
    const { department, role, q } = req.query;
    const filter = { active: { $ne: false } };

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

    const faculty = await FacultyMember.find(filter).sort({ role: -1, name: 1 }).lean();
    return res.status(200).json({ success: true, count: faculty.length, data: faculty });
  } catch (err) {
    console.error('❌ Failed to query faculty directory:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// 3. Faculty Lookup by Email
app.get('/api/directory/lookup', authenticateToken, async (req, res) => {
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
app.post('/api/directory/transfer', authenticateToken, async (req, res) => {
  try {
    const callerRole = (req.user?.role || '').toUpperCase().trim();
    const callerEmail = (req.user?.email || '').toLowerCase().trim();
    const isAuthorized = ['REGISTRAR', 'ADMIN'].includes(callerRole) ||
      callerEmail === 'registrar@tce.edu' || callerEmail === 'siddharthk@student.tce.edu';
    if (!isAuthorized) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Only the Registrar or Administrator can reassign faculty departments.'
      });
    }

    const { email, newDepartment, newDepartmentName, newRole } = req.body;
    if (!email || !newDepartment) {
      return res.status(400).json({ success: false, message: 'email and newDepartment are required.' });
    }

    const cleanTransferEmail = email.toLowerCase().trim();
    const normNewDept = normalizeDepartmentCode(newDepartment);
    const resolvedNewDeptName = newDepartmentName || DEPARTMENT_NAME_MAP[normNewDept] || normNewDept;

    const updated = await FacultyMember.findOneAndUpdate(
      {
        $or: [
          { email: cleanTransferEmail },
          { personalEmail: cleanTransferEmail },
          { alternateEmails: cleanTransferEmail }
        ]
      },
      {
        $set: {
          department: normNewDept,
          departmentName: resolvedNewDeptName,
          ...(newRole ? { role: newRole } : {})
        }
      },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ success: false, message: 'Faculty member not found to update.' });
    }

    const allTransferEmails = Array.from(new Set([
      cleanTransferEmail,
      updated.email,
      updated.personalEmail,
      ...(updated.alternateEmails || [])
    ].filter(Boolean).map(e => String(e).toLowerCase().trim())));

    // Update all appraisals (Draft, Pending, Submitted, etc.) to reflect the reassigned department
    await Appraisal.updateMany(
      {
        $or: [
          { email: { $in: allTransferEmails } },
          { facultyEmail: { $in: allTransferEmails } }
        ]
      },
      {
        $set: {
          department: normNewDept,
          departmentName: resolvedNewDeptName
        }
      }
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

// 5. Official Appraisal Document Downloads (General Engineering)
app.get('/api/documents/guidelines', (req, res) => {
  const candidates = [
    path.join(__dirname, '..', 'public', 'Faculty Appraisal Evaluation Guidelines.pdf'),
    path.join(__dirname, '..', 'dist', 'Faculty Appraisal Evaluation Guidelines.pdf'),
  ];
  for (const filePath of candidates) {
    if (fs.existsSync(filePath)) {
      return res.download(filePath, 'Faculty Appraisal Evaluation Guidelines.pdf');
    }
  }
  return res.status(404).json({ success: false, message: 'Evaluation Guidelines PDF not found' });
});

app.get('/api/documents/template', (req, res) => {
  const candidates = [
    path.join(__dirname, '..', 'public', 'Faculty Appraisal Template Aug 2026.docx'),
    path.join(__dirname, '..', 'dist', 'Faculty Appraisal Template Aug 2026.docx'),
  ];
  for (const filePath of candidates) {
    if (fs.existsSync(filePath)) {
      return res.download(filePath, 'Faculty Appraisal Template Aug 2026.docx');
    }
  }
  return res.status(404).json({ success: false, message: 'Appraisal Template Word document not found' });
});

// Official Appraisal Document Downloads (TSEDA - Architecture)
app.get('/api/documents/tseda-guidelines', (req, res) => {
  const candidates = [
    path.join(__dirname, '..', 'public', 'TSEDA Faculty Appraisal Evaluation Guidelines.pdf'),
    path.join(__dirname, '..', 'dist', 'TSEDA Faculty Appraisal Evaluation Guidelines.pdf'),
    path.join(__dirname, '..', 'public', 'tseda_faculty_appraisal_evaluation_guidelines.pdf'),
    path.join(__dirname, '..', 'dist', 'tseda_faculty_appraisal_evaluation_guidelines.pdf'),
  ];
  for (const filePath of candidates) {
    if (fs.existsSync(filePath)) {
      return res.download(filePath, 'TSEDA Faculty Appraisal Evaluation Guidelines.pdf');
    }
  }
  return res.status(404).json({ success: false, message: 'TSEDA Evaluation Guidelines PDF not found' });
});

app.get('/api/documents/tseda-template', (req, res) => {
  const candidates = [
    path.join(__dirname, '..', 'public', 'TSEDA Faculty Appraisal Template Aug 2026.docx'),
    path.join(__dirname, '..', 'dist', 'TSEDA Faculty Appraisal Template Aug 2026.docx'),
    path.join(__dirname, '..', 'public', 'tseda_faculty_appraisal_template.docx'),
    path.join(__dirname, '..', 'dist', 'tseda_faculty_appraisal_template.docx'),
  ];
  for (const filePath of candidates) {
    if (fs.existsSync(filePath)) {
      return res.download(filePath, 'TSEDA Faculty Appraisal Template Aug 2026.docx');
    }
  }
  return res.status(404).json({ success: false, message: 'TSEDA Appraisal Template Word document not found' });
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
app.post('/api/directory/change-hod', authenticateToken, async (req, res) => {
  try {
    const callerRole = (req.user?.role || '').toUpperCase().trim();
    const callerEmail = (req.user?.email || '').toLowerCase().trim();
    const isAuthorized = ['REGISTRAR', 'ADMIN', 'PRINCIPAL'].includes(callerRole) ||
      callerEmail === 'registrar@tce.edu' || isPrincipalEmail(callerEmail) || callerEmail === 'siddharthk@student.tce.edu';
    if (!isAuthorized) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Only the Registrar, Principal, or Administrator can reassign departmental leadership.'
      });
    }

    const { department, newHodEmail } = req.body;
    if (!department || !newHodEmail) {
      return res.status(400).json({ success: false, message: 'department and newHodEmail are required.' });
    }

    const deptCode = department.toUpperCase().trim();
    const targetEmail = newHodEmail.toLowerCase().trim();
    const genericHodEmail = `hod${deptCode.toLowerCase()}@tce.edu`;

    // 1. Find the incoming new HoD's personal faculty profile (never pick a generic hod* record)
    const incomingFaculty = await FacultyMember.findOne({
      $and: [
        {
          $or: [
            { email: targetEmail },
            { personalEmail: targetEmail },
            { alternateEmails: targetEmail }
          ]
        },
        { email: { $not: /^hod[a-z]{2,6}@tce\.edu$/i } }
      ],
      department: deptCode
    }) || await FacultyMember.findOne({
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

    // 2. Demote the outgoing personal HoD for this department (keep role: 'Faculty')
    const outgoingHod = await FacultyMember.findOne({
      department: deptCode,
      email: { $not: /^hod[a-z]{2,6}@tce\.edu$/i },
      _id: { $ne: incomingFaculty._id },
      $or: [
        { hodEmail: genericHodEmail },
        { designation: /\b(head|hod)\b/i },
        { role: 'HOD' }
      ]
    });

    if (outgoingHod) {
      outgoingHod.role = 'Faculty';
      outgoingHod.hodEmail = '';
      outgoingHod.alternateEmails = (outgoingHod.alternateEmails || []).filter(e => !/^hod[a-z]{2,6}@tce\.edu$/i.test(e));
      if (outgoingHod.designation.toLowerCase().includes('head')) {
        outgoingHod.designation = outgoingHod.designation.replace(/\s*(?:&|,|\/)\s*Head\s*(?:I\/c)?/i, '').trim() || 'Professor';
      }
      await outgoingHod.save();
      console.log(`✓ Demoted outgoing HoD: ${outgoingHod.name} (${outgoingHod.email}) to regular Faculty`);
    }

    // 3. Promote the incoming personal faculty profile to Head while keeping personal role as 'Faculty'
    if (!/^hod[a-z]{2,6}@tce\.edu$/i.test(incomingFaculty.email)) {
      incomingFaculty.role = 'Faculty';
      incomingFaculty.hodEmail = genericHodEmail;
      incomingFaculty.alternateEmails = (incomingFaculty.alternateEmails || []).filter(e => !/^hod[a-z]{2,6}@tce\.edu$/i.test(e));
      if (!incomingFaculty.alternateEmails.includes(incomingFaculty.email)) {
        incomingFaculty.alternateEmails.push(incomingFaculty.email);
      }
      if (!incomingFaculty.designation.toLowerCase().includes('head')) {
        incomingFaculty.designation = `${incomingFaculty.designation} & Head`;
      }
      await incomingFaculty.save();
    }

    // Update or create the official generic departmental HOD login account (hod<dept>@tce.edu)
    let officialHodDoc = await FacultyMember.findOne({
      department: deptCode,
      $or: [
        { email: genericHodEmail },
        { role: 'HOD' }
      ]
    });
    if (officialHodDoc) {
      officialHodDoc.name = incomingFaculty.name;
      officialHodDoc.designation = incomingFaculty.designation;
      officialHodDoc.role = 'HOD';
      officialHodDoc.department = deptCode;
      officialHodDoc.alternateEmails = [officialHodDoc.email];
      await officialHodDoc.save();
    } else {
      officialHodDoc = await FacultyMember.create({
        staffId: incomingFaculty.staffId || '',
        name: incomingFaculty.name,
        designation: incomingFaculty.designation,
        email: genericHodEmail,
        personalEmail: genericHodEmail,
        hodEmail: genericHodEmail,
        alternateEmails: [genericHodEmail],
        department: deptCode,
        departmentName: incomingFaculty.departmentName || DEPARTMENT_NAME_MAP[deptCode] || '',
        role: 'HOD',
        photo: incomingFaculty.photo || '',
        profileUrl: incomingFaculty.profileUrl || '',
        active: true
      });
    }
    console.log(`✓ Promoted incoming HoD: ${incomingFaculty.name} (${incomingFaculty.email}) with ${officialHodDoc.email}`);

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
app.post('/api/directory/seed', authenticateToken, async (req, res) => {
  try {
    const callerRole = (req.user?.role || '').toUpperCase().trim();
    const callerEmail = (req.user?.email || '').toLowerCase().trim();
    const isAuthorized = ['REGISTRAR', 'ADMIN'].includes(callerRole) ||
      callerEmail === 'registrar@tce.edu' || callerEmail === 'siddharthk@student.tce.edu';
    if (!isAuthorized) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Only the Registrar or Administrator can re-seed the master directory.'
      });
    }

    const count = await seedFacultyDirectory(true);
    return res.status(200).json({ success: true, message: `Master directory synced (${count} faculty records).` });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// 7. Register / Onboard New Faculty Member
app.post('/api/directory/register', authenticateToken, async (req, res) => {
  try {
    const callerRole = (req.user?.role || '').toUpperCase().trim();
    const callerEmail = (req.user?.email || '').toLowerCase().trim();
    const canRegister = ['REGISTRAR', 'ADMIN', 'PRINCIPAL', 'HOD'].includes(callerRole) ||
      callerEmail === 'registrar@tce.edu' || isPrincipalEmail(callerEmail) || callerEmail === 'siddharthk@student.tce.edu' ||
      /^hod[a-z]{2,6}@tce\.edu$/i.test(callerEmail);
    if (!canRegister) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Only institutional leadership (Registrar, Principal, HOD) can register new faculty profiles.'
      });
    }

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
      AI: 'Artificial Intelligence'
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


app.post(['/api/appraisals/review', '/appraisals/review'], authenticateToken, async (req, res) => {
  try {
    const { id, appraisalStatus, hodRemarks, subsectionRemarks, hodSubsectionScores, finalScore, email, timeline } = req.body;
    
    // Verify caller has reviewer / leadership authority
    const callerRole = (req.user?.role || '').toUpperCase().trim();
    const callerEmail = (req.user?.email || '').toLowerCase().trim();
    
    let hasLeadershipPrivilege = ['HOD', 'PRINCIPAL', 'REGISTRAR', 'IQAC', 'ADMIN'].includes(callerRole) ||
      callerEmail === 'registrar@tce.edu' ||
      callerEmail === 'siddharthk@student.tce.edu' ||
      isPrincipalEmail(callerEmail) ||
      isIqacAccount(callerEmail) ||
      /^hod[a-z]{2,6}@tce\.edu$/i.test(callerEmail);

    if (!hasLeadershipPrivilege) {
      const fac = await FacultyMember.findOne({
        $or: [
          { email: callerEmail },
          { personalEmail: callerEmail },
          { alternateEmails: callerEmail }
        ]
      });
      if (fac && ['HOD', 'PRINCIPAL', 'REGISTRAR', 'IQAC', 'ADMIN'].includes(String(fac.role).toUpperCase())) {
        hasLeadershipPrivilege = true;
      }
    }

    if (!hasLeadershipPrivilege) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: Only departmental leadership (HOD, IQAC, Principal) can review and evaluate appraisals."
      });
    }

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

    const currentStatus = String(targetRecord.appraisalStatus || '').toUpperCase().trim();
    if (currentStatus === 'DRAFT') {
      return res.status(400).json({
        success: false,
        message: "Cannot review or modify a Draft submission. The faculty member has not submitted this appraisal yet."
      });
    }

    const targetEmailCheck = (targetRecord.email || targetRecord.facultyEmail || email || '').toLowerCase().trim();
    const callerIsOnlyHod = !(
      ['IQAC', 'PRINCIPAL', 'REGISTRAR', 'ADMIN'].includes(callerRole) ||
      callerEmail === 'registrar@tce.edu' ||
      callerEmail === 'siddharthk@student.tce.edu' ||
      isPrincipalEmail(callerEmail) ||
      isIqacAccount(callerEmail)
    );
    if (callerIsOnlyHod) {
      const hodEmailSet = await getHodEmailSet();
      if (
        Boolean(targetRecord.isHodSubmission) ||
        Boolean(targetRecord.isDeanSubmission) ||
        isDeanPersonalSubmission(targetEmailCheck, targetRecord) ||
        isHodEmailInSet(targetEmailCheck, hodEmailSet) ||
        isHodDesignation(targetRecord.designation) ||
        targetEmailCheck === callerEmail
      ) {
        return res.status(403).json({
          success: false,
          message: "Forbidden: HOD and Dean appraisals cannot be reviewed or approved by an HOD. They are routed directly to IQAC and Principal."
        });
      }
      if (isRegistrarPersonalSubmission(targetEmailCheck, targetRecord)) {
        return res.status(403).json({
          success: false,
          message: "Forbidden: Registrar appraisals cannot be reviewed or approved by an HOD. They must be approved by IQAC and Principal."
        });
      }
    }

    // Determine canonical evaluated final score from shared scoring engine
    const cleanedHodScores = (typeof hodSubsectionScores === 'object' && hodSubsectionScores !== null) ? hodSubsectionScores : {};
    const liveScores = computeEffectiveScores(
      buildNormalizedSectionDataForScoring(targetRecord),
      cleanedHodScores,
      targetRecord.department
    );
    const evaluatedConvertedScore = typeof liveScores.grandTotal === 'number'
      ? liveScores.grandTotal
      : (finalScore !== undefined && finalScore !== null
          ? Number(finalScore)
          : (req.body.convertedScore !== undefined && req.body.convertedScore !== null
              ? Number(req.body.convertedScore)
              : targetRecord.convertedScore));

    const isApprovedDecision = ['APPROVED', 'HOD APPROVED'].includes(String(appraisalStatus || '').toUpperCase().trim());
    const updateFields = { 
      appraisalStatus: appraisalStatus, 
      hodRemarks: hodRemarks || "",
      ...(isApprovedDecision ? { hodEvaluatedAt: new Date(), hodEvaluatedBy: callerEmail } : {}),
      subsectionRemarks: typeof subsectionRemarks === 'object' && subsectionRemarks !== null ? subsectionRemarks : {},
      hodSubsectionScores: cleanedHodScores,
      convertedScore: evaluatedConvertedScore,
      ...(typeof liveScores.autoGrandTotal === 'number' ? { systemScore: liveScores.autoGrandTotal } : {}),
      updatedAt: new Date()
    };

    await Appraisal.findByIdAndUpdate(
      targetRecord._id,
      { $set: updateFields },
      { new: true }
    );

    const targetEmail = (targetRecord.email || targetRecord.facultyEmail || email || '').toLowerCase().trim();
    const targetTimeline = targetRecord.timeline || timeline;
    if (targetEmail && targetTimeline) {
      await Appraisal.updateMany(
        { 
          $or: [{ email: targetEmail }, { facultyEmail: targetEmail }],
          timeline: targetTimeline
        },
        { $set: updateFields }
      );
    }

    console.log(`✅ Success: Status updated to [${appraisalStatus}] with Score [${evaluatedConvertedScore}] for ${targetRecord.email}`);

    // Trigger notification email if appraisal is marked 'Not Approved' / Rejected / Returned
    const normApStatus = String(appraisalStatus).toUpperCase().trim();
    const isRejection = ['NOT APPROVED', 'REJECTED', 'FIX NEEDED', 'RETURNED'].includes(normApStatus);
    if (isRejection) {
      try {
        let hodName = 'Head of Department';
        let hodDept = targetRecord.department || '';
        const authHeader = req.headers['authorization'];
        if (authHeader && authHeader.startsWith('Bearer ')) {
          try {
            const decoded = jwt.verify(authHeader.split(' ')[1], jwtSecret);
            if (decoded?.name) hodName = decoded.name;
            if (decoded?.department) hodDept = decoded.department;
          } catch (e) {
            // ignore
          }
        }
        if (!hodName || hodName === 'Head of Department') {
          if (hodDept) {
            const hodMember = await FacultyMember.findOne({ department: new RegExp(`^${hodDept}$`, 'i'), role: 'HOD' });
            if (hodMember?.name) hodName = hodMember.name;
          }
        }

        const facultyRecipient = (targetRecord.facultyEmail || targetRecord.email || email || '').toLowerCase().trim();
        const facName = targetRecord.facultyName || targetRecord.name || '';
        const appTimeline = targetRecord.timeline || timeline || '';

        sendRejectionEmail({
          toEmail: facultyRecipient,
          facultyName: facName,
          timeline: appTimeline,
          hodName,
          hodDepartment: hodDept,
          hodRemarks: hodRemarks || '',
          subsectionRemarks: subsectionRemarks || {},
        }).catch((mailErr) => {
          console.error('❌ [Mailer] Background rejection email error:', mailErr.message);
        });
      } catch (mailTriggerErr) {
        console.error('❌ [Mailer] Failed to trigger rejection email:', mailTriggerErr.message);
      }
    }

    return res.status(200).json({ success: true, message: "Evaluation status and scores recorded successfully." });

  } catch (err) {
    console.error("❌ CRITICAL BACKEND RUNTIME FAULT:", err.message);
    return res.status(500).json({ success: false, message: `Database processing crash: ${err.message}` });
  }
});

// ── Revert / Convert Appraisal to Draft (preserves all data, unlocks for editing) ──
app.post(['/api/appraisals/revert-to-draft', '/appraisals/revert-to-draft'], authenticateToken, async (req, res) => {
  try {
    const { id, email, timeline } = req.body;
    if (!id && (!email || !timeline)) {
      return res.status(400).json({ success: false, message: 'Appraisal ID or email and timeline required.' });
    }

    const allAppraisals = await Appraisal.find({}).sort({ updatedAt: -1, createdAt: -1 });
    const targetRecord = findAppraisalRecordInDb(allAppraisals, id, email, timeline);

    if (!targetRecord) {
      return res.status(404).json({ success: false, message: 'Appraisal record not found.' });
    }

    const callerRole = (req.user?.role || '').toUpperCase().trim();
    const callerEmail = (req.user?.email || '').toLowerCase().trim();
    const isLeadership = ['HOD', 'PRINCIPAL', 'REGISTRAR', 'IQAC', 'ADMIN'].includes(callerRole) ||
      isPrincipalEmail(callerEmail) || callerEmail === 'registrar@tce.edu' || callerEmail === 'siddharthk@student.tce.edu' ||
      /^hod[a-z]{2,6}@tce\.edu$/i.test(callerEmail);
    const targetEmail = (targetRecord.email || targetRecord.facultyEmail || email || '').toLowerCase().trim();
    const isOwner = targetEmail === callerEmail;

    if (!isLeadership && !isOwner) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: You do not have permission to revert this appraisal to Draft."
      });
    }

    const updateFields = {
      appraisalStatus: 'Draft',
      isSubmitted: false,
      isDraft: true,
      isLocked: false,
      principalApprovalStatus: 'Draft',
      iqacStatus: 'Draft',
      submittedAt: null,
      updatedAt: new Date()
    };

    const updated = await Appraisal.findByIdAndUpdate(
      targetRecord._id,
      { $set: updateFields },
      { new: true }
    );

    const targetTimeline = targetRecord.timeline || timeline;
    if (targetEmail && targetTimeline) {
      await Appraisal.updateMany(
        {
          $or: [{ email: targetEmail }, { facultyEmail: targetEmail }],
          timeline: targetTimeline
        },
        { $set: updateFields }
      );
    }

    console.log(`✓ Reverted appraisal to Draft for ${targetEmail} (${targetTimeline}), preserving all data.`);
    return res.status(200).json({
      success: true,
      message: 'Appraisal successfully converted to Draft. Faculty can now edit and re-submit.',
      data: updated
    });
  } catch (err) {
    console.error('❌ Error reverting appraisal to Draft:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ── IQAC Verification & Quality Audit Endpoint ────────────────────────────
app.post(['/api/appraisals/iqac-verify', '/appraisals/iqac-verify'], authenticateToken, async (req, res) => {
  try {
    const callerRole = (req.user?.role || '').toUpperCase().trim();
    const callerEmail = (req.user?.email || '').toLowerCase().trim();
    const isAuthorizedIqac = ['IQAC', 'PRINCIPAL', 'REGISTRAR', 'ADMIN'].includes(callerRole) ||
      isIqacAccount(callerEmail) || isPrincipalEmail(callerEmail) || callerEmail === 'registrar@tce.edu' || callerEmail === 'siddharthk@student.tce.edu';

    if (!isAuthorizedIqac) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: Only IQAC, Principal, or Administrator can perform quality audit verification."
      });
    }

    const { id, iqacStatus, iqacAuditRemarks, iqacExcluded, email, timeline } = req.body;
    if (!id) {
      return res.status(400).json({ success: false, message: "Appraisal ID is required." });
    }

    const allAppraisals = await Appraisal.find({}).sort({ updatedAt: -1, createdAt: -1 });
    const targetRecord = findAppraisalRecordInDb(allAppraisals, id, email, timeline);

    if (!targetRecord) {
      return res.status(404).json({ success: false, message: "No matching appraisal record found." });
    }

    const evaluatorRole = req.body.evaluatorRole || req.body.evaluatedBy || ((req.user?.role === 'Principal' || isPrincipalEmail(callerEmail)) ? 'Principal' : 'IQAC');
    const isRegistrarRecord = isRegistrarPersonalSubmission(targetRecord.email || targetRecord.facultyEmail || email, targetRecord);
    const { updateFields, finalStatus } = applyLeadershipDecision({
      targetRecord,
      decision: iqacStatus,
      evaluatorRole,
      remarks: iqacAuditRemarks,
      excluded: iqacExcluded,
      isRegistrarRecord
    });

    const updatedRecord = await Appraisal.findByIdAndUpdate(
      targetRecord._id,
      { $set: updateFields },
      { new: true }
    );

    const targetEmail = (targetRecord.email || targetRecord.facultyEmail || email || '').toLowerCase().trim();
    if (targetEmail) {
      const timelineFilter = targetRecord.timeline ? { timeline: targetRecord.timeline } : {};
      await Appraisal.updateMany(
        {
          $or: [{ email: targetEmail }, { facultyEmail: targetEmail }],
          ...timelineFilter
        },
        { $set: updateFields }
      );
    }

    console.log(`✅ ${evaluatorRole} Verified: ID [${id}] updated to status [${finalStatus}]`);
    return res.status(200).json({
      success: true,
      message: `Appraisal successfully marked as ${finalStatus} by ${evaluatorRole}.`,
      updatedRecord
    });
  } catch (err) {
    console.error('❌ Error in IQAC Verification API:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ── IQAC Soft Curation Toggle Endpoint ──────────────────────────────────
app.patch(['/api/appraisals/:id/iqac-status', '/appraisals/:id/iqac-status'], authenticateToken, async (req, res) => {
  try {
    const callerRole = (req.user?.role || '').toUpperCase().trim();
    const callerEmail = (req.user?.email || '').toLowerCase().trim();
    const isAuthorizedIqac = ['IQAC', 'PRINCIPAL', 'REGISTRAR', 'ADMIN'].includes(callerRole) ||
      isIqacAccount(callerEmail) || isPrincipalEmail(callerEmail) || callerEmail === 'registrar@tce.edu' || callerEmail === 'siddharthk@student.tce.edu';

    if (!isAuthorizedIqac) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: Only IQAC, Principal, or Administrator can update curation status."
      });
    }

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
      const timelineFilter = targetRecord.timeline ? { timeline: targetRecord.timeline } : {};
      await Appraisal.updateMany(
        {
          $or: [{ email: targetEmail }, { facultyEmail: targetEmail }],
          ...timelineFilter
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
app.post(['/api/appraisals/endorse', '/appraisals/endorse'], authenticateToken, async (req, res) => {
  try {
    const callerRole = (req.user?.role || '').toUpperCase().trim();
    const callerEmail = (req.user?.email || '').toLowerCase().trim();
    const isPrincipalOrAdmin = ['PRINCIPAL', 'REGISTRAR', 'ADMIN'].includes(callerRole) ||
      isPrincipalEmail(callerEmail) || callerEmail === 'registrar@tce.edu' || callerEmail === 'siddharthk@student.tce.edu';

    if (!isPrincipalOrAdmin) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: Only the Principal or Master Administrator can institutionally endorse and ratify appraisals."
      });
    }

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
    const updateFields = {
      appraisalStatus: 'Ratified',
      principalApprovalStatus: 'Ratified',
      principalEndorsedAt: now,
      principalRemarks: (remarks || '').trim(),
      isLocked: true,
      iqacStatus: 'Approved',
      iqacEvaluatedBy: 'Principal',
      iqacEvaluatedAt: now,
      updatedAt: now
    };
    await Appraisal.collection.updateOne(
      { _id: targetRecord._id },
      {
        $set: updateFields
      }
    );

    const targetEmail = (targetRecord.email || targetRecord.facultyEmail || email || '').toLowerCase().trim();
    if (targetEmail) {
      const timelineFilter = targetRecord.timeline ? { timeline: targetRecord.timeline } : {};
      await Appraisal.updateMany(
        {
          $or: [{ email: targetEmail }, { facultyEmail: targetEmail }],
          ...timelineFilter
        },
        { $set: updateFields }
      );
    }

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
        iqacStatus: 'Approved',
        iqacEvaluatedBy: 'Principal',
        iqacEvaluatedAt: now,
        isLocked: true
      }
    });
  } catch (err) {
    console.error("❌ Endorsement processing error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

app.post(['/api/appraisals/delete', '/delete'], authenticateToken, async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ success: false, message: "Missing row identification criteria." });

    const callerRole = (req.user?.role || '').toUpperCase().trim();
    const callerEmail = (req.user?.email || '').toLowerCase().trim();
    const isRegistrarOrAdmin = ['REGISTRAR', 'ADMIN'].includes(callerRole) ||
      callerEmail === 'registrar@tce.edu' || callerEmail === 'siddharthk@student.tce.edu';

    // If not admin/registrar, verify that caller is the owner of this appraisal
    if (!isRegistrarOrAdmin) {
      const allAppraisals = await Appraisal.find({});
      const targetRecord = findAppraisalRecordInDb(allAppraisals, id);
      const isOwner = targetRecord && ((targetRecord.email && targetRecord.email.toLowerCase() === callerEmail) ||
        (targetRecord.facultyEmail && targetRecord.facultyEmail.toLowerCase() === callerEmail));
      if (!isOwner) {
        return res.status(403).json({
          success: false,
          message: "Forbidden: Only the Registrar, Administrator, or the appraisal owner can delete this record."
        });
      }
    }

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

        let systemInstruction = 'You are an academic Head of Department (HoD) at Thiagarajar College of Engineering, an autonomous institution. Write concise, constructive, professional, and encouraging feedback adhering to AICTE and NBA standards. Do not use markdown headers or special markdown formatting (use plain text and clean bullet points if needed). Do not invent facts not in the data.';

        let promptText = '';
        if (mode === 'subsection') {
          promptText = `Evaluate Subsection ${subKey} (${subLabel}).\nFaculty Name: ${facultyName}\nEvaluated Score: ${score} / ${maxMarks} Marks.\nWrite a 1-to-2 sentence constructive observation for the HoD remark box explaining the rationale or recommendation.`;
        } else {
          promptText = `Provide an overall performance appraisal review summary for ${facultyName}.\nScores:\n- Teaching & Learning (Sec I): ${sectionScores.section1Total || 0}/50\n- Research Publications (Sec II): ${sectionScores.section2Total || 0}/55\n- Patents & Innovation (Sec III): ${sectionScores.section3Total || 0}/15\n- Sponsored Research & Consultancy (Sec IV): ${sectionScores.section4Total || 0}/15\n- Total Evaluated Score: ${sectionScores.grandTotal || 0}/200\n\nGenerate exactly 3 clean bullet points:\n• Key Strengths: ...\n• Growth Focus: ...\n• Next Cycle Recommendation: ...`;
        }

        const requestedModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
        const candidateModels = [
          requestedModel,
          'gemini-flash-latest',
          'gemini-3.8-flash',
          'gemini-2.5-flash',
        ].filter((val, idx, self) => val && self.indexOf(val) === idx);

        let aiResult = null;
        let usedModel = null;

        for (const model of candidateModels) {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 6000);

            const response = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'x-goog-api-key': apiKey,
                },
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
                aiResult = candidateText.replace(/\*\*/g, '').replace(/###/g, '');
                usedModel = model;
                break;
              }
            } else {
              const errBody = await response.text().catch(() => '');
              console.warn(`⚠️ Gemini API model ${model} returned HTTP ${response.status}:`, errBody.slice(0, 150));
            }
          } catch (modelErr) {
            console.warn(`⚠️ Gemini model ${model} attempt failed:`, modelErr.message);
          }
        }

        if (aiResult) {
          return res.status(200).json({
            success: true,
            suggestion: aiResult,
            source: usedModel,
          });
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

// Database policy enforcement: Purge all unauthorized @gmail.com & @student.tce.edu data
async function enforceDomainSecurityPolicy() {
  try {
    // 1. Purge non-whitelisted @gmail.com appraisals (preserve only deansiddharth@gmail.com)
    const appraisalFilter = {
      $and: [
        {
          $or: [
            { email: /@gmail\.com$/i },
            { facultyEmail: /@gmail\.com$/i }
          ]
        },
        { email: { $ne: 'deansiddharth@gmail.com' } },
        { facultyEmail: { $ne: 'deansiddharth@gmail.com' } }
      ]
    };
    const appDel = await Appraisal.deleteMany(appraisalFilter);
    if (appDel.deletedCount > 0) {
      console.log(`🧹 Enforce Security Policy: Purged ${appDel.deletedCount} unauthorized @gmail.com appraisal record(s).`);
    }

    // 2. Purge all student appraisals (@student.tce.edu)
    const studentAppDel = await Appraisal.deleteMany({
      $or: [
        { email: /@student\.tce\.edu$/i },
        { facultyEmail: /@student\.tce\.edu$/i }
      ]
    });
    if (studentAppDel.deletedCount > 0) {
      console.log(`🧹 Enforce Security Policy: Purged ${studentAppDel.deletedCount} student appraisal record(s).`);
    }

    // 2b. Purge appraisal data for testing accounts: deansiddharth@gmail.com and siddharthk@student.tce.edu
    const testAppDel = await Appraisal.deleteMany({
      $or: [
        { email: { $in: ['deansiddharth@gmail.com', 'siddharthk@student.tce.edu'] } },
        { facultyEmail: { $in: ['deansiddharth@gmail.com', 'siddharthk@student.tce.edu'] } }
      ]
    });
    if (testAppDel.deletedCount > 0) {
      console.log(`🧹 Enforce Security Policy: Purged ${testAppDel.deletedCount} test appraisal record(s).`);
    }

    // 2c. Purge all 2026-2027 timeline appraisals
    const timeline2627Del = await Appraisal.deleteMany({
      timeline: { $regex: /2026.*2027|2026.*27/i }
    });
    if (timeline2627Del.deletedCount > 0) {
      console.log(`🧹 Enforce Security Policy: Purged ${timeline2627Del.deletedCount} appraisal record(s) for 2026-2027 timeline.`);
    }

    // 2d. Re-synchronize convertedScore and systemScore across all appraisals with computeEffectiveScores
    try {
      const allAppraisals = await Appraisal.find({}).lean();
      let resyncedCount = 0;
      for (const rec of allAppraisals) {
        const fullSec = {
          ...(rec.section1Data || {}),
          ...(rec.section2Data || {}),
          ...(rec.section3Data || {}),
          ...(rec.section4Data || {}),
          ...(rec.section5Data || {}),
          ...(rec.section6Data || {}),
          ...(rec.section7Data || {}),
          ...(rec.section8Data || {}),
          ...(rec.section9Data || {}),
        };
        const computed = computeEffectiveScores(fullSec, rec.hodSubsectionScores || {}, rec.department);
        const correctScore = computed.grandTotal;
        if (rec.convertedScore !== correctScore || rec.systemScore !== correctScore) {
          await Appraisal.updateOne(
            { _id: rec._id },
            { $set: { convertedScore: correctScore, systemScore: correctScore } }
          );
          resyncedCount++;
        }
      }
      if (resyncedCount > 0) {
        console.log(`📊 Synchronized scores: Updated ${resyncedCount} appraisal record(s) to match the official scoring engine.`);
      }
    } catch (syncErr) {
      console.warn('Score synchronization warning:', syncErr.message);
    }

    // 3. Purge sessions
    const sessDel = await UserSession.deleteMany({
      email: { $regex: /@gmail\.com$/i, $nin: ['deansiddharth@gmail.com', 'tcetestingmail@gmail.com'] }
    });
    if (sessDel.deletedCount > 0) {
      console.log(`🧹 Enforce Security Policy: Purged ${sessDel.deletedCount} unauthorized @gmail.com session(s).`);
    }

    const studentSessDel = await UserSession.deleteMany({
      email: { $regex: /@student\.tce\.edu$/i, $ne: 'siddharthk@student.tce.edu' }
    });
    if (studentSessDel.deletedCount > 0) {
      console.log(`🧹 Enforce Security Policy: Purged ${studentSessDel.deletedCount} student session(s).`);
    }

    // 4. Remove any student accounts from facultymembers
    await FacultyMember.deleteMany({
      email: { $regex: /@student\.tce\.edu$/i, $ne: 'siddharthk@student.tce.edu' }
    });

    // 5. Ensure master accounts exist in master directory with exact roles
    const deanExists = await FacultyMember.findOne({ email: 'deansiddharth@gmail.com' });
    if (!deanExists) {
      await FacultyMember.create({
        staffId: 'DEANSIDDHARTH',
        name: 'Dr. Siddharth (Testing)',
        designation: 'Assistant Professor',
        email: 'deansiddharth@gmail.com',
        personalEmail: 'deansiddharth@gmail.com',
        hodEmail: 'hodcse@tce.edu',
        alternateEmails: ['deansiddharth@gmail.com'],
        department: 'CSE',
        departmentName: 'Computer Science and Engineering',
        role: 'Faculty',
        active: true
      });
      console.log('✓ Ensured Dean Siddharth test faculty directory record.');
    } else {
      await FacultyMember.updateOne(
        { email: 'deansiddharth@gmail.com' },
        {
          $set: {
            role: 'Faculty',
            designation: 'Assistant Professor',
            department: 'CSE',
            departmentName: 'Computer Science and Engineering',
            alternateEmails: ['deansiddharth@gmail.com']
          }
        }
      );
    }

    const masterStudentExists = await FacultyMember.findOne({ email: 'siddharthk@student.tce.edu' });
    if (!masterStudentExists) {
      await FacultyMember.create({
        staffId: 'SIDDHARTHK',
        name: 'Dr. Siddharth K (Master)',
        designation: 'Registrar / Master Admin',
        email: 'siddharthk@student.tce.edu',
        personalEmail: 'siddharthk@student.tce.edu',
        hodEmail: 'hodcse@tce.edu',
        alternateEmails: ['siddharthk@student.tce.edu'],
        department: 'ALL',
        departmentName: 'All Academic Departments',
        role: 'Registrar',
        active: true
      });
      console.log('✓ Ensured master student faculty record.');
    } else {
      await FacultyMember.updateOne(
        { email: 'siddharthk@student.tce.edu' },
        {
          $set: {
            role: 'Registrar',
            designation: 'Registrar / Master Admin',
            department: 'ALL',
            departmentName: 'All Academic Departments',
            alternateEmails: ['siddharthk@student.tce.edu']
          }
        }
      );
    }
  } catch (err) {
    console.warn('⚠️ Enforce Security Policy warning:', err.message);
  }
}

// Serve static assets from public/ directory
const publicPath = path.join(__dirname, '..', 'public');
if (fs.existsSync(publicPath)) {
  app.use(express.static(publicPath));
}

// Express 5 rejects app.get('*'). Serve the Vite build when dist/ exists
// (single-container TCE image: vite build + node server/index.js).
if (fs.existsSync(spaIndex)) {
  app.use(express.static(distPath));
  app.get('/{*splat}', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    return res.sendFile(path.join(distPath, 'index.html'));
  });
}

// ── Asynchronous Server Initialization ───────────────────────────────────────
async function startServer() {
  // Bind HTTP server immediately on 0.0.0.0 to guarantee Render health checks pass
  app.listen(port, '0.0.0.0', () => {
    console.log(`✓ Auth server listening on 0.0.0.0:${port}`);
  });

  if (!mongoUri) {
    console.warn('⚠️ WARNING: MONGO_URI is not set in environment variables!');
    console.warn('Please configure MONGO_URI in your Render environment variables.');
    return;
  }

  try {
    console.log('⏳ Connecting to MongoDB Atlas Cloud Cluster...');
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 15000,
      socketTimeoutMS: 45000,
    });
    console.log('✓ Connected securely to MongoDB Atlas Cloud Cluster!');

    // Auto-seed/verify faculty master directory
    await seedFacultyDirectory(false);

    // Ensure AI department name and Dr. S. Padmavathi's designation are up to date in MongoDB
    try {
      await FacultyMember.updateMany(
        { $or: [{ department: 'AI' }, { departmentName: { $in: ['Artificial Intelligence and Data Science', 'Artificial Intelligence and Machine Learning'] } }] },
        { $set: { departmentName: 'Artificial Intelligence' } }
      );
      await Appraisal.updateMany(
        { $or: [{ department: 'AI' }, { departmentName: { $in: ['Artificial Intelligence and Data Science', 'Artificial Intelligence and Machine Learning'] } }] },
        { $set: { departmentName: 'Artificial Intelligence' } }
      );
      await FacultyMember.updateMany(
        {
          $or: [
            { email: { $in: ['spmcse@tce.edu', 'hodai@tce.edu'] } },
            { personalEmail: { $in: ['spmcse@tce.edu', 'hodai@tce.edu'] } },
            { alternateEmails: { $in: ['spmcse@tce.edu', 'hodai@tce.edu'] } },
            { staffId: 'SPMCSE' }
          ]
        },
        { $set: { designation: 'Professor & Head I/C', departmentName: 'Artificial Intelligence' } }
      );
      // Keep stored appraisal records (used by PDF / Excel exports) in sync with the corrected designation
      await Appraisal.updateMany(
        {
          $or: [
            { email: { $in: ['spmcse@tce.edu', 'hodai@tce.edu'] } },
            { facultyEmail: { $in: ['spmcse@tce.edu', 'hodai@tce.edu'] } }
          ]
        },
        { $set: { designation: 'Professor & Head I/C', departmentName: 'Artificial Intelligence' } }
      );

      // Ensure all Architecture (T'SEDA) faculty and their appraisals are strictly mapped to department: 'ARCH'
      const archEmails = [
        'gsjarch@tce.edu', 'hodarch@tce.edu', 'jjlkarch@tce.edu', 'jinujoshua@tce.edu', 'aakarch@tce.edu',
        'aaarch@tce.edu', 'agarch@tce.edu', 'cparch@tce.edu', 'dglarch@tce.edu',
        'drnarch@tce.edu', 'mlsarch@tce.edu', 'crissindhu@tce.edu', 'msarch@tce.edu',
        'mvlarch@tce.edu', 'ppharch@tce.edu', 'pvkarch@tce.edu', 'ajarch@tce.edu',
        'rrarch@tce.edu', 'rraarch@tce.edu', 'rsrarch@tce.edu', 'sararch@tce.edu',
        'senarch@tce.edu', 'skrarch@tce.edu', 'smvsarch@tce.edu', 'ssuarch@tce.edu',
        'lavanya_arch@tce.edu', 'stlarch@tce.edu', 'svlarch@tce.edu', 'uvaarch@tce.edu',
        'gviarch@tce.edu', 'gbarch@tce.edu', 'cmarch@tce.edu', 'icarch@tce.edu',
        'rmiarch@tce.edu', 'rvkarch@tce.edu', 'psaarch@tce.edu', 'priarch@tce.edu',
        'amdarch@tce.edu', 'saarch@tce.edu', 'svaarch@tce.edu'
      ];
      await FacultyMember.updateMany(
        {
          $or: [
            { email: { $in: archEmails } },
            { personalEmail: { $in: archEmails } },
            { alternateEmails: { $in: archEmails } },
            { email: /arch@tce\.edu$/i },
            { personalEmail: /arch@tce\.edu$/i },
            { profileUrl: /\/BARCH\//i },
            { department: /^arch/i },
            { departmentName: /arch|tseda/i }
          ]
        },
        { $set: { department: 'ARCH', departmentName: "Architecture (T'SEDA)" } }
      );
      await Appraisal.updateMany(
        {
          $or: [
            { email: { $in: archEmails } },
            { facultyEmail: { $in: archEmails } },
            { email: /arch@tce\.edu$/i },
            { facultyEmail: /arch@tce\.edu$/i },
            { department: /^arch/i },
            { departmentName: /arch|tseda/i }
          ]
        },
        { $set: { department: 'ARCH', departmentName: "Architecture (T'SEDA)" } }
      );

      // Isolate personal HOD faculty accounts from official generic institutional logins
      await FacultyMember.updateOne(
        { email: 'pccse@tce.edu' },
        {
          $set: {
            role: 'Faculty',
            department: 'MCA',
            departmentName: 'Computer Applications',
            hodEmail: 'hodca@tce.edu',
            alternateEmails: ['pccse@tce.edu', 'pchitracse@tce.edu']
          }
        }
      );
      await FacultyMember.updateOne(
        { email: 'headiqac@tce.edu' },
        {
          $set: {
            role: 'IQAC',
            department: 'ALL',
            departmentName: 'Internal Quality Assurance Cell (IQAC)',
            alternateEmails: ['headiqac@tce.edu', 'iqac@tce.edu']
          }
        }
      );
      await FacultyMember.updateOne(
        { email: 'hodca@tce.edu' },
        { $set: { alternateEmails: ['hodca@tce.edu'] } }
      );
      await FacultyMember.updateOne(
        { email: 'hodamcs@tce.edu' },
        { $set: { alternateEmails: ['hodamcs@tce.edu'] } }
      );
      await FacultyMember.updateOne(
        { email: 'spcse@tce.edu' },
        { $set: { alternateEmails: ['sps@tce.edu', 'spcse@tce.edu'] } }
      );
      await FacultyMember.updateOne(
        { email: 'mseee@tce.edu' },
        { $set: { alternateEmails: ['mseee@tce.edu'] } }
      );
      await FacultyMember.updateMany(
        {
          email: { $not: /^hod[a-z]{2,6}@tce\.edu$/i },
          role: 'HOD'
        },
        { $set: { role: 'Faculty' } }
      );

      // Backfill leadership submission flags with strict hierarchy precedence: Registrar > Dean > HOD
      const hodEmailSetForBackfill = await getHodEmailSet();
      const hodEmailsArr = Array.from(hodEmailSetForBackfill);

      // 1. Ensure all Dean & Head IQAC appraisals (including Deans who also serve as HOD, e.g. spcse@tce.edu, shalinie@tce.edu, pccse@tce.edu)
      // have isDeanSubmission: true and isHodSubmission: false
      await Appraisal.updateMany(
        {
          $or: [
            { email: { $in: KNOWN_DEAN_PERSONAL_EMAILS } },
            { facultyEmail: { $in: KNOWN_DEAN_PERSONAL_EMAILS } }
          ]
        },
        { $set: { isDeanSubmission: true, isHodSubmission: false } }
      );

      // 1b. Demote former HODs (e.g. Dr. C. Jeyamala, Dr. G. Kumaraguruparan, Dr. M. Saravanan, Dr. G. Sooraj) from HOD submissions to regular faculty
      await Appraisal.updateMany(
        {
          $or: [
            { email: { $in: FORMER_HOD_PERSONAL_EMAILS } },
            { facultyEmail: { $in: FORMER_HOD_PERSONAL_EMAILS } }
          ]
        },
        { $set: { isHodSubmission: false, isDeanSubmission: false } }
      );
      await FacultyMember.updateOne(
        { email: 'jeyamala@tce.edu' },
        { $set: { designation: 'Associate Professor', hodEmail: '', role: 'Faculty' } }
      );
      await Appraisal.updateMany(
        {
          $or: [
            { email: 'jeyamala@tce.edu' },
            { facultyEmail: 'jeyamala@tce.edu' }
          ]
        },
        { $set: { isHodSubmission: false, isDeanSubmission: false, designation: 'Associate Professor' } }
      );
      await FacultyMember.updateOne(
        { email: 'gkgmech@tce.edu' },
        { $set: { designation: 'Professor & Dean', hodEmail: '', role: 'Faculty' } }
      );
      await Appraisal.updateMany(
        { $or: [{ email: 'gkgmech@tce.edu' }, { facultyEmail: 'gkgmech@tce.edu' }] },
        { $set: { designation: 'Professor & Dean', isHodSubmission: false, isDeanSubmission: true } }
      );
      await FacultyMember.updateOne(
        { email: 'mseee@tce.edu' },
        { $set: { designation: 'Professor (RD)', hodEmail: '', role: 'Faculty' } }
      );
      await FacultyMember.updateOne(
        { email: 'gsjarch@tce.edu' },
        { $set: { designation: 'Associate Professor', hodEmail: '', role: 'Faculty' } }
      );

      // 2. Ensure non-Dean, non-Registrar, current HOD appraisals have isHodSubmission: true
      await Appraisal.updateMany(
        {
          isHodSubmission: { $ne: true },
          email: { $nin: [...KNOWN_DEAN_PERSONAL_EMAILS, ...KNOWN_REGISTRAR_PERSONAL_EMAILS, ...FORMER_HOD_PERSONAL_EMAILS, 'rhmech@tce.edu'] },
          $or: [
            { email: { $in: hodEmailsArr } },
            { facultyEmail: { $in: hodEmailsArr } },
            { designation: /^(?!.*\bcent(?:er|re)\s+head\b).*\b(head|hod)\b/i }
          ]
        },
        { $set: { isHodSubmission: true, isDeanSubmission: false } }
      );

      // 3. SynchronizeDr. R. Rajanprakash (HOD I/c, EEE), Dr. P. S. Manoharan (HOD I/c, MECT), Dr. G. K. Raajesh / Kanagaraj (Dean Career Development), and Dr. R. Priyadarshini (HOD I/c, FT)
      await FacultyMember.updateOne(
        { email: 'r[underscore]rajanprakash@tce.edu' },
        {
          $set: {
            email: 'r_rajanprakash@tce.edu',
            personalEmail: 'r_rajanprakash@tce.edu',
            hodEmail: 'hodeee@tce.edu',
            alternateEmails: ['r_rajanprakash@tce.edu', 'rrpeee@tce.edu'],
            designation: 'HOD I/c, Associate Professor (CAS)',
            department: 'EEE',
            departmentName: 'Electrical and Electronics Engineering'
          }
        }
      );
      await FacultyMember.updateOne(
        { email: 'r_rajanprakash@tce.edu' },
        {
          $set: {
            personalEmail: 'r_rajanprakash@tce.edu',
            hodEmail: 'hodeee@tce.edu',
            alternateEmails: ['r_rajanprakash@tce.edu', 'rrpeee@tce.edu'],
            designation: 'HOD I/c, Associate Professor (CAS)',
            department: 'EEE',
            departmentName: 'Electrical and Electronics Engineering'
          }
        }
      );
      await FacultyMember.updateOne(
        { email: 'hodeee@tce.edu' },
        {
          $set: {
            name: 'Dr. R. Rajanprakash',
            designation: 'HOD I/c, Associate Professor (CAS)',
            department: 'EEE',
            departmentName: 'Electrical and Electronics Engineering',
            role: 'HOD',
            alternateEmails: ['hodeee@tce.edu']
          }
        }
      );
      await FacultyMember.updateOne(
        { email: 'psmeee@tce.edu' },
        {
          $set: {
            hodEmail: 'hodmect@tce.edu',
            designation: 'HOD I/c, Professor',
            department: 'MECT',
            departmentName: 'Mechatronics'
          }
        }
      );
      await FacultyMember.updateOne(
        { email: 'hodmect@tce.edu' },
        {
          $set: {
            name: 'Dr. P. S. Manoharan',
            designation: 'HOD I/c, Professor',
            department: 'MECT',
            departmentName: 'Mechatronics',
            role: 'HOD',
            alternateEmails: ['hodmect@tce.edu']
          }
        }
      );
      await Appraisal.updateMany(
        { email: 'psmeee@tce.edu' },
        {
          $set: {
            department: 'MECT',
            departmentName: 'Mechatronics',
            designation: 'HOD I/c, Professor',
            isHodSubmission: true,
            isDeanSubmission: false
          }
        }
      );
      await FacultyMember.updateOne(
        { email: 'gkmech@tce.edu' },
        {
          $set: {
            designation: 'Professor',
            department: 'MECT',
            departmentName: 'Mechatronics',
            hodEmail: 'hodmect@tce.edu',
            role: 'Faculty'
          }
        }
      );
      await Appraisal.updateMany(
        { $or: [{ email: 'gkmech@tce.edu' }, { facultyEmail: 'gkmech@tce.edu' }] },
        {
          $set: {
            designation: 'Professor',
            department: 'MECT',
            departmentName: 'Mechatronics',
            'section1Data.department': 'MECT',
            'section1Data.departmentName': 'Mechatronics',
            isDeanSubmission: false,
            isHodSubmission: false
          }
        }
      );
      await FacultyMember.updateOne(
        { $or: [{ email: 'dnjayakumar@tce.edu' }, { email: 'dnjeee@tce.edu' }] },
        {
          $set: {
            name: 'Dr. D. Nelson Jayakumar',
            email: 'dnjayakumar@tce.edu',
            personalEmail: 'dnjayakumar@tce.edu',
            alternateEmails: ['dnjeee@tce.edu', 'dnjayakumar@tce.edu'],
            department: 'EEE',
            departmentName: 'Electrical and Electronics Engineering',
            hodEmail: 'hodeee@tce.edu',
            role: 'Faculty'
          }
        }
      );
      await Appraisal.updateMany(
        { $or: [{ email: 'dnjayakumar@tce.edu' }, { facultyEmail: 'dnjayakumar@tce.edu' }] },
        {
          $set: {
            department: 'EEE',
            departmentName: 'Electrical and Electronics Engineering',
            'section1Data.department': 'EEE',
            'section1Data.departmentName': 'Electrical and Electronics Engineering'
          }
        }
      );
      await FacultyMember.updateOne(
        { email: 'spcse@tce.edu' },
        {
          $set: {
            designation: 'Professor, Dean (Centres of Excellence and Continuing Education) and Head'
          }
        }
      );
      await Appraisal.updateMany(
        { email: 'spcse@tce.edu' },
        {
          $set: {
            designation: 'Professor, Dean (Centres of Excellence and Continuing Education) and Head',
            isDeanSubmission: true,
            isHodSubmission: false
          }
        }
      );
      await FacultyMember.updateOne(
        { email: 'rpift@tce.edu' },
        {
          $set: {
            staffId: 'RPIFT',
            name: 'Dr. R. Priyadarshini',
            designation: 'HOD I/c, Associate Professor',
            email: 'rpift@tce.edu',
            personalEmail: 'rpift@tce.edu',
            hodEmail: 'hodft@tce.edu',
            alternateEmails: ['rpift@tce.edu'],
            department: 'FT',
            departmentName: 'Fashion Technology',
            role: 'Faculty',
            photo: 'https://www.tce.edu/sites/default/files/2026-08/rpift.jpg',
            profileUrl: 'https://www.tce.edu/staff_profile/faculty/BARCH/rpift.html',
            active: true
          }
        },
        { upsert: true }
      );
      await FacultyMember.updateOne(
        { email: 'hodft@tce.edu' },
        {
          $set: {
            staffId: 'RPIFT',
            name: 'Dr. R. Priyadarshini',
            designation: 'HOD I/c, Associate Professor',
            email: 'hodft@tce.edu',
            personalEmail: 'hodft@tce.edu',
            hodEmail: 'hodft@tce.edu',
            alternateEmails: ['hodft@tce.edu'],
            department: 'FT',
            departmentName: 'Fashion Technology',
            role: 'HOD',
            photo: 'https://www.tce.edu/sites/default/files/2026-08/rpift.jpg',
            profileUrl: 'https://www.tce.edu/staff_profile/faculty/BARCH/rpift.html',
            active: true
          }
        },
        { upsert: true }
      );
      await FacultyMember.updateOne(
        { email: 'sajft@tce.edu' },
        {
          $set: {
            staffId: 'SAJFT',
            name: 'Ms. S. Aishwarya',
            designation: 'Assistant Professor',
            email: 'sajft@tce.edu',
            personalEmail: 'sajft@tce.edu',
            hodEmail: 'hodft@tce.edu',
            alternateEmails: ['sajft@tce.edu'],
            department: 'FT',
            departmentName: 'Fashion Technology',
            role: 'Faculty',
            profileUrl: 'https://www.tce.edu/academics/departments/fashion-technology/academic-faculty',
            active: true
          }
        },
        { upsert: true }
      );
    } catch (normErr) {
      console.warn('AI dept / designation normalization warning:', normErr.message);
    }

    // Enforce Domain Security Policy (purge unauthorized gmail and student data)
    await enforceDomainSecurityPolicy();

    // Start automated daily database backup background schedule
    scheduleDailyAutoBackup();
  } catch (err) {
    console.error('⚠️ NON-FATAL DATABASE STARTUP WARNING:', err.message);
    console.error('The server remains running for healthchecks and API requests.');
  }
}

startServer();

