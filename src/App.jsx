import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GoogleLogin, GoogleOAuthProvider } from '@react-oauth/google';
import axios from 'axios';
import tceBanner from './tce-banner.png';
import tceLogo from './tce-logo.png';
import AppraisalPrintDocument from './AppraisalPrintDocument.jsx';
import { exportAppraisalToExcel } from './excelExporter.js';
import { exportAppraisalToPDF, exportIqacRosterPDF } from './pdfExporter.js';
import { computeEffectiveScores, SUBSECTION_MAX_MARKS, SECTION_MAX_MARKS } from './scoringEngine.js';
import DepartmentManagementModal from './DepartmentManagementModal.jsx';
import FacultyRegistrationModal from './FacultyRegistrationModal.jsx';
import AnalyticsDashboard from './AnalyticsDashboard.jsx';

// ── Module-level constants ────────────────────────────────────────────────────
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

// Resolves the active JWT from every known localStorage key slot.
const getAuthToken = () => {
  const directToken = window.localStorage.getItem('token') || window.localStorage.getItem('userToken');
  if (directToken) return directToken;
  try {
    const raw = window.localStorage.getItem('tce_appraisal_user') || window.localStorage.getItem('STORAGE_USER_KEY');
    if (raw) return JSON.parse(raw)?.token || null;
  } catch { /* ignore parse errors */ }
  return null;
};

const STATS = [
  { value: '1957', label: 'Founded' },
  { value: 'A++', label: 'NAAC Grade' },
  { value: '140+', label: 'Acre Campus' },
  { value: '350+', label: 'Faculty' },
];

const TIMELINES = ['2025-2026', '2026-2027', '2027-2028'];
const MENTORING_BATCH_GROUPS = [
  {
    label: '4-Year UG Programs (B.E. / B.Tech)',
    options: ['2021 - 2025', '2022 - 2026', '2023 - 2027', '2024 - 2028', '2025 - 2029']
  },
  {
    label: '2-Year PG Programs (M.C.A. / M.E. / M.Tech)',
    options: ['2023 - 2025', '2024 - 2026', '2025 - 2027', '2026 - 2028']
  },
  {
    label: '5-Year Integrated Programs (M.Sc. Data Science / B.Arch)',
    options: ['2020 - 2025', '2021 - 2026', '2022 - 2027', '2023 - 2028', '2024 - 2029', '2025 - 2030']
  }
];

const MENTORING_BATCH_OPTIONS = [
  '2021 - 2025', '2022 - 2026', '2023 - 2027', '2024 - 2028', '2025 - 2029',
  '2023 - 2025', '2024 - 2026', '2025 - 2027', '2026 - 2028',
  '2020 - 2025', '2021 - 2026', '2022 - 2027', '2023 - 2028', '2024 - 2029', '2025 - 2030'
];
const SEMESTER_OPTIONS = [
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

const ACADEMIC_COLLABORATION_TYPES = [
  'Joint Research Project',
  'Joint Publication / Patent',
  'Faculty Exchange Program',
  'Student Exchange Program',
  'Joint Course Design / Curriculum Development',
  'Guest / Adjunct Faculty Engagement',
  'Joint Conference / Seminar / Workshop',
  'Institutional MoU Activity',
  'Other Academic Collaboration',
];

const ACADEMIC_PERIOD_OPTIONS = [
  '2021 - 2022',
  '2022 - 2023',
  '2023 - 2024',
  '2024 - 2025',
  '2025 - 2026',
  '2026 - 2027',
  '2027 - 2028',
  '2028 - 2029',
  '2022 - 2024',
  '2023 - 2025',
  '2024 - 2026',
  '2025 - 2027',
  '2026 - 2028',
  '2022 - 2025',
  '2023 - 2026',
  '2024 - 2027',
  '2025 - 2028',
  '2026 - 2029',
];

const STARTUP_DURATION_OPTIONS = [
  '1 Month',
  '3 Months',
  '6 Months',
  '1 Year',
  '2 Years',
  '3 Years',
  'Ongoing',
];

const COURSE_CODE_REGEX = /^[A-Z0-9]{5,7}$/i;

const DEFAULT_ONLY_KEYS = new Set(['id', 'role', 'type', 'category', 'mode', 'status', 'level', 'evidenceSubmitted', 'approval', 'compliance']);

function isMeaningfullyFilledRow(row) {
  if (!row || typeof row !== 'object') return false;
  return Object.entries(row).some(([k, v]) => {
    if (k === 'id') return false;
    if (v === null || v === undefined || String(v).trim() === '') return false;
    return !DEFAULT_ONLY_KEYS.has(k) || k === 'evidenceLink';
  });
}

function createRowId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Section I data vectors stay completely empty until the user starts adding rows.
function createEmptySectionState() {
  return {
    appraisalStatus: 'Pending',
    submittedAt: '',
    hodRemarks: '',
    coursesHandled: [],
    courseFiles: [],
    coursesDesigned: [],
    valueAdded: [],
    innovativeMethods: [],
    academicCollaborations: [],
    mentoring: {
      menteeCount: '',
      batch: '2024-28',
      description: '',
      hodReview: 'Pending',
      evidenceLink: '',
    },
    certifications: [],
    studentFeedback: [],
    resultAnalysis: [],
    coAttainment: [],
    journalPapers: [],
    citationsReceived: { totalCount: '' },
    q1Citations: { totalCount: '' },
    bookPublications: [],
    conferencePapers: [],
    researchCollaborations: [],
    phdRegistered: [],
    phdAwarded: [],
    // Section III
    patentsPublished: [],
    patentsGranted: [],
    transferOfTechnology: [],
    prototypesDeveloped: [],
    hackathonPrizes: [],
    // Section IV
    researchProjects: [],
    consultancyProjects: [],
    // Section V
    internationalEngagement: [],
    visitingPositions: [],
    foreignFaculty: [],
    reputationSurvey: [],
    nirfSurvey: [],
    // Section VI
    fdpAttended: [],
    programsOrganized: [],
    resourcePerson: [],
    professionalMembership: [],
    editorialBoard: [],
    moocDeveloped: [],
    // Section VII
    partialDelivery: [],
    industrialVisits: [],
    facultyInternships: [],
    employerEngagement: [],
    // Section VIII
    projectPublications: [],
    hackathonMentoring: [],
    startupSupport: [],
    // Section IX
    deptActivities: [],
    collegeActivities: [],
    adminResponsibilities: [],
  };
}


function flattenAppraisalRecord(record) {
  if (!record) return createEmptySectionState();
  return {
    ...createEmptySectionState(),
    ...(record.section1Data || {}),
    ...(record.section2Data || {}),
    ...(record.section3Data || {}),
    ...(record.section4Data || {}),
    ...(record.section5Data || {}),
    ...(record.section6Data || {}),
    ...(record.section7Data || {}),
    ...(record.section8Data || {}),
    ...(record.section9Data || {}),
    submittedAt: record.submittedAt,
    appraisalStatus: record.appraisalStatus,
    hodRemarks: record.hodRemarks,
    subsectionRemarks: record.subsectionRemarks || {},
    hodSubsectionScores: record.hodSubsectionScores || {},
    systemScore: record.systemScore || 0,
    iqacStatus: record.iqacStatus || 'Pending',
    iqacAuditRemarks: record.iqacAuditRemarks || '',
    iqacExcluded: Boolean(record.iqacExcluded),
    iqacEvaluatedAt: record.iqacEvaluatedAt || null,
    principalRemarks: record.principalRemarks || '',
    principalApprovalStatus: record.principalApprovalStatus || 'Pending',
    principalEndorsedAt: record.principalEndorsedAt || null,
  };
}

function hasSectionEntries(sectionData) {
  return (
    (sectionData.coursesHandled || []).length > 0 ||
    (sectionData.courseFiles || []).length > 0 ||
    (sectionData.coursesDesigned || []).length > 0 ||
    (sectionData.valueAdded || []).length > 0 ||
    (sectionData.innovativeMethods || []).length > 0 ||
    (sectionData.academicCollaborations || []).length > 0 ||
    (sectionData.certifications || []).length > 0 ||
    (sectionData.studentFeedback || []).length > 0 ||
    (sectionData.resultAnalysis || []).length > 0 ||
    (sectionData.coAttainment || []).length > 0 ||
    Boolean(sectionData.mentoring?.menteeCount?.toString().trim()) ||
    Boolean(sectionData.mentoring?.batch?.toString().trim()) ||
    Boolean(sectionData.mentoring?.description?.toString().trim()) ||
    Boolean(sectionData.mentoring?.evidenceLink?.toString().trim())
  );
}

function buildTimelineState() {
  return TIMELINES.reduce((accumulator, timeline) => {
    accumulator[timeline] = createEmptySectionState();
    return accumulator;
  }, {});
}

// HOD inbox starts completely empty â€” populated only by real faculty submissions.
function buildHodInboxState() {
  return {};
}

const TCE_DEPARTMENTS = [
  { code: 'ALL', name: 'All 16 Academic Departments' },
  { code: 'CSE', name: 'Computer Science and Engineering' },
  { code: 'ECE', name: 'Electronics and Communication Engineering' },
  { code: 'EEE', name: 'Electrical and Electronics Engineering' },
  { code: 'MECH', name: 'Mechanical Engineering' },
  { code: 'CIVIL', name: 'Civil Engineering' },
  { code: 'IT', name: 'Information Technology' },
  { code: 'MECT', name: 'Mechatronics' },
  { code: 'CSBS', name: 'Computer Science and Business Systems' },
  { code: 'MCA', name: 'Computer Applications' },
  { code: 'ARCH', name: 'Architecture' },
  { code: 'MATH', name: 'Mathematics' },
  { code: 'AMCS', name: 'Applied Mathematics and Computational Science' },
  { code: 'PHY', name: 'Physics' },
  { code: 'CHEM', name: 'Chemistry' },
  { code: 'ENG', name: 'English' },
  { code: 'AI', name: 'Artificial Intelligence and Data Science' }
];

function getRoleFromEmail(email) {
  const userEmail = (email || '').toLowerCase().trim();

  if (userEmail === 'registrar@tce.edu' || userEmail === 'siddharthk@student.tce.edu') {
    return 'Registrar';
  }
  if (userEmail === 'principal@tce.edu') {
    return 'Principal';
  }
  if (
    userEmail.startsWith('hod') ||
    userEmail.includes('hod') ||
    userEmail.endsWith('.tce.edu') ||
    userEmail.endsWith('@tce.edu')
  ) {
    return 'HOD';
  }

  return 'Faculty';
}

function getRoleBadgeClass(role) {
  if (role === 'Registrar' || role === 'Principal') {
    return 'bg-purple-200 text-purple-950 font-black border-purple-300';
  }
  return role === 'HOD'
    ? 'bg-amber-300 text-[#3B1013]'
    : 'bg-white/10 text-white';
}

function getScoreBadgeClass(value, max) {
  if (value === 0) {
    return 'bg-slate-100 text-slate-600';
  }

  if (value >= max) {
    return 'bg-emerald-500 text-white';
  }

  return 'bg-amber-400 text-amber-950';
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function isValidCourseCode(value) {
  return COURSE_CODE_REGEX.test((value || '').trim());
}

function isValidEvidenceLink(value) {
  return /^https?:\/\//i.test((value || '').trim());
}

function isNonEmpty(value) {
  return Boolean((value || '').trim());
}

function getRowValidationErrors(row, columns) {
  const errors = {};

  columns.forEach((column) => {
    const rawValue = row[column.name];
    const value = typeof rawValue === 'string' ? rawValue : String(rawValue || '');
    if (column.name === 'courseCode') {
      if (!isValidCourseCode(value)) {
        errors[column.name] = true;
      }
      return;
    }

    if (column.type === 'select') {
      if (!value.trim()) {
        errors[column.name] = true;
      }
      return;
    }

    if (!value.trim()) {
      errors[column.name] = true;
    }
  });

  if (!isValidEvidenceLink(row.evidenceLink)) {
    errors.evidenceLink = true;
  }

  return errors;
}

function isRowValidForScoring(row, columns) {
  return Object.keys(getRowValidationErrors(row, columns)).length === 0;
}

function isRowValid(row, requireCourseCode, keyName) {
  if (!row) return false;
  if (requireCourseCode && !isValidCourseCode(row.courseCode)) return false;
  if (keyName && !isNonEmpty(row[keyName])) return false;
  if (!isValidEvidenceLink(row.evidenceLink)) return false;
  return true;
}

// ── Row-completion gate helpers ──────────────────────────────────────────────
// Each returns true when the last row of that subsection array is fully valid,
// meaning the "+ Add" button should be ENABLED. When the array is empty the
// button is always enabled (first-entry canvas rule).

function canAddCoursesHandled(rows) {
  if (!rows || rows.length === 0) return true;
  const last = rows[rows.length - 1];
  return (
    isValidCourseCode(last.courseCode) &&
    isNonEmpty(last.courseName) &&
    isValidEvidenceLink(last.evidenceLink)
  );
}

function canAddCourseFiles(rows) {
  if (!rows || rows.length === 0) return true;
  const last = rows[rows.length - 1];
  return (
    isValidCourseCode(last.courseCode) &&
    isNonEmpty(last.courseName) &&
    isNonEmpty(last.compliance) &&
    isValidEvidenceLink(last.evidenceLink)
  );
}

function canAddCoAttainment(rows) {
  if (!rows || rows.length === 0) return true;
  const last = rows[rows.length - 1];
  return (
    isValidCourseCode(last.courseCode) &&
    isNonEmpty(last.courseName) &&
    isNonEmpty(last.attainmentPct) &&
    isValidEvidenceLink(last.evidenceLink)
  );
}

function canAddCoursesDesigned(rows) {
  if (!rows || rows.length === 0) return true;
  const last = rows[rows.length - 1];
  return (
    isValidCourseCode(last.courseCode) &&
    isNonEmpty(last.courseName) &&
    isNonEmpty(last.remarks) &&
    isValidEvidenceLink(last.evidenceLink)
  );
}

function canAddValueAdded(rows) {
  if (!rows || rows.length === 0) return true;
  const last = rows[rows.length - 1];
  return (
    isNonEmpty(last.courseName) &&
    isNonEmpty(last.particulars) &&
    isNonEmpty(last.studentCount) &&
    isValidEvidenceLink(last.evidenceLink)
  );
}

function canAddResultAnalysis(rows) {
  if (!rows || rows.length === 0) return true;
  const last = rows[rows.length - 1];
  return (
    isValidCourseCode(last.courseCode) &&
    isNonEmpty(last.courseName) &&
    isNonEmpty(last.passPercentage) &&
    isValidEvidenceLink(last.evidenceLink)
  );
}

function canAddInnovativeMethods(rows) {
  if (!rows || rows.length === 0) return true;
  const last = rows[rows.length - 1];
  return (
    isValidCourseCode(last.courseCode) &&
    isNonEmpty(last.method) &&
    isValidEvidenceLink(last.evidenceLink)
  );
}

function canAddCertifications(rows) {
  if (!rows || rows.length === 0) return true;
  const last = rows[rows.length - 1];
  return (
    isNonEmpty(last.courseName) &&
    isNonEmpty(last.platform) &&
    isNonEmpty(last.certType) &&
    isValidEvidenceLink(last.evidenceLink)
  );
}

function canAddAcademicCollaborations(rows) {
  if (!rows || rows.length === 0) return true;
  const last = rows[rows.length - 1];
  return (
    isNonEmpty(last.organization) &&
    isNonEmpty(last.collaborationType) &&
    isValidEvidenceLink(last.evidenceLink)
  );
}

function canAddStudentFeedback(rows) {
  if (!rows || rows.length === 0) return true;
  const last = rows[rows.length - 1];
  return (
    isValidCourseCode(last.courseCode) &&
    isNonEmpty(last.feedbackPct) &&
    isValidEvidenceLink(last.evidenceLink)
  );
}

function canAddJournalPapers(rows) {
  if (!rows || rows.length === 0) return true;
  return !rows.some((r) => !r.paperTitle || !r.journalName || !r.tier || !r.evidenceLink);
}

function canAddBookPublications(rows) {
  if (!rows || rows.length === 0) return true;
  return !rows.some((r) => !r.title || !r.type || !r.evidenceLink);
}

function canAddConferencePapers(rows) {
  if (!rows || rows.length === 0) return true;
  return !rows.some((r) => !r.paperTitle || !r.proceedingName || !r.evidenceLink);
}

function canAddResearchCollaborations(rows) {
  if (!rows || rows.length === 0) return true;
  return !rows.some((r) => !r.title || !r.partner || !r.type || !r.evidenceLink);
}

function canAddPhdRegistered(rows) {
  if (!rows || rows.length === 0) return true;
  return !rows.some((r) => !r.scholarName || !r.researchArea || !r.evidenceLink);
}

function canAddPhdAwarded(rows) {
  if (!rows || rows.length === 0) return true;
  return !rows.some((r) => !r.scholarName || !r.researchArea || !r.evidenceLink);
}



function canAddFdpAttended(rows) {
  if (rows.length === 0) return true;
  const last = rows[rows.length - 1];
  return !!(last.programName && last.organizer && last.duration && last.dateRange && last.evidenceLink);
}
function canAddProgramsOrganized(rows) {
  if (rows.length === 0) return true;
  const last = rows[rows.length - 1];
  return !!(last.programName && last.days && last.dateRange && last.role && last.participants && last.evidenceLink);
}
function canAddResourcePerson(rows) {
  if (rows.length === 0) return true;
  const last = rows[rows.length - 1];
  return !!(last.eventName && last.level && last.topic && last.date && last.evidenceLink);
}
function canAddProfessionalMembership(rows) {
  if (rows.length === 0) return true;
  const last = rows[rows.length - 1];
  return !!(last.societyName && last.membershipType && last.status && last.evidenceLink);
}
function canAddEditorialBoard(rows) {
  if (rows.length === 0) return true;
  const last = rows[rows.length - 1];
  return !!(last.bodyName && last.position && last.period && last.evidenceLink);
}
function canAddMoocDeveloped(rows) {
  if (rows.length === 0) return true;
  const last = rows[rows.length - 1];
  return !!(last.courseName && last.weeks && last.coFacultyCount && last.takersCount && last.evidenceLink);
}
function canAddPartialDelivery(rows) {
  if (rows.length === 0) return true;
  const last = rows[rows.length - 1];
  return !!(last.courseDetails && last.mode && last.industryName && last.expertDetails && last.duration && last.date && last.evidenceLink);
}
function canAddIndustrialVisits(rows) {
  if (rows.length === 0) return true;
  const last = rows[rows.length - 1];
  return !!(last.visitDetails && last.industry && last.studentsCount && last.date && last.evidenceLink);
}
function canAddFacultyInternships(rows) {
  if (rows.length === 0) return true;
  const last = rows[rows.length - 1];
  return !!(last.industryName && last.duration && last.purpose && last.evidenceLink);
}
function canAddEmployerEngagement(rows) {
  if (rows.length === 0) return true;
  const last = rows[rows.length - 1];
  return !!(last.activityName && last.involvedParty && last.date && last.evidenceLink);
}
function canAddProjectPublications(rows) {
  if (rows.length === 0) return true;
  const last = rows[rows.length - 1];
  return !!(last.title && last.students && last.journalDetails && last.date && last.evidenceLink);
}
function canAddHackathonMentoring(rows) {
  if (rows.length === 0) return true;
  const last = rows[rows.length - 1];
  return !!(last.eventName && last.students && last.outcome && last.dateRange && last.evidenceLink);
}
function canAddStartupSupport(rows) {
  if (rows.length === 0) return true;
  const last = rows[rows.length - 1];
  return !!(last.startupName && last.role && last.duration && last.evidenceLink);
}
function canAddDeptActivities(rows) {
  if (rows.length === 0) return true;
  const last = rows[rows.length - 1];
  return !!(last.description && last.type && last.role && last.approval && last.evidenceLink);
}
function canAddCollegeActivities(rows) {
  if (rows.length === 0) return true;
  const last = rows[rows.length - 1];
  return !!(last.description && last.category && last.role && last.approval && last.evidenceLink);
}
function canAddAdminResponsibilities(rows) {
  if (rows.length === 0) return true;
  const last = rows[rows.length - 1];
  return !!(last.role && last.evidenceLink);
}

function canAddPatentsPublished(rows) {
  if (rows.length === 0) return true;
  const last = rows[rows.length - 1];
  return !!(last.refNumber && last.title && last.inventors && last.datePublished && last.evidenceLink);
}
function canAddPatentsGranted(rows) {
  if (rows.length === 0) return true;
  const last = rows[rows.length - 1];
  return !!(last.refNumber && last.title && last.inventors && last.dateGranted && last.evidenceLink);
}
function canAddTransferOfTechnology(rows) {
  if (rows.length === 0) return true;
  const last = rows[rows.length - 1];
  return !!(last.title && last.industryPartner && last.amount && last.evidenceLink);
}
function canAddPrototypesDeveloped(rows) {
  if (rows.length === 0) return true;
  const last = rows[rows.length - 1];
  return !!(last.title && last.studentsInvolved && last.date && last.evidenceLink);
}
function canAddHackathonPrizes(rows) {
  if (rows.length === 0) return true;
  const last = rows[rows.length - 1];
  return !!(last.eventName && last.studentsMentored && last.prize && last.date && last.evidenceLink);
}
function canAddResearchProjects(rows) {
  if (rows.length === 0) return true;
  const last = rows[rows.length - 1];
  return !!(last.projectName && last.fundingAgency && last.period && last.amount && last.role && last.status && last.evidenceLink);
}
function canAddConsultancyProjects(rows) {
  if (rows.length === 0) return true;
  const last = rows[rows.length - 1];
  return !!(last.title && last.clientDetails && last.period && last.amount && last.facultyInvolved && last.evidenceLink);
}
function canAddInternationalEngagement(rows) {
  if (rows.length === 0) return true;
  const last = rows[rows.length - 1];
  return !!(last.institution && last.country && last.nature && last.status && last.evidenceLink);
}
function canAddVisitingPositions(rows) {
  if (rows.length === 0) return true;
  const last = rows[rows.length - 1];
  return !!(last.institution && last.country && last.duration && last.period && last.evidenceLink);
}
function canAddForeignFaculty(rows) {
  if (rows.length === 0) return true;
  const last = rows[rows.length - 1];
  return !!(last.name && last.institution && last.engagementType && last.period && last.evidenceLink);
}
function canAddReputationSurvey(rows) {
  if (rows.length === 0) return true;
  const last = rows[rows.length - 1];
  return !!(last.surveyName && last.contributionDetails && last.evidenceSubmitted && last.evidenceLink);
}
function canAddNirfSurvey(rows) {
  if (rows.length === 0) return true;
  const last = rows[rows.length - 1];
  return !!(last.nominationDetails && last.evidenceSubmitted && last.evidenceLink);
}

function computeSectionScores(sectionData = {}, role) {
  const safeData = sectionData || {};
  const validCoursesHandledRows = (safeData.coursesHandled || []).filter(
    (row) =>
      isValidCourseCode(row.courseCode) &&
      isNonEmpty(row.courseName) &&
      isNonEmpty(row.type) &&
      isNonEmpty(row.semester) &&
      isValidEvidenceLink(row.evidenceLink)
  );
  const coursesHandledCount = validCoursesHandledRows.length;
  let coursesHandledScore = 0;
  if (coursesHandledCount === 1) {
    coursesHandledScore = 3;
  } else if (coursesHandledCount === 2) {
    coursesHandledScore = 6;
  } else if (coursesHandledCount >= 3) {
    coursesHandledScore = 8;
  }

  const courseFileScore = Math.min(
    (sectionData.courseFiles || []).reduce((sum, row) => {
      const rowIsValid =
        isValidCourseCode(row.courseCode) &&
        isNonEmpty(row.courseName) &&
        isNonEmpty(row.compliance) &&
        isValidEvidenceLink(row.evidenceLink);
      if (!rowIsValid) return sum;
      if (row.compliance === 'Full') return sum + 5;
      if (row.compliance === 'Partial') return sum + 3;
      return sum;
    }, 0),
    5
  );

  const coursesDesignedScore = Math.min(
    ((sectionData.coursesDesigned || []).filter(
      (row) =>
        isValidCourseCode(row.courseCode) &&
        isNonEmpty(row.courseName) &&
        isNonEmpty(row.remarks) &&
        isValidEvidenceLink(row.evidenceLink)
    ).length) * 2,
    5
  );

  const valueAddedScore = Math.min(
    ((sectionData.valueAdded || []).filter(
      (row) =>
        isNonEmpty(row.courseName) &&
        isNonEmpty(row.particulars) &&
        isNonEmpty(row.studentCount) &&
        isValidEvidenceLink(row.evidenceLink)
    ).length) * 2,
    4
  );

  const validInnovativeMethodsCount = (sectionData.innovativeMethods || []).filter(
    (row) =>
      isValidCourseCode(row.courseCode) &&
      isNonEmpty(row.method) &&
      isValidEvidenceLink(row.evidenceLink)
  ).length;
  let innovativeMethodsScore = 0;
  if (validInnovativeMethodsCount === 1) {
    innovativeMethodsScore = 2;
  } else if (validInnovativeMethodsCount === 2) {
    innovativeMethodsScore = 4;
  } else if (validInnovativeMethodsCount >= 3) {
    innovativeMethodsScore = 5;
  }

  const academicCollaborationsScore = Math.min(
    ((sectionData.academicCollaborations || []).filter(
      (row) =>
        isNonEmpty(row.organization) &&
        isNonEmpty(row.collaborationType) &&
        isValidEvidenceLink(row.evidenceLink)
    ).length) * 4,
    4
  );

  const mentoringScore =
    sectionData.mentoring?.menteeCount &&
    toNumber(sectionData.mentoring.menteeCount) > 0 &&
    isNonEmpty(sectionData.mentoring.batch) &&
    isNonEmpty(sectionData.mentoring.description) &&
    isValidEvidenceLink(sectionData.mentoring.evidenceLink)
      ? 2
      : 0;

  const certificationsScore = Math.min(
    ((sectionData.certifications || []).filter(
      (row) =>
        isNonEmpty(row.courseName) &&
        isNonEmpty(row.platform) &&
        isNonEmpty(row.certType) &&
        isValidEvidenceLink(row.evidenceLink)
    ).length) * 2,
    4
  );

  const studentFeedbackScore = Math.min(
    (sectionData.studentFeedback || []).reduce((sum, row) => {
      const rowIsValid =
        isValidCourseCode(row.courseCode) &&
        isNonEmpty(row.feedbackPct) &&
        isValidEvidenceLink(row.evidenceLink);
      if (!rowIsValid) return sum;
      const val = toNumber(row.feedbackPct);
      if (val > 90) return sum + 4;
      if (val >= 80) return sum + 3;
      if (val >= 75) return sum + 1;
      return sum;
    }, 0),
    4
  );

  const resultAnalysisScore = Math.min(
    (sectionData.resultAnalysis || []).reduce((sum, row) => {
      const rowIsValid =
        isValidCourseCode(row.courseCode) &&
        isNonEmpty(row.courseName) &&
        isNonEmpty(row.passPercentage) &&
        isValidEvidenceLink(row.evidenceLink);
      if (!rowIsValid) return sum;
      const val = toNumber(row.passPercentage);
      if (val >= 90) return sum + 5;
      if (val >= 80) return sum + 4;
      if (val >= 70) return sum + 3;
      if (val >= 60) return sum + 2;
      if (val > 0) return sum + 1;
      return sum;
    }, 0),
    5
  );

  const coAttainmentScore = Math.min(
    (sectionData.coAttainment || []).reduce((sum, row) => {
      const rowIsValid =
        isValidCourseCode(row.courseCode) &&
        isNonEmpty(row.courseName) &&
        isNonEmpty(row.attainmentPct) &&
        isValidEvidenceLink(row.evidenceLink);
      if (!rowIsValid) return sum;
      const val = toNumber(row.attainmentPct);
      if (val >= 70) return sum + 4;
      if (val >= 60) return sum + 3;
      if (val >= 50) return sum + 2;
      return sum;
    }, 0),
    4
  );

  const total = Math.min(
    coursesHandledScore +
      courseFileScore +
      coursesDesignedScore +
      valueAddedScore +
      innovativeMethodsScore +
      academicCollaborationsScore +
      mentoringScore +
      certificationsScore +
      studentFeedbackScore +
      resultAnalysisScore +
      coAttainmentScore,
    50
  );

  // --- Section II Scoring Engine ---
  // 2.1 Journal Papers: Map row.tier. Q1=6, Q2=4, Q3=2 marks per entry. Clamped to Max 15.
  const sub2_1 = Math.min(
    (safeData.journalPapers || []).reduce((sum, row) => {
      if (!isNonEmpty(row.paperTitle) || !isNonEmpty(row.journalName)) return sum;
      if (row.tier === 'Q1') return sum + 6;
      if (row.tier === 'Q2') return sum + 4;
      if (row.tier === 'Q3') return sum + 2;
      return sum;
    }, 0),
    15
  );

  // 2.2 Citations Received: >=50=8, 25-49=5, 15-24=4, 5-14=3, 1-4=1. Max 8.
  const citationsVal = parseInt(safeData.citationsReceived?.totalCount || 0, 10);
  let sub2_2 = 0;
  if (citationsVal >= 50) sub2_2 = 8;
  else if (citationsVal >= 25) sub2_2 = 5;
  else if (citationsVal >= 15) sub2_2 = 4;
  else if (citationsVal >= 5) sub2_2 = 3;
  else if (citationsVal >= 1) sub2_2 = 1;

  // 2.3 Q1 Citations: >=25=7, 15-24=5, 6-14=3, 1-5=1. Max 7.
  const q1CitationsVal = parseInt(safeData.q1Citations?.totalCount || 0, 10);
  let sub2_3 = 0;
  if (q1CitationsVal >= 25) sub2_3 = 7;
  else if (q1CitationsVal >= 15) sub2_3 = 5;
  else if (q1CitationsVal >= 6) sub2_3 = 3;
  else if (q1CitationsVal >= 1) sub2_3 = 1;

  // 2.4 Books/Chapters: Map row.type. Book (Author)=5, Chapter/Editor=2 per entry. Clamped to Max 5.
  const sub2_4 = Math.min(
    (safeData.bookPublications || []).reduce((sum, row) => {
      if (!isNonEmpty(row.title)) return sum;
      if (row.type === 'Book (Author)') return sum + 5;
      if (row.type === 'Chapter' || row.type === 'Editor') return sum + 2;
      return sum;
    }, 0),
    5
  );

  // 2.5 Conference Papers: 1 mark per paper entry. Clamped to Max 4.
  const sub2_5 = Math.min(
    (safeData.conferencePapers || []).filter(r => isNonEmpty(r.paperTitle) || isNonEmpty(r.proceedingName)).length * 1,
    4
  );

  // 2.6 Collaborations: Map row.type. International=3, National/Industry=2 per entry. Clamped to Max 5.
  const sub2_6 = Math.min(
    (safeData.researchCollaborations || []).reduce((sum, row) => {
      if (!isNonEmpty(row.title) || !isNonEmpty(row.partner)) return sum;
      if (row.type === 'International') return sum + 3;
      if (row.type === 'National' || row.type === 'Industry') return sum + 2;
      return sum;
    }, 0),
    5
  );

  // 2.7 PhD Registered: 1 mark per active scholar entry. Clamped to Max 5.
  const sub2_7 = Math.min(
    (safeData.phdRegistered || []).filter(r => isNonEmpty(r.scholarName) && isNonEmpty(r.researchArea)).length * 1,
    5
  );

  // 2.8 PhD Awarded: 3 marks per awarded scholar entry. Clamped to Max 6.
  const sub2_8 = Math.min(
    (safeData.phdAwarded || []).filter(r => isNonEmpty(r.scholarName) && isNonEmpty(r.researchArea)).length * 3,
    6
  );

  const rawSection2Sum = sub2_1 + sub2_2 + sub2_3 + sub2_4 + sub2_5 + sub2_6 + sub2_7 + sub2_8;
  const section2Total = Math.min(rawSection2Sum, 55);

  // --- Section III Scoring Engine ---
  const sub3_1 = Math.min((safeData.patentsPublished || []).filter(r => isNonEmpty(r.title) || isNonEmpty(r.refNumber)).length * 1, 2);
  const sub3_2 = Math.min((safeData.patentsGranted || []).filter(r => isNonEmpty(r.title) || isNonEmpty(r.refNumber)).length * 3, 6);
  const sub3_3 = Math.min((safeData.transferOfTechnology || []).filter(r => isNonEmpty(r.title) && isNonEmpty(r.industryPartner)).length * 3, 3);
  const sub3_4 = Math.min((safeData.prototypesDeveloped || []).filter(r => isNonEmpty(r.title)).length * 1, 2);
  const sub3_5 = Math.min((safeData.hackathonPrizes || []).filter(r => isNonEmpty(r.eventName) && isNonEmpty(r.prize)).length * 2, 2);
  const section3Total = Math.min(sub3_1 + sub3_2 + sub3_3 + sub3_4 + sub3_5, 15);

  // --- Section IV Scoring Engine ---
  const sub4_1 = Math.min(
    (safeData.researchProjects || []).reduce((sum, row) => {
      if (!isNonEmpty(row.projectName)) return sum;
      const val = parseInt(row.amount || 0, 10);
      if (val >= 2000000) return sum + 8;
      if (val >= 1500000) return sum + 5;
      if (val >= 1000000) return sum + 3;
      if (val >= 500000) return sum + 2;
      if (val >= 100000) return sum + 1;
      return sum;
    }, 0),
    8
  );
  const sub4_2 = Math.min(
    (safeData.consultancyProjects || []).reduce((sum, row) => {
      if (!isNonEmpty(row.title)) return sum;
      const val = parseInt(row.amount || 0, 10);
      if (val >= 500000) return sum + 7;
      if (val >= 300000) return sum + 5;
      if (val >= 100000) return sum + 3;
      if (val > 0) return sum + 1;
      return sum;
    }, 0),
    7
  );
  const section4Total = Math.min(sub4_1 + sub4_2, 15);

  // --- Section V Scoring Engine ---
  const sub5_1 = Math.min((safeData.internationalEngagement || []).filter(r => isNonEmpty(r.institution) && isNonEmpty(r.country)).length * 1, 2);
  const sub5_2 = Math.min(
    (safeData.visitingPositions || []).reduce((sum, row) => {
      if (!isNonEmpty(row.institution)) return sum;
      const val = parseInt(row.duration || 0, 10);
      if (val >= 30) return sum + 4;
      if (val >= 15) return sum + 3;
      if (val >= 7) return sum + 2;
      return sum;
    }, 0),
    4
  );
  const sub5_3 = Math.min((safeData.foreignFaculty || []).filter(r => isNonEmpty(r.name) && isNonEmpty(r.institution)).length * 1, 2);
  const sub5_4 = Math.min((safeData.reputationSurvey || []).filter(r => isNonEmpty(r.surveyName) && (r.evidenceSubmitted || "").toLowerCase() === "yes").length * 1, 1);
  const sub5_5 = Math.min((safeData.nirfSurvey || []).filter(r => isNonEmpty(r.nominationDetails) && (r.evidenceSubmitted || "").toLowerCase() === "yes").length * 1, 1);
  const section5Total = Math.min(sub5_1 + sub5_2 + sub5_3 + sub5_4 + sub5_5, 10);

  // --- Section VI Scoring Engine ---
  const sub6_1 = Math.min((safeData.fdpAttended || []).filter(r => isNonEmpty(r.programName) && isNonEmpty(r.organizer)).length * 2, 3);
  const sub6_2 = Math.min(
    (safeData.programsOrganized || []).reduce((sum, row) => {
      if (!isNonEmpty(row.programName)) return sum;
      const days = parseInt(row.days || 0, 10);
      if (days >= 5) return sum + 2;
      if (days >= 2) return sum + 1;
      return sum;
    }, 0),
    4
  );
  const sub6_3 = Math.min(
    (safeData.resourcePerson || []).reduce((sum, row) => {
      if (!isNonEmpty(row.eventName) || !isNonEmpty(row.topic)) return sum;
      if (row.level === "International") return sum + 2;
      if (row.level === "National") return sum + 1;
      return sum;
    }, 0),
    4
  );
  const sub6_4 = Math.min((safeData.professionalMembership || []).filter(r => isNonEmpty(r.societyName) && (r.status || "").toLowerCase() === "active").length * 1, 1);
  const sub6_5 = Math.min((safeData.editorialBoard || []).filter(r => isNonEmpty(r.bodyName) && isNonEmpty(r.position)).length > 0 ? 2 : 0, 2);
  const sub6_6 = Math.min((safeData.moocDeveloped || []).filter(r => isNonEmpty(r.courseName)).length * 3, 6);
  const section6Total = Math.min(sub6_1 + sub6_2 + sub6_3 + sub6_4 + sub6_5 + sub6_6, 20);

  // --- Section VII Scoring Engine ---
  const sub7_1 = Math.min(
    (safeData.partialDelivery || []).reduce((sum, row) => {
      if (!isNonEmpty(row.courseDetails) || !isNonEmpty(row.industryName)) return sum;
      const hrs = parseFloat(row.duration || 0);
      if (hrs >= 6) return sum + 3;
      if (hrs >= 3) return sum + 2;
      if (hrs >= 1) return sum + 1;
      return sum;
    }, 0),
    4
  );
  const sub7_2 = Math.min((safeData.industrialVisits || []).filter(r => isNonEmpty(r.visitDetails) && isNonEmpty(r.industry)).length * 1, 2);
  const sub7_3 = Math.min(
    (safeData.facultyInternships || []).reduce((sum, row) => {
      if (!isNonEmpty(row.industryName)) return sum;
      const days = parseInt(row.duration || 0, 10);
      if (days >= 10) return sum + 3;
      if (days >= 5) return sum + 2;
      if (days >= 2) return sum + 1;
      return sum;
    }, 0),
    3
  );
  const sub7_4 = Math.min((safeData.employerEngagement || []).filter(r => isNonEmpty(r.activityName) && isNonEmpty(r.involvedParty)).length * 1, 1);
  const section7Total = Math.min(sub7_1 + sub7_2 + sub7_3 + sub7_4, 10);

  // --- Section VIII Scoring Engine ---
  const sub8_1 = Math.min((safeData.projectPublications || []).filter(r => isNonEmpty(r.title) && isNonEmpty(r.students)).length * 2, 2);
  const sub8_2 = Math.min((safeData.hackathonMentoring || []).filter(r => isNonEmpty(r.eventName) && isNonEmpty(r.students)).length * 1, 2);
  const sub8_3 = Math.min((safeData.startupSupport || []).filter(r => isNonEmpty(r.startupName) && isNonEmpty(r.role)).length > 0 ? 1 : 0, 1);
  const section8Total = Math.min(sub8_1 + sub8_2 + sub8_3, 5);

  // --- Section IX Scoring Engine ---
  const sub9_1 = Math.min(
    (safeData.deptActivities || []).reduce((sum, row) => {
      if (!isNonEmpty(row.description)) return sum;
      if (row.type === "DLCs and File Maintenance") return sum + 5;
      if (row.type === "Dept. Activity & File Maintenance") return sum + 2;
      return sum;
    }, 0),
    10
  );
  const sub9_2 = Math.min(
    (safeData.collegeActivities || []).reduce((sum, row) => {
      if (!isNonEmpty(row.description)) return sum;
      if (row.category === "Committee Member") return sum + 3;
      if (row.category === "Internal Review Committee") return sum + 5;
      if (row.category === "CLC / Deputy Warden") return sum + 7;
      if (row.category === "Associate Dean / Deputy Registrar / Deputy CoE / Warden") return sum + 10;
      return sum;
    }, 0),
    10
  );
  const sub9_3 = Math.min((safeData.adminResponsibilities || []).filter(r => isNonEmpty(r.role) && (isNonEmpty(r.evidenceLink) || isNonEmpty(r.appointmentLink))).length > 0 ? 20 : 0, 20);
  const section9Total = Math.min(sub9_1 + sub9_2 + sub9_3, 20);

  const grandTotal = total + section2Total + section3Total + section4Total + section5Total + section6Total + section7Total + section8Total + section9Total;

  return {
    coursesHandled: coursesHandledScore,
    courseFile: courseFileScore,
    coursesDesigned: coursesDesignedScore,
    valueAdded: valueAddedScore,
    innovativeMethods: innovativeMethodsScore,
    academicCollaborations: academicCollaborationsScore,
    mentoring: mentoringScore,
    certifications: certificationsScore,
    studentFeedback: studentFeedbackScore,
    resultAnalysis: resultAnalysisScore,
    coAttainment: coAttainmentScore,
    total,
    sub2_1, sub2_2, sub2_3, sub2_4, sub2_5, sub2_6, sub2_7, sub2_8, section2Total,
    sub3_1, sub3_2, sub3_3, sub3_4, sub3_5, section3Total,
    sub4_1, sub4_2, section4Total,
    sub5_1, sub5_2, sub5_3, sub5_4, sub5_5, section5Total,
    sub6_1, sub6_2, sub6_3, sub6_4, sub6_5, sub6_6, section6Total,
    sub7_1, sub7_2, sub7_3, sub7_4, section7Total,
    sub8_1, sub8_2, sub8_3, section8Total,
    sub9_1, sub9_2, sub9_3, section9Total,
    grandTotal,
  };
}


function DynamicArraySection({
  title,
  subtitle,
  rows = [],
  columns = [],
  rowErrors,
  onAdd,
  onChange,
  onRemove,
  canAdd,
  disabled = false,
  hodRemark,
}) {
  const safeRows = rows || [];
  const safeColumns = columns || [];

  const getFieldErrorText = (row, columnName) => {
    if (!rowErrors?.[row.id]?.[columnName]) {
      return '';
    }

    if (columnName === 'courseCode') {
      return 'Use 5-7 alphanumeric code (e.g., CS301).';
    }

    return 'Required field.';
  };

  const addDisabled = canAdd === false || disabled;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm shadow-black/5">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0 pr-2">
          <p className="text-sm font-bold uppercase tracking-wide text-gray-700">
            {title}
          </p>
          <span className="text-[11px] text-gray-500 font-medium mt-0.5 block tracking-wide italic normal-case">
            {subtitle}
          </span>
        </div>

        <button
          type="button"
          onClick={addDisabled ? undefined : onAdd}
          disabled={addDisabled}
          title={addDisabled ? 'Complete the last row (all fields + valid evidence link) before adding a new entry.' : 'Add a new entry'}
          className={`shrink-0 whitespace-nowrap inline-flex items-center justify-center gap-1.5 px-3 py-1.5 h-8 text-xs font-semibold rounded-lg transition-all select-none ${
            addDisabled
              ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed shadow-none'
              : 'bg-[#4A1519] hover:bg-[#3B1013] text-white cursor-pointer shadow-sm hover:shadow active:scale-[0.98]'
          }`}
        >
          <span className="text-sm leading-none font-bold">+</span>
          <span>Add</span>
        </button>
      </div>

      {hodRemark ? (
        <div className="mb-3 bg-amber-50/90 border border-amber-200 rounded-lg p-2.5 text-xs text-amber-900 font-medium flex items-center gap-2">
          <span className="text-sm">💬</span>
          <div>
            <span className="font-bold text-[#4A1519]">HoD Feedback:</span> "{hodRemark}"
          </div>
        </div>
      ) : null}

      {safeRows.length === 0 ? (
        <div className="mt-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-2 py-3 text-center text-xs text-slate-500">
          No entries yet.
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {safeRows.map((row, index) => (
            <div
              key={row.id || index}
              className="rounded-lg border border-slate-200 bg-slate-50 p-2"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700">
                  Entry {index + 1}
                </span>
                <button
                  type="button"
                  onClick={() => onRemove(row.id)}
                  disabled={disabled}
                  className="text-[11px] text-red-500 font-medium hover:text-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Remove
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2 w-full">
                {safeColumns.map((column) => (
                  <div
                    key={column.name}
                    className={`flex flex-col ${
                      column.name === 'evidenceLink'
                        ? 'flex-1 min-w-[280px]'
                        : column.name === 'paperTitle' ||
                          column.name === 'title' ||
                          column.name === 'scholarName' ||
                          column.name === 'journalName' ||
                          column.name === 'proceedingName' ||
                          column.name === 'partner' ||
                          column.name === 'researchArea'
                          ? 'flex-1 min-w-[180px]'
                          : ''
                    }`}
                  >
                    {column.type === 'select' ? (
                      <>
                        <select
                          value={row[column.name]}
                          onChange={(event) =>
                            onChange(row.id, column.name, event.target.value)
                          }
                          disabled={disabled}
                          className={`w-full rounded-md border ${
                            rowErrors?.[row.id]?.[column.name] ||
                            (column.name === 'courseCode' &&
                              isNonEmpty(row[column.name]) &&
                              !isValidCourseCode(row[column.name]))
                              ? 'border-red-400'
                              : 'border-slate-200'
                          } bg-white py-0.5 px-2 text-xs text-slate-800 outline-none transition focus:border-[#4A1519] focus:ring-2 focus:ring-[#4A1519]/20 disabled:bg-slate-100 disabled:cursor-not-allowed ${
                            column.name === 'courseCode'
                              ? 'max-w-[110px]'
                              : column.name === 'courseName'
                                ? 'max-w-[160px]'
                                : ''
                          }`}
                        >
                          <option value="">{column.label}</option>
                          {(column.options || []).map((option) => {
                            const optValue = typeof option === 'object' && option !== null ? option.value : option;
                            const optLabel = typeof option === 'object' && option !== null ? option.label : option;
                            return (
                              <option key={optValue} value={optValue}>
                                {optLabel}
                              </option>
                            );
                          })}
                        </select>
                        {getFieldErrorText(row, column.name) ? (
                          <span className="mt-0.5 block text-[10px] text-rose-600">
                            {getFieldErrorText(row, column.name)}
                          </span>
                        ) : null}
                      </>
                    ) : (
                      <>
                        <input
                          type={column.type || 'text'}
                          value={row[column.name]}
                          onChange={(event) =>
                            onChange(row.id, column.name, event.target.value)
                          }
                          disabled={disabled}
                          placeholder={column.placeholder || column.label}
                          className={`w-full rounded-md border ${
                            rowErrors?.[row.id]?.[column.name] ||
                            (column.name === 'courseCode' &&
                              isNonEmpty(row[column.name]) &&
                              !isValidCourseCode(row[column.name]))
                              ? 'border-red-400'
                              : 'border-slate-200'
                          } bg-white py-0.5 px-2 text-xs text-slate-800 outline-none transition focus:border-[#4A1519] focus:ring-2 focus:ring-[#4A1519]/20 placeholder:text-[11px] placeholder:text-gray-400 disabled:bg-slate-100 disabled:cursor-not-allowed ${
                            column.name === 'courseCode'
                              ? 'max-w-[110px]'
                              : column.name === 'courseName'
                                ? 'max-w-[160px]'
                                : ''
                          }`}
                        />
                        {getFieldErrorText(row, column.name) ? (
                          <span className="mt-0.5 block text-[10px] text-rose-600">
                            {getFieldErrorText(row, column.name)}
                          </span>
                        ) : null}
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function LandingPage({ googleClientId, onLogin }) {
  const [errorMessage, setErrorMessage] = useState('');
  const [isRegModalOpen, setIsRegModalOpen] = useState(false);

  const resolvedClientId = useMemo(
    () =>
      googleClientId ||
      (typeof window !== 'undefined' ? window.__GOOGLE_CLIENT_ID__ || '' : ''),
    [googleClientId]
  );

  const handleGoogleSuccess = async (credentialResponse) => {
    setErrorMessage('');

    if (!credentialResponse.credential) {
      setErrorMessage('Google sign-in did not return a valid credential token.');
      return;
    }

    try {
      const authResponse = await axios.post(
        `${API_BASE_URL}/auth/google`,
        { credential: credentialResponse.credential },
        { withCredentials: true }
      );
      const backendUser = authResponse.data?.user;
      const backendToken = authResponse.data?.token;
      const userEmail = (backendUser?.email || '').toLowerCase();
      const assignedRole = backendUser?.role || getRoleFromEmail(userEmail);

      if (!userEmail || !backendToken) {
        setErrorMessage('Authentication succeeded but no active session token was issued.');
        return;
      }

      onLogin({
        id: backendUser?.id || '',
        name: backendUser?.name || 'Staff User',
        email: userEmail,
        personalEmail: backendUser?.personalEmail || userEmail,
        hodEmail: backendUser?.hodEmail || '',
        alternateEmails: backendUser?.alternateEmails || [userEmail],
        picture: backendUser?.picture || '',
        role: assignedRole,
        department: backendUser?.department || 'CSE',
        departmentName: backendUser?.departmentName || '',
        designation: backendUser?.designation || 'Faculty',
        token: backendToken,
      });
    } catch (error) {
      if (axios.isAxiosError(error)) {
        setErrorMessage(
          error.response?.data?.message || 'Google authentication failed. Please try again.'
        );
        return;
      }

      setErrorMessage(error instanceof Error ? error.message : 'Google sign-in failed.');
    }
  };

  return (
    <div className="flex min-h-screen w-full flex-col md:flex-row">
      <section className="flex basis-full bg-gradient-to-br from-[#4A1519] to-[#3B1013] px-6 py-8 text-white md:basis-3/5 md:px-12 md:py-10 lg:px-16">
        <div className="flex w-full flex-col">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/20 bg-white/95 p-1.5 shadow-lg shadow-black/20 shrink-0">
              <img
                src={tceLogo}
                alt="Thiagarajar College of Engineering Official Logo"
                className="h-full w-full object-contain"
              />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-white/70">
                Institutional Portal
              </p>
              <h1 className="mt-1 text-lg font-bold leading-tight sm:text-xl text-white tracking-wide">
                Thiagarajar College of Engineering
              </h1>
            </div>
          </div>

          <div className="flex flex-1 items-center py-16 md:py-20">
            <div className="max-w-2xl">
              <p className="mb-5 text-sm font-medium uppercase tracking-[0.4em] text-white/60">
                Appraisal Portal
              </p>
              <h2 className="max-w-xl text-4xl font-semibold leading-tight sm:text-5xl lg:text-6xl">
                TCE Faculty Performance Evaluation Portal (TFPEP)
              </h2>
              
            </div>
          </div>

          <div className="flex flex-wrap gap-6 border-t border-white/10 pt-6">
            {STATS.map((stat) => (
              <div key={stat.label} className="min-w-[120px]">
                <p className="text-xl font-semibold tracking-wide sm:text-2xl">
                  {stat.value}
                </p>
                <p className="mt-1 text-xs font-medium uppercase tracking-[0.35em] text-white/60">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="flex basis-full items-center justify-center bg-[#F5F5F5] px-6 py-10 md:basis-2/5 md:px-8 lg:px-10">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl shadow-black/10 sm:p-10">
          <div className="inline-flex rounded-full bg-[#4A1519]/8 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-[#4A1519]">
            Staff Sign-In
          </div>
          <h3 className="mt-5 text-3xl font-bold tracking-tight text-slate-900">
            Welcome back
          </h3>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            Authenticate with Google to continue into the appraisal workspace.
          </p>

          <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6">
            <div className="flex justify-center">
              {resolvedClientId ? (
                <GoogleOAuthProvider clientId={resolvedClientId}>
                  <GoogleLogin
                    onSuccess={handleGoogleSuccess}
                    onError={() =>
                      setErrorMessage(
                        'Google sign-in was cancelled or could not be completed.'
                      )
                    }
                    shape="pill"
                    size="large"
                    text="signin_with"
                    theme="outline"
                    width="320"
                  />
                </GoogleOAuthProvider>
              ) : (
                <p className="text-center text-sm text-amber-700">
                  Add a valid Google client ID to enable sign-in.
                </p>
              )}
            </div>

            {errorMessage && (
              <p className="mt-4 text-center text-sm font-medium text-rose-600">
                {errorMessage}
              </p>
            )}

            {/* Onboarding & Directory Verification Trigger Button */}
            <div className="mt-5 pt-4 border-t border-slate-200 text-center">
              <button
                type="button"
                onClick={() => setIsRegModalOpen(true)}
                className="text-xs font-bold text-[#4A1519] hover:text-[#3B1013] hover:underline flex items-center justify-center gap-1.5 mx-auto transition-all py-1 px-2 rounded-lg bg-[#4A1519]/5 border border-[#4A1519]/10"
              >
                <span>🎓</span>
                <span>New Faculty or Verify Profile? Register / Lookup</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Registration & Roster Verification Modal */}
      <FacultyRegistrationModal
        isOpen={isRegModalOpen}
        onClose={() => setIsRegModalOpen(false)}
      />
    </div>
  );
}

// Read-only drill-down view of a submitted appraisal record.
// When hodControls is provided, a feedback textarea and action buttons render at the bottom.
function DetailedReviewView({ appraisal, onClose, hodControls, principalControls, iqacControls, onExportPDF }) {
  const facultyName = appraisal.facultyName || appraisal.name || "Faculty Member";
  const facultyEmail = appraisal.facultyEmail || appraisal.email || "";
  const fullData = flattenAppraisalRecord(appraisal);
  const sec1 = appraisal.section1Data || appraisal.sectionData || fullData;
  const sec2 = appraisal.section2Data || appraisal.sectionData || fullData;
  
  const exportUserObj = {
    name: facultyName,
    email: facultyEmail,
    role: appraisal.role || 'Faculty',
    designation: appraisal.designation || (appraisal.role === 'HOD' ? 'Professor & Head (HOD)' : 'Assistant Professor')
  };

  // Active HoD Scores map (either being edited in hodControls or saved on appraisal)
  const activeHodScores = (hodControls ? hodControls.subsectionScores : appraisal.hodSubsectionScores) || {};
  const effectiveScoreObj = computeEffectiveScores(fullData, activeHodScores);
  const scoreObj = effectiveScoreObj;

  const [loadingAiKey, setLoadingAiKey] = useState(null);
  const [principalRemarksInput, setPrincipalRemarksInput] = useState(principalControls?.remarks || appraisal.principalRemarks || '');
  const [isEndorsing, setIsEndorsing] = useState(false);

  const fetchAISuggestion = async (payload) => {
    try {
      const token = getAuthToken();
      const res = await axios.post(`${API_BASE_URL}/ai/suggest-feedback`, payload, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      return res.data?.suggestion || '';
    } catch (err) {
      console.warn('AI suggestion fetch error:', err.message);
      return '';
    }
  };

  const handleAiSuggestSubsection = async (subKey, label, currentScore, maxMark) => {
    setLoadingAiKey(subKey);
    try {
      const suggestion = await fetchAISuggestion({
        mode: 'subsection',
        subKey,
        subLabel: label,
        score: currentScore,
        maxMarks: maxMark,
        facultyName,
        sectionScores: effectiveScoreObj,
      });
      if (suggestion && hodControls) {
        const existing = hodControls.subsectionRemarks?.[subKey] || '';
        const finalVal = existing ? `${existing} | ${suggestion}` : suggestion;
        hodControls.onSubsectionRemarkChange(subKey, finalVal);
      }
    } finally {
      setLoadingAiKey(null);
    }
  };

  const handleAiSuggestOverall = async () => {
    setLoadingAiKey('overall');
    try {
      const suggestion = await fetchAISuggestion({
        mode: 'overall',
        facultyName,
        sectionScores: effectiveScoreObj,
      });
      if (suggestion && hodControls) {
        const existing = hodControls.remarksValue || '';
        const finalVal = existing ? `${existing}\n\n${suggestion}` : suggestion;
        hodControls.onRemarksChange(finalVal);
      }
    } finally {
      setLoadingAiKey(null);
    }
  };

  const isRowBlank = (row) => !isMeaningfullyFilledRow(row);

  const isRowIncomplete = (row, fields) => {
    if (isRowBlank(row)) return false;
    return fields.some((f) => !row[f] || String(row[f]).trim() === '');
  };

  const renderHoDSubsectionScoringAndFeedback = (subKey, label) => {
    const maxMark = SUBSECTION_MAX_MARKS[subKey] || 10;
    const autoScore = effectiveScoreObj.autoMap[subKey] ?? 0;
    const effScore = effectiveScoreObj.effectiveMap[subKey] ?? autoScore;
    const isOverridden = effScore !== autoScore;

    return (
      <div className="mt-2.5 bg-gradient-to-r from-amber-50/90 to-orange-50/60 border border-amber-200 rounded-lg p-3 space-y-2.5">
        {/* Dual Score Evaluation Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 items-center">
          {/* Box 1: Automated System Score (Locked) */}
          <div className="bg-white/90 border border-slate-200 rounded-md px-3 py-2 flex items-center justify-between shadow-xs">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                🤖 Automated Score
              </span>
              <span className="text-[11px] font-medium text-slate-600">Calculated via Rubric</span>
            </div>
            <div className="text-right">
              <span className="text-sm font-black text-slate-800">{autoScore}</span>
              <span className="text-xs text-slate-400 font-semibold"> / {maxMark}</span>
            </div>
          </div>

          {/* Box 2: HoD Evaluated Score Box */}
          {hodControls ? (
            <div className={`bg-white rounded-md px-3 py-1.5 border ${isOverridden ? 'border-amber-400 ring-2 ring-amber-400/20' : 'border-amber-200'} shadow-xs flex items-center justify-between`}>
              <div className="flex-1 mr-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#4A1519] flex items-center gap-1">
                  <span>👨‍🏫</span> HoD Awarded Score:
                </span>
                <span className="text-[10px] text-slate-500 block">
                  {isOverridden ? '⚡ Overriding system score' : 'Leave blank for system score'}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="0"
                  max={maxMark}
                  step="0.5"
                  value={hodControls.subsectionScores?.[subKey] ?? ''}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw === '') {
                      hodControls.onSubsectionScoreChange(subKey, '');
                    } else {
                      const num = Math.max(0, Math.min(Number(raw), maxMark));
                      hodControls.onSubsectionScoreChange(subKey, num);
                    }
                  }}
                  placeholder={String(autoScore)}
                  className="w-14 h-8 text-center text-xs font-black text-[#4A1519] bg-amber-50/60 border border-amber-300 rounded outline-none focus:bg-white focus:border-[#4A1519] focus:ring-1 focus:ring-[#4A1519]"
                />
                <span className="text-xs font-bold text-slate-500">/ {maxMark}</span>
              </div>
            </div>
          ) : (
            <div className="bg-white/90 border border-amber-200 rounded-md px-3 py-2 flex items-center justify-between shadow-xs">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#4A1519] block">
                  👨‍🏫 Final Evaluated Mark
                </span>
                <span className="text-[10px] text-slate-500">
                  {isOverridden ? '⚡ Manually evaluated by HoD' : 'Matches system calculation'}
                </span>
              </div>
              <div className="text-right">
                <span className="text-sm font-black text-[#4A1519]">{effScore}</span>
                <span className="text-xs text-slate-400 font-semibold"> / {maxMark}</span>
              </div>
            </div>
          )}
        </div>

        {/* Feedback Notes Section */}
        {hodControls ? (
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10.5px] font-bold text-[#4A1519] flex items-center gap-1.5">
                <span>💬</span> HoD Feedback Remarks for {label}:
              </label>
              <div className="flex items-center gap-1.5">
                {hodControls.subsectionRemarks?.[subKey] && (
                  <span className="text-[9px] bg-amber-200 text-amber-900 font-bold px-1.5 py-0.2 rounded">
                    Saved Note
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => handleAiSuggestSubsection(subKey, label, effScore, maxMark)}
                  disabled={loadingAiKey === subKey}
                  className="text-[9.5px] font-bold px-2 py-0.5 rounded bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-300 transition flex items-center gap-1 cursor-pointer disabled:opacity-50 shadow-2xs"
                  title="Generate AI observation for this subsection based on awarded marks"
                >
                  {loadingAiKey === subKey ? '⏳ AI Drafting...' : '✨ AI Suggest'}
                </button>
              </div>
            </div>
            <input
              type="text"
              value={hodControls.subsectionRemarks?.[subKey] || ''}
              onChange={(e) => hodControls.onSubsectionRemarkChange(subKey, e.target.value)}
              placeholder={`Enter feedback / rationale for ${label}...`}
              className="w-full text-xs px-2.5 py-1.5 bg-white border border-amber-200 rounded-md outline-none focus:border-[#4A1519] focus:ring-1 focus:ring-[#4A1519]/20 text-slate-800"
            />
          </div>
        ) : appraisal.subsectionRemarks?.[subKey] ? (
          <div className="bg-white/90 border border-amber-200/80 rounded-md p-2 text-xs text-amber-900 font-medium">
            💬 <span className="font-bold text-[#4A1519]">HoD Feedback:</span> "{appraisal.subsectionRemarks[subKey]}"
          </div>
        ) : null}
      </div>
    );
  };

  const section1Arrays = [
    { label: '1.1 Courses Handled', rows: (sec1.coursesHandled || []).filter(r => !isRowBlank(r)), fields: ['courseCode', 'courseName', 'type', 'semester', 'evidenceLink'] },
    { label: '1.2 Course File', rows: (sec1.courseFiles || []).filter(r => !isRowBlank(r)), fields: ['courseCode', 'courseName', 'compliance', 'evidenceLink'] },
    { label: '1.3 Course Design', rows: (sec1.coursesDesigned || []).filter(r => !isRowBlank(r)), fields: ['courseCode', 'courseName', 'remarks', 'evidenceLink'] },
    { label: '1.4 Value-Added', rows: (sec1.valueAdded || []).filter(r => !isRowBlank(r)), fields: ['courseName', 'particulars', 'studentCount', 'evidenceLink'] },
    { label: '1.5 Innovative Methods', rows: (sec1.innovativeMethods || []).filter(r => !isRowBlank(r)), fields: ['courseCode', 'method', 'evidenceLink'] },
    { label: '1.6 Academic Collaborations', rows: (sec1.academicCollaborations || []).filter(r => !isRowBlank(r)), fields: ['organization', 'collaborationType', 'evidenceLink'] },
    { label: '1.8 NPTEL Certifications', rows: (sec1.certifications || []).filter(r => !isRowBlank(r)), fields: ['courseName', 'platform', 'certType', 'evidenceLink'] },
    { label: '1.9 Student Feedback', rows: (sec1.studentFeedback || []).filter(r => !isRowBlank(r)), fields: ['courseCode', 'feedbackPct', 'evidenceLink'] },
    { label: '1.10 Result Analysis', rows: (sec1.resultAnalysis || []).filter(r => !isRowBlank(r)), fields: ['courseCode', 'courseName', 'passPercentage', 'evidenceLink'] },
    { label: '1.11 CO Attainment %', rows: (sec1.coAttainment || []).filter(r => !isRowBlank(r)), fields: ['courseCode', 'courseName', 'attainmentPct', 'evidenceLink'] },
  ];

  const section2Arrays = [
    { label: '2.1 Journal Publications', rows: (sec2.journalPapers || []).filter(r => !isRowBlank(r)), fields: ['paperTitle', 'journalName', 'tier', 'evidenceLink'] },
    { label: '2.4 Books / Chapters', rows: (sec2.bookPublications || []).filter(r => !isRowBlank(r)), fields: ['title', 'type', 'evidenceLink'] },
    { label: '2.5 Conference Publications', rows: (sec2.conferencePapers || []).filter(r => !isRowBlank(r)), fields: ['paperTitle', 'proceedingName', 'evidenceLink'] },
    { label: '2.6 Research Collaborations', rows: (sec2.researchCollaborations || []).filter(r => !isRowBlank(r)), fields: ['title', 'partner', 'type', 'evidenceLink'] },
    { label: '2.7 PhD Scholars (Registered)', rows: (sec2.phdRegistered || []).filter(r => !isRowBlank(r)), fields: ['scholarName', 'researchArea', 'evidenceLink'] },
    { label: '2.8 PhD Scholars (Awarded)', rows: (sec2.phdAwarded || []).filter(r => !isRowBlank(r)), fields: ['scholarName', 'researchArea', 'evidenceLink'] },
  ];

  const isSection1Populated = section1Arrays.some(s => s.rows.length > 0) ||
    Boolean(sec1.mentoring && (sec1.mentoring.menteeCount || sec1.mentoring.description || sec1.mentoring.evidenceLink));

  const isSection2Populated = section2Arrays.some(s => s.rows.length > 0) ||
    Boolean(sec2.citationsReceived?.totalCount || sec2.q1Citations?.totalCount);

  const sec3 = appraisal.section3Data || {};
  const sec4 = appraisal.section4Data || {};
  const sec5 = appraisal.section5Data || {};

  const section3Arrays = [
    { label: "3.1 Patents Published", rows: (sec3.patentsPublished || []).filter(r => !isRowBlank(r)), fields: ["refNumber", "title", "inventors", "datePublished", "evidenceLink"] },
    { label: "3.2 Patents Granted", rows: (sec3.patentsGranted || []).filter(r => !isRowBlank(r)), fields: ["refNumber", "title", "inventors", "dateGranted", "evidenceLink"] },
    { label: "3.3 Transfer of Technology", rows: (sec3.transferOfTechnology || []).filter(r => !isRowBlank(r)), fields: ["title", "industryPartner", "amount", "evidenceLink"] },
    { label: "3.4 Prototypes", rows: (sec3.prototypesDeveloped || []).filter(r => !isRowBlank(r)), fields: ["title", "studentsInvolved", "date", "evidenceLink"] },
    { label: "3.5 Hackathon Prizes", rows: (sec3.hackathonPrizes || []).filter(r => !isRowBlank(r)), fields: ["eventName", "studentsMentored", "prize", "date", "evidenceLink"] }
  ];
  const isSection3Populated = section3Arrays.some(s => s.rows.length > 0);

  const section4Arrays = [
    { label: "4.1 Research Projects", rows: (sec4.researchProjects || []).filter(r => !isRowBlank(r)), fields: ["projectName", "fundingAgency", "period", "amount", "role", "evidenceLink"] },
    { label: "4.2 Consultancy Projects", rows: (sec4.consultancyProjects || []).filter(r => !isRowBlank(r)), fields: ["title", "clientDetails", "period", "amount", "evidenceLink"] }
  ];
  const isSection4Populated = section4Arrays.some(s => s.rows.length > 0);

  const section5Arrays = [
    { label: "5.1 International Engagement", rows: (sec5.internationalEngagement || []).filter(r => !isRowBlank(r)), fields: ["institution", "country", "nature", "evidenceLink"] },
    { label: "5.2 Visiting Positions", rows: (sec5.visitingPositions || []).filter(r => !isRowBlank(r)), fields: ["institution", "duration", "period", "evidenceLink"] },
    { label: "5.3 Foreign Faculty", rows: (sec5.foreignFaculty || []).filter(r => !isRowBlank(r)), fields: ["name", "institution", "period", "engagementType", "evidenceLink"] },
    { label: "5.4 Reputation Survey", rows: (sec5.reputationSurvey || []).filter(r => !isRowBlank(r)), fields: ["surveyName", "evidenceSubmitted", "evidenceLink"] },
    { label: "5.5 NIRF Survey", rows: (sec5.nirfSurvey || []).filter(r => !isRowBlank(r)), fields: ["nominationDetails", "evidenceSubmitted", "evidenceLink"] }
  ];
  const isSection5Populated = section5Arrays.some(s => s.rows.length > 0);

  const sec6 = appraisal.section6Data || {};
  const sec7 = appraisal.section7Data || {};
  const sec8 = appraisal.section8Data || {};
  const sec9 = appraisal.section9Data || {};

  const section6Arrays = [
    { label: "6.1 FDP / STTP Attended", rows: (sec6.fdpAttended || []).filter(r => !isRowBlank(r)), fields: ["programName", "organizer", "duration", "dateRange", "evidenceLink"] },
    { label: "6.2 Programs Organized", rows: (sec6.programsOrganized || []).filter(r => !isRowBlank(r)), fields: ["programName", "days", "dateRange", "role", "participants", "evidenceLink"] },
    { label: "6.3 Resource Person", rows: (sec6.resourcePerson || []).filter(r => !isRowBlank(r)), fields: ["eventName", "level", "topic", "date", "evidenceLink"] },
    { label: "6.4 Professional Membership", rows: (sec6.professionalMembership || []).filter(r => !isRowBlank(r)), fields: ["societyName", "membershipType", "status", "evidenceLink"] },
    { label: "6.5 Editorial Board", rows: (sec6.editorialBoard || []).filter(r => !isRowBlank(r)), fields: ["bodyName", "position", "period", "evidenceLink"] },
    { label: "6.6 MOOC Developed", rows: (sec6.moocDeveloped || []).filter(r => !isRowBlank(r)), fields: ["courseName", "weeks", "coFacultyCount", "takersCount", "evidenceLink"] }
  ];
  const isSection6Populated = section6Arrays.some(s => s.rows.length > 0);

  const section7Arrays = [
    { label: "7.1 Expert Deliveries", rows: (sec7.partialDelivery || []).filter(r => !isRowBlank(r)), fields: ["courseDetails", "mode", "industryName", "expertDetails", "duration", "date", "evidenceLink"] },
    { label: "7.2 Industrial Visits", rows: (sec7.industrialVisits || []).filter(r => !isRowBlank(r)), fields: ["visitDetails", "industry", "studentsCount", "date", "evidenceLink"] },
    { label: "7.3 Faculty Internships", rows: (sec7.facultyInternships || []).filter(r => !isRowBlank(r)), fields: ["industryName", "duration", "purpose", "evidenceLink"] },
    { label: "7.4 Employer Engagement", rows: (sec7.employerEngagement || []).filter(r => !isRowBlank(r)), fields: ["activityName", "involvedParty", "date", "evidenceLink"] }
  ];
  const isSection7Populated = section7Arrays.some(s => s.rows.length > 0);

  const section8Arrays = [
    { label: "8.1 Project Publications", rows: (sec8.projectPublications || []).filter(r => !isRowBlank(r)), fields: ["title", "students", "journalDetails", "date", "evidenceLink"] },
    { label: "8.2 Hackathon Mentoring", rows: (sec8.hackathonMentoring || []).filter(r => !isRowBlank(r)), fields: ["eventName", "students", "outcome", "dateRange", "evidenceLink"] },
    { label: "8.3 Startup Support", rows: (sec8.startupSupport || []).filter(r => !isRowBlank(r)), fields: ["startupName", "role", "duration", "evidenceLink"] }
  ];
  const isSection8Populated = section8Arrays.some(s => s.rows.length > 0);

  const section9Arrays = [
    { label: "9.1 Dept Activities", rows: (sec9.deptActivities || []).filter(r => !isRowBlank(r)), fields: ["description", "type", "role", "approval", "evidenceLink"] },
    { label: "9.2 College Activities", rows: (sec9.collegeActivities || []).filter(r => !isRowBlank(r)), fields: ["description", "category", "role", "approval", "evidenceLink"] },
    { label: "9.3 Admin Responsibilities", rows: (sec9.adminResponsibilities || []).filter(r => !isRowBlank(r)), fields: ["role", "evidenceLink"] }
  ];
  const isSection9Populated = section9Arrays.some(s => s.rows.length > 0);

  const renderSubTableGroup = (groups) => {
    return groups.map(({ label, rows, fields }) => {
      const subKey = label.split(' ')[0];
      return (
        <div key={label} className="rounded-lg border border-slate-100 bg-slate-50 p-2.5 mb-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1.5">
            {label}
          </p>
          {rows.length === 0 ? (
            <p className="text-[11px] text-slate-400 italic">No entries submitted.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left">
                <thead>
                  <tr className="border-b border-slate-200">
                    {fields.map((field) => (
                      <th key={field} className="py-1 px-2 text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                        {field === 'evidenceLink' ? 'Evidence' : field}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => {
                    const incomplete = isRowIncomplete(row, fields);
                    return (
                      <tr 
                        key={row.id || idx} 
                        className={`border-b border-slate-100 ${incomplete ? 'bg-amber-50/70 border-l-2 border-l-amber-500' : ''}`}
                      >
                        {fields.map((field) => (
                          <td key={field} className="py-1 px-2 text-[11px] text-slate-600 max-w-[180px] truncate">
                            {field === 'evidenceLink' && row[field] ? (
                              <a
                                href={row[field]}
                                target="_blank"
                                rel="noreferrer"
                                className="text-blue-600 underline hover:text-blue-800"
                              >
                                Link ↗
                              </a>
                            ) : (
                              row[field] || <span className="text-amber-600 font-medium italic">Missing</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {renderHoDSubsectionScoringAndFeedback(subKey, label)}
        </div>
      );
    });
  };
  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-black/5 space-y-4">
      <div className="flex items-start justify-between border-b border-slate-100 pb-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-[#4A1519]">
            Submission Detail View
          </p>
          <p className="mt-0.5 text-sm font-bold text-slate-800">
            {facultyName} <span className="text-xs font-normal text-slate-500">({facultyEmail})</span>
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            <div className="bg-slate-100 px-2.5 py-1 rounded text-xs font-semibold text-slate-700">
              Automated Score: <span className="font-bold text-slate-900">{effectiveScoreObj.autoGrandTotal} / 200</span>
            </div>
            <div className="bg-[#4A1519]/10 px-2.5 py-1 rounded text-xs font-bold text-[#4A1519]">
              HoD Final Evaluated Score: <span className="font-black text-sm">{effectiveScoreObj.grandTotal} / 200</span>
            </div>
            {effectiveScoreObj.hasAdjustments && (
              <span className="text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-full">
                ⚡ Overrides Applied
              </span>
            )}
          </div>
          {appraisal.iqacAuditRemarks && (
            <div className="mt-2 text-xs font-semibold text-blue-900 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
              <span>📊</span>
              <span><strong>IQAC Audit Remarks:</strong> "{appraisal.iqacAuditRemarks}"</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              exportAppraisalToPDF({
                user: exportUserObj,
                timeline: appraisal.timeline,
                sectionData: fullData,
                scores: effectiveScoreObj,
                record: appraisal,
              });
            }}
            className="text-[11px] py-1 px-2.5 h-7 bg-white border border-[#4A1519] text-[#4A1519] hover:bg-[#4A1519] hover:text-white rounded-md font-medium shadow-xs transition flex items-center gap-1"
            title="Download PDF with Clickable Evidence Links"
          >
            <span>📄</span> PDF
          </button>
          <button
            type="button"
            onClick={() => {
              if (onExportPDF) {
                onExportPDF({
                  user: exportUserObj,
                  timeline: appraisal.timeline,
                  sectionData: fullData,
                  scores: effectiveScoreObj,
                  record: appraisal,
                });
              } else {
                window.print();
              }
            }}
            className="text-[11px] py-1 px-2 h-7 bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-md font-medium shadow-xs transition flex items-center gap-1"
            title="Print Document"
          >
            <span>🖨️</span> Print
          </button>
          <button
            type="button"
            onClick={() => {
              exportAppraisalToExcel({
                user: exportUserObj,
                timeline: appraisal.timeline,
                sectionData: fullData,
                scores: effectiveScoreObj,
                record: appraisal,
              });
            }}
            className="text-[11px] py-1 px-2.5 h-7 bg-white border border-emerald-600 text-emerald-700 hover:bg-emerald-600 hover:text-white rounded-md font-medium shadow-xs transition flex items-center gap-1"
            title="Download Excel Workbook"
          >
            <span>📊</span> Excel
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-xs py-1 px-2.5 h-7 bg-white border border-slate-300 rounded-md font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition"
          >
            Close
          </button>
        </div>
      </div>

      {/* Institutional Ratification Status Banner */}
      {(appraisal.principalApprovalStatus === 'Ratified' || appraisal.appraisalStatus === 'Ratified' || principalControls?.isRatified) && (
        <div className="rounded-xl border border-emerald-300 bg-gradient-to-r from-emerald-50 via-teal-50 to-green-50 p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="text-2xl p-2 bg-emerald-100 rounded-lg text-emerald-800 shrink-0">🎓</div>
            <div className="flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-xs font-black uppercase tracking-wider text-emerald-900 flex items-center gap-1.5">
                  <span>🔒 Institutionally Ratified &amp; Locked for Audit</span>
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-emerald-200 text-emerald-800">
                    Official Institutional Seal
                  </span>
                </h4>
                <span className="text-[11px] font-semibold text-emerald-700">
                  {appraisal.principalEndorsedAt
                    ? `Endorsed on ${new Date(appraisal.principalEndorsedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                    : 'Ratified by Principal'}
                </span>
              </div>
              {(appraisal.principalRemarks || principalControls?.remarks) && (
                <div className="mt-2 text-xs text-emerald-900 bg-white/80 border border-emerald-200/70 rounded-lg p-2.5 leading-relaxed">
                  <span className="font-bold text-emerald-950">Principal's Institutional Commendation:</span> "{appraisal.principalRemarks || principalControls?.remarks}"
                </div>
              )}
              <p className="text-[10px] text-emerald-600 mt-1.5 font-medium">
                This appraisal has received final executive sign-off from the Principal and is permanently preserved for NAAC, NBA, and NIRF institutional accreditation compliance.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* IQAC Verification Status Banner */}
      {((appraisal.iqacStatus || '').toUpperCase().includes('IQAC') || (appraisal.appraisalStatus || '').toUpperCase().includes('IQAC')) && (
        <div className="rounded-xl border border-blue-300 bg-gradient-to-r from-blue-50 via-indigo-50 to-sky-50 p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="text-2xl p-2 bg-blue-100 rounded-lg text-blue-900 shrink-0">📊</div>
            <div className="flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-xs font-black uppercase tracking-wider text-blue-950 flex items-center gap-1.5">
                  <span>📊 IQAC Audit Verified</span>
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-blue-200 text-blue-900">
                    Quality Assured
                  </span>
                </h4>
                <span className="text-[11px] font-semibold text-blue-700">
                  {appraisal.iqacEvaluatedAt
                    ? `Verified on ${new Date(appraisal.iqacEvaluatedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                    : 'Audited by IQAC Cell'}
                </span>
              </div>
              {appraisal.iqacAuditRemarks && (
                <div className="mt-2 text-xs text-blue-900 bg-white/80 border border-blue-200/70 rounded-lg p-2.5 leading-relaxed">
                  <span className="font-bold text-blue-950">IQAC Audit Note &amp; Feedback:</span> "{appraisal.iqacAuditRemarks}"
                </div>
              )}
              <p className="text-[10px] text-blue-700 mt-1.5 font-medium">
                This appraisal submission has undergone IQAC institutional quality audit and meets quality compliance benchmarks.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Section I Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2">
        <div className="flex justify-between items-center border-b border-slate-100 pb-2">
          <h4 className="text-xs font-black uppercase tracking-wider text-[#4A1519]">SECTION I: Teaching &amp; Learning</h4>
          <span className="text-xs font-bold text-slate-700">Subtotal: {scoreObj.total || 0} / 50</span>
        </div>
        {!isSection1Populated ? (
          <p className="text-xs text-gray-400 italic py-2">Section completely unpopulated by faculty.</p>
        ) : (
          <div className="space-y-2 mt-2">
            {renderSubTableGroup(section1Arrays)}
            {/* 1.7 Mentoring System */}
            {sec1.mentoring && (
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-2.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                  1.7 Mentoring System
                </p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-slate-600 sm:grid-cols-3">
                  <div><span className="font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Mentee Count</span><p>{sec1.mentoring.menteeCount || '—'}</p></div>
                  <div><span className="font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Batch</span><p>{sec1.mentoring.batch || '—'}</p></div>
                  <div><span className="font-semibold text-slate-500 uppercase tracking-wider text-[10px]">HOD Review</span><p>{sec1.mentoring.hodReview || 'Pending'}</p></div>
                  <div className="col-span-2 sm:col-span-3"><span className="font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Description</span><p className="mt-0.5 leading-4">{sec1.mentoring.description || '—'}</p></div>
                  <div className="col-span-2 sm:col-span-3"><span className="font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Evidence</span><p className="mt-0.5">{sec1.mentoring.evidenceLink ? (<a href={sec1.mentoring.evidenceLink} target="_blank" rel="noreferrer" className="text-blue-600 underline hover:text-blue-800">Link ↗</a>) : '—'}</p></div>
                </div>
                {renderHoDSubsectionScoringAndFeedback('1.7', '1.7 Mentoring System')}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Section II Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2">
        <div className="flex justify-between items-center border-b border-slate-100 pb-2">
          <h4 className="text-xs font-black uppercase tracking-wider text-[#4A1519]">SECTION II: Research Publications</h4>
          <span className="text-xs font-bold text-slate-700">Subtotal: {scoreObj.section2Total || 0} / 55</span>
        </div>
        {!isSection2Populated ? (
          <p className="text-xs text-gray-400 italic py-2">Section completely unpopulated by faculty.</p>
        ) : (
          <div className="space-y-2 mt-2">
            {/* Citations Summary */}
            <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 mb-2 space-y-2">
              <div className="grid grid-cols-2 gap-2 text-xs font-medium">
                <div><span className="text-slate-500">2.2 Citations Received (3 Yrs):</span> <span className="font-bold text-slate-800">{sec2.citationsReceived?.totalCount || '0'}</span></div>
                <div><span className="text-slate-500">2.3 Total Q1 Citations:</span> <span className="font-bold text-slate-800">{sec2.q1Citations?.totalCount || '0'}</span></div>
              </div>
              {renderHoDSubsectionScoringAndFeedback('2.2', '2.2 Citations Received')}
              {renderHoDSubsectionScoringAndFeedback('2.3', '2.3 Total Q1 Citations')}
            </div>
            {renderSubTableGroup(section2Arrays)}
          </div>
        )}
      </div>

      {/* Section III Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2">
        <div className="flex justify-between items-center border-b border-slate-100 pb-2">
          <h4 className="text-xs font-black uppercase tracking-wider text-[#4A1519]">SECTION III: Patents and Innovation</h4>
          <span className="text-xs font-bold text-slate-700">Subtotal: {scoreObj.section3Total || 0} / 15</span>
        </div>
        {!isSection3Populated ? (
          <p className="text-xs text-gray-400 italic py-2">Section completely unpopulated by faculty.</p>
        ) : (
          <div className="space-y-2 mt-2">
            {renderSubTableGroup(section3Arrays)}
          </div>
        )}
      </div>

      {/* Section IV Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2">
        <div className="flex justify-between items-center border-b border-slate-100 pb-2">
          <h4 className="text-xs font-black uppercase tracking-wider text-[#4A1519]">SECTION IV: Sponsored Research and Consultancy</h4>
          <span className="text-xs font-bold text-slate-700">Subtotal: {scoreObj.section4Total || 0} / 15</span>
        </div>
        {!isSection4Populated ? (
          <p className="text-xs text-gray-400 italic py-2">Section completely unpopulated by faculty.</p>
        ) : (
          <div className="space-y-2 mt-2">
            {renderSubTableGroup(section4Arrays)}
          </div>
        )}
      </div>

      {/* Section V Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2">
        <div className="flex justify-between items-center border-b border-slate-100 pb-2">
          <h4 className="text-xs font-black uppercase tracking-wider text-[#4A1519]">SECTION V: International Engagement & Rankings</h4>
          <span className="text-xs font-bold text-slate-700">Subtotal: {scoreObj.section5Total || 0} / 10</span>
        </div>
        {!isSection5Populated ? (
          <p className="text-xs text-gray-400 italic py-2">Section completely unpopulated by faculty.</p>
        ) : (
          <div className="space-y-2 mt-2">
            {renderSubTableGroup(section5Arrays)}
          </div>
        )}
      </div>

      {/* Section VI Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2">
        <div className="flex justify-between items-center border-b border-slate-100 pb-2">
          <h4 className="text-xs font-black uppercase tracking-wider text-[#4A1519]">SECTION VI: Faculty Development & Professional Activities</h4>
          <span className="text-xs font-bold text-slate-700">Subtotal: {scoreObj.section6Total || 0} / 20</span>
        </div>
        {!isSection6Populated ? (
          <p className="text-xs text-gray-400 italic py-2">Section completely unpopulated by faculty.</p>
        ) : (
          <div className="space-y-2 mt-2">
            {renderSubTableGroup(section6Arrays)}
          </div>
        )}
      </div>

      {/* Section VII Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2">
        <div className="flex justify-between items-center border-b border-slate-100 pb-2">
          <h4 className="text-xs font-black uppercase tracking-wider text-[#4A1519]">SECTION VII: Industry Interaction & Internship</h4>
          <span className="text-xs font-bold text-slate-700">Subtotal: {scoreObj.section7Total || 0} / 10</span>
        </div>
        {!isSection7Populated ? (
          <p className="text-xs text-gray-400 italic py-2">Section completely unpopulated by faculty.</p>
        ) : (
          <div className="space-y-2 mt-2">
            {renderSubTableGroup(section7Arrays)}
          </div>
        )}
      </div>

      {/* Section VIII Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2">
        <div className="flex justify-between items-center border-b border-slate-100 pb-2">
          <h4 className="text-xs font-black uppercase tracking-wider text-[#4A1519]">SECTION VIII: Student Development Activities</h4>
          <span className="text-xs font-bold text-slate-700">Subtotal: {scoreObj.section8Total || 0} / 5</span>
        </div>
        {!isSection8Populated ? (
          <p className="text-xs text-gray-400 italic py-2">Section completely unpopulated by faculty.</p>
        ) : (
          <div className="space-y-2 mt-2">
            {renderSubTableGroup(section8Arrays)}
          </div>
        )}
      </div>

      {/* Section IX Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2">
        <div className="flex justify-between items-center border-b border-slate-100 pb-2">
          <h4 className="text-xs font-black uppercase tracking-wider text-[#4A1519]">SECTION IX: Institutional Development</h4>
          <span className="text-xs font-bold text-slate-700">Subtotal: {scoreObj.section9Total || 0} / 20</span>
        </div>
        {!isSection9Populated ? (
          <p className="text-xs text-gray-400 italic py-2">Section completely unpopulated by faculty.</p>
        ) : (
          <div className="space-y-2 mt-2">
            {renderSubTableGroup(section9Arrays)}
          </div>
        )}
      </div>

      {/* Read-Only HoD Evaluation Remarks & Recommendation (for Principal / Registrar / IQAC inspection) */}
      {appraisal.hodRemarks && !hodControls && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/80 p-3.5 space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#4A1519]">
            <span>👨‍🏫</span> Department HoD Evaluation Remarks &amp; Recommendation
          </div>
          <p className="text-xs text-slate-800 italic leading-relaxed bg-white/80 border border-amber-200/60 rounded-md p-2.5">
            "{appraisal.hodRemarks}"
          </p>
        </div>
      )}

      {/* Read-Only IQAC Quality Audit Comments & Feedback (viewable to Registrar, Principal & HOD) */}
      {appraisal.iqacAuditRemarks && !iqacControls && (
        <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50/90 p-3.5 space-y-1">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-blue-950">
            <span className="flex items-center gap-1.5">
              <span>📊</span> IQAC Quality Audit Comments &amp; Scoring Feedback
            </span>
            {appraisal.iqacEvaluatedAt && (
              <span className="text-[10px] text-blue-700 font-semibold">
                Recorded on {new Date(appraisal.iqacEvaluatedAt).toLocaleDateString('en-GB')}
              </span>
            )}
          </div>
          <p className="text-xs text-blue-950 font-medium italic leading-relaxed bg-white/90 border border-blue-200/60 rounded-md p-2.5">
            "{appraisal.iqacAuditRemarks}"
          </p>
        </div>
      )}

      {/* Interactive IQAC Quality Audit & Scoring Evaluation Controls */}
      {iqacControls && (
        <div className="mt-4 border-t border-slate-200 pt-4 print-hidden bg-gradient-to-br from-blue-50/60 via-indigo-50/40 to-sky-50/60 rounded-xl p-4 border border-blue-200 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl">📊</span>
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-blue-950">
                  IQAC Quality Audit Comments &amp; Scoring Verification
                </h4>
                <p className="text-[11px] text-blue-800">
                  Review faculty submissions and HoD evaluation comments, then pass official IQAC audit notes and score confirmation.
                </p>
              </div>
            </div>
            {iqacControls.isVerified && (
              <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-blue-100 text-blue-900 border border-blue-300 shadow-xs flex items-center gap-1">
                <span>✔</span> Quality Verified
              </span>
            )}
          </div>

          {/* Reference: HoD Submitted Remarks for IQAC Member */}
          {appraisal.hodRemarks && (
            <div className="bg-amber-50/90 border border-amber-200 rounded-lg p-3 text-xs text-slate-800 space-y-1">
              <span className="font-bold text-[#4A1519] flex items-center gap-1.5">
                <span>👨‍🏫</span> Department HoD Submitted Feedback &amp; Recommendation:
              </span>
              <p className="italic text-slate-800 bg-white/80 border border-amber-200/60 rounded-md p-2">
                "{appraisal.hodRemarks}"
              </p>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-bold text-blue-950 mb-1">
              IQAC Quality Audit Remarks / Scoring Comments (Viewable to Registrar &amp; Principal):
            </label>
            <textarea
              value={iqacControls.remarksValue}
              onChange={(e) => iqacControls.onRemarksChange(e.target.value)}
              placeholder="Enter IQAC quality audit feedback, scoring verification notes, or observations (e.g., 'Score verified against Section 2 journal proofs. NAAC Category A compliance confirmed.')..."
              className="w-full min-h-24 rounded-md border border-blue-300 px-3 py-2 text-xs text-slate-800 bg-white outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-500/20 font-sans leading-relaxed"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => iqacControls.onVerify('IQAC Verified')}
                className="inline-flex items-center gap-1.5 rounded-md bg-blue-700 hover:bg-blue-800 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm transition cursor-pointer"
              >
                <span>✔</span> Verify &amp; Save IQAC Audit Notes
              </button>
              <button
                type="button"
                onClick={() => iqacControls.onVerify('Needs Clarification')}
                className="inline-flex items-center gap-1.5 rounded-md bg-amber-600 hover:bg-amber-700 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition cursor-pointer"
              >
                <span>⚠️</span> Request Clarification
              </button>
            </div>

            <button
              type="button"
              onClick={iqacControls.onToggleExclusion}
              className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-bold transition shadow-sm cursor-pointer ${iqacControls.isExcluded ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'}`}
            >
              <span>{iqacControls.isExcluded ? '↩ Restore to Active Audit List' : '🚫 Soft-Hide from Active Audit List'}</span>
            </button>
          </div>
        </div>
      )}

      {/* HOD Evaluation Controls */}
      {hodControls && (
        <div className="mt-4 border-t border-slate-200 pt-4 print-hidden">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-[#4A1519] flex items-center gap-1.5">
              <span>📝</span> Official Review Evaluation Remarks / Overall Feedback
            </span>
            <button
              type="button"
              onClick={handleAiSuggestOverall}
              disabled={loadingAiKey === 'overall'}
              className="text-[11px] font-bold px-3 py-1 rounded bg-gradient-to-r from-amber-100 to-amber-200 hover:from-amber-200 hover:to-amber-300 text-amber-950 border border-amber-300 transition flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
              title="Generate AI overall appraisal evaluation summary based on all 9 sections"
            >
              {loadingAiKey === 'overall' ? '⏳ Generating AI Summary...' : '✨ AI Suggest Overall Review'}
            </button>
          </div>
          <textarea
            value={hodControls.remarksValue}
            onChange={(e) => hodControls.onRemarksChange(e.target.value)}
            placeholder="Write actionable feedback for this faculty submission, or click 'AI Suggest Overall Review' to generate a tailored academic draft."
            className="mt-1 min-h-24 w-full rounded-md border border-slate-300 px-3 py-2 text-xs text-slate-800 outline-none focus:border-[#4A1519] focus:ring-2 focus:ring-[#4A1519]/20 font-sans leading-relaxed"
          />

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => hodControls.onAction('Approved')}
              className="inline-flex items-center rounded-full border border-emerald-500 px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 cursor-pointer"
            >
              Approve Appraisal
            </button>
            <button
              type="button"
              onClick={() => hodControls.onAction('Not Approved')}
              className="inline-flex items-center rounded-full border border-red-500 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 cursor-pointer"
            >
              Return for Correction
            </button>
          </div>
        </div>
      )}

      {/* Principal Institutional Ratification & Sign-off Action Card */}
      {principalControls && !principalControls.isRatified && appraisal.principalApprovalStatus !== 'Ratified' && appraisal.appraisalStatus !== 'Ratified' && (
        <div className="mt-4 border-t border-slate-200 pt-4 print-hidden">
          <div className="rounded-xl border-2 border-[#4A1519]/30 bg-gradient-to-br from-amber-50/50 via-white to-orange-50/40 p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">🎓</span>
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-[#4A1519]">
                    Principal Institutional Ratification &amp; Executive Sign-off
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Final executive governance review. Ratifying seals and permanently locks this appraisal for institutional accreditation audits.
                  </p>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Institutional Commendation / Remarks (Optional):
              </label>
              <textarea
                value={principalRemarksInput}
                onChange={(e) => setPrincipalRemarksInput(e.target.value)}
                placeholder="Add executive commendation or accreditation notes (e.g., 'Approved for NAAC Criterion 3 documentation. Commended for high-impact research output.')..."
                className="w-full min-h-20 rounded-md border border-slate-300 px-3 py-2 text-xs text-slate-800 outline-none focus:border-[#4A1519] focus:ring-2 focus:ring-[#4A1519]/20 font-sans leading-relaxed"
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              <div className="text-[11px] text-slate-500 flex items-center gap-1">
                <span>ℹ️</span>
                <span>Total Evaluated Score: <strong className="text-[#4A1519] font-bold">{effectiveScoreObj.grandTotal} / 200</strong></span>
              </div>
              <button
                type="button"
                disabled={isEndorsing}
                onClick={async () => {
                  if (window.confirm("🎓 Are you sure you want to formally ratify and endorse this faculty appraisal? This will seal and lock the appraisal for institutional audits.")) {
                    setIsEndorsing(true);
                    try {
                      await principalControls.onEndorse(
                        appraisal._id || appraisal.id,
                        principalRemarksInput,
                        appraisal.facultyEmail || appraisal.email,
                        appraisal.timeline
                      );
                    } finally {
                      setIsEndorsing(false);
                    }
                  }
                }}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-[#4A1519] hover:bg-[#3B1013] text-white font-bold text-xs shadow-sm hover:shadow transition cursor-pointer disabled:opacity-50"
              >
                {isEndorsing ? '⏳ Ratifying...' : '🎓 Ratify & Endorse Appraisal'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DashboardPage({ user, onSignOut, onWorkspaceSave, onWorkspaceLoad }) {
  const isSuperAdmin = user.email === 'siddharthk@student.tce.edu' || 
                       user.email === 'registrar@tce.edu' || 
                       user.email === 'principal@tce.edu' || 
                       user.email === 'iqac@tce.edu' ||
                       user.email?.includes('iqac') ||
                       user.role === 'Registrar' || 
                       user.role === 'Principal' ||
                       user.role === 'IQAC' ||
                       user.role === 'Admin';

  const [adminActiveRole, setAdminActiveRole] = useState(() => {
    if (user.role === 'Principal') return 'Principal';
    if (user.role === 'Registrar') return 'Registrar';
    if (user.role === 'IQAC') return 'IQAC';
    if (user.role === 'HOD') return 'HOD';
    return user.role || 'Faculty';
  });
  const effectiveRole = isSuperAdmin ? adminActiveRole : user.role;
  const isPrincipal = effectiveRole === 'Principal';
  const isRegistrar = effectiveRole === 'Registrar';
  const [iqacWorkspaceMode, setIqacWorkspaceMode] = useState('iqac_audit'); // 'iqac_audit' | 'hod_inbox' | 'self_appraisal'
  const [hodWorkspaceMode, setHodWorkspaceMode] = useState('hod_inbox'); // 'hod_inbox' | 'self_appraisal'
  
  const isIQAC = (effectiveRole === 'IQAC' || user?.role === 'IQAC') && iqacWorkspaceMode === 'iqac_audit';
  const isHod = (effectiveRole === 'HOD' && hodWorkspaceMode === 'hod_inbox') || ((effectiveRole === 'IQAC' || user?.role === 'IQAC') && iqacWorkspaceMode === 'hod_inbox');
  const hasHodPrivileges = effectiveRole === 'HOD' || isRegistrar || isPrincipal || isIQAC || effectiveRole === 'IQAC';
  
  const [isLeadershipModalOpen, setIsLeadershipModalOpen] = useState(false);
  const [isFacultyModalOpen, setIsFacultyModalOpen] = useState(false);
  const [selectedDeptFilter, setSelectedDeptFilter] = useState('ALL');
  
  // IQAC Score Filtering & Soft Curation State
  const [iqacTargetScoreFilter, setIqacTargetScoreFilter] = useState(100);
  const [iqacScoreFrom, setIqacScoreFrom] = useState(10);
  const [iqacScoreTo, setIqacScoreTo] = useState(20);
  const [iqacScoreFilterMode, setIqacScoreFilterMode] = useState('min'); // 'min' (>=) | 'exact' (==) | 'range' (from-to)
  const [iqacShowExcludedOnly, setIqacShowExcludedOnly] = useState(false);
  
  const isReviewMode = isPrincipal || isRegistrar || isIQAC || isHod;
  
  const [selectedTimeline, setSelectedTimeline] = useState(TIMELINES[0]);
  const [activeReviewTab, setActiveReviewTab] = useState('inbox');
  const [activeView, setActiveView] = useState('overview');
  const setView = (v) => setActiveView(v === 'dashboard' ? 'overview' : v);
  const [activeSection, setActiveSection] = useState('I'); // Tracks 'I' or 'II'
  const [showHodRemarks, setShowHodRemarks] = useState(false);
  const [selectedInboxRecordId, setSelectedInboxRecordId] = useState('');
  const [hodFeedbackDraft, setHodFeedbackDraft] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState('');

  // Auto-dismiss submission toast after 4 seconds
  useEffect(() => {
    if (!submitSuccess) return;
    const timer = setTimeout(() => {
      setSubmitSuccess('');
    }, 4000);
    return () => clearTimeout(timer);
  }, [submitSuccess]);
  // Drill-down view: holds the appraisal object the user clicked "View Summary" on.
  const [selectedAppraisal, setSelectedAppraisal] = useState(null);
  // HOD review: the appraisal record currently being evaluated, and the remarks text.
  const [selectedReviewAppraisal, setSelectedReviewAppraisal] = useState(null);
  const [hodRemarksInput, setHodRemarksInput] = useState('');
  const [hodSubsectionRemarks, setHodSubsectionRemarks] = useState({});
  const [hodSubsectionScores, setHodSubsectionScores] = useState({});
  const [iqacRemarksInput, setIqacRemarksInput] = useState('');
  const [workspaceByTimeline, setWorkspaceByTimeline] = useState(() => {
    const stored = onWorkspaceLoad?.();
    return stored || buildTimelineState();
  });
  const [hodInboxByTimeline, setHodInboxByTimeline] = useState(() =>
    // HOD reads the shared inbox that Faculty submissions write into.
    loadInboxFromStorage()
  );

  // Appraisal records fetched from MongoDB Atlas.
  const [appraisals, setAppraisals] = useState([]);
  const [printRecordState, setPrintRecordState] = useState(null);

  const handlePrintDocument = useCallback((targetData) => {
    setPrintRecordState(targetData);
    setTimeout(() => {
      window.print();
    }, 150);
  }, []);

  const isSameUser = useCallback((rowEmail, userObj, rowName) => {
    if (!userObj) return false;
    if (!rowEmail && !rowName) return true;
    
    const target = String(rowEmail || '').toLowerCase().trim();
    const targetName = String(rowName || '').toLowerCase().trim();
    const userName = String(userObj.name || '').toLowerCase().trim();

    const aliases = [
      userObj.email,
      userObj.personalEmail,
      userObj.hodEmail,
      userObj.facultyEmail,
      ...(userObj.alternateEmails || [])
    ].filter(Boolean).map(e => String(e).toLowerCase().trim());

    if (target && aliases.some(alias => alias === target || target.includes(alias) || alias.includes(target))) {
      return true;
    }

    if (targetName && userName && (targetName === userName || targetName.includes(userName) || userName.includes(targetName))) {
      return true;
    }

    return false;
  }, []);

  const activeTimelineRecord = useMemo(() => {
    return appraisals.find((a) => {
      const match = isSameUser(a.email || a.facultyEmail, user);
      return match && a.timeline === selectedTimeline;
    });
  }, [appraisals, user, selectedTimeline, isSameUser]);

  const isEditable = useMemo(() => {
    if (isReviewMode) return false;
    if (!activeTimelineRecord) return true;
    const status = (activeTimelineRecord.appraisalStatus || '').toUpperCase().trim();
    return status === 'NOT APPROVED' || status === 'FIX NEEDED' || status === 'REJECTED' || !status;
  }, [activeTimelineRecord, isReviewMode]);

  // Workspace persistence effect (existing).
  React.useEffect(() => {
    onWorkspaceSave?.(workspaceByTimeline);
  }, [workspaceByTimeline, onWorkspaceSave]);

  const draftUserKey = (user?.personalEmail || user?.email || '').toLowerCase().trim();

  // Check for local draft when switching timeline years or logging back in; fallback to cloud database submission
  useEffect(() => {
    if (!selectedTimeline) return;
    const savedDraft = draftUserKey ? localStorage.getItem(`draft_${draftUserKey}_${selectedTimeline}`) : null;
    if (savedDraft) {
      try {
        const parsedDraft = JSON.parse(savedDraft);
        setWorkspaceByTimeline((prev) => ({
          ...prev,
          [selectedTimeline]: parsedDraft,
        }));
        return;
      } catch (error) {
        console.error("Failed to parse local draft:", error);
      }
    }
    if (activeTimelineRecord) {
      setWorkspaceByTimeline((prev) => ({
        ...prev,
        [selectedTimeline]: flattenAppraisalRecord(activeTimelineRecord),
      }));
    }
  }, [selectedTimeline, draftUserKey, activeTimelineRecord]);

  // Watchdog: syncs appraisal records from MongoDB Atlas
  const syncHistoryFromCloud = useCallback(async (currentUser, roleOverride, deptOverride) => {
    if (!currentUser || !currentUser.email) return;
    const activeToken = currentUser.token || getAuthToken();

    try {
      const userRole = roleOverride !== undefined ? roleOverride : (currentUser.role || user?.role || "");
      const userDept = deptOverride !== undefined ? deptOverride : (currentUser.department || user?.department || "");
      const headers = activeToken ? { Authorization: `Bearer ${activeToken}` } : {};
      const response = await axios.get(
        `${API_BASE_URL}/appraisals?email=${encodeURIComponent(currentUser.email.trim())}&role=${encodeURIComponent(userRole)}&department=${encodeURIComponent(userDept)}`, 
        {
          headers,
          withCredentials: true
        }
      );
      
      const remoteData = response.data?.data || response.data;
      if (Array.isArray(remoteData)) {
        setAppraisals(remoteData);
      }
    } catch (error) {
      console.error("Cloud synchronization failed:", error.message);
    }
  }, [user]);

  // Trigger the sync whenever the authenticated user session, effective role, or department filter changes.
  useEffect(() => {
    if (user) {
      const currentDeptParam = (isPrincipal || isRegistrar || isIQAC) ? selectedDeptFilter : (user.department || 'ALL');
      syncHistoryFromCloud(user, effectiveRole, currentDeptParam);
    }
  }, [user, effectiveRole, selectedDeptFilter, isPrincipal, isRegistrar, isIQAC, syncHistoryFromCloud]);

  const handleIqacVerifySubmission = useCallback(async (recordId, recordEmail = '', recordTimeline = '', customRemarks = null, customStatus = 'IQAC Verified') => {
    try {
      const cleanId = String(recordId || '').trim();
      let trimmedRemarks = '';
      if (customRemarks !== null) {
        trimmedRemarks = String(customRemarks).trim();
      } else {
        const inputRemarks = window.prompt("✔ (Optional) Enter IQAC verification remarks or notes for this appraisal:");
        if (inputRemarks === null) return;
        trimmedRemarks = inputRemarks.trim();
      }

      const targetStatus = customStatus || 'IQAC Verified';

      // OPTIMISTIC LOCAL STATE UPDATE (0 ms instant UI render)
      setAppraisals(prev => prev.map(rec => {
        const recIdStr = rec._id ? String(rec._id) : String(rec.id || '');
        const isMatch = recIdStr === cleanId || rec.id === cleanId || `${rec.email}-${rec.timeline}` === cleanId;
        if (isMatch) {
          return {
            ...rec,
            iqacStatus: targetStatus,
            appraisalStatus: targetStatus === 'Needs Clarification' ? 'Needs Clarification' : 'IQAC Verified',
            ...(trimmedRemarks !== undefined ? { iqacAuditRemarks: trimmedRemarks } : {}),
            iqacEvaluatedAt: new Date().toISOString()
          };
        }
        return rec;
      }));

      // Update selectedAppraisal state if currently open in modal
      setSelectedAppraisal(prev => {
        if (!prev) return null;
        const prevId = prev._id ? String(prev._id) : String(prev.id || '');
        if (prevId === cleanId || `${prev.email}-${prev.timeline}` === cleanId) {
          return {
            ...prev,
            iqacStatus: targetStatus,
            appraisalStatus: targetStatus === 'Needs Clarification' ? 'Needs Clarification' : 'IQAC Verified',
            ...(trimmedRemarks !== undefined ? { iqacAuditRemarks: trimmedRemarks } : {}),
            iqacEvaluatedAt: new Date().toISOString()
          };
        }
        return prev;
      });

      setSubmitSuccess(`Appraisal audit status updated to [${targetStatus}] by IQAC!`);

      const activeToken = getStoredAuthToken();
      const headers = activeToken ? { Authorization: `Bearer ${activeToken}` } : {};
      await axios.post(
        `${API_BASE_URL}/appraisals/iqac-verify`,
        { 
          id: cleanId, 
          email: recordEmail,
          timeline: recordTimeline,
          iqacStatus: targetStatus,
          iqacAuditRemarks: trimmedRemarks
        },
        { headers }
      );
      
      const currentDeptParam = (isPrincipal || isRegistrar || isIQAC) ? selectedDeptFilter : (user.department || 'ALL');
      syncHistoryFromCloud(user, effectiveRole, currentDeptParam);
    } catch (err) {
      console.error('IQAC Verification Error:', err);
      setSubmitError(err.response?.data?.message || 'Failed to update IQAC verification status.');
      const currentDeptParam = (isPrincipal || isRegistrar || isIQAC) ? selectedDeptFilter : (user.department || 'ALL');
      syncHistoryFromCloud(user, effectiveRole, currentDeptParam);
    }
  }, [user, effectiveRole, isPrincipal, isRegistrar, isIQAC, selectedDeptFilter, syncHistoryFromCloud]);

  const handleIqacToggleExclusion = useCallback(async (recordId, currentExcludedState, recordEmail = '', recordTimeline = '') => {
    try {
      const cleanId = String(recordId || '').trim();
      let remarks = '';
      if (!currentExcludedState) {
        const inputReason = window.prompt("🚫 (Optional) Enter reason/feedback for soft-hiding this faculty member from the active IQAC list:");
        if (inputReason === null) return;
        remarks = inputReason.trim();
      }

      const nextExcludedState = !currentExcludedState;

      // OPTIMISTIC LOCAL STATE UPDATE (0 ms instant UI render)
      setAppraisals(prev => prev.map(rec => {
        const recIdStr = rec._id ? String(rec._id) : String(rec.id || '');
        const isMatch = recIdStr === cleanId || rec.id === cleanId || `${rec.email}-${rec.timeline}` === cleanId;
        if (isMatch) {
          return {
            ...rec,
            iqacExcluded: nextExcludedState,
            ...(remarks ? { iqacAuditRemarks: remarks } : {})
          };
        }
        return rec;
      }));

      // Update selectedAppraisal state if currently open in modal
      setSelectedAppraisal(prev => {
        if (!prev) return null;
        const prevId = prev._id ? String(prev._id) : String(prev.id || '');
        if (prevId === cleanId || `${prev.email}-${prev.timeline}` === cleanId) {
          return {
            ...prev,
            iqacExcluded: nextExcludedState,
            ...(remarks ? { iqacAuditRemarks: remarks } : {})
          };
        }
        return prev;
      });

      setSubmitSuccess(currentExcludedState ? 'Faculty restored to active IQAC audit list.' : 'Faculty soft-hidden from active IQAC audit list.');

      const activeToken = getStoredAuthToken();
      const headers = activeToken ? { Authorization: `Bearer ${activeToken}` } : {};
      await axios.patch(
        `${API_BASE_URL}/appraisals/${encodeURIComponent(cleanId)}/iqac-status`,
        { 
          iqacExcluded: nextExcludedState,
          email: recordEmail,
          timeline: recordTimeline,
          ...(remarks ? { iqacAuditRemarks: remarks } : {})
        },
        { headers }
      );
      
      const currentDeptParam = (isPrincipal || isRegistrar || isIQAC) ? selectedDeptFilter : (user.department || 'ALL');
      syncHistoryFromCloud(user, effectiveRole, currentDeptParam);
    } catch (err) {
      console.error('IQAC Exclusion Error:', err);
      setSubmitError(err.response?.data?.message || 'Failed to update curation status.');
      const currentDeptParam = (isPrincipal || isRegistrar || isIQAC) ? selectedDeptFilter : (user.department || 'ALL');
      syncHistoryFromCloud(user, effectiveRole, currentDeptParam);
    }
  }, [user, effectiveRole, isPrincipal, isRegistrar, isIQAC, selectedDeptFilter, syncHistoryFromCloud]);

  // HOD/Registrar/IQAC INBOX BRIDGE: Whenever appraisals are refreshed from the cloud,
  // rebuild hodInboxByTimeline so the table reflects the latest appraisalStatus from MongoDB.
  useEffect(() => {
    if (!hasHodPrivileges || !Array.isArray(appraisals)) return;
    const rebuilt = {};
    appraisals.forEach((record) => {
      const tl = record.timeline;
      if (!tl) return;
      if (!rebuilt[tl]) rebuilt[tl] = [];
      rebuilt[tl].push({
        id: record._id || `${record.email}-${tl}`,
        _id: record._id,
        timeline: record.timeline,
        facultyName: record.facultyName || record.name || record.email,
        facultyEmail: record.email || record.facultyEmail,
        department: record.department || 'CSE',
        departmentName: record.departmentName || '',
        appraisalStatus: record.appraisalStatus || 'Pending',
        iqacStatus: record.iqacStatus || 'Pending',
        iqacExcluded: Boolean(record.iqacExcluded),
        iqacAuditRemarks: record.iqacAuditRemarks || '',
        iqacEvaluatedAt: record.iqacEvaluatedAt || null,
        hodRemarks: record.hodRemarks || '',
        subsectionRemarks: record.subsectionRemarks || {},
        hodSubsectionScores: record.hodSubsectionScores || {},
        submittedAt: record.submittedAt || record.createdAt || record.updatedAt,
        convertedScore: record.convertedScore || 0,
        designation: record.designation || 'Assistant Professor',
        section1Data: record.section1Data || {},
        section2Data: record.section2Data || {},
        section3Data: record.section3Data || {},
        section4Data: record.section4Data || {},
        section5Data: record.section5Data || {},
        section6Data: record.section6Data || {},
        section7Data: record.section7Data || {},
        section8Data: record.section8Data || {},
        section9Data: record.section9Data || {},
        sectionData: flattenAppraisalRecord(record),
      });
    });
    setHodInboxByTimeline(rebuilt);
  }, [appraisals, hasHodPrivileges]);

  const currentSectionData =
    workspaceByTimeline[selectedTimeline] || createEmptySectionState();
  const coursesHandledColumns = [
    { name: 'courseCode', label: 'Course Code', placeholder: 'Enter Course Code' },
    {
      name: 'courseName',
      label: 'Course Name',
      placeholder: 'Enter Course Name',
    },
    {
      name: 'type',
      label: 'Type',
      type: 'select',
      options: ['Theory', 'Lab', 'Integrated/TCP'],
    },
    {
      name: 'semester',
      label: 'Semester',
      type: 'select',
      options: SEMESTER_OPTIONS,
    },
    { name: 'evidenceLink', label: 'Supporting Document Link', type: 'url', placeholder: "https://drive.google.com/.." },
  ];
  const courseFilesColumns = [
    { name: 'courseCode', label: 'Course Code', placeholder: 'Enter Course Code' },
    {
      name: 'courseName',
      label: 'Course Name',
      placeholder: 'Enter Course Name',
    },
    {
      name: 'compliance',
      label: 'Compliance',
      type: 'select',
      options: ['Full', 'Partial', 'No'],
    },
    { name: 'evidenceLink', label: 'Supporting Document Link', type: 'url', placeholder: "https://drive.google.com/.." },
  ];
  const coAttainmentColumns = [
    { name: 'courseCode', label: 'Course Code', placeholder: 'Enter Course Code' },
    {
      name: 'courseName',
      label: 'Course Name',
      placeholder: 'Enter Course Name',
    },
    {
      name: 'attainmentPct',
      label: 'CO Attainment % (Single Number 0 - 100)',
      type: 'number',
      placeholder: 'e.g. 85.5',
    },
    { name: 'evidenceLink', label: 'Supporting Document Link', type: 'url', placeholder: "https://drive.google.com/.." },
  ];
  const coursesDesignedColumns = [
    { name: 'courseCode', label: 'Course Code', placeholder: 'Enter Course Code' },
    {
      name: 'courseName',
      label: 'Course Name',
      placeholder: 'Enter Course Name',
    },
    {
      name: 'remarks',
      label: 'Remarks',
      placeholder: 'Reframed for CBCS curriculum',
    },
    { name: 'evidenceLink', label: 'Supporting Document Link', type: 'url', placeholder: "https://drive.google.com/.." },
  ];
  const valueAddedColumns = [
    {
      name: 'courseName',
      label: 'Course Name',
      placeholder: 'Enter Course Name',
    },
    {
      name: 'particulars',
      label: 'Particulars',
      placeholder: '30-hour hands-on program',
    },
    {
      name: 'studentCount',
      label: 'Student Count',
      type: 'number',
      placeholder: '62',
    },
    { name: 'evidenceLink', label: 'Supporting Document Link', type: 'url', placeholder: "https://drive.google.com/.." },
  ];
  const resultAnalysisColumns = [
    { name: 'courseCode', label: 'Course Code', placeholder: 'Enter Course Code' },
    {
      name: 'courseName',
      label: 'Course Name',
      placeholder: 'Enter Course Name',
    },
    {
      name: 'passPercentage',
      label: 'Pass %',
      type: 'number',
      placeholder: '95',
    },
    { name: 'evidenceLink', label: 'Supporting Document Link', type: 'url', placeholder: "https://drive.google.com/.." },
  ];
  const innovativeMethodsColumns = [
    { name: 'courseCode', label: 'Course Code', placeholder: 'Enter Course Code' },
    {
      name: 'method',
      label: 'Method',
      placeholder: 'Flipped classroom with peer critique',
    },
    { name: 'evidenceLink', label: 'Supporting Document Link', type: 'url', placeholder: "https://drive.google.com/.." },
  ];
  const certificationsColumns = [
    {
      name: 'courseName',
      label: 'Course / Certification Title',
      placeholder: 'Enter Course / Certification Title',
    },
    {
      name: 'platform',
      label: 'Platform / Body',
      type: 'select',
      options: ['NPTEL / SWAYAM', 'Coursera', 'Udemy', 'IUCEE', 'IEEE', 'AWS / Industry Certification', 'Other Professional Platform'],
    },
    {
      name: 'certType',
      label: 'Certification Type',
      placeholder: 'e.g. Elite + Silver / Professional Certificate',
    },
    { name: 'evidenceLink', label: 'Supporting Document Link', type: 'url', placeholder: "https://drive.google.com/.." },
  ];
  const academicCollaborationsColumns = [
    { name: 'organization', label: 'Organization / Partner Institution', placeholder: 'Enter Organization / Institution' },
    {
      name: 'collaborationType',
      label: 'Collaboration Type',
      type: 'select',
      options: ACADEMIC_COLLABORATION_TYPES,
    },
    { name: 'evidenceLink', label: 'Supporting Document Link', type: 'url', placeholder: "https://drive.google.com/.." },
  ];
  const studentFeedbackColumns = [
    { name: 'courseCode', label: 'Course Code', placeholder: 'Enter Course Code' },
    { name: 'feedbackPct', label: 'Feedback %', type: 'number', placeholder: 'e.g. 92' },
    { name: 'evidenceLink', label: 'Supporting Document Link', type: 'url', placeholder: "https://drive.google.com/.." },
  ];
  const journalPapersColumns = [
    { name: 'paperTitle', label: 'Paper Title', placeholder: 'Enter Paper Title' },
    { name: 'journalName', label: 'Journal Name', placeholder: 'Enter Journal Name' },
    { name: 'doi', label: 'DOI (Digital Object Identifier)', placeholder: 'e.g. 10.1016/j.jss.2025.101' },
    { name: 'publisher', label: 'Publisher', placeholder: 'e.g. Elsevier / IEEE / Springer' },
    { name: 'volumeIssue', label: 'Vol, Issue & Page Nos.', placeholder: 'e.g. Vol 15, Issue 2, pp. 45-52' },
    { name: 'pubDate', label: 'Publication Date', type: 'date' },
    {
      name: 'tier',
      label: 'Journal Tier',
      type: 'select',
      options: [
        { value: 'Q1', label: 'Q1 Tier (6 marks)' },
        { value: 'Q2', label: 'Q2 Tier (4 marks)' },
        { value: 'Q3', label: 'Q3 Tier (2 marks)' },
      ],
    },
    { name: 'evidenceLink', label: 'Supporting Document Link', type: 'url', placeholder: 'https://drive.google.com/...' },
  ];
  const bookPublicationsColumns = [
    { name: 'title', label: 'Book / Chapter Title', placeholder: 'Enter Title' },
    { name: 'doi', label: 'DOI (Digital Object Identifier)', placeholder: 'e.g. 10.1007/978-3-030...' },
    { name: 'publisher', label: 'Publisher', placeholder: 'e.g. Springer / CRC Press' },
    { name: 'isbnIssn', label: 'ISBN / ISSN No.', placeholder: 'e.g. 978-3-16-148410-0' },
    { name: 'pubDate', label: 'Publication Date', type: 'date' },
    {
      name: 'type',
      label: 'Publication Type',
      type: 'select',
      options: [
        { value: 'Book (Author)', label: 'Book (Author) (5 marks)' },
        { value: 'Chapter', label: 'Chapter (2 marks)' },
        { value: 'Editor', label: 'Editor (2 marks)' },
      ],
    },
    { name: 'evidenceLink', label: 'Supporting Document Link', type: 'url', placeholder: 'https://drive.google.com/...' },
  ];
  const conferencePapersColumns = [
    { name: 'paperTitle', label: 'Conference Paper Title', placeholder: 'Enter Paper Title' },
    { name: 'proceedingName', label: 'Proceeding Name', placeholder: 'Enter Proceeding Name' },
    { name: 'doi', label: 'DOI (Digital Object Identifier)', placeholder: 'e.g. 10.1109/ICAI.2025.101' },
    { name: 'publisher', label: 'Publisher / Organizer', placeholder: 'e.g. IEEE Xplore / ACM' },
    { name: 'pubDate', label: 'Conference Date', type: 'date' },
    { name: 'evidenceLink', label: 'Supporting Document Link', type: 'url', placeholder: 'https://drive.google.com/...' },
  ];
  const researchCollaborationsColumns = [
    { name: 'title', label: 'Paper / Project Title', placeholder: 'Enter Title' },
    { name: 'partner', label: 'Partner Inst. / Expert', placeholder: 'Enter Partner Institution or Expert' },
    {
      name: 'type',
      label: 'Collaboration Type',
      type: 'select',
      options: [
        { value: 'International', label: 'International (3 marks)' },
        { value: 'National', label: 'National (2 marks)' },
        { value: 'Industry', label: 'Industry (2 marks)' },
      ],
    },
    { name: 'evidenceLink', label: 'Supporting Document Link', type: 'url', placeholder: 'https://drive.google.com/...' },
  ];
  const phdRegisteredColumns = [
    { name: 'scholarName', label: 'Scholar Name', placeholder: 'Enter Scholar Name' },
    { name: 'researchArea', label: 'Title / Area of Research', placeholder: 'Enter Research Area / Title' },
    { name: 'evidenceLink', label: 'Notification / Evidence Link', type: 'url', placeholder: 'https://drive.google.com/...' },
  ];
  
  
  const fdpAttendedColumns = [
    { name: "programName", label: "Name of Program", type: "text", placeholder: "e.g. FDP on AI & Data Analytics" },
    { name: "organizer", label: "Organizer", type: "text", placeholder: "e.g. TCE / NPTEL / AICTE" },
    { name: "duration", label: "Duration (Days)", type: "number", placeholder: "e.g. 5" },
    { name: "dateRange", label: "Start Date", type: "date" },
    { name: "endDate", label: "End Date", type: "date" },
    { name: "evidenceLink", label: "Supporting Document Link", type: "url", placeholder: "https://drive.google.com/.." }
  ];
  const programsOrganizedColumns = [
    { name: "programName", label: "Name of Program", type: "text", placeholder: "e.g. Workshop / FDP on Cloud Computing" },
    { name: "days", label: "Number of Days", type: "number", placeholder: "e.g. 5" },
    { name: "dateRange", label: "Start Date", type: "date" },
    { name: "endDate", label: "End Date", type: "date" },
    {
      name: "role",
      label: "Role in Program",
      type: "select",
      options: [
        "Coordinator",
        "Co-Coordinator",
        "Convener",
        "Co-Convener",
        "Organizing Secretary",
        "Joint Secretary",
        "Session Chair / Resource Person",
        "Committee Member",
        "Co-Organizer"
      ]
    },
    { name: "participants", label: "Number of Participants (Internal, External)", type: "text", placeholder: "e.g. 50 (30 Internal, 20 External)" },
    { name: "evidenceLink", label: "Supporting Document Link", type: "url", placeholder: "https://drive.google.com/.." }
  ];
  const resourcePersonColumns = [
    { name: "eventName", label: "Event Name", type: "text", placeholder: "e.g. International Conference on AI" },
    { name: "level", label: "International / National", type: "select", options: ["International", "National"] },
    { name: "topic", label: "Topic", type: "text", placeholder: "e.g. Keynote on Cloud Computing" },
    { name: "venue", label: "Venue / Host Institution", type: "text", placeholder: "e.g. IIT Madras / Online (Zoom)" },
    { name: "date", label: "Date of Session", type: "date" },
    { name: "evidenceLink", label: "Supporting Document Link", type: "url", placeholder: "https://drive.google.com/.." }
  ];
  const professionalMembershipColumns = [
    { name: "societyName", label: "Name of Society", type: "text", placeholder: "e.g. IEEE" },
    { name: "membershipType", label: "Membership Type", type: "text", placeholder: "e.g. Life Member" },
    { name: "status", label: "Status (Active/Inactive)", type: "select", options: ["Active", "Inactive"] },
    { name: "evidenceLink", label: "Supporting Document Link", type: "url", placeholder: "https://drive.google.com/.." }
  ];
  const editorialBoardColumns = [
    { name: "bodyName", label: "Name of Body", type: "text", placeholder: "e.g. Springer Editorial Board" },
    { name: "position", label: "Position Held", type: "text", placeholder: "e.g. Associate Editor" },
    { name: "period", label: "Period", type: "select", options: ACADEMIC_PERIOD_OPTIONS },
    { name: "evidenceLink", label: "Supporting Document Link", type: "url", placeholder: "https://drive.google.com/.." }
  ];
  const moocDevelopedColumns = [
    { name: "courseName", label: "Course Code & Name", type: "text", placeholder: "e.g. 21CS401 - Machine Learning Essentials (TCE MOOC)" },
    { name: "courseId", label: "Course ID / Faculty Staff ID / Roll No", type: "text", placeholder: "e.g. Staff ID: MCA105 / Roll No: 21CS001" },
    { name: "weeks", label: "Duration (Weeks / Credits)", type: "number", placeholder: "e.g. 8 Weeks (or 3 Credits)" },
    { name: "coFacultyCount", label: "No. of Modules / Co-Faculty", type: "number", placeholder: "e.g. 4 Modules / 2 Co-Faculty" },
    { name: "takersCount", label: "Number of Learners / Takers (Internal, External)", type: "text", placeholder: "e.g. 150 Learners (100 Internal, 50 External)" },
    { name: "evidenceLink", label: "Proof / Evidence Link (Syllabus, Video or Platform URL)", type: "url", placeholder: "https://drive.google.com/.." }
  ];

  const partialDeliveryColumns = [
    { name: "courseDetails", label: "Course Code & Course Name", type: "text", placeholder: "e.g. 21CS401 - Database Systems" },
    { name: "mode", label: "Online/Offline", type: "select", options: ["Online", "Offline"] },
    { name: "industryName", label: "Name of the Industry", type: "text", placeholder: "e.g. Microsoft" },
    { name: "expertDetails", label: "Name of the Expert & Designation", type: "text", placeholder: "e.g. Mr. Alok, Lead Engineer" },
    { name: "duration", label: "Duration (Hours)", type: "number", placeholder: "e.g. 6" },
    { name: "date", label: "Lecture Date", type: "date" },
    { name: "evidenceLink", label: "Supporting Document Link", type: "url", placeholder: "https://drive.google.com/.." }
  ];
  const industrialVisitsColumns = [
    { name: "visitDetails", label: "Visit Details", type: "text", placeholder: "e.g. Visit to ISRO" },
    { name: "industry", label: "Industry", type: "text", placeholder: "e.g. ISRO Madurai" },
    { name: "studentsCount", label: "No. of Students", type: "number", placeholder: "e.g. 60" },
    { name: "date", label: "Visit Date", type: "date" },
    { name: "evidenceLink", label: "Supporting Document Link", type: "url", placeholder: "https://drive.google.com/.." }
  ];
  const facultyInternshipsColumns = [
    { name: "industryName", label: "Industry Name", type: "text", placeholder: "e.g. Infosys Labs" },
    { name: "duration", label: "Duration (Days)", type: "number", placeholder: "e.g. 10" },
    { name: "purpose", label: "Purpose", type: "text", placeholder: "e.g. Training on Cloud Native Dev" },
    { name: "evidenceLink", label: "Supporting Document Link", type: "url", placeholder: "https://drive.google.com/.." }
  ];
  const employerEngagementColumns = [
    { name: "activityName", label: "Activity Name", type: "text", placeholder: "e.g. Board of Studies Meeting" },
    { name: "involvedParty", label: "Alumni / Employer Involved", type: "text", placeholder: "e.g. Zoho Corp Recruiters" },
    { name: "date", label: "Engagement Date", type: "date" },
    { name: "evidenceLink", label: "Supporting Document Link", type: "url", placeholder: "https://drive.google.com/.." }
  ];

  const projectPublicationsColumns = [
    { name: "title", label: "Publication Title", type: "text", placeholder: "e.g. Smart Irrigation System using IoT" },
    { name: "students", label: "Student Name(s)", type: "text", placeholder: "e.g. Alice, Bob" },
    { name: "journalDetails", label: "Journal / Conference details", type: "text", placeholder: "e.g. IEEE Access..." },
    { name: "doi", label: "DOI (Digital Object Identifier)", placeholder: "e.g. 10.1109/ACCESS.2025..." },
    { name: "publisher", label: "Publisher", placeholder: "e.g. IEEE / Elsevier" },
    { name: "date", label: "Date of Publication", type: "date" },
    { name: "evidenceLink", label: "Supporting Document Link", type: "url", placeholder: "https://drive.google.com/.." }
  ];
  const hackathonMentoringColumns = [
    { name: "eventName", label: "Hackathon / Event Name", type: "text", placeholder: "e.g. Smart India Hackathon" },
    { name: "students", label: "Students Mentored", type: "text", placeholder: "e.g. Team ByteMasters" },
    { name: "outcome", label: "Outcome", type: "text", placeholder: "e.g. First Prize Winner" },
    { name: "dateRange", label: "Event Date", type: "date" },
    { name: "evidenceLink", label: "Supporting Document Link", type: "url", placeholder: "https://drive.google.com/.." }
  ];
  const startupSupportColumns = [
    { name: "startupName", label: "Activity / Startup Name", type: "text", placeholder: "e.g. AgriTech Solutions" },
    { name: "role", label: "Role", type: "text", placeholder: "e.g. Faculty Mentor" },
    { name: "duration", label: "Duration", type: "select", options: STARTUP_DURATION_OPTIONS },
    { name: "evidenceLink", label: "Supporting Document Link", type: "url", placeholder: "https://drive.google.com/.." }
  ];

  const deptActivitiesColumns = [
    { name: "description", label: "Activity Description", type: "text", placeholder: "e.g. NBA Document Coordinator" },
    { name: "type", label: "Activity Type", type: "select", options: ["DLCs and File Maintenance", "Dept. Activity & File Maintenance"] },
    { name: "role", label: "Role (Major/Supporting)", type: "select", options: ["Major", "Supporting"] },
    { name: "approval", label: "HoD Approval", type: "select", options: ["Yes", "No"] },
    { name: "evidenceLink", label: "Supporting Document Link", type: "url", placeholder: "https://drive.google.com/.." }
  ];
  const collegeActivitiesColumns = [
    { name: "description", label: "Activity Description", type: "text", placeholder: "e.g. College Day Event Organizer" },
    { 
      name: "category", 
      label: "Activity Category", 
      type: "select", 
      options: [
        "Committee Member", 
        "Internal Review Committee", 
        "CLC / Deputy Warden", 
        "Associate Dean / Deputy Registrar / Deputy CoE / Warden"
      ] 
    },
    { name: "role", label: "Role (Major/Supporting)", type: "select", options: ["Major", "Supporting"] },
    { name: "approval", label: "Section Head Approval", type: "select", options: ["Yes", "No"] },
    { name: "evidenceLink", label: "Supporting Document Link", type: "url", placeholder: "https://drive.google.com/.." }
  ];
  const adminResponsibilitiesColumns = [
    { name: "role", label: "Administrative Position Held", type: "select", options: ["Registrar", "Dean", "CoE", "Head IQAC", "HoD"] },
    { name: "evidenceLink", label: "Supporting Document Link", type: "url", placeholder: "https://drive.google.com/.." }
  ];

  const patentsPublishedColumns = [
    { name: "refNumber", label: "Patent Ref / Application Number", type: "text", placeholder: "e.g. 2024103..." },
    {
      name: "patentType",
      label: "Patent Category",
      type: "select",
      options: ["Design Patent", "Utility / Invention Patent", "Process Patent", "Software Patent / Copyright"]
    },
    { name: "title", label: "Title", type: "text", placeholder: "e.g. A novel AI system..." },
    { name: "inventors", label: "Name of Inventors", type: "text", placeholder: "e.g. Dr. John Doe" },
    { name: "datePublished", label: "Date Published", type: "date" },
    { name: "evidenceLink", label: "Supporting Document Link", type: "url", placeholder: "https://drive.google.com/.." }
  ];
  const patentsGrantedColumns = [
    { name: "refNumber", label: "Patent Grant / Registration Number", type: "text", placeholder: "e.g. US109..." },
    {
      name: "patentType",
      label: "Patent Category",
      type: "select",
      options: ["Design Patent", "Utility / Invention Patent", "Process Patent", "Software Patent / Copyright"]
    },
    { name: "title", label: "Title", type: "text", placeholder: "e.g. A novel AI system..." },
    { name: "inventors", label: "Name of Inventors", type: "text", placeholder: "e.g. Dr. John Doe" },
    { name: "dateGranted", label: "Date Granted", type: "date" },
    { name: "evidenceLink", label: "Supporting Document Link", type: "url", placeholder: "https://drive.google.com/.." }
  ];
  const transferOfTechnologyColumns = [
    { name: "title", label: "Title", type: "text", placeholder: "e.g. Advanced Routing..." },
    { name: "industryPartner", label: "Industry Partner", type: "text", placeholder: "e.g. Acme Corp" },
    { name: "amount", label: "Amount (Rs.)", type: "number", placeholder: "e.g. 500000" },
    { name: "evidenceLink", label: "Supporting Document Link", type: "url", placeholder: "https://drive.google.com/.." }
  ];
  const prototypesDevelopedColumns = [
    { name: "title", label: "Title of Product", type: "text", placeholder: "e.g. Smart Helmet" },
    { name: "studentsInvolved", label: "Students Involved", type: "text", placeholder: "e.g. Alice, Bob" },
    { name: "date", label: "Development Date", type: "date" },
    { name: "evidenceLink", label: "Supporting Document Link", type: "url", placeholder: "https://drive.google.com/.." }
  ];
  const hackathonPrizesColumns = [
    { name: "eventName", label: "Hackathon/Event Name", type: "text", placeholder: "e.g. SIH 2024" },
    { name: "studentsMentored", label: "Students Mentored", type: "text", placeholder: "e.g. Team Alpha" },
    { name: "prize", label: "Prize / Achievement", type: "text", placeholder: "e.g. 1st Place" },
    { name: "date", label: "Award Date", type: "date" },
    { name: "evidenceLink", label: "Supporting Document Link", type: "url", placeholder: "https://drive.google.com/.." }
  ];
  
  const researchProjectsColumns = [
    { name: "projectName", label: "Project Name", type: "text", placeholder: "e.g. IoT Framework..." },
    { name: "fundingAgency", label: "Funding Agency", type: "text", placeholder: "e.g. DST" },
    { name: "period", label: "Period", type: "select", options: ACADEMIC_PERIOD_OPTIONS },
    { name: "amount", label: "Sanctioned Amount (Rs.)", type: "number", placeholder: "e.g. 2000000" },
    { name: "role", label: "Role", type: "select", options: ["PI", "Co-PI"] },
    { name: "status", label: "Project Status", type: "select", options: ["Ongoing", "Completed"] },
    { name: "evidenceLink", label: "Supporting Document Link", type: "url", placeholder: "https://drive.google.com/.." }
  ];
  const consultancyProjectsColumns = [
    { name: "title", label: "Title of Consultancy Project", type: "text", placeholder: "e.g. DB Optimization..." },
    { name: "clientDetails", label: "Client Details", type: "text", placeholder: "e.g. Zeta Inc" },
    { name: "period", label: "Period", type: "select", options: ACADEMIC_PERIOD_OPTIONS },
    { name: "amount", label: "Amount Generated (Rs.)", type: "number", placeholder: "e.g. 500000" },
    { name: "facultyInvolved", label: "Names of Faculty Involved", type: "text", placeholder: "e.g. Dr. Jane" },
    { name: "evidenceLink", label: "Supporting Document Link", type: "url", placeholder: "https://drive.google.com/.." }
  ];

  const internationalEngagementColumns = [
    { name: "institution", label: "Partner Institution", type: "text", placeholder: "e.g. MIT" },
    { name: "country", label: "Country", type: "text", placeholder: "e.g. USA" },
    { name: "nature", label: "Nature of Collaboration", type: "text", placeholder: "e.g. Joint Research" },
    { name: "status", label: "Status", type: "text", placeholder: "e.g. Active" },
    { name: "evidenceLink", label: "Supporting Document Link", type: "url", placeholder: "https://drive.google.com/.." }
  ];
  const visitingPositionsColumns = [
    { name: "institution", label: "Institution", type: "text", placeholder: "e.g. Stanford University" },
    { name: "country", label: "Country", type: "text", placeholder: "e.g. USA" },
    { name: "duration", label: "Duration (Days)", type: "number", placeholder: "e.g. 30" },
    { name: "period", label: "Period / Date", type: "date" },
    { name: "evidenceLink", label: "Supporting Document Link", type: "url", placeholder: "https://drive.google.com/.." }
  ];
  const foreignFacultyColumns = [
    { name: "name", label: "Name", type: "text", placeholder: "e.g. Dr. Smith" },
    { name: "institution", label: "Institution / Country", type: "text", placeholder: "e.g. Oxford, UK" },
    { name: "engagementType", label: "Engagement Type", type: "text", placeholder: "e.g. Guest Lecture" },
    { name: "period", label: "Period / Date", type: "date" },
    { name: "evidenceLink", label: "Supporting Document Link", type: "url", placeholder: "https://drive.google.com/.." }
  ];
  const reputationSurveyColumns = [
    { name: "surveyName", label: "Survey Name", type: "text", placeholder: "e.g. QS World University Rankings" },
    { name: "contributionDetails", label: "Contribution Details", type: "text", placeholder: "e.g. Submitted academic details" },
    { name: "evidenceSubmitted", label: "Evidence Submitted (Yes/No)", type: "select", options: ["Yes", "No"] },
    { name: "evidenceLink", label: "Supporting Document Link", type: "url", placeholder: "https://drive.google.com/.." }
  ];
  const nirfSurveyColumns = [
    { name: "nominationDetails", label: "Nomination Details", type: "text", placeholder: "e.g. Submitted faculty details" },
    { name: "evidenceSubmitted", label: "Evidence Submitted (Yes/No)", type: "select", options: ["Yes", "No"] },
    { name: "evidenceLink", label: "Supporting Document Link", type: "url", placeholder: "https://drive.google.com/.." }
  ];

  const phdAwardedColumns = [
    { name: 'scholarName', label: 'Scholar Name', placeholder: 'Enter Scholar Name' },
    { name: 'researchArea', label: 'Title / Area of Research', placeholder: 'Enter Research Area / Title' },
    { name: 'evidenceLink', label: 'Notification / Evidence Link', type: 'url', placeholder: 'https://drive.google.com/...' },
  ];
  const timelineApprovalStatus = currentSectionData.appraisalStatus || 'Not Approved';
  const timelineHodRemarks = currentSectionData.hodRemarks || 'No HoD remarks available.';
  const hodRemarksPreview = `${timelineHodRemarks.slice(0, 20)}...`;

  const selectedInboxRows = useMemo(() => {
    let rows = appraisals;

    // Department filtering:
    if (isPrincipal || isRegistrar || isIQAC) {
      if (selectedDeptFilter && selectedDeptFilter !== 'ALL') {
        rows = rows.filter(r => (r.department || '').toUpperCase() === selectedDeptFilter.toUpperCase());
      }
    } else if (effectiveRole === 'HOD') {
      const hodDept = (user.department || '').toUpperCase();
      if (hodDept && hodDept !== 'ALL') {
        rows = rows.filter(r => (r.department || '').toUpperCase() === hodDept);
      }
    }

    // Timeline filtering:
    if (selectedTimeline !== 'All') {
      rows = rows.filter(r => r.timeline === selectedTimeline);
    }

    return rows.map((record) => {
      const flattenedData = flattenAppraisalRecord(record);
      const fullScores = computeSectionScores(flattenedData, 'Faculty');
      const calculatedTotalScore = record.convertedScore || fullScores.grandTotal || (fullScores.total || 0) + (fullScores.section2Total || 0);

      return {
        id: record._id || `${record.email}-${record.timeline}`,
        _id: record._id,
        timeline: record.timeline,
        facultyName: record.facultyName || record.name || record.email,
        facultyEmail: record.email || record.facultyEmail,
        department: record.department || 'CSE',
        departmentName: record.departmentName || '',
        designation: record.designation || 'Assistant Professor',
        appraisalStatus: record.appraisalStatus || 'Pending',
        iqacStatus: record.iqacStatus || 'Pending',
        iqacExcluded: Boolean(record.iqacExcluded),
        iqacAuditRemarks: record.iqacAuditRemarks || '',
        iqacEvaluatedAt: record.iqacEvaluatedAt || null,
        hodRemarks: record.hodRemarks || '',
        subsectionRemarks: record.subsectionRemarks || {},
        hodSubsectionScores: record.hodSubsectionScores || {},
        submittedAt: record.submittedAt || record.createdAt || record.updatedAt,
        convertedScore: record.convertedScore || 0,
        totalScore: calculatedTotalScore,
        section1Data: record.section1Data || {},
        section2Data: record.section2Data || {},
        section3Data: record.section3Data || {},
        section4Data: record.section4Data || {},
        section5Data: record.section5Data || {},
        section6Data: record.section6Data || {},
        section7Data: record.section7Data || {},
        section8Data: record.section8Data || {},
        section9Data: record.section9Data || {},
        sectionData: flattenedData,
      };
    });
  }, [appraisals, isPrincipal, isRegistrar, isIQAC, selectedDeptFilter, effectiveRole, user.department, selectedTimeline, computeSectionScores]);

  const selectedInboxRecord = selectedInboxRows.find(
    (row) => row.id === selectedInboxRecordId
  );

  const scores = useMemo(
    () => computeSectionScores(currentSectionData, effectiveRole),
    [currentSectionData, effectiveRole]
  );
  const sectionValidation = useMemo(() => {
    const rowErrors = {
      coursesHandled: {},
      courseFiles: {},
      coAttainment: {},
      coursesDesigned: {},
      valueAdded: {},
      resultAnalysis: {},
      innovativeMethods: {},
      certifications: {},
      academicCollaborations: {},
      studentFeedback: {},
    };

    const validateRows = (key, columns) => {
      const rows = currentSectionData[key] || [];
      if (rows.length === 0) {
        return;
      }

      rows.forEach((row) => {
        const errors = getRowValidationErrors(row, columns);
        if (Object.keys(errors).length > 0) {
          rowErrors[key][row.id] = errors;
        }
      });
    };

    validateRows('coursesHandled', coursesHandledColumns);
    validateRows('courseFiles', courseFilesColumns);
    validateRows('coAttainment', coAttainmentColumns);
    validateRows('coursesDesigned', coursesDesignedColumns);
    validateRows('valueAdded', valueAddedColumns);
    validateRows('resultAnalysis', resultAnalysisColumns);
    validateRows('innovativeMethods', innovativeMethodsColumns);
    validateRows('certifications', certificationsColumns);
    validateRows('academicCollaborations', academicCollaborationsColumns);
    validateRows('studentFeedback', studentFeedbackColumns);

    const mentoringTouched =
      isNonEmpty(currentSectionData.mentoring?.menteeCount) ||
      isNonEmpty(currentSectionData.mentoring?.batch) ||
      isNonEmpty(currentSectionData.mentoring?.description) ||
      isNonEmpty(currentSectionData.mentoring?.evidenceLink);
    const mentoringErrors = {
      menteeCount:
        mentoringTouched && !isNonEmpty(currentSectionData.mentoring?.menteeCount),
      batch: mentoringTouched && !isNonEmpty(currentSectionData.mentoring?.batch),
      description:
        mentoringTouched && !isNonEmpty(currentSectionData.mentoring?.description),
      evidenceLink:
        mentoringTouched &&
        !isValidEvidenceLink(currentSectionData.mentoring?.evidenceLink),
    };
    const rowErrorCount = Object.values(rowErrors).reduce(
      (sectionCount, section) =>
        sectionCount + Object.values(section).reduce((rowCount, fieldMap) => rowCount + Object.keys(fieldMap).length, 0),
      0
    );
    const mentoringErrorCount = Object.values(mentoringErrors).filter(Boolean).length;
    const hasMentoringErrors = Object.values(mentoringErrors).some(Boolean);
    const hasRowErrors = Object.values(rowErrors).some(
      (section) => Object.keys(section).length > 0
    );

    return {
      rowErrors,
      mentoringErrors,
      mentoringTouched,
      errorCount: rowErrorCount + mentoringErrorCount,
      hasErrors: hasRowErrors || hasMentoringErrors,
    };
  }, [
    currentSectionData,
    coursesHandledColumns,
    courseFilesColumns,
    coAttainmentColumns,
    coursesDesignedColumns,
    valueAddedColumns,
    resultAnalysisColumns,
    innovativeMethodsColumns,
    certificationsColumns,
    academicCollaborationsColumns,
    studentFeedbackColumns,
  ]);

  const mySubmissions = useMemo(() => {
    if (!user) return [];
    if (!isReviewMode) {
      const filtered = appraisals.filter((row) => isSameUser(row.email || row.facultyEmail, user, row.facultyName || row.name));
      return filtered.length > 0 ? filtered : appraisals;
    }
    return appraisals.filter((row) => isSameUser(row.email || row.facultyEmail, user, row.facultyName || row.name));
  }, [appraisals, user, isSameUser, isReviewMode]);

  const facultyHistoryRows = useMemo(() => {
    // Primary source: cloud-synced appraisals state. Merge in any active local
    // workspace drafts so unsubmitted in-progress rows stay visible on screen.
    const dbByTimeline = {};
    appraisals.forEach((rec) => {
      if (isSameUser(rec.email || rec.facultyEmail, user) && rec.timeline) {
        dbByTimeline[rec.timeline] = rec;
      }
    });

    return TIMELINES.map((timeline) => {
      const dbRecord = dbByTimeline[timeline];
      const localSection =
        workspaceByTimeline[timeline] || createEmptySectionState();
      const hasLocalDraft = hasSectionEntries(localSection);
      const sectionData = hasLocalDraft
        ? localSection
        : flattenAppraisalRecord(dbRecord);
      const totalScore = computeSectionScores(sectionData, 'Faculty').grandTotal;

      return {
        timeline,
        submittedAt: dbRecord?.submittedAt || localSection.submittedAt,
        createdAt: dbRecord?.createdAt,
        status:
          dbRecord?.appraisalStatus ||
          localSection.appraisalStatus ||
          'Pending',
        convertedScore: dbRecord ? (dbRecord.convertedScore || 0) : totalScore,
        sectionData,
      };
    }).filter(
      (row) =>
        dbByTimeline[row.timeline] ||
        row.submittedAt ||
        hasSectionEntries(
          workspaceByTimeline[row.timeline] || createEmptySectionState()
        )
    );
  }, [workspaceByTimeline, appraisals, user, isSameUser]);

  React.useEffect(() => {
    setShowHodRemarks(false);
    setSubmitError('');
    setSubmitSuccess('');
  }, [selectedTimeline]);

  const handleProceedToSectionOne = () => {
    setSubmitError('');
    setSubmitSuccess('');
    if (activeTimelineRecord) {
      setWorkspaceByTimeline((prev) => ({
        ...prev,
        [selectedTimeline]: flattenAppraisalRecord(activeTimelineRecord),
      }));
    } else {
      updateCurrentTimeline((current) => ({
        ...current,
        submittedAt: current.submittedAt || new Date().toISOString(),
        appraisalStatus: current.appraisalStatus || 'Pending',
      }));
    }
    setActiveView('section1');
  };

  const handleSaveAndSubmit = async () => {
    const activeToken = getStoredAuthContext().token;
    const submissionEmail = (user?.personalEmail || user?.email || '').toLowerCase().trim();
    
    // Emergency Backup Lambda: Instantly locks form state to localStorage
    const backupCurrentDraft = () => {
      localStorage.setItem(`draft_${draftUserKey}_${selectedTimeline}`, JSON.stringify(currentSectionData));
    };

    if (!activeToken) {
      backupCurrentDraft();
      alert("⚠️ Your login session has expired. Your data has been securely saved offline! Please click Sign Out and sign back in to submit.");
      return;
    }

    try {
      setIsSubmitting(true);
      setSubmitError('');
      setSubmitSuccess('');

      const formData = currentSectionData;
      const cleanSectionArray = (arr) => {
        if (!Array.isArray(arr)) return [];
        return arr.filter(isMeaningfullyFilledRow);
      };

      const cleanedSection1Data = {
        ...formData,
        coursesHandled: cleanSectionArray(formData.coursesHandled),
        courseFiles: cleanSectionArray(formData.courseFiles),
        coAttainment: cleanSectionArray(formData.coAttainment),
        coursesDesigned: cleanSectionArray(formData.coursesDesigned),
        valueAdded: cleanSectionArray(formData.valueAdded),
        resultAnalysis: cleanSectionArray(formData.resultAnalysis),
        innovativeMethods: cleanSectionArray(formData.innovativeMethods),
        academicCollaborations: cleanSectionArray(formData.academicCollaborations),
        certifications: cleanSectionArray(formData.certifications),
        studentFeedback: cleanSectionArray(formData.studentFeedback),
        mentoring: formData.mentoring || {},
      };

      const cleanedSection2Data = {
        journalPapers: cleanSectionArray(formData.journalPapers),
        citationsReceived: formData.citationsReceived || { totalCount: '' },
        q1Citations: formData.q1Citations || { totalCount: '' },
        bookPublications: cleanSectionArray(formData.bookPublications),
        conferencePapers: cleanSectionArray(formData.conferencePapers),
        researchCollaborations: cleanSectionArray(formData.researchCollaborations),
        phdRegistered: cleanSectionArray(formData.phdRegistered),
        phdAwarded: cleanSectionArray(formData.phdAwarded),
      };

      const cleanedSection3Data = {
        patentsPublished: cleanSectionArray(formData.patentsPublished),
        patentsGranted: cleanSectionArray(formData.patentsGranted),
        transferOfTechnology: cleanSectionArray(formData.transferOfTechnology),
        prototypesDeveloped: cleanSectionArray(formData.prototypesDeveloped),
        hackathonPrizes: cleanSectionArray(formData.hackathonPrizes),
      };

      const cleanedSection4Data = {
        researchProjects: cleanSectionArray(formData.researchProjects),
        consultancyProjects: cleanSectionArray(formData.consultancyProjects),
      };

      const cleanedSection5Data = {
        internationalEngagement: cleanSectionArray(formData.internationalEngagement),
        visitingPositions: cleanSectionArray(formData.visitingPositions),
        foreignFaculty: cleanSectionArray(formData.foreignFaculty),
        reputationSurvey: cleanSectionArray(formData.reputationSurvey),
        nirfSurvey: cleanSectionArray(formData.nirfSurvey),
      };

      const cleanedSection6Data = {
        fdpAttended: cleanSectionArray(formData.fdpAttended),
        programsOrganized: cleanSectionArray(formData.programsOrganized),
        resourcePerson: cleanSectionArray(formData.resourcePerson),
        professionalMembership: cleanSectionArray(formData.professionalMembership),
        editorialBoard: cleanSectionArray(formData.editorialBoard),
        moocDeveloped: cleanSectionArray(formData.moocDeveloped),
      };

      const cleanedSection7Data = {
        partialDelivery: cleanSectionArray(formData.partialDelivery),
        industrialVisits: cleanSectionArray(formData.industrialVisits),
        facultyInternships: cleanSectionArray(formData.facultyInternships),
        employerEngagement: cleanSectionArray(formData.employerEngagement),
      };

      const cleanedSection8Data = {
        projectPublications: cleanSectionArray(formData.projectPublications),
        hackathonMentoring: cleanSectionArray(formData.hackathonMentoring),
        startupSupport: cleanSectionArray(formData.startupSupport),
      };

      const cleanedSection9Data = {
        deptActivities: cleanSectionArray(formData.deptActivities),
        collegeActivities: cleanSectionArray(formData.collegeActivities),
        adminResponsibilities: cleanSectionArray(formData.adminResponsibilities),
      };

      const totalScoreToSubmit = scores.grandTotal || 0;

      const response = await axios.post(
        `${API_BASE_URL}/appraisals`,
        {
          timeline: selectedTimeline,
          facultyName: user?.name || "Faculty Member",
          email: submissionEmail,
          convertedScore: totalScoreToSubmit,
          section1Data: cleanedSection1Data,
          section2Data: cleanedSection2Data,
          section3Data: cleanedSection3Data,
          section4Data: cleanedSection4Data,
          section5Data: cleanedSection5Data,
          section6Data: cleanedSection6Data,
          section7Data: cleanedSection7Data,
          section8Data: cleanedSection8Data,
          section9Data: cleanedSection9Data,
        },
        {
          withCredentials: true,
          headers: { Authorization: `Bearer ${activeToken}` },
        }
      );

      if (response.status !== 200 && response.status !== 201) {
        setSubmitError('Submission failed. Please try again.');
        return;
      }

      alert("✔ Appraisal saved and submitted successfully!");
      localStorage.removeItem(`draft_${draftUserKey}_${selectedTimeline}`);

      const transaction = response.data?.data;
      const submittedSection = {
        ...cleanedSection1Data,
        submittedAt: transaction?.submittedAt || new Date().toISOString(),
        appraisalStatus: transaction?.appraisalStatus || 'Pending',
        hodRemarks: transaction?.hodRemarks || '',
      };
      updateCurrentTimeline(() => submittedSection);

      // Push this submission into the shared HOD inbox (persists across sign-outs).
      const inboxRecord = {
        id: `${submissionEmail}-${selectedTimeline}`,
        facultyName: user.name,
        facultyEmail: submissionEmail,
        department: transaction?.department || user.department || 'CSE',
        appraisalStatus: 'Pending',
        hodRemarks: '',
        section1Data: cleanedSection1Data,
        section2Data: cleanedSection2Data,
        section3Data: cleanedSection3Data,
        section4Data: cleanedSection4Data,
        section5Data: cleanedSection5Data,
        section6Data: cleanedSection6Data,
        section7Data: cleanedSection7Data,
        section8Data: cleanedSection8Data,
        section9Data: cleanedSection9Data,
        sectionData: cleanedSection1Data,
      };
      pushRecordToInboxStorage(selectedTimeline, inboxRecord);
      if (transaction) {
        setAppraisals((prev) => {
          const idx = prev.findIndex((rec) => rec.timeline === selectedTimeline && isSameUser(rec.email || rec.facultyEmail, user));
          if (idx === -1) return [...prev, transaction];
          const next = [...prev];
          next[idx] = transaction;
          return next;
        });
      }
      // Also reflect in HOD inbox state (if HOD is somehow already logged in same session).
      setHodInboxByTimeline((prev) => {
        const rows = prev[selectedTimeline] || [];
        const existingIdx = rows.findIndex((r) => isSameUser(r.facultyEmail || r.email, user));
        const updated = [...rows];
        if (existingIdx !== -1) {
          updated[existingIdx] = inboxRecord;
        } else {
          updated.push(inboxRecord);
        }
        return { ...prev, [selectedTimeline]: updated };
      });

      await syncHistoryFromCloud(user, effectiveRole, isRegistrar ? selectedDeptFilter : user.department);
      setSubmitSuccess('Appraisal saved and submitted successfully.');
      setActiveView('overview');
    } catch (err) {
      console.error("Submission catch triggered:", err);
      
      // FIREWALL INTERCEPTION: Catch 401 Unauthorized or expired pass responses
      if (err.response?.status === 401 || err.message?.includes("token") || err.response?.data?.message?.includes("token")) {
        backupCurrentDraft(); // Secure the state instantly
        alert("🔒 Session Security Pass Expired! To protect your work, your appraisal has been fully backed up offline. Please click 'Sign Out', log back in immediately via Google, and click Submit again.");
        setSubmitError("Session expired. Please sign out and sign in again.");
      } else {
        const responseData = err?.response?.data;
        const msg = responseData?.message || err.message || 'Unable to submit appraisal.';
        alert(`Submission failed: ${msg}`);
        setSubmitError(`Submission failed: ${msg}`);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const openInboxRecord = (record) => {
    setSelectedInboxRecordId(record.id);
    setHodFeedbackDraft(record.sectionData.hodRemarks || '');
  };

  const closeInboxRecord = () => {
    setSelectedInboxRecordId('');
    setHodFeedbackDraft('');
  };

  const updateInboxRecordStatus = (status) => {
    if (!selectedInboxRecordId) {
      return;
    }

    setHodInboxByTimeline((previous) => ({
      ...previous,
      [selectedTimeline]: (previous[selectedTimeline] || []).map((record) =>
        record.id === selectedInboxRecordId
          ? {
              ...record,
              sectionData: {
                ...record.sectionData,
                appraisalStatus: status,
                hodRemarks: status === 'Not Approved' ? hodFeedbackDraft : '',
              },
            }
          : record
      ),
    }));
  };

  const processHodReviewAction = async (statusUpdateValue) => {
    if (!selectedReviewAppraisal) return;
    
    let activeToken = getAuthToken() || user?.token;
    if (!activeToken) {
      const storedProfile = localStorage.getItem('tce_appraisal_user');
      if (storedProfile) {
        try { activeToken = JSON.parse(storedProfile)?.token; } catch (e) { activeToken = null; }
      }
    }

    if (!activeToken) {
      alert("🔒 Authorization session expired. Please sign out and log back in.");
      return;
    }

    try {
      const targetId = selectedReviewAppraisal._id || selectedReviewAppraisal.id;
      
      console.log(`📡 Sending [${statusUpdateValue}] validation to database for Document ID: ${targetId}`);

      // Calculate the final evaluated grand total score with HoD manual overrides across all 9 sections
      const fullReviewData = flattenAppraisalRecord(selectedReviewAppraisal);
      const finalEvalScore = computeEffectiveScores(fullReviewData, hodSubsectionScores).grandTotal;

      // 1. Single network dispatch to update the record in our MongoDB Atlas Cluster
      await axios.post(`${API_BASE_URL}/appraisals/review`, {
        id: targetId,
        appraisalStatus: statusUpdateValue,
        hodRemarks: hodRemarksInput || "",
        subsectionRemarks: hodSubsectionRemarks || {},
        hodSubsectionScores: hodSubsectionScores || {},
        finalScore: finalEvalScore,
        convertedScore: finalEvalScore
      }, {
        headers: { Authorization: `Bearer ${activeToken}` },
        withCredentials: true
      });

      alert(`✔ Appraisal status successfully updated to [${statusUpdateValue}] and recorded to the faculty's profile!`);

      // 2. CRITICAL SYNC HOOK: Force a clean re-fetch from the cloud to update active dashboard table rows live
      await syncHistoryFromCloud(user, effectiveRole, isRegistrar ? selectedDeptFilter : user.department);

      // 3. Clear review workbench parameters and return smoothly to dashboard view
      setSelectedReviewAppraisal(null);
      setSelectedAppraisal(null);
      setHodRemarksInput('');
    } catch (err) {
      console.error("❌ HOD APPRAISAL REVIEW ACTION FAULT:", err);
      alert(`Review transmission dropped: ${err.response?.data?.message || err.message}`);
    }
  };

  const handlePrincipalEndorse = async (targetId, remarks, facultyEmail, timeline) => {
    let activeToken = getAuthToken() || user?.token;
    if (!activeToken) {
      const storedProfile = localStorage.getItem('tce_appraisal_user');
      if (storedProfile) {
        try { activeToken = JSON.parse(storedProfile)?.token; } catch (e) { activeToken = null; }
      }
    }

    if (!activeToken) {
      alert("🔒 Authorization session expired. Please sign out and log back in.");
      return;
    }

    try {
      await axios.post(`${API_BASE_URL}/appraisals/endorse`, {
        id: targetId,
        remarks: remarks || "",
        email: facultyEmail,
        timeline: timeline,
      }, {
        headers: { Authorization: `Bearer ${activeToken}` },
        withCredentials: true
      });

      alert("🎓 Appraisal successfully ratified and permanently locked for institutional audit!");
      await syncHistoryFromCloud(user, effectiveRole, (isPrincipal || isRegistrar) ? selectedDeptFilter : user.department);
      setSelectedReviewAppraisal(null);
      setSelectedAppraisal(null);
    } catch (err) {
      console.error("❌ PRINCIPAL ENDORSEMENT FAULT:", err);
      alert(`Endorsement transmission dropped: ${err.response?.data?.message || err.message}`);
    }
  };

  const handleDeleteAppraisalRecord = async (targetRowId) => {
    if (!window.confirm("⚠️ Warning: Are you absolutely sure you want to permanently purge this appraisal record from the cloud database? This cannot be undone.")) return;
    const activeToken = getAuthToken() || user?.token;
    if (!activeToken) return;

    try {
      await axios.post(`${API_BASE_URL}/appraisals/delete`, { id: targetRowId }, {
        headers: { Authorization: `Bearer ${activeToken}` },
        withCredentials: true
      });
      alert("🗑️ Appraisal record permanently purged from database cluster!");
      await syncHistoryFromCloud(user, effectiveRole, isRegistrar ? selectedDeptFilter : user.department); // Dynamically refresh rows live
    } catch (err) {
      alert("Failed to remove document line item from server.");
    }
  };

  const updateCurrentTimeline = (updater) => {
    setWorkspaceByTimeline((previousState) => ({
      ...previousState,
      [selectedTimeline]: updater(
        previousState[selectedTimeline] || createEmptySectionState()
      ),
    }));
  };

  const addArrayRow = (key, template) => {
    updateCurrentTimeline((current) => {
      const nextFormDataState = {
        ...current,
        [key]: [...(current[key] || []), { id: createRowId(), ...template }],
      };
      localStorage.setItem(`draft_${draftUserKey}_${selectedTimeline}`, JSON.stringify(nextFormDataState));
      return nextFormDataState;
    });
  };

  const updateArrayRow = (key, rowId, field, value) => {
    updateCurrentTimeline((current) => {
      const nextFormDataState = {
        ...current,
        [key]: (current[key] || []).map((row) =>
          row.id === rowId ? { ...row, [field]: value } : row
        ),
      };
      localStorage.setItem(`draft_${draftUserKey}_${selectedTimeline}`, JSON.stringify(nextFormDataState));
      return nextFormDataState;
    });
  };

  const removeArrayRow = (key, rowId) => {
    updateCurrentTimeline((current) => {
      const nextFormDataState = {
        ...current,
        [key]: (current[key] || []).filter((row) => row.id !== rowId),
      };
      localStorage.setItem(`draft_${draftUserKey}_${selectedTimeline}`, JSON.stringify(nextFormDataState));
      return nextFormDataState;
    });
  };

  const updateMentoringField = (field, value) => {
    updateCurrentTimeline((current) => {
      const nextFormDataState = {
        ...current,
        mentoring: {
          ...current.mentoring,
          [field]: value,
        },
      };
      localStorage.setItem(`draft_${draftUserKey}_${selectedTimeline}`, JSON.stringify(nextFormDataState));
      return nextFormDataState;
    });
  };

  const updateNestedField = (parentKey, field, value) => {
    updateCurrentTimeline((current) => {
      const nextFormDataState = {
        ...current,
        [parentKey]: {
          ...(current[parentKey] || {}),
          [field]: value,
        },
      };
      if (draftUserKey && selectedTimeline) {
        localStorage.setItem(`draft_${draftUserKey}_${selectedTimeline}`, JSON.stringify(nextFormDataState));
      }
      return nextFormDataState;
    });
  };


  // â”€â”€ Excel export â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // ————————————————————————————————————————————————————————————————
  const exportToPDF = useCallback(() => {
    const section = workspaceByTimeline[selectedTimeline] || createEmptySectionState();
    const effScores = scores || computeEffectiveScores(section, activeTimelineRecord?.hodSubsectionScores || {});
    exportAppraisalToPDF({
      user,
      timeline: selectedTimeline,
      sectionData: section,
      scores: effScores,
      record: activeTimelineRecord || {},
    });
  }, [workspaceByTimeline, selectedTimeline, user, scores, activeTimelineRecord]);

  const exportToExcel = useCallback(() => {
    const section = workspaceByTimeline[selectedTimeline] || createEmptySectionState();
    exportAppraisalToExcel({
      user,
      timeline: selectedTimeline,
      sectionData: section,
      scores,
      record: activeTimelineRecord || {},
    });
  }, [workspaceByTimeline, selectedTimeline, user, scores, activeTimelineRecord]);

  const scoreboardItems = [
    { label: '1.1 Courses Handled', value: scores.coursesHandled, max: 8 },
    { label: '1.2 Course File', value: scores.courseFile, max: 5 },
    { label: '1.3 Course Design', value: scores.coursesDesigned, max: 5 },
    { label: '1.4 Value-Added', value: scores.valueAdded, max: 4 },
    { label: '1.5 Innovative Methods', value: scores.innovativeMethods, max: 5 },
    { label: '1.6 Academic Collaborations', value: scores.academicCollaborations, max: 4 },
    { label: '1.7 Mentoring System', value: scores.mentoring, max: 2 },
    { label: '1.8 NPTEL Certifications', value: scores.certifications, max: 4 },
    { label: '1.9 Student Feedback', value: scores.studentFeedback, max: 4 },
    { label: '1.10 Result Analysis', value: scores.resultAnalysis, max: 5 },
    { label: '1.11 CO Attainment %', value: scores.coAttainment, max: 4 },
  ];

  const renderOverview = () => {
    const iqacActiveCount = selectedInboxRows.filter(r => !r.iqacExcluded).length;
    const iqacExcludedCount = selectedInboxRows.filter(r => r.iqacExcluded).length;

    let displayInboxRows = selectedInboxRows;
    if (isIQAC) {
      displayInboxRows = selectedInboxRows.filter((row) => {
        const totalScore = row.totalScore || 0;
        
        if (!iqacShowExcludedOnly && row.iqacExcluded) return false;
        if (iqacShowExcludedOnly && !row.iqacExcluded) return false;
        
        if (iqacScoreFilterMode === 'min') {
          return totalScore >= iqacTargetScoreFilter;
        } else if (iqacScoreFilterMode === 'exact') {
          return totalScore === iqacTargetScoreFilter;
        } else if (iqacScoreFilterMode === 'range') {
          const minS = Math.min(Number(iqacScoreFrom) || 0, Number(iqacScoreTo) || 0);
          const maxS = Math.max(Number(iqacScoreFrom) || 0, Number(iqacScoreTo) || 0);
          return totalScore >= minS && totalScore <= maxS;
        }
        return true;
      });
    }

    return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-black/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="max-w-xl">
            <p className="text-sm font-bold uppercase tracking-wide text-gray-700">
              {isPrincipal ? '🎓 Apex Executive Governance & Oversight' : isRegistrar ? '🏛️ Institutional Governance & Review' : isIQAC ? '📊 IQAC Accreditation & Quality Audit' : isHod ? '🏢 Departmental Evaluation' : 'Academic Timeline'}
            </p>
            <h2 className="mt-1 text-xl font-semibold text-slate-900">
              {isPrincipal
                ? 'Campus-Wide Accreditation & Analytics'
                : isRegistrar
                  ? 'Campus-Wide Appraisal Overview'
                  : isIQAC
                    ? 'NAAC / NIRF Benchmark & Quality Audit'
                    : isHod
                      ? `Department of ${user.department || 'CSE'} Appraisal Inbox`
                      : `Appraisal for ${selectedTimeline}`}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {isPrincipal
                ? 'College-wide performance insights, NIRF/NAAC accreditation readiness, and departmental benchmarks across all 16 academic departments.'
                : isRegistrar
                  ? 'Monitor, filter, and validate annual faculty performance submissions across all 16 TCE academic departments.'
                  : isIQAC
                    ? 'Audit faculty submissions, filter by score range (e.g. 10 to 20) or target threshold (e.g. Score = 100), verify accreditation evidence, and curate NAAC lists.'
                    : isHod
                      ? 'Review faculty submissions and validate appraisal records for the selected academic year.'
                      : 'Select the academic year and create your Section I submission when ready.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {(isPrincipal || isRegistrar || isIQAC) && (
              <label className="block">
                <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  Filter Department
                </span>
                <select
                  value={selectedDeptFilter}
                  onChange={(e) => setSelectedDeptFilter(e.target.value)}
                  className="h-8 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-semibold text-[#4A1519] outline-none focus:border-[#4A1519] focus:ring-1 focus:ring-[#4A1519]"
                >
                  {TCE_DEPARTMENTS.map((dept) => (
                    <option key={dept.code} value={dept.code}>
                      {dept.code === 'ALL' ? '🏛️ All 16 Departments' : `${dept.code} - ${dept.name}`}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="block">
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                Timeline
              </span>
              <select
                value={selectedTimeline}
                onChange={(event) => setSelectedTimeline(event.target.value)}
                className="h-8 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 outline-none transition focus:border-[#4A1519] focus:ring-1 focus:ring-[#4A1519]"
              >
                {isReviewMode && <option value="All">All Timelines / Submissions</option>}
                {TIMELINES.map((timeline) => (
                  <option key={timeline} value={timeline}>
                    {timeline}
                  </option>
                ))}
              </select>
            </label>

            {isReviewMode && (
              <button
                type="button"
                onClick={() => syncHistoryFromCloud(user, effectiveRole, (isPrincipal || isRegistrar || isIQAC) ? selectedDeptFilter : user.department)}
                className="h-8 mt-4 px-3 bg-white border border-slate-300 rounded-md text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-sm flex items-center gap-1.5 transition"
              >
                <span>🔄</span> Refresh
              </button>
            )}
          </div>
        </div>

        {/* IQAC Score Range Filter & Soft Curation Toolbar */}
        {isIQAC && (
          <div className="mt-4 p-4 bg-gradient-to-r from-blue-900/10 via-slate-50 to-blue-900/10 border border-blue-200 rounded-xl space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                {iqacScoreFilterMode === 'range' ? (
                  <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-300 shadow-sm">
                    <span className="text-[11px] font-extrabold uppercase text-blue-900 tracking-wider">🎯 Score Range (From – To):</span>
                    <span className="text-xs font-bold text-slate-600">From</span>
                    <input
                      type="number"
                      min="0"
                      max="200"
                      value={iqacScoreFrom}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/^0+(?=\d)/, '');
                        setIqacScoreFrom(raw === '' ? '' : Math.min(200, Math.max(0, Number(raw))));
                      }}
                      className="w-16 px-2 py-0.5 border border-slate-300 rounded text-xs font-black text-blue-900 outline-none focus:border-blue-700 text-center"
                    />
                    <span className="text-xs font-bold text-slate-600">To</span>
                    <input
                      type="number"
                      min="0"
                      max="200"
                      value={iqacScoreTo}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/^0+(?=\d)/, '');
                        setIqacScoreTo(raw === '' ? '' : Math.min(200, Math.max(0, Number(raw))));
                      }}
                      className="w-16 px-2 py-0.5 border border-slate-300 rounded text-xs font-black text-blue-900 outline-none focus:border-blue-700 text-center"
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-300 shadow-sm">
                    <span className="text-[11px] font-extrabold uppercase text-blue-900 tracking-wider">🎯 Target Score Filter:</span>
                    <input
                      type="number"
                      min="0"
                      max="200"
                      value={iqacTargetScoreFilter}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/^0+(?=\d)/, '');
                        setIqacTargetScoreFilter(raw === '' ? '' : Math.min(200, Math.max(0, Number(raw))));
                      }}
                      className="w-16 px-2 py-0.5 border border-slate-300 rounded text-xs font-black text-blue-900 outline-none focus:border-blue-700 text-center"
                    />
                    <input
                      type="range"
                      min="0"
                      max="200"
                      value={Number(iqacTargetScoreFilter) || 0}
                      onChange={(e) => setIqacTargetScoreFilter(Number(e.target.value))}
                      className="w-28 accent-blue-900 cursor-pointer"
                    />
                  </div>
                )}

                <div className="flex items-center bg-slate-200/80 p-0.5 rounded-lg border border-slate-300">
                  <button
                    type="button"
                    onClick={() => setIqacScoreFilterMode('min')}
                    className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition ${iqacScoreFilterMode === 'min' ? 'bg-blue-900 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                  >
                    Score ≥ {iqacTargetScoreFilter}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIqacScoreFilterMode('exact')}
                    className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition ${iqacScoreFilterMode === 'exact' ? 'bg-blue-900 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                  >
                    Exact ({iqacTargetScoreFilter})
                  </button>
                  <button
                    type="button"
                    onClick={() => setIqacScoreFilterMode('range')}
                    className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition ${iqacScoreFilterMode === 'range' ? 'bg-blue-900 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                  >
                    Range ({iqacScoreFrom}–{iqacScoreTo})
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center bg-white p-1 rounded-lg border border-slate-300 shadow-sm">
                  <button
                    type="button"
                    onClick={() => setIqacShowExcludedOnly(false)}
                    className={`px-3 py-1 text-[11px] font-extrabold rounded-md transition flex items-center gap-1 ${!iqacShowExcludedOnly ? 'bg-blue-900 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                  >
                    <span>📋</span> Active Audit List ({iqacActiveCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setIqacShowExcludedOnly(true)}
                    className={`px-3 py-1 text-[11px] font-extrabold rounded-md transition flex items-center gap-1 ${iqacShowExcludedOnly ? 'bg-rose-900 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                  >
                    <span>🚫</span> Excluded Archive ({iqacExcludedCount})
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    exportIqacRosterPDF({
                      rows: displayInboxRows,
                      timeline: selectedTimeline,
                      departmentFilter: selectedDeptFilter,
                      targetScore: iqacTargetScoreFilter,
                      scoreFrom: iqacScoreFrom,
                      scoreTo: iqacScoreTo,
                      scoreFilterMode: iqacScoreFilterMode,
                      showExcludedArchive: iqacShowExcludedOnly,
                    });
                  }}
                  className="px-3 py-1 bg-[#4A1519] hover:bg-[#3B1013] text-white text-[11px] font-bold rounded-md shadow-sm transition flex items-center gap-1.5"
                  title="Export IQAC Audit Report as PDF (Excludes soft-hidden faculty entries)"
                >
                  <span>📄</span> Export Audit PDF
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Live Metric Statistics Cards Row */}
        {isReviewMode && (
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-100">
            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 text-left">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total Submissions</p>
              <p className="text-2xl font-black text-slate-800 mt-1">{selectedInboxRows.length}</p>
            </div>
            <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3 text-left">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Approved / Ratified</p>
              <p className="text-2xl font-black text-emerald-800 mt-1">
                {selectedInboxRows.filter(r => ['APPROVED', 'RATIFIED'].includes((r.appraisalStatus || '').toUpperCase()) || (r.principalApprovalStatus || '').toUpperCase() === 'RATIFIED').length}
              </p>
            </div>
            <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3 text-left">
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Pending Review</p>
              <p className="text-2xl font-black text-amber-800 mt-1">
                {selectedInboxRows.filter(r => (r.appraisalStatus || '').toUpperCase() === 'PENDING' || !r.appraisalStatus).length}
              </p>
            </div>
            <div className="bg-rose-50/70 border border-rose-200 rounded-xl p-3 text-left">
              <p className="text-[10px] font-bold uppercase tracking-wider text-rose-700">Fix Needed</p>
              <p className="text-2xl font-black text-rose-800 mt-1">
                {selectedInboxRows.filter(r => ['NOT APPROVED', 'FIX NEEDED', 'REJECTED'].includes((r.appraisalStatus || '').toUpperCase())).length}
              </p>
            </div>
          </div>
        )}

        {!isReviewMode && (
          <div className="mt-4 flex min-h-20 items-center justify-between rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3">
            <div>
              <p className="text-xs font-semibold text-slate-700">Self-Appraisal Workspace: {selectedTimeline}</p>
              <p className="text-[11px] text-slate-500">
                {activeTimelineRecord
                  ? `Submission Status: ${activeTimelineRecord.appraisalStatus || 'Pending'} (${activeTimelineRecord.convertedScore || 0} / 200)`
                  : 'No active submission for this academic year yet. Click Submit Form to edit your appraisal.'}
              </p>
            </div>
            <button
              type="button"
              onClick={handleProceedToSectionOne}
              className="text-xs py-1.5 px-4 bg-[#4A1519] rounded-md font-bold text-white shadow-sm hover:bg-[#5a1c22] transition"
            >
              {activeTimelineRecord ? 'Edit / View Form' : 'Submit Form'}
            </button>
          </div>
        )}
      </div>

      {isReviewMode ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-black/5">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center w-full gap-4 mb-4">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wide text-gray-700">
                {isPrincipal ? 'Institutional Executive Dashboard' : isRegistrar ? 'Institutional Faculty Dashboard' : 'Department Faculty Appraisal Dashboard'}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Showing {selectedInboxRows.length} {selectedTimeline === 'All' ? 'total submission(s)' : `submission(s) for ${selectedTimeline}`}
                {(isPrincipal || isRegistrar) && selectedDeptFilter !== 'ALL' ? ` [Filtered: Department of ${selectedDeptFilter}]` : ''}
              </p>
            </div>
            <div className="flex rounded-md shadow-sm border border-slate-200 p-1 bg-slate-50">
              <button
                onClick={() => setActiveReviewTab('inbox')}
                className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all duration-200 flex items-center gap-1.5 ${activeReviewTab === 'inbox' ? 'bg-white text-maroon-700 shadow-sm border border-slate-200/50' : 'text-slate-500 hover:text-slate-800'}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg>
                Inbox Roster
              </button>
              <button
                onClick={() => setActiveReviewTab('analytics')}
                className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all duration-200 flex items-center gap-1.5 ${activeReviewTab === 'analytics' ? 'bg-white text-maroon-700 shadow-sm border border-slate-200/50' : 'text-slate-500 hover:text-slate-800'}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                Analytics & Reports
              </button>
            </div>
          </div>
          
          {activeReviewTab === 'inbox' && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500 bg-slate-50">
                  <th className="py-2.5 px-3">Faculty Name</th>
                  <th className="py-2.5 px-3">Designation</th>
                  <th className="py-2.5 px-3">Faculty Email</th>
                  <th className="py-2.5 px-3">Dept</th>
                  <th className="py-2.5 px-3">Academic Year</th>
                  <th className="py-2.5 px-3">Date Submitted</th>
                  <th className="py-2.5 px-3">Evaluated Score</th>
                  <th className="py-2.5 px-3">Validation State</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {displayInboxRows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-6 px-3 text-center text-xs text-slate-500 italic">
                      {isIQAC 
                        ? `No faculty submissions found matching Score ${iqacScoreFilterMode === 'min' ? `≥ ${iqacTargetScoreFilter}` : iqacScoreFilterMode === 'exact' ? `== ${iqacTargetScoreFilter}` : `Range ${iqacScoreFrom} – ${iqacScoreTo}`} ${iqacShowExcludedOnly ? 'in the Excluded Archive' : 'in the Active Audit List'}.`
                        : `No faculty submissions available ${selectedTimeline === 'All' ? 'in the database' : `for ${selectedTimeline}`}.`}
                    </td>
                  </tr>
                ) : (
                  displayInboxRows.map((row) => {
                    const totalScore = row.totalScore || 0;
                    const formattedDate = row.submittedAt || row.createdAt
                      ? new Date(row.submittedAt || row.createdAt).toLocaleDateString('en-GB')
                      : '—';
                    const isIqacVerified = (row.iqacStatus || '').toUpperCase().includes('IQAC') || (row.appraisalStatus || '').toUpperCase().includes('IQAC');

                    return (
                      <tr
                        key={row.id || row._id}
                        className={`border-b border-slate-100 text-xs text-slate-700 hover:bg-slate-50 transition ${row.iqacExcluded ? 'bg-rose-50/40' : ''}`}
                      >
                        <td className="py-2.5 px-3 font-semibold text-slate-900">
                          <div>{row.facultyName}</div>
                          {row.iqacAuditRemarks && (
                            <div className={`text-[10px] font-medium px-2 py-0.5 rounded mt-1 border max-w-xs ${row.iqacExcluded ? 'bg-rose-100/80 text-rose-900 border-rose-200' : 'bg-blue-50 text-blue-900 border-blue-200'}`}>
                              💬 <strong>IQAC Note:</strong> "{row.iqacAuditRemarks}"
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-900 border border-amber-200">
                            {row.designation || 'Assistant Professor'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-600 text-[11px]">{row.facultyEmail}</td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-[#4A1519] border border-slate-200">
                            {row.department || 'CSE'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-medium text-slate-800">{row.timeline || selectedTimeline}</td>
                        <td className="py-2.5 px-3 text-slate-500">{formattedDate}</td>
                        <td className="py-2.5 px-3 font-bold text-[#4A1519]">
                          <span className={`px-2 py-0.5 rounded text-xs font-black ${totalScore >= 100 ? 'bg-emerald-100 text-emerald-900 border border-emerald-300 shadow-sm' : 'text-[#4A1519]'}`}>
                            {totalScore} / 200
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          {(() => {
                            const activeStatus = (row.appraisalStatus || 'Pending').toUpperCase().trim();
                            const isRatified = activeStatus === 'RATIFIED' || (row.principalApprovalStatus || '').toUpperCase() === 'RATIFIED';
                            
                            if (isRatified && isIqacVerified) {
                              return (
                                <div className="flex flex-col gap-1 items-start">
                                  <span className="px-2.5 py-0.5 rounded-full text-[9.5px] font-black uppercase bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-sm flex items-center gap-1 w-fit">
                                    <span>🔒</span> Ratified
                                  </span>
                                  <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-blue-100 text-blue-900 border border-blue-300 shadow-sm flex items-center gap-1 w-fit">
                                    <span>📊</span> IQAC Verified
                                  </span>
                                </div>
                              );
                            } else if (isIqacVerified) {
                              return (
                                <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-blue-100 text-blue-900 border border-blue-300 shadow-sm flex items-center gap-1 w-fit">
                                  <span>📊</span> IQAC Verified
                                </span>
                              );
                            } else if (isRatified) {
                              return (
                                <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-sm flex items-center gap-1 w-fit">
                                  <span>🔒</span> Ratified
                                </span>
                              );
                            } else if (activeStatus === 'APPROVED') {
                              return (
                                <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-green-50 text-green-700 border border-green-200 shadow-sm">
                                  ✔ Approved
                                </span>
                              );
                            } else if (activeStatus === 'NOT APPROVED' || activeStatus === 'FIX NEEDED' || activeStatus === 'REJECTED') {
                              return (
                                <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-rose-50 text-rose-700 border border-rose-200 shadow-sm">
                                  ⚠ Fix Needed
                                </span>
                              );
                            } else {
                              return (
                                <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-amber-50 text-amber-700 border border-amber-200 shadow-sm animate-pulse">
                                  {activeStatus || 'Pending'}
                                </span>
                              );
                            }
                          })()}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <div className="flex items-center justify-end space-x-1.5">
                            <button
                              onClick={() => {
                                const flattened = flattenAppraisalRecord(row);
                                openInboxRecord(row);
                                setSelectedAppraisal({ ...row, ...flattened });
                                setSelectedReviewAppraisal(row);
                                setHodRemarksInput(row.hodRemarks || '');
                                setHodSubsectionRemarks(row.subsectionRemarks || {});
                                setHodSubsectionScores(row.hodSubsectionScores || {});
                                setIqacRemarksInput(row.iqacAuditRemarks || '');
                              }}
                              className="text-[10.5px] bg-[#4A1519] hover:bg-[#3B1013] text-white px-2.5 py-1 rounded-md shadow-sm transition font-medium flex items-center gap-1"
                            >
                              <span>🔍</span> {isIQAC ? 'Audit Data' : 'Review Data'}
                            </button>

                            {isIQAC && (
                              <>
                                {!isIqacVerified && (
                                  <button
                                    type="button"
                                    onClick={() => handleIqacVerifySubmission(row._id ? String(row._id) : row.id, row.facultyEmail || row.email, row.timeline)}
                                    disabled={isSubmitting}
                                    className="text-[10.5px] bg-blue-700 hover:bg-blue-800 text-white px-2.5 py-1 rounded-md shadow-sm transition font-medium flex items-center gap-1 disabled:opacity-50"
                                    title="Mark submission as IQAC Verified"
                                  >
                                    <span>✔</span> Verify
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleIqacToggleExclusion(row._id ? String(row._id) : row.id, Boolean(row.iqacExcluded), row.facultyEmail || row.email, row.timeline)}
                                  disabled={isSubmitting}
                                  className={`text-[10.5px] px-2 py-1 rounded-md shadow-sm transition font-bold flex items-center gap-1 ${row.iqacExcluded ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'}`}
                                  title={row.iqacExcluded ? 'Restore entry to active IQAC list' : 'Soft-hide entry from active IQAC list (Does NOT delete database record)'}
                                >
                                  <span>{row.iqacExcluded ? '↩ Restore' : '🚫 Hide'}</span>
                                </button>
                              </>
                            )}

                            {!isIQAC && (
                              <button
                                onClick={() => handleDeleteAppraisalRecord(row._id || row.id)}
                                className="text-xs text-gray-400 hover:text-red-600 transition p-1"
                                title="Purge Record"
                              >
                                🗑️
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          )}
          
          {activeReviewTab === 'analytics' && (
            <AnalyticsDashboard data={selectedInboxRows} computeScores={computeSectionScores} />
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-black/5">
          <h3 className="text-sm font-bold uppercase tracking-wide text-gray-700">
            My Appraisal Submission History
          </h3>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500">
                  <th className="py-2 px-2">Academic Year</th>
                  <th className="py-2 px-2">Submission Date</th>
                  <th className="py-2 px-2">Converted Score</th>
                  <th className="py-2 px-2">Status</th>
                  <th className="py-2 px-2">HOD Remarks / Feedback</th>
                  <th className="py-2 px-2">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs font-medium text-gray-700">
                {mySubmissions.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="text-center py-6 text-xs text-gray-400 italic">
                      No self-appraisal submissions found for your account ({user?.email}) on the cloud database.
                    </td>
                  </tr>
                ) : (
                  mySubmissions.map((row) => {
                    const rawDate = row.submittedAt || row.createdAt;
                    const localSubmissionDate = rawDate && !isNaN(new Date(rawDate).getTime())
                      ? new Date(rawDate).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
                      : '—';
                    const isIqacVerifiedHistory = (row.iqacStatus || '').toUpperCase().includes('IQAC') || (row.appraisalStatus || '').toUpperCase().includes('IQAC');

                    return (
                      <tr key={row._id || row.id} className="border-b border-gray-100 hover:bg-gray-50/50 transition text-xs">
                        <td className="py-3 px-3 font-semibold text-gray-700">{row.timeline}</td>
                        <td className="py-3 px-3 text-gray-500">{localSubmissionDate}</td>
                        <td className="py-3 px-3 font-medium text-gray-800">
                          <span className="font-bold text-[#4A1519]">{row.convertedScore || "0"} / 200</span>
                          {row.hodSubsectionScores && Object.keys(row.hodSubsectionScores).length > 0 && (
                            <span className="ml-2 text-[9px] font-bold bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-0.2 rounded-full inline-block">
                              ⚡ HoD Evaluated
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          {(() => {
                            const activeStatus = (row.appraisalStatus || 'Pending').toUpperCase().trim();
                            const isRatified = activeStatus === 'RATIFIED' || (row.principalApprovalStatus || '').toUpperCase() === 'RATIFIED';
                            if (isRatified && isIqacVerifiedHistory) {
                              return (
                                <div className="flex flex-col gap-1 items-start">
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-sm">
                                    <span>🔒</span> Ratified
                                  </span>
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8.5px] font-black uppercase bg-blue-100 text-blue-900 border border-blue-300 shadow-sm">
                                    <span>📊</span> IQAC Verified
                                  </span>
                                </div>
                              );
                            } else if (isIqacVerifiedHistory) {
                              return (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase bg-blue-100 text-blue-900 border border-blue-300 shadow-sm">
                                  <span>📊</span> IQAC Verified
                                </span>
                              );
                            } else if (isRatified) {
                              return (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-sm">
                                  <span>🔒</span> Ratified
                                </span>
                              );
                            } else if (activeStatus === 'APPROVED') {
                              return (
                                <span className="inline-block px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase bg-green-50 text-green-700 border border-green-200 shadow-sm">
                                  ✔ Approved
                                </span>
                              );
                            } else if (activeStatus === 'NOT APPROVED' || activeStatus === 'REJECTED') {
                              return (
                                <span className="inline-block px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase bg-rose-50 text-rose-700 border border-rose-200 shadow-sm">
                                  ⚠ Fix Needed
                                </span>
                              );
                            } else {
                              return (
                                <span className="inline-block px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase bg-amber-50 text-amber-700 border border-amber-200 shadow-sm">
                                  Pending
                                </span>
                              );
                            }
                          })()}
                        </td>
                        <td className="py-3 px-3 max-w-xs break-words whitespace-normal text-gray-600 font-normal leading-relaxed space-y-1">
                          {row.principalRemarks && (
                            <div className="bg-emerald-50/90 border border-emerald-200 rounded-lg p-2 text-[11px] text-emerald-900">
                              🎓 <span className="font-bold text-emerald-950">Principal Commendation:</span> "{row.principalRemarks}"
                            </div>
                          )}
                          {row.iqacAuditRemarks && (
                            <div className="bg-blue-50/90 border border-blue-200 rounded-lg p-2 text-[11px] text-blue-950">
                              📊 <span className="font-bold text-blue-900">IQAC Audit Note:</span> "{row.iqacAuditRemarks}"
                            </div>
                          )}
                          {row.hodRemarks ? (
                            <div className="bg-gray-50/80 border border-gray-100 rounded-lg p-2 text-[11px]">
                              💬 <span className="font-semibold text-gray-700">HOD Feedback:</span> "{row.hodRemarks}"
                            </div>
                          ) : (!row.principalRemarks && !row.iqacAuditRemarks) ? (
                            <span className="text-gray-300 italic">—</span>
                          ) : null}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                const flattened = flattenAppraisalRecord(row);
                                const effScores = computeEffectiveScores(flattened, row.hodSubsectionScores || {});
                                exportAppraisalToPDF({
                                  user: {
                                    name: row.facultyName || row.name || user?.name || 'Faculty Member',
                                    email: row.facultyEmail || row.email || user?.email || '',
                                    role: row.role || 'Faculty',
                                  },
                                  timeline: row.timeline,
                                  sectionData: flattened,
                                  scores: effScores,
                                  record: row,
                                });
                              }}
                              className="text-[10.5px] py-1 px-2 bg-white border border-[#4A1519] text-[#4A1519] hover:bg-[#4A1519] hover:text-white font-medium rounded shadow-xs transition flex items-center gap-0.5"
                              title="Download PDF / Print Document"
                            >
                              <span>📄</span> PDF
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const flattened = flattenAppraisalRecord(row);
                                exportAppraisalToExcel({
                                  user,
                                  timeline: row.timeline,
                                  sectionData: flattened,
                                  scores: computeEffectiveScores(flattened, row.hodSubsectionScores || {}),
                                  record: row,
                                });
                              }}
                              className="text-[10.5px] py-1 px-2 bg-white border border-emerald-600 text-emerald-700 hover:bg-emerald-600 hover:text-white font-medium rounded shadow-xs transition flex items-center gap-0.5"
                              title="Download Excel Workbook"
                            >
                              <span>📊</span> Excel
                            </button>
                            <button
                              onClick={() => {
                                setWorkspaceByTimeline((prev) => ({
                                  ...prev,
                                  [row.timeline]: flattenAppraisalRecord(row),
                                }));
                                setSelectedTimeline(row.timeline);
                                setActiveView('section1');
                              }}
                              className="text-[10.5px] py-1 px-2.5 bg-[#4A1519] hover:bg-[#3B1013] text-white font-medium rounded shadow-xs transition-all"
                            >
                              View
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Drill-down detail panel â€” shown when any View button is clicked */}
      {selectedAppraisal && (
        <DetailedReviewView
          appraisal={selectedAppraisal}
          onClose={() => {
            setSelectedAppraisal(null);
            setSelectedReviewAppraisal(null);
            setHodRemarksInput('');
            setHodSubsectionRemarks({});
            setHodSubsectionScores({});
            setIqacRemarksInput('');
          }}
          onExportPDF={handlePrintDocument}
          hodControls={isHod && selectedReviewAppraisal && selectedAppraisal.principalApprovalStatus !== 'Ratified' && selectedAppraisal.appraisalStatus !== 'Ratified' ? {
            remarksValue: hodRemarksInput,
            onRemarksChange: setHodRemarksInput,
            subsectionRemarks: hodSubsectionRemarks,
            onSubsectionRemarkChange: (key, val) => setHodSubsectionRemarks(prev => ({ ...prev, [key]: val })),
            subsectionScores: hodSubsectionScores,
            onSubsectionScoreChange: (key, val) => setHodSubsectionScores(prev => ({ ...prev, [key]: val })),
            onAction: processHodReviewAction,
          } : null}
          principalControls={isPrincipal && selectedAppraisal ? {
            onEndorse: handlePrincipalEndorse,
            isRatified: selectedAppraisal.principalApprovalStatus === 'Ratified' || selectedAppraisal.appraisalStatus === 'Ratified',
            endorsedAt: selectedAppraisal.principalEndorsedAt,
            remarks: selectedAppraisal.principalRemarks,
          } : null}
          iqacControls={isIQAC && selectedAppraisal ? {
            remarksValue: iqacRemarksInput,
            onRemarksChange: setIqacRemarksInput,
            onVerify: (targetStatus) => handleIqacVerifySubmission(selectedAppraisal._id || selectedAppraisal.id, selectedAppraisal.facultyEmail || selectedAppraisal.email, selectedAppraisal.timeline, iqacRemarksInput, targetStatus),
            onToggleExclusion: () => handleIqacToggleExclusion(selectedAppraisal._id || selectedAppraisal.id, Boolean(selectedAppraisal.iqacExcluded), selectedAppraisal.facultyEmail || selectedAppraisal.email, selectedAppraisal.timeline),
            isVerified: (selectedAppraisal.iqacStatus || '').toUpperCase().includes('IQAC') || (selectedAppraisal.appraisalStatus || '').toUpperCase().includes('IQAC'),
            isExcluded: Boolean(selectedAppraisal.iqacExcluded)
          } : null}
        />
      )}
    </div>
    );
  };

  const renderSectionOne = () => (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
      <div className="space-y-3">
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm shadow-black/5">
          {/* Title row + export buttons */}
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-sm font-bold uppercase tracking-wide text-gray-700">
                Section I
              </p>
              <h2 className="mt-1 text-lg font-semibold text-slate-900">
                Teaching &amp; Learning
              </h2>
            </div>

            {/* Export controllers */}
            <div className="flex items-center gap-1.5 print-hidden">
              <button
                type="button"
                onClick={exportToPDF}
                className="py-1 px-2.5 text-xs rounded-md font-medium border border-[#4A1519] text-[#4A1519] hover:bg-[#4A1519] hover:text-white transition flex items-center gap-1"
              >
                <span>📄</span> Export as PDF
              </button>
              <button
                type="button"
                onClick={exportToExcel}
                className="py-1 px-2.5 text-xs rounded-md font-medium border border-emerald-600 text-emerald-700 hover:bg-emerald-600 hover:text-white transition"
              >
                Export as Excel
              </button>
            </div>
          </div>

          {/* Auto-save status badge */}
          <div className="mt-2 flex items-center gap-1.5">
            <span className="text-[11px] text-slate-400">
              Scores update instantly · Saved offline
            </span>
          </div>
        </div>

        {/* Section I Collapsible Card Container */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-4">
          <div 
            onClick={() => setActiveSection(activeSection === 'I' ? null : 'I')} 
            className={`p-5 flex justify-between items-center cursor-pointer transition-all ${activeSection === 'I' ? 'bg-orange-50/50 border-b border-orange-100' : 'hover:bg-gray-50'}`}
          >
            <div>
              <h2 className="text-base font-black text-[#4A1519]">SECTION I: Teaching & Learning</h2>
              <p className="text-[11px] text-gray-400 mt-0.5">Scores update instantly • Max Section mark: 50</p>
            </div>
            <span className="text-xs font-bold text-[#4A1519]">{activeSection === 'I' ? '▲ Collapse' : '▼ Expand'}</span>
          </div>
            <div className={`p-6 space-y-6 ${activeSection === 'I' ? 'block' : 'hidden print-section'}`}>
        <DynamicArraySection
          title="1.1 Courses Handled"
          subtitle="(Calculation Rubric: 1 course = 3 marks | 2 courses = 6 marks | 3+ courses = 8 marks max)"
          rows={currentSectionData.coursesHandled || []}
          rowErrors={sectionValidation.rowErrors.coursesHandled}
          canAdd={canAddCoursesHandled(currentSectionData.coursesHandled || [])}
          disabled={!isEditable}
          onAdd={() =>
            addArrayRow('coursesHandled', {
              courseCode: '',
              courseName: '',
              type: '',
              semester: '',
              evidenceLink: '',
            })
          }
          onChange={(rowId, field, value) =>
            updateArrayRow('coursesHandled', rowId, field, value)
          }
          onRemove={(rowId) => removeArrayRow('coursesHandled', rowId)}
          columns={coursesHandledColumns}
        />

        <DynamicArraySection
          title="1.2 Course File"
          subtitle="(Calculation Rubric: Full compliance = 5 marks | Partial compliance = 3 marks | Max 5 marks)"
          rows={currentSectionData.courseFiles || []}
          rowErrors={sectionValidation.rowErrors.courseFiles}
          canAdd={canAddCourseFiles(currentSectionData.courseFiles || [])}
          disabled={!isEditable}
          onAdd={() =>
            addArrayRow('courseFiles', {
              courseCode: '',
              courseName: '',
              compliance: '',
              evidenceLink: '',
            })
          }
          onChange={(rowId, field, value) =>
            updateArrayRow('courseFiles', rowId, field, value)
          }
          onRemove={(rowId) => removeArrayRow('courseFiles', rowId)}
          columns={courseFilesColumns}
        />

        <DynamicArraySection
          title="1.3 Course Design"
          subtitle="(Calculation Rubric: 2 marks per entry | Max 5 marks)"
          rows={currentSectionData.coursesDesigned || []}
          rowErrors={sectionValidation.rowErrors.coursesDesigned}
          canAdd={canAddCoursesDesigned(currentSectionData.coursesDesigned || [])}
          disabled={!isEditable}
          onAdd={() =>
            addArrayRow('coursesDesigned', {
              courseCode: '',
              courseName: '',
              remarks: '',
              evidenceLink: '',
            })
          }
          onChange={(rowId, field, value) =>
            updateArrayRow('coursesDesigned', rowId, field, value)
          }
          onRemove={(rowId) => removeArrayRow('coursesDesigned', rowId)}
          columns={coursesDesignedColumns}
        />

        <DynamicArraySection
          title="1.4 Value-Added"
          subtitle="(Calculation Rubric: 2 marks per entry | Max 4 marks)"
          rows={currentSectionData.valueAdded || []}
          rowErrors={sectionValidation.rowErrors.valueAdded}
          canAdd={canAddValueAdded(currentSectionData.valueAdded || [])}
          disabled={!isEditable}
          onAdd={() =>
            addArrayRow('valueAdded', {
              courseName: '',
              particulars: '',
              studentCount: '',
              evidenceLink: '',
            })
          }
          onChange={(rowId, field, value) =>
            updateArrayRow('valueAdded', rowId, field, value)
          }
          onRemove={(rowId) => removeArrayRow('valueAdded', rowId)}
          columns={valueAddedColumns}
        />

        <DynamicArraySection
          title="1.5 Innovative Methods"
          subtitle="(Calculation Rubric: ≥3 methods = 5 marks | 2 methods = 4 marks | 1 method = 2 marks | Max 5 marks)"
          rows={currentSectionData.innovativeMethods || []}
          rowErrors={sectionValidation.rowErrors.innovativeMethods}
          canAdd={canAddInnovativeMethods(currentSectionData.innovativeMethods || [])}
          disabled={!isEditable}
          onAdd={() =>
            addArrayRow('innovativeMethods', {
              courseCode: '',
              method: '',
              evidenceLink: '',
            })
          }
          onChange={(rowId, field, value) =>
            updateArrayRow('innovativeMethods', rowId, field, value)
          }
          onRemove={(rowId) => removeArrayRow('innovativeMethods', rowId)}
          columns={innovativeMethodsColumns}
        />

        <DynamicArraySection
          title="1.6 Academic Collaborations"
          subtitle="(Calculation Rubric: 4 marks per entry | Max 4 marks)"
          rows={currentSectionData.academicCollaborations || []}
          rowErrors={sectionValidation.rowErrors.academicCollaborations}
          canAdd={canAddAcademicCollaborations(currentSectionData.academicCollaborations || [])}
          disabled={!isEditable}
          onAdd={() =>
            addArrayRow('academicCollaborations', {
              organization: '',
              collaborationType: '',
              evidenceLink: '',
            })
          }
          onChange={(rowId, field, value) =>
            updateArrayRow('academicCollaborations', rowId, field, value)
          }
          onRemove={(rowId) => removeArrayRow('academicCollaborations', rowId)}
          columns={academicCollaborationsColumns}
        />

        <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm shadow-black/5">
          <div className="mb-3">
            <p className="text-sm font-bold uppercase tracking-wide text-gray-700">
              1.7 Mentoring System
            </p>
            <span className="text-[11px] text-gray-500 font-medium mt-0.5 block tracking-wide italic normal-case">
              (Calculation Rubric: Mentee Count &gt; 0 with complete mentoring details = 2 marks | Else = 0 marks)
            </span>
          </div>

          <div className="grid gap-2 grid-cols-2 lg:grid-cols-3">
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Mentee Count
              </span>
              <input
                type="number"
                value={currentSectionData.mentoring?.menteeCount || ''}
                onChange={(event) =>
                  updateMentoringField('menteeCount', event.target.value)
                }
                readOnly={!isEditable || user.role === 'HOD'}
                placeholder="Enter Mentee Count"
                className={`mt-1 w-full rounded-md border ${
                  sectionValidation.mentoringErrors.menteeCount
                    ? 'border-red-400'
                    : 'border-slate-200'
                } bg-white py-0.5 px-2 text-xs text-slate-800 outline-none transition focus:border-[#4A1519] focus:ring-2 focus:ring-[#4A1519]/20 read-only:cursor-default read-only:bg-slate-100 placeholder:text-[11px] placeholder:text-gray-400`}
              />
            </label>

            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Batch
              </span>
              <select
                value={currentSectionData.mentoring?.batch || ''}
                onChange={(event) => updateMentoringField('batch', event.target.value)}
                disabled={!isEditable || user.role === 'HOD'}
                className={`mt-1 w-full rounded-md border ${
                  sectionValidation.mentoringErrors.batch
                    ? 'border-red-400'
                    : 'border-slate-200'
                } bg-white py-0.5 px-2 text-xs text-slate-800 outline-none transition focus:border-[#4A1519] focus:ring-2 focus:ring-[#4A1519]/20 disabled:cursor-default disabled:bg-slate-100`}
              >
                <option value="">Select Batch</option>
                {MENTORING_BATCH_GROUPS.map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.options.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
          </div>

          <label className="mt-2 block">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Mentoring Description
            </span>
            <textarea
              value={currentSectionData.mentoring?.description || ''}
              onChange={(event) =>
                updateMentoringField('description', event.target.value)
              }
              readOnly={!isEditable || user.role === 'HOD'}
              placeholder="Enter Description"
              className={`mt-1 w-full rounded-md border ${
                sectionValidation.mentoringErrors.description
                  ? 'border-red-400'
                  : 'border-slate-200'
              } bg-white py-1 px-2 text-xs leading-5 text-slate-800 outline-none transition focus:border-[#4A1519] focus:ring-2 focus:ring-[#4A1519]/20 read-only:cursor-default read-only:bg-slate-100 placeholder:text-[11px] placeholder:text-gray-400 min-h-16`}
            />
          </label>

          <label className="mt-2 block">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Supporting Document Link
            </span>
            <input
              type="url"
              value={currentSectionData.mentoring?.evidenceLink || ''}
              onChange={(event) =>
                updateMentoringField('evidenceLink', event.target.value)
              }
              readOnly={!isEditable || user.role === 'HOD'}
              placeholder="Mentoring Supporting Document Link (Google Drive / OneDrive)"
              className={`mt-1 w-full rounded-md border ${
                sectionValidation.mentoringErrors.evidenceLink
                  ? 'border-red-400'
                  : 'border-slate-200'
              } bg-white py-0.5 px-2 text-xs text-slate-800 outline-none transition focus:border-[#4A1519] focus:ring-2 focus:ring-[#4A1519]/20 read-only:cursor-default read-only:bg-slate-100 placeholder:text-[11px] placeholder:text-gray-400`}
            />
          </label>

          <p className="mt-2 text-[11px] font-medium text-slate-500">
            Auto-scored in real time when all required mentoring fields are valid.
          </p>
        </section>

        <DynamicArraySection
          title="1.8 NPTEL Certifications"
          subtitle="(Calculation Rubric: 2 marks per NPTEL/SWAYAM certification completed | Max 4 marks)"
          rows={currentSectionData.certifications || []}
          rowErrors={sectionValidation.rowErrors.certifications}
          canAdd={canAddCertifications(currentSectionData.certifications || [])}
          disabled={!isEditable}
          onAdd={() =>
            addArrayRow('certifications', {
              courseName: '',
              platform: '',
              certType: '',
              evidenceLink: '',
            })
          }
          onChange={(rowId, field, value) =>
            updateArrayRow('certifications', rowId, field, value)
          }
          onRemove={(rowId) => removeArrayRow('certifications', rowId)}
          columns={certificationsColumns}
        />

        <DynamicArraySection
          title="1.9 Student Feedback"
          subtitle="(Calculation Rubric: >90% = 4 marks | 80-90% = 3 marks | 75-80% = 1 mark | Max 4 marks)"
          rows={currentSectionData.studentFeedback || []}
          rowErrors={sectionValidation.rowErrors.studentFeedback}
          canAdd={canAddStudentFeedback(currentSectionData.studentFeedback || [])}
          disabled={!isEditable}
          onAdd={() =>
            addArrayRow('studentFeedback', {
              courseCode: '',
              feedbackPct: '',
              evidenceLink: '',
            })
          }
          onChange={(rowId, field, value) =>
            updateArrayRow('studentFeedback', rowId, field, value)
          }
          onRemove={(rowId) => removeArrayRow('studentFeedback', rowId)}
          columns={studentFeedbackColumns}
        />

        <DynamicArraySection
          title="1.10 Result Analysis"
          subtitle="(Calculation Rubric: ≥90% = 5 marks | 80-89% = 4 marks | 70-79% = 3 marks | 60-69% = 2 marks | <60% = 1 mark | Max 5 marks)"
          rows={currentSectionData.resultAnalysis || []}
          rowErrors={sectionValidation.rowErrors.resultAnalysis}
          canAdd={canAddResultAnalysis(currentSectionData.resultAnalysis || [])}
          disabled={!isEditable}
          onAdd={() =>
            addArrayRow('resultAnalysis', {
              courseCode: '',
              courseName: '',
              passPercentage: '',
              evidenceLink: '',
            })
          }
          onChange={(rowId, field, value) =>
            updateArrayRow('resultAnalysis', rowId, field, value)
          }
          onRemove={(rowId) => removeArrayRow('resultAnalysis', rowId)}
          columns={resultAnalysisColumns}
        />

        <DynamicArraySection
          title="1.11 CO Attainment %"
          subtitle="(Calculation Rubric: ≥70% = 4 marks | 60-69% = 3 marks | 50-59% = 2 marks | Max 4 marks)"
          rows={currentSectionData.coAttainment || []}
          rowErrors={sectionValidation.rowErrors.coAttainment}
          canAdd={canAddCoAttainment(currentSectionData.coAttainment || [])}
          disabled={!isEditable}
          onAdd={() =>
            addArrayRow('coAttainment', {
              courseCode: '',
              courseName: '',
              attainmentPct: '',
              evidenceLink: '',
            })
          }
          onChange={(rowId, field, value) =>
            updateArrayRow('coAttainment', rowId, field, value)
          }
          onRemove={(rowId) => removeArrayRow('coAttainment', rowId)}
          columns={coAttainmentColumns}
        />


            </div>
        </div>

        {/* Section II Collapsible Card Container */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div 
            onClick={() => setActiveSection(activeSection === 'II' ? null : 'II')} 
            className={`p-5 flex justify-between items-center cursor-pointer transition-all ${activeSection === 'II' ? 'bg-orange-50/50 border-b border-orange-100' : 'hover:bg-gray-50'}`}
          >
            <div>
              <h2 className="text-base font-black text-[#4A1519]">SECTION II: Research Publications</h2>
              <p className="text-[11px] text-gray-400 mt-0.5">Jan-Dec Calendar Year • Max Section mark: 55</p>
            </div>
            <span className="text-xs font-bold text-[#4A1519]">{activeSection === 'II' ? '▲ Collapse' : '▼ Expand'}</span>
          </div>
            <div className={`p-6 space-y-6 ${activeSection === 'II' ? 'block' : 'hidden print-section'}`}>
              {/* 2.1 Journal Papers */}
              <DynamicArraySection
                title="2.1 Journal Publications (SCI / Scopus Indexed)"
                subtitle="(Calculation Rubric: Q1 = 6 marks | Q2 = 4 marks | Q3 = 2 marks | Max 15 marks | Note: Give the first page as proof)"
                rows={currentSectionData.journalPapers || []}
                canAdd={canAddJournalPapers(currentSectionData.journalPapers || [])}
                disabled={!isEditable}
                onAdd={() =>
                  addArrayRow('journalPapers', {
                    paperTitle: '',
                    journalName: '',
                    tier: 'Q1',
                    evidenceLink: '',
                  })
                }
                onChange={(rowId, field, value) =>
                  updateArrayRow('journalPapers', rowId, field, value)
                }
                onRemove={(rowId) => removeArrayRow('journalPapers', rowId)}
                columns={journalPapersColumns}
              />

              {/* 2.2 Citations Received (Last 3 Years) */}
              <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm shadow-black/5">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">
                      2.2 Citations Received (Last 3 Years)
                    </h3>
                    <p className="text-xs text-slate-500">
                      (Calculation Rubric: ≥50 = 8 marks | 25-49 = 5 marks | 15-24 = 4 marks | 5-14 = 3 marks | 1-4 = 1 mark | Max 8 marks)
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-700">
                      Subtotal: {scores.sub2_2 || 0} / 8
                    </span>
                  </div>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <label className="block">
                    <span className="text-xs font-medium text-slate-700">
                      Total Citations Count
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      placeholder="e.g. 35"
                      value={currentSectionData.citationsReceived?.totalCount || ''}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, ''); // Allow only numbers
                        updateCurrentTimeline((prev) => {
                          const next = {
                            ...prev,
                            citationsReceived: typeof prev.citationsReceived === 'object' && prev.citationsReceived !== null && !Array.isArray(prev.citationsReceived)
                              ? { ...prev.citationsReceived, totalCount: val }
                              : { totalCount: val }
                          };
                          localStorage.setItem(`draft_${user.email}_${selectedTimeline}`, JSON.stringify(next));
                          return next;
                        });
                      }}
                      disabled={!isEditable}
                      className="w-full max-w-xs border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#4A1519] bg-white text-gray-900 disabled:bg-slate-100 disabled:cursor-not-allowed"
                    />
                  </label>
                </div>
              </div>

              {/* 2.3 Total Q1 Citations */}
              <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm shadow-black/5">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">
                      2.3 Total Q1 Citations
                    </h3>
                    <p className="text-xs text-slate-500">
                      (Calculation Rubric: ≥25 = 7 marks | 15-24 = 5 marks | 6-14 = 3 marks | 1-5 = 1 mark | Max 7 marks)
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-700">
                      Subtotal: {scores.sub2_3 || 0} / 7
                    </span>
                  </div>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <label className="block">
                    <span className="text-xs font-medium text-slate-700">
                      Q1 Citations Count
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      placeholder="e.g. 18"
                      value={currentSectionData.q1Citations?.totalCount || ''}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, ''); // Allow only numbers
                        updateCurrentTimeline((prev) => {
                          const next = {
                            ...prev,
                            q1Citations: typeof prev.q1Citations === 'object' && prev.q1Citations !== null && !Array.isArray(prev.q1Citations)
                              ? { ...prev.q1Citations, totalCount: val }
                              : { totalCount: val }
                          };
                          localStorage.setItem(`draft_${user.email}_${selectedTimeline}`, JSON.stringify(next));
                          return next;
                        });
                      }}
                      disabled={!isEditable}
                      className="w-full max-w-xs border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#4A1519] bg-white text-gray-900 disabled:bg-slate-100 disabled:cursor-not-allowed"
                    />
                  </label>
                </div>
              </div>

              {/* 2.4 Books / Chapters */}
              <DynamicArraySection
                title="2.4 Books / Book Chapters Published"
                subtitle="(Calculation Rubric: Book (Author) = 5 marks | Chapter/Editor = 2 marks | Max 5 marks)"
                rows={currentSectionData.bookPublications || []}
                canAdd={canAddBookPublications(currentSectionData.bookPublications || [])}
                disabled={!isEditable}
                onAdd={() =>
                  addArrayRow('bookPublications', {
                    title: '',
                    type: 'Book (Author)',
                    evidenceLink: '',
                  })
                }
                onChange={(rowId, field, value) =>
                  updateArrayRow('bookPublications', rowId, field, value)
                }
                onRemove={(rowId) => removeArrayRow('bookPublications', rowId)}
                columns={bookPublicationsColumns}
              />

              {/* 2.5 Conference Papers */}
              <DynamicArraySection
                title="2.5 Conference Publications (Scopus / Web of Science)"
                subtitle="(Calculation Rubric: 1 mark per paper entry | Max 4 marks)"
                rows={currentSectionData.conferencePapers || []}
                canAdd={canAddConferencePapers(currentSectionData.conferencePapers || [])}
                disabled={!isEditable}
                onAdd={() =>
                  addArrayRow('conferencePapers', {
                    paperTitle: '',
                    proceedingName: '',
                    evidenceLink: '',
                  })
                }
                onChange={(rowId, field, value) =>
                  updateArrayRow('conferencePapers', rowId, field, value)
                }
                onRemove={(rowId) => removeArrayRow('conferencePapers', rowId)}
                columns={conferencePapersColumns}
              />

              {/* 2.6 Research Collaborations */}
              <DynamicArraySection
                title="2.6 Research Collaborations & Projects"
                subtitle="(Calculation Rubric: International = 3 marks | National/Industry = 2 marks | Max 5 marks)"
                rows={currentSectionData.researchCollaborations || []}
                canAdd={canAddResearchCollaborations(currentSectionData.researchCollaborations || [])}
                disabled={!isEditable}
                onAdd={() =>
                  addArrayRow('researchCollaborations', {
                    title: '',
                    partner: '',
                    type: 'International',
                    evidenceLink: '',
                  })
                }
                onChange={(rowId, field, value) =>
                  updateArrayRow('researchCollaborations', rowId, field, value)
                }
                onRemove={(rowId) => removeArrayRow('researchCollaborations', rowId)}
                columns={researchCollaborationsColumns}
              />

              {/* 2.7 PhD Registered */}
              <DynamicArraySection
                title="2.7 PhD Scholars Guided (Registered)"
                subtitle="(Calculation Rubric: 1 mark per active registered scholar entry | Max 5 marks)"
                rows={currentSectionData.phdRegistered || []}
                canAdd={canAddPhdRegistered(currentSectionData.phdRegistered || [])}
                disabled={!isEditable}
                onAdd={() =>
                  addArrayRow('phdRegistered', {
                    scholarName: '',
                    researchArea: '',
                    evidenceLink: '',
                  })
                }
                onChange={(rowId, field, value) =>
                  updateArrayRow('phdRegistered', rowId, field, value)
                }
                onRemove={(rowId) => removeArrayRow('phdRegistered', rowId)}
                columns={phdRegisteredColumns}
              />

              {/* 2.8 PhD Awarded */}
              <DynamicArraySection
                title="2.8 PhD Scholars Guided (Degree Awarded)"
                subtitle="(Calculation Rubric: 3 marks per awarded scholar entry | Max 6 marks)"
                rows={currentSectionData.phdAwarded || []}
                canAdd={canAddPhdAwarded(currentSectionData.phdAwarded || [])}
                disabled={!isEditable}
                onAdd={() =>
                  addArrayRow('phdAwarded', {
                    scholarName: '',
                    researchArea: '',
                    evidenceLink: '',
                  })
                }
                onChange={(rowId, field, value) =>
                  updateArrayRow('phdAwarded', rowId, field, value)
                }
                onRemove={(rowId) => removeArrayRow('phdAwarded', rowId)}
                columns={phdAwardedColumns}
              />
            </div>
        </div>
        {/* Section III Collapsible Card Container */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-4">
          <div 
            onClick={() => setActiveSection(activeSection === "III" ? null : "III")} 
            className={`p-5 flex justify-between items-center cursor-pointer transition-all ${activeSection === "III" ? "bg-orange-50/50 border-b border-orange-100" : "hover:bg-gray-50"}`}
          >
            <div>
              <h2 className="text-base font-black text-[#4A1519]">SECTION III: Patents and Innovation</h2>
              <p className="text-[11px] text-gray-400 mt-0.5">Max Section mark: 15</p>
            </div>
            <span className="text-xs font-bold text-[#4A1519]">{activeSection === "III" ? "\u25B2 Collapse" : "\u25BC Expand"}</span>
          </div>
            <div className={`p-6 space-y-6 ${activeSection === "III" ? 'block' : 'hidden print-section'}`}>
              <DynamicArraySection
                title="3.1 Number of Patents Published"
                subtitle="(Calculation Rubric: 1 mark per patent | Max 2 marks)"
                rows={currentSectionData.patentsPublished || []}
                canAdd={canAddPatentsPublished(currentSectionData.patentsPublished || [])}
                disabled={!isEditable}
                onAdd={() => addArrayRow("patentsPublished", { refNumber: "", title: "", inventors: "", datePublished: "", evidenceLink: "" })}
                onChange={(rowId, field, value) => updateArrayRow("patentsPublished", rowId, field, value)}
                onRemove={(rowId) => removeArrayRow("patentsPublished", rowId)}
                columns={patentsPublishedColumns}
              />
              <DynamicArraySection
                title="3.2 Number of Patents Granted"
                subtitle="(Calculation Rubric: 3 marks per patent | Max 6 marks)"
                rows={currentSectionData.patentsGranted || []}
                canAdd={canAddPatentsGranted(currentSectionData.patentsGranted || [])}
                disabled={!isEditable}
                onAdd={() => addArrayRow("patentsGranted", { refNumber: "", title: "", inventors: "", dateGranted: "", evidenceLink: "" })}
                onChange={(rowId, field, value) => updateArrayRow("patentsGranted", rowId, field, value)}
                onRemove={(rowId) => removeArrayRow("patentsGranted", rowId)}
                columns={patentsGrantedColumns}
              />
              <DynamicArraySection
                title="3.3 Number of Transfer of Technology"
                subtitle="(Calculation Rubric: 3 marks per ToT | Max 3 marks)"
                rows={currentSectionData.transferOfTechnology || []}
                canAdd={canAddTransferOfTechnology(currentSectionData.transferOfTechnology || [])}
                disabled={!isEditable}
                onAdd={() => addArrayRow("transferOfTechnology", { title: "", industryPartner: "", amount: "", evidenceLink: "" })}
                onChange={(rowId, field, value) => updateArrayRow("transferOfTechnology", rowId, field, value)}
                onRemove={(rowId) => removeArrayRow("transferOfTechnology", rowId)}
                columns={transferOfTechnologyColumns}
              />
              <DynamicArraySection
                title="3.4 Number of Prototype / Product Developed (with Students)"
                subtitle="(Calculation Rubric: 1 mark per product | Max 2 marks)"
                rows={currentSectionData.prototypesDeveloped || []}
                canAdd={canAddPrototypesDeveloped(currentSectionData.prototypesDeveloped || [])}
                disabled={!isEditable}
                onAdd={() => addArrayRow("prototypesDeveloped", { title: "", studentsInvolved: "", date: "", evidenceLink: "" })}
                onChange={(rowId, field, value) => updateArrayRow("prototypesDeveloped", rowId, field, value)}
                onRemove={(rowId) => removeArrayRow("prototypesDeveloped", rowId)}
                columns={prototypesDevelopedColumns}
              />
              <DynamicArraySection
                title="3.5 Hackathon Mentoring & Prizes (with Students)"
                subtitle="(Calculation Rubric: 2 marks per prize | Max 2 marks)"
                rows={currentSectionData.hackathonPrizes || []}
                canAdd={canAddHackathonPrizes(currentSectionData.hackathonPrizes || [])}
                disabled={!isEditable}
                onAdd={() => addArrayRow("hackathonPrizes", { eventName: "", studentsMentored: "", prize: "", date: "", evidenceLink: "" })}
                onChange={(rowId, field, value) => updateArrayRow("hackathonPrizes", rowId, field, value)}
                onRemove={(rowId) => removeArrayRow("hackathonPrizes", rowId)}
                columns={hackathonPrizesColumns}
              />
            </div>
        </div>

        {/* Section IV Collapsible Card Container */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-4">
          <div 
            onClick={() => setActiveSection(activeSection === "IV" ? null : "IV")} 
            className={`p-5 flex justify-between items-center cursor-pointer transition-all ${activeSection === "IV" ? "bg-orange-50/50 border-b border-orange-100" : "hover:bg-gray-50"}`}
          >
            <div>
              <h2 className="text-base font-black text-[#4A1519]">SECTION IV: Sponsored Research and Consultancy</h2>
              <p className="text-[11px] text-gray-400 mt-0.5">Max Section mark: 15</p>
            </div>
            <span className="text-xs font-bold text-[#4A1519]">{activeSection === "IV" ? "\u25B2 Collapse" : "\u25BC Expand"}</span>
          </div>
            <div className={`p-6 space-y-6 ${activeSection === "IV" ? 'block' : 'hidden print-section'}`}>
              <DynamicArraySection
                title="4.1 Sponsored Research Project - PI / Co-PI"
                subtitle="(Calculation Rubric: Sanctioned Amount >= ₹1 Lakh = 5 marks; < ₹1 Lakh = 3 marks | Max 8 marks | Note: Sanction letter to be uploaded)"
                rows={currentSectionData.researchProjects || []}
                canAdd={canAddResearchProjects(currentSectionData.researchProjects || [])}
                disabled={!isEditable}
                onAdd={() => addArrayRow("researchProjects", { projectName: "", fundingAgency: "", period: "", amount: "", role: "PI", status: "Ongoing", evidenceLink: "" })}
                onChange={(rowId, field, value) => updateArrayRow("researchProjects", rowId, field, value)}
                onRemove={(rowId) => removeArrayRow("researchProjects", rowId)}
                columns={researchProjectsColumns}
              />
              <DynamicArraySection
                title="4.2 Consultancy Projects"
                subtitle="(Calculation Rubric: Consultancy Amount >= ₹50,000 = 3 marks; < ₹50,000 = 2 marks | Max 7 marks)"
                rows={currentSectionData.consultancyProjects || []}
                canAdd={canAddConsultancyProjects(currentSectionData.consultancyProjects || [])}
                disabled={!isEditable}
                onAdd={() => addArrayRow("consultancyProjects", { title: "", clientDetails: "", period: "", amount: "", facultyInvolved: "", evidenceLink: "" })}
                onChange={(rowId, field, value) => updateArrayRow("consultancyProjects", rowId, field, value)}
                onRemove={(rowId) => removeArrayRow("consultancyProjects", rowId)}
                columns={consultancyProjectsColumns}
              />
            </div>
        </div>

        {/* Section V Collapsible Card Container */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-4">
          <div 
            onClick={() => setActiveSection(activeSection === "V" ? null : "V")} 
            className={`p-5 flex justify-between items-center cursor-pointer transition-all ${activeSection === "V" ? "bg-orange-50/50 border-b border-orange-100" : "hover:bg-gray-50"}`}
          >
            <div>
              <h2 className="text-base font-black text-[#4A1519]">SECTION V: International Engagement & Rankings Contribution</h2>
              <p className="text-[11px] text-gray-400 mt-0.5">Max Section mark: 10</p>
            </div>
            <span className="text-xs font-bold text-[#4A1519]">{activeSection === "V" ? "\u25B2 Collapse" : "\u25BC Expand"}</span>
          </div>
            <div className={`p-6 space-y-6 ${activeSection === "V" ? 'block' : 'hidden print-section'}`}>
              <DynamicArraySection
                title="5.1 International Engagement / MoU"
                subtitle="(Calculation Rubric: 1 mark per engagement | Max 2 marks)"
                rows={currentSectionData.internationalEngagement || []}
                canAdd={canAddInternationalEngagement(currentSectionData.internationalEngagement || [])}
                disabled={!isEditable}
                onAdd={() => addArrayRow("internationalEngagement", { institution: "", country: "", nature: "", status: "", evidenceLink: "" })}
                onChange={(rowId, field, value) => updateArrayRow("internationalEngagement", rowId, field, value)}
                onRemove={(rowId) => removeArrayRow("internationalEngagement", rowId)}
                columns={internationalEngagementColumns}
              />
              <DynamicArraySection
                title="5.2 Visiting / Adjunct Position Abroad"
                subtitle="(Calculation Rubric: Based on duration threshold | Max 4 marks)"
                rows={currentSectionData.visitingPositions || []}
                canAdd={canAddVisitingPositions(currentSectionData.visitingPositions || [])}
                disabled={!isEditable}
                onAdd={() => addArrayRow("visitingPositions", { institution: "", country: "", duration: "", period: "", evidenceLink: "" })}
                onChange={(rowId, field, value) => updateArrayRow("visitingPositions", rowId, field, value)}
                onRemove={(rowId) => removeArrayRow("visitingPositions", rowId)}
                columns={visitingPositionsColumns}
              />
              <DynamicArraySection
                title="5.3 Foreign Faculty / Student Hosted or Engaged"
                subtitle="(Calculation Rubric: 1 mark per engagement | Max 2 marks)"
                rows={currentSectionData.foreignFaculty || []}
                canAdd={canAddForeignFaculty(currentSectionData.foreignFaculty || [])}
                disabled={!isEditable}
                onAdd={() => addArrayRow("foreignFaculty", { name: "", institution: "", engagementType: "", period: "", evidenceLink: "" })}
                onChange={(rowId, field, value) => updateArrayRow("foreignFaculty", rowId, field, value)}
                onRemove={(rowId) => removeArrayRow("foreignFaculty", rowId)}
                columns={foreignFacultyColumns}
              />
              <DynamicArraySection
                title="5.4 QS / THE Reputation Survey Nominations Contribution"
                subtitle="(Calculation Rubric: 1 mark if submitted | Max 1 mark)"
                rows={currentSectionData.reputationSurvey || []}
                canAdd={canAddReputationSurvey(currentSectionData.reputationSurvey || [])}
                disabled={!isEditable}
                onAdd={() => addArrayRow("reputationSurvey", { surveyName: "", contributionDetails: "", evidenceSubmitted: "Yes", evidenceLink: "" })}
                onChange={(rowId, field, value) => updateArrayRow("reputationSurvey", rowId, field, value)}
                onRemove={(rowId) => removeArrayRow("reputationSurvey", rowId)}
                columns={reputationSurveyColumns}
              />
              <DynamicArraySection
                title="5.5 NIRF Survey Nomination"
                subtitle="(Calculation Rubric: 1 mark if submitted | Max 1 mark)"
                rows={currentSectionData.nirfSurvey || []}
                canAdd={canAddNirfSurvey(currentSectionData.nirfSurvey || [])}
                disabled={!isEditable}
                onAdd={() => addArrayRow("nirfSurvey", { nominationDetails: "", evidenceSubmitted: "Yes", evidenceLink: "" })}
                onChange={(rowId, field, value) => updateArrayRow("nirfSurvey", rowId, field, value)}
                onRemove={(rowId) => removeArrayRow("nirfSurvey", rowId)}
                columns={nirfSurveyColumns}
              />
            </div>
        </div>

      
        {/* Section VI Collapsible Card Container */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-4">
          <div 
            onClick={() => setActiveSection(activeSection === "VI" ? null : "VI")} 
            className={`p-5 flex justify-between items-center cursor-pointer transition-all ${activeSection === "VI" ? "bg-orange-50/50 border-b border-orange-100" : "hover:bg-gray-50"}`}
          >
            <div>
              <h2 className="text-base font-black text-[#4A1519]">SECTION VI: Faculty Development & Professional Activities</h2>
              <p className="text-[11px] text-gray-400 mt-0.5">Max Section mark: 20</p>
            </div>
            <span className="text-xs font-bold text-[#4A1519]">{activeSection === "VI" ? "\u25B2 Collapse" : "\u25BC Expand"}</span>
          </div>
            <div className={`p-6 space-y-6 ${activeSection === "VI" ? 'block' : 'hidden print-section'}`}>
              <DynamicArraySection
                title="6.1 FDP / STTP Attended (5 days and above)"
                subtitle="(Calculation Rubric: Per program = 2 marks | Max 3 marks)"
                rows={currentSectionData.fdpAttended || []}
                canAdd={canAddFdpAttended(currentSectionData.fdpAttended || [])}
                disabled={!isEditable}
                onAdd={() => addArrayRow("fdpAttended", { programName: "", organizer: "", duration: "", dateRange: "", endDate: "", evidenceLink: "" })}
                onChange={(rowId, field, value) => updateArrayRow("fdpAttended", rowId, field, value)}
                onRemove={(rowId) => removeArrayRow("fdpAttended", rowId)}
                columns={fdpAttendedColumns}
              />
              <DynamicArraySection
                title="6.2 Programs (FDP/STTP/Workshops/others) Organized"
                subtitle="(Calculation Rubric: Per program (>= 5 days) = 2; (2-4 days) = 1 | Max 4 marks)"
                rows={currentSectionData.programsOrganized || []}
                canAdd={canAddProgramsOrganized(currentSectionData.programsOrganized || [])}
                disabled={!isEditable}
                onAdd={() => addArrayRow("programsOrganized", { programName: "", days: "", dateRange: "", endDate: "", role: "Coordinator", participants: "", evidenceLink: "" })}
                onChange={(rowId, field, value) => updateArrayRow("programsOrganized", rowId, field, value)}
                onRemove={(rowId) => removeArrayRow("programsOrganized", rowId)}
                columns={programsOrganizedColumns}
              />
              <DynamicArraySection
                title="6.3 Resource Person / Keynote Speaker"
                subtitle="(Calculation Rubric: International = 2; National = 1 | Max 4 marks)"
                rows={currentSectionData.resourcePerson || []}
                canAdd={canAddResourcePerson(currentSectionData.resourcePerson || [])}
                disabled={!isEditable}
                onAdd={() => addArrayRow("resourcePerson", { eventName: "", level: "National", topic: "", date: "", evidenceLink: "" })}
                onChange={(rowId, field, value) => updateArrayRow("resourcePerson", rowId, field, value)}
                onRemove={(rowId) => removeArrayRow("resourcePerson", rowId)}
                columns={resourcePersonColumns}
              />
              <DynamicArraySection
                title="6.4 Professional Society Membership"
                subtitle="(Calculation Rubric: Active member = 1 | Max 1 mark)"
                rows={currentSectionData.professionalMembership || []}
                canAdd={canAddProfessionalMembership(currentSectionData.professionalMembership || [])}
                disabled={!isEditable}
                onAdd={() => addArrayRow("professionalMembership", { societyName: "", membershipType: "", status: "Active", evidenceLink: "" })}
                onChange={(rowId, field, value) => updateArrayRow("professionalMembership", rowId, field, value)}
                onRemove={(rowId) => removeArrayRow("professionalMembership", rowId)}
                columns={professionalMembershipColumns}
              />
              <DynamicArraySection
                title="6.5 Designation in Professional Body / Editorial Board"
                subtitle="(Calculation Rubric: Holds position = 2 | Max 2 marks)"
                rows={currentSectionData.editorialBoard || []}
                canAdd={canAddEditorialBoard(currentSectionData.editorialBoard || [])}
                disabled={!isEditable}
                onAdd={() => addArrayRow("editorialBoard", { bodyName: "", position: "", period: "", evidenceLink: "" })}
                onChange={(rowId, field, value) => updateArrayRow("editorialBoard", rowId, field, value)}
                onRemove={(rowId) => removeArrayRow("editorialBoard", rowId)}
                columns={editorialBoardColumns}
              />
              <DynamicArraySection
                title="6.6 MOOCs Content Developed (TCE MOOC)"
                subtitle="(Calculation Rubric: Per course = 3 | Max 6 marks)"
                rows={currentSectionData.moocDeveloped || []}
                canAdd={canAddMoocDeveloped(currentSectionData.moocDeveloped || [])}
                disabled={!isEditable}
                onAdd={() => addArrayRow("moocDeveloped", { courseName: "", courseId: "", weeks: "", coFacultyCount: "", takersCount: "", evidenceLink: "" })}
                onChange={(rowId, field, value) => updateArrayRow("moocDeveloped", rowId, field, value)}
                onRemove={(rowId) => removeArrayRow("moocDeveloped", rowId)}
                columns={moocDevelopedColumns}
              />
            </div>
        </div>

        {/* Section VII Collapsible Card Container */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-4">
          <div 
            onClick={() => setActiveSection(activeSection === "VII" ? null : "VII")} 
            className={`p-5 flex justify-between items-center cursor-pointer transition-all ${activeSection === "VII" ? "bg-orange-50/50 border-b border-orange-100" : "hover:bg-gray-50"}`}
          >
            <div>
              <h2 className="text-base font-black text-[#4A1519]">SECTION VII: Industry Interaction & Internship</h2>
              <p className="text-[11px] text-gray-400 mt-0.5">Max Section mark: 10</p>
            </div>
            <span className="text-xs font-bold text-[#4A1519]">{activeSection === "VII" ? "\u25B2 Collapse" : "\u25BC Expand"}</span>
          </div>
            <div className={`p-6 space-y-6 ${activeSection === "VII" ? 'block' : 'hidden print-section'}`}>
              <DynamicArraySection
                title="7.1 Partial delivery of regular courses by industry experts"
                subtitle="(Calculation Rubric: >=6 hrs = 3; 3 hrs = 2; 1-2 hrs = 1 | Max 4 marks)"
                rows={currentSectionData.partialDelivery || []}
                canAdd={canAddPartialDelivery(currentSectionData.partialDelivery || [])}
                disabled={!isEditable}
                onAdd={() => addArrayRow("partialDelivery", { courseDetails: "", mode: "Offline", industryName: "", expertDetails: "", duration: "", date: "", evidenceLink: "" })}
                onChange={(rowId, field, value) => updateArrayRow("partialDelivery", rowId, field, value)}
                onRemove={(rowId) => removeArrayRow("partialDelivery", rowId)}
                columns={partialDeliveryColumns}
              />
              <DynamicArraySection
                title="7.2 Accompanying Industrial Visit"
                subtitle="(Calculation Rubric: Per visit = 1 | Max 2 marks)"
                rows={currentSectionData.industrialVisits || []}
                canAdd={canAddIndustrialVisits(currentSectionData.industrialVisits || [])}
                disabled={!isEditable}
                onAdd={() => addArrayRow("industrialVisits", { visitDetails: "", industry: "", studentsCount: "", date: "", evidenceLink: "" })}
                onChange={(rowId, field, value) => updateArrayRow("industrialVisits", rowId, field, value)}
                onRemove={(rowId) => removeArrayRow("industrialVisits", rowId)}
                columns={industrialVisitsColumns}
              />
              <DynamicArraySection
                title="7.3 Faculty Internship in Industries"
                subtitle="(Calculation Rubric: >=10 days = 3; 5-7 days = 2; 2-4 days = 1 | Max 3 marks)"
                rows={currentSectionData.facultyInternships || []}
                canAdd={canAddFacultyInternships(currentSectionData.facultyInternships || [])}
                disabled={!isEditable}
                onAdd={() => addArrayRow("facultyInternships", { industryName: "", duration: "", purpose: "", evidenceLink: "" })}
                onChange={(rowId, field, value) => updateArrayRow("facultyInternships", rowId, field, value)}
                onRemove={(rowId) => removeArrayRow("facultyInternships", rowId)}
                columns={facultyInternshipsColumns}
              />
              <DynamicArraySection
                title="7.4 Employer / Alumni Engagement Activity"
                subtitle="(Calculation Rubric: Per activity = 1 | Max 1 mark)"
                rows={currentSectionData.employerEngagement || []}
                canAdd={canAddEmployerEngagement(currentSectionData.employerEngagement || [])}
                disabled={!isEditable}
                onAdd={() => addArrayRow("employerEngagement", { activityName: "", involvedParty: "", date: "", evidenceLink: "" })}
                onChange={(rowId, field, value) => updateArrayRow("employerEngagement", rowId, field, value)}
                onRemove={(rowId) => removeArrayRow("employerEngagement", rowId)}
                columns={employerEngagementColumns}
              />
            </div>
        </div>

        {/* Section VIII Collapsible Card Container */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-4">
          <div 
            onClick={() => setActiveSection(activeSection === "VIII" ? null : "VIII")} 
            className={`p-5 flex justify-between items-center cursor-pointer transition-all ${activeSection === "VIII" ? "bg-orange-50/50 border-b border-orange-100" : "hover:bg-gray-50"}`}
          >
            <div>
              <h2 className="text-base font-black text-[#4A1519]">SECTION VIII: Student Development Activities</h2>
              <p className="text-[11px] text-gray-400 mt-0.5">Max Section mark: 5</p>
            </div>
            <span className="text-xs font-bold text-[#4A1519]">{activeSection === "VIII" ? "\u25B2 Collapse" : "\u25BC Expand"}</span>
          </div>
            <div className={`p-6 space-y-6 ${activeSection === "VIII" ? 'block' : 'hidden print-section'}`}>
              <DynamicArraySection
                title="8.1 UG/PG Student Project Publication- Journal/ Conference (Scopus indexed)"
                subtitle="(Calculation Rubric: Per publication = 2 | Max 2 marks)"
                rows={currentSectionData.projectPublications || []}
                canAdd={canAddProjectPublications(currentSectionData.projectPublications || [])}
                disabled={!isEditable}
                onAdd={() => addArrayRow("projectPublications", { title: "", students: "", journalDetails: "", date: "", evidenceLink: "" })}
                onChange={(rowId, field, value) => updateArrayRow("projectPublications", rowId, field, value)}
                onRemove={(rowId) => removeArrayRow("projectPublications", rowId)}
                columns={projectPublicationsColumns}
              />
              <DynamicArraySection
                title="8.2 Hackathon / Competition Mentoring"
                subtitle="(Calculation Rubric: Per event = 1 | Max 2 marks)"
                rows={currentSectionData.hackathonMentoring || []}
                canAdd={canAddHackathonMentoring(currentSectionData.hackathonMentoring || [])}
                disabled={!isEditable}
                onAdd={() => addArrayRow("hackathonMentoring", { eventName: "", students: "", outcome: "", dateRange: "", evidenceLink: "" })}
                onChange={(rowId, field, value) => updateArrayRow("hackathonMentoring", rowId, field, value)}
                onRemove={(rowId) => removeArrayRow("hackathonMentoring", rowId)}
                columns={hackathonMentoringColumns}
              />
              <DynamicArraySection
                title="8.3 Startup / Incubation Support / Tech-Club"
                subtitle="(Calculation Rubric: Active mentoring = 1 | Max 1 mark)"
                rows={currentSectionData.startupSupport || []}
                canAdd={canAddStartupSupport(currentSectionData.startupSupport || [])}
                disabled={!isEditable}
                onAdd={() => addArrayRow("startupSupport", { startupName: "", role: "", duration: "", evidenceLink: "" })}
                onChange={(rowId, field, value) => updateArrayRow("startupSupport", rowId, field, value)}
                onRemove={(rowId) => removeArrayRow("startupSupport", rowId)}
                columns={startupSupportColumns}
              />
            </div>
        </div>

        {/* Section IX Collapsible Card Container */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-4">
          <div 
            onClick={() => setActiveSection(activeSection === "IX" ? null : "IX")} 
            className={`p-5 flex justify-between items-center cursor-pointer transition-all ${activeSection === "IX" ? "bg-orange-50/50 border-b border-orange-100" : "hover:bg-gray-50"}`}
          >
            <div>
              <h2 className="text-base font-black text-[#4A1519]">SECTION IX: Institutional Development</h2>
              <p className="text-[11px] text-gray-400 mt-0.5">Max Section mark: 20</p>
            </div>
            <span className="text-xs font-bold text-[#4A1519]">{activeSection === "IX" ? "\u25B2 Collapse" : "\u25BC Expand"}</span>
          </div>
            <div className={`p-6 space-y-6 ${activeSection === "IX" ? 'block' : 'hidden print-section'}`}>
              <DynamicArraySection
                title="9.1 Department Level Activities"
                subtitle="(Calculation Rubric: DLCs and File Maintenance = 5; Dept. Activity & File Maintenance = 2 per Activity | Max 10 marks)"
                rows={currentSectionData.deptActivities || []}
                canAdd={canAddDeptActivities(currentSectionData.deptActivities || [])}
                disabled={!isEditable}
                onAdd={() => addArrayRow("deptActivities", { description: "", type: "Dept. Activity & File Maintenance", role: "Major", approval: "Yes", evidenceLink: "" })}
                onChange={(rowId, field, value) => updateArrayRow("deptActivities", rowId, field, value)}
                onRemove={(rowId) => removeArrayRow("deptActivities", rowId)}
                columns={deptActivitiesColumns}
              />
              <DynamicArraySection
                title="9.2 College Level Activities"
                subtitle="(Calculation Rubric: Committee Member = 3; Internal Review Committee = 5; CLCs/Warden = 7; Deans/Registrar/CoE = 10 | Max 10 marks)"
                rows={currentSectionData.collegeActivities || []}
                canAdd={canAddCollegeActivities(currentSectionData.collegeActivities || [])}
                disabled={!isEditable}
                onAdd={() => addArrayRow("collegeActivities", { description: "", category: "Committee Member", role: "Major", approval: "Yes", evidenceLink: "" })}
                onChange={(rowId, field, value) => updateArrayRow("collegeActivities", rowId, field, value)}
                onRemove={(rowId) => removeArrayRow("collegeActivities", rowId)}
                columns={collegeActivitiesColumns}
              />
              <DynamicArraySection
                title="9.3 Administrative Responsibilities"
                subtitle="(Calculation Rubric: Registrar / Deans / CoE / Head IQAC / HoDs = 20 | Max 20 marks)"
                rows={currentSectionData.adminResponsibilities || []}
                canAdd={canAddAdminResponsibilities(currentSectionData.adminResponsibilities || [])}
                disabled={!isEditable}
                onAdd={() => addArrayRow("adminResponsibilities", { role: "HoD", evidenceLink: "" })}
                onChange={(rowId, field, value) => updateArrayRow("adminResponsibilities", rowId, field, value)}
                onRemove={(rowId) => removeArrayRow("adminResponsibilities", rowId)}
                columns={adminResponsibilitiesColumns}
              />
            </div>
        </div>

        {/* RELOCATED SUBMIT BUTTON BOX - FOR SECTIONS 1 TO 9 */}
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm shadow-black/5 mt-4 print-hidden">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-medium text-slate-700">
                Submit this Section I to IX appraisal to the HoD when your added rows are complete.
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                Empty sections are allowed and will be ignored automatically.
              </p>
              {submitError ? (
                <p className="mt-1 text-xs font-medium text-rose-600">{submitError}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={handleSaveAndSubmit}
              disabled={isSubmitting || !isEditable}
              className="inline-flex h-8 items-center justify-center rounded-md bg-[#4A1519] px-3 text-xs font-semibold text-white transition hover:bg-[#5a1c22] disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
            >
              {isSubmitting ? 'Submitting…' : !isEditable ? 'Submitted (Locked)' : 'Submit to HOD'}
            </button>
          </div>
        </div>

      </div>

      <aside className="xl:sticky xl:top-6 xl:self-start">
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm shadow-black/5">
          <div className="flex flex-col gap-2 items-start justify-between sm:flex-row sm:items-center">
            <div>
              <p className="text-sm font-bold uppercase tracking-wide text-gray-700">
                Scoreboard
              </p>
              <h3 className="mt-1 text-lg font-semibold text-slate-900">
                Summary
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setActiveView('overview')}
              className="text-xs py-1 px-2.5 h-7 bg-white border border-slate-300 rounded-md font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition"
            >
              Back
            </button>
          </div>

          {/* Section I Score Block Row */}
          <div className="border-b border-gray-100 pb-3 mb-3 mt-3">
            <div 
              onClick={() => setActiveSection(activeSection === 'I' ? null : 'I')} 
              className="flex justify-between items-center cursor-pointer font-bold text-xs text-gray-800 uppercase tracking-wider mb-2"
            >
              <span>Section I Subtotal</span>
              <span className="text-[#4A1519]">{scores.total || 0} / 50</span>
            </div>
            {activeSection === 'I' && (
              <div className="print-hidden space-y-1.5 text-[11px] text-gray-500 font-medium pl-1 mt-2">
                {scoreboardItems.map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1.5"
                  >
                    <div>
                      <p className="text-xs font-medium text-gray-700">{item.label}</p>
                      <p className="text-[10px] uppercase tracking-wider text-gray-400">
                        Max {item.max}
                      </p>
                    </div>
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wider ${getScoreBadgeClass(
                        item.value,
                        item.max
                      )}`}
                    >
                      {item.value} / {item.max}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section II Score Block Row */}
          <div>
            <div 
              onClick={() => setActiveSection(activeSection === 'II' ? null : 'II')} 
              className="flex justify-between items-center cursor-pointer font-bold text-xs text-gray-800 uppercase tracking-wider mb-2"
            >
              <span>Section II Subtotal</span>
              <span className="text-[#4A1519]">{scores.section2Total || 0} / 55</span>
            </div>
            {activeSection === 'II' && (
              <div className="print-hidden space-y-2 text-xs font-medium text-gray-600 mt-2 pl-1">
                <div className="flex justify-between"><span>2.1 Journal Papers (SCI/Scopus)</span><span className="font-bold text-gray-800">{scores.sub2_1 || 0} / 15</span></div>
                <div className="flex justify-between"><span>2.2 Citations (Last 3 Years)</span><span className="font-bold text-gray-800">{scores.sub2_2 || 0} / 8</span></div>
                <div className="flex justify-between"><span>2.3 Total Q1 Citations</span><span className="font-bold text-gray-800">{scores.sub2_3 || 0} / 7</span></div>
                <div className="flex justify-between"><span>2.4 Books / Chapters</span><span className="font-bold text-gray-800">{scores.sub2_4 || 0} / 5</span></div>
                <div className="flex justify-between"><span>2.5 Conference Publications</span><span className="font-bold text-gray-800">{scores.sub2_5 || 0} / 4</span></div>
                <div className="flex justify-between"><span>2.6 Research Collaborations</span><span className="font-bold text-gray-800">{scores.sub2_6 || 0} / 5</span></div>
                <div className="flex justify-between"><span>2.7 PhD Scholars (Registered)</span><span className="font-bold text-gray-800">{scores.sub2_7 || 0} / 5</span></div>
                <div className="flex justify-between"><span>2.8 PhD Scholars (Awarded)</span><span className="font-bold text-gray-800">{scores.sub2_8 || 0} / 6</span></div>
              </div>
            )}
          </div>
          {/* Section III Score Block Row */}
          <div className="border-t border-gray-100 pt-3 mt-3">
            <div 
              onClick={() => setActiveSection(activeSection === "III" ? null : "III")} 
              className="flex justify-between items-center cursor-pointer font-bold text-xs text-gray-800 uppercase tracking-wider mb-2"
            >
              <span>Section III Subtotal</span>
              <span className="text-[#4A1519]">{scores.section3Total || 0} / 15</span>
            </div>
            {activeSection === "III" && (
              <div className="print-hidden space-y-2 text-xs font-medium text-gray-600 mt-2 pl-1">
                <div className="flex justify-between"><span>3.1 Patents Published</span><span className="font-bold text-gray-800">{scores.sub3_1 || 0} / 2</span></div>
                <div className="flex justify-between"><span>3.2 Patents Granted</span><span className="font-bold text-gray-800">{scores.sub3_2 || 0} / 6</span></div>
                <div className="flex justify-between"><span>3.3 Transfer of Technology</span><span className="font-bold text-gray-800">{scores.sub3_3 || 0} / 3</span></div>
                <div className="flex justify-between"><span>3.4 Prototypes</span><span className="font-bold text-gray-800">{scores.sub3_4 || 0} / 2</span></div>
                <div className="flex justify-between"><span>3.5 Hackathons Mentoring</span><span className="font-bold text-gray-800">{scores.sub3_5 || 0} / 2</span></div>
              </div>
            )}
          </div>

          {/* Section IV Score Block Row */}
          <div className="border-t border-gray-100 pt-3 mt-3">
            <div 
              onClick={() => setActiveSection(activeSection === "IV" ? null : "IV")} 
              className="flex justify-between items-center cursor-pointer font-bold text-xs text-gray-800 uppercase tracking-wider mb-2"
            >
              <span>Section IV Subtotal</span>
              <span className="text-[#4A1519]">{scores.section4Total || 0} / 15</span>
            </div>
            {activeSection === "IV" && (
              <div className="print-hidden space-y-2 text-xs font-medium text-gray-600 mt-2 pl-1">
                <div className="flex justify-between"><span>4.1 Research Projects</span><span className="font-bold text-gray-800">{scores.sub4_1 || 0} / 8</span></div>
                <div className="flex justify-between"><span>4.2 Consultancy Projects</span><span className="font-bold text-gray-800">{scores.sub4_2 || 0} / 7</span></div>
              </div>
            )}
          </div>

          {/* Section V Score Block Row */}
          <div className="border-t border-gray-100 pt-3 mt-3 pb-3 mb-3">
            <div 
              onClick={() => setActiveSection(activeSection === "V" ? null : "V")} 
              className="flex justify-between items-center cursor-pointer font-bold text-xs text-gray-800 uppercase tracking-wider mb-2"
            >
              <span>Section V Subtotal</span>
              <span className="text-[#4A1519]">{scores.section5Total || 0} / 10</span>
            </div>
            {activeSection === "V" && (
              <div className="print-hidden space-y-2 text-xs font-medium text-gray-600 mt-2 pl-1">
                <div className="flex justify-between"><span>5.1 Int. Engagement</span><span className="font-bold text-gray-800">{scores.sub5_1 || 0} / 2</span></div>
                <div className="flex justify-between"><span>5.2 Visiting Abroad</span><span className="font-bold text-gray-800">{scores.sub5_2 || 0} / 4</span></div>
                <div className="flex justify-between"><span>5.3 Hosted Faculty</span><span className="font-bold text-gray-800">{scores.sub5_3 || 0} / 2</span></div>
                <div className="flex justify-between"><span>5.4 QS Survey</span><span className="font-bold text-gray-800">{scores.sub5_4 || 0} / 1</span></div>
                <div className="flex justify-between"><span>5.5 NIRF Survey</span><span className="font-bold text-gray-800">{scores.sub5_5 || 0} / 1</span></div>
              </div>
            )}
          </div>

          {/* Section VI Score Block Row */}
          <div className="border-t border-gray-100 pt-3 mt-3">
            <div 
              onClick={() => setActiveSection(activeSection === "VI" ? null : "VI")} 
              className="flex justify-between items-center cursor-pointer font-bold text-xs text-gray-800 uppercase tracking-wider mb-2"
            >
              <span>Section VI Subtotal</span>
              <span className="text-[#4A1519]">{scores.section6Total || 0} / 20</span>
            </div>
            {activeSection === "VI" && (
              <div className="print-hidden space-y-2 text-xs font-medium text-gray-600 mt-2 pl-1">
                <div className="flex justify-between"><span>6.1 FDP Attended</span><span className="font-bold text-gray-800">{scores.sub6_1 || 0} / 3</span></div>
                <div className="flex justify-between"><span>6.2 Programs Organized</span><span className="font-bold text-gray-800">{scores.sub6_2 || 0} / 4</span></div>
                <div className="flex justify-between"><span>6.3 Resource Person</span><span className="font-bold text-gray-800">{scores.sub6_3 || 0} / 4</span></div>
                <div className="flex justify-between"><span>6.4 Society Membership</span><span className="font-bold text-gray-800">{scores.sub6_4 || 0} / 1</span></div>
                <div className="flex justify-between"><span>6.5 Designation Positions</span><span className="font-bold text-gray-800">{scores.sub6_5 || 0} / 2</span></div>
                <div className="flex justify-between"><span>6.6 MOOC Developed</span><span className="font-bold text-gray-800">{scores.sub6_6 || 0} / 6</span></div>
              </div>
            )}
          </div>

          {/* Section VII Score Block Row */}
          <div className="border-t border-gray-100 pt-3 mt-3">
            <div 
              onClick={() => setActiveSection(activeSection === "VII" ? null : "VII")} 
              className="flex justify-between items-center cursor-pointer font-bold text-xs text-gray-800 uppercase tracking-wider mb-2"
            >
              <span>Section VII Subtotal</span>
              <span className="text-[#4A1519]">{scores.section7Total || 0} / 10</span>
            </div>
            {activeSection === "VII" && (
              <div className="print-hidden space-y-2 text-xs font-medium text-gray-600 mt-2 pl-1">
                <div className="flex justify-between"><span>7.1 Expert Deliveries</span><span className="font-bold text-gray-800">{scores.sub7_1 || 0} / 4</span></div>
                <div className="flex justify-between"><span>7.2 Industrial Visits</span><span className="font-bold text-gray-800">{scores.sub7_2 || 0} / 2</span></div>
                <div className="flex justify-between"><span>7.3 Faculty Internships</span><span className="font-bold text-gray-800">{scores.sub7_3 || 0} / 3</span></div>
                <div className="flex justify-between"><span>7.4 Employer Engagement</span><span className="font-bold text-gray-800">{scores.sub7_4 || 0} / 1</span></div>
              </div>
            )}
          </div>

          {/* Section VIII Score Block Row */}
          <div className="border-t border-gray-100 pt-3 mt-3">
            <div 
              onClick={() => setActiveSection(activeSection === "VIII" ? null : "VIII")} 
              className="flex justify-between items-center cursor-pointer font-bold text-xs text-gray-800 uppercase tracking-wider mb-2"
            >
              <span>Section VIII Subtotal</span>
              <span className="text-[#4A1519]">{scores.section8Total || 0} / 5</span>
            </div>
            {activeSection === "VIII" && (
              <div className="print-hidden space-y-2 text-xs font-medium text-gray-600 mt-2 pl-1">
                <div className="flex justify-between"><span>8.1 Project Publications</span><span className="font-bold text-gray-800">{scores.sub8_1 || 0} / 2</span></div>
                <div className="flex justify-between"><span>8.2 Hackathon Mentoring</span><span className="font-bold text-gray-800">{scores.sub8_2 || 0} / 2</span></div>
                <div className="flex justify-between"><span>8.3 Startup Support</span><span className="font-bold text-gray-800">{scores.sub8_3 || 0} / 1</span></div>
              </div>
            )}
          </div>

          {/* Section IX Score Block Row */}
          <div className="border-t border-gray-100 pt-3 mt-3 pb-3 mb-3">
            <div 
              onClick={() => setActiveSection(activeSection === "IX" ? null : "IX")} 
              className="flex justify-between items-center cursor-pointer font-bold text-xs text-gray-800 uppercase tracking-wider mb-2"
            >
              <span>Section IX Subtotal</span>
              <span className="text-[#4A1519]">{scores.section9Total || 0} / 20</span>
            </div>
            {activeSection === "IX" && (
              <div className="print-hidden space-y-2 text-xs font-medium text-gray-600 mt-2 pl-1">
                <div className="flex justify-between"><span>9.1 Dept. Activities</span><span className="font-bold text-gray-800">{scores.sub9_1 || 0} / 10</span></div>
                <div className="flex justify-between"><span>9.2 College Activities</span><span className="font-bold text-gray-800">{scores.sub9_2 || 0} / 10</span></div>
                <div className="flex justify-between"><span>9.3 Admin Responsibilities</span><span className="font-bold text-gray-800">{scores.sub9_3 || 0} / 20</span></div>
              </div>
            )}
          </div>

          <div className="mt-3 rounded-lg bg-gradient-to-br from-[#4A1519] to-[#3B1013] px-3 py-3 text-white">
            <p className="text-xs font-semibold uppercase tracking-wider text-white/65">
              Total Score
            </p>
            <p className="mt-2 text-3xl font-semibold">
              {scores.grandTotal || 0}
              <span className="ml-1 text-sm font-medium text-white/65">/ 200</span>
            </p>
            <p className="mt-1 text-xs leading-4 text-white/75">
              Current / 200 Max
            </p>
          </div>
        </div>
      </aside>
    </div>
  );


  return (
    <>
      <div className="min-h-screen bg-[#F5F3F2] interactive-ui">
      <div className="w-full flex flex-col font-sans">
        {/* Top Banner Row: Full-width White Background */}
        <div className="w-full bg-white px-6 py-2 flex items-center justify-between border-b border-gray-200 select-none">
          
          {/* Left Side: Uncompressed Logos */}
          <img
            src={tceBanner}
            alt="TCE Header"
            onClick={() => setActiveView('overview')}
            className="h-12 w-auto object-contain object-left cursor-pointer transition-opacity hover:opacity-90 active:scale-[0.98]"
          />
          
          {/* Right Side: Controls, Profile & Actions */}
          <div className="flex items-center space-x-3">

            {/* Master Role Switcher Bar (Super-Admin Privilege) */}
            {isSuperAdmin && (
              <div className="flex items-center bg-amber-50/90 p-1 rounded-xl border border-amber-300 shadow-sm">
                <span className="text-[10px] font-black uppercase text-amber-900 px-2 flex items-center gap-1">
                  <span>👑</span> Role:
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setAdminActiveRole('Principal');
                    setActiveView('overview');
                  }}
                  className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all flex items-center gap-1 ${
                    effectiveRole === 'Principal'
                      ? 'bg-[#4A1519] text-white shadow-sm'
                      : 'text-amber-950 hover:bg-amber-100'
                  }`}
                >
                  <span>🎓</span>
                  <span>Principal</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAdminActiveRole('Registrar');
                    setActiveView('overview');
                  }}
                  className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all flex items-center gap-1 ${
                    effectiveRole === 'Registrar'
                      ? 'bg-[#4A1519] text-white shadow-sm'
                      : 'text-amber-950 hover:bg-amber-100'
                  }`}
                >
                  <span>🏛️</span>
                  <span>Registrar</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAdminActiveRole('IQAC');
                    setActiveView('overview');
                  }}
                  className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all flex items-center gap-1 ${
                    effectiveRole === 'IQAC'
                      ? 'bg-[#4A1519] text-white shadow-sm'
                      : 'text-amber-950 hover:bg-amber-100'
                  }`}
                >
                  <span>📊</span>
                  <span>IQAC</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAdminActiveRole('HOD');
                    setHodWorkspaceMode('hod_inbox');
                    setActiveView('overview');
                  }}
                  className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all flex items-center gap-1 ${
                    effectiveRole === 'HOD'
                      ? 'bg-[#4A1519] text-white shadow-sm'
                      : 'text-amber-950 hover:bg-amber-100'
                  }`}
                >
                  <span>🏢</span>
                  <span>HoD</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAdminActiveRole('Faculty');
                    setActiveView('overview');
                  }}
                  className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all flex items-center gap-1 ${
                    effectiveRole === 'Faculty'
                      ? 'bg-[#4A1519] text-white shadow-sm'
                      : 'text-amber-950 hover:bg-amber-100'
                  }`}
                >
                  <span>📋</span>
                  <span>Faculty</span>
                </button>
              </div>
            )}

            {/* HoD & IQAC Mode Switcher (HOD Review Queue | Self-Appraisal | IQAC Audit) */}
            {(effectiveRole === 'HOD' || effectiveRole === 'IQAC' || user?.role === 'IQAC') && (
              <div className="flex items-center bg-gray-100 p-1 rounded-xl border border-gray-200 shadow-inner">
                <button
                  type="button"
                  onClick={() => {
                    setHodWorkspaceMode('hod_inbox');
                    setIqacWorkspaceMode('hod_inbox');
                    setActiveView('overview');
                  }}
                  className={`px-3 py-1 rounded-lg font-bold text-[11px] transition-all flex items-center gap-1.5 ${
                    (effectiveRole === 'IQAC' || user?.role === 'IQAC')
                      ? iqacWorkspaceMode === 'hod_inbox' ? 'bg-[#4A1519] text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
                      : hodWorkspaceMode === 'hod_inbox' ? 'bg-[#4A1519] text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <span>🏢</span>
                  <span>HOD Review Queue</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setHodWorkspaceMode('self_appraisal');
                    setIqacWorkspaceMode('self_appraisal');
                    setActiveView('overview');
                  }}
                  className={`px-3 py-1 rounded-lg font-bold text-[11px] transition-all flex items-center gap-1.5 ${
                    (effectiveRole === 'IQAC' || user?.role === 'IQAC')
                      ? iqacWorkspaceMode === 'self_appraisal' ? 'bg-[#4A1519] text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
                      : hodWorkspaceMode === 'self_appraisal' ? 'bg-[#4A1519] text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <span>📋</span>
                  <span>Self-Appraisal</span>
                </button>

                {(effectiveRole === 'IQAC' || user?.role === 'IQAC') && (
                  <button
                    type="button"
                    onClick={() => {
                      setIqacWorkspaceMode('iqac_audit');
                      setActiveView('overview');
                    }}
                    className={`px-3 py-1 rounded-lg font-bold text-[11px] transition-all flex items-center gap-1.5 ${
                      iqacWorkspaceMode === 'iqac_audit'
                        ? 'bg-[#4A1519] text-white shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    <span>📊</span>
                    <span>IQAC Audit</span>
                  </button>
                )}
              </div>
            )}

            {/* Institutional Leadership & HoD Handover Button */}
            {(hasHodPrivileges || isSuperAdmin) && (
              <button 
                type="button"
                onClick={() => setIsLeadershipModalOpen(true)}
                className="text-[11px] font-bold text-[#4A1519] bg-amber-50 hover:bg-amber-100 border border-amber-300 shadow-sm rounded-full px-3.5 py-1.5 transition-all flex items-center space-x-1.5"
              >
                <span>🏛️</span>
                <span>Leadership & Handover</span>
              </button>
            )}

            {/* User Profile Rounded Badge Box */}
            <div className="flex items-center space-x-3 bg-[#4A1519] px-3 py-1.5 rounded-xl shadow-sm border border-red-950/20 text-left">
              <div className="w-8 h-8 rounded-xl bg-white/10 text-white font-black text-sm flex items-center justify-center border border-white/20 uppercase shadow-inner">
                {user.name?.charAt(0) || 'U'}
              </div>
              <div className="leading-tight">
                <p className="text-xs font-bold text-white tracking-wide">{user.name}</p>
                <p className="text-[10px] text-red-200/80 font-medium">{user.email}</p>
              </div>
            </div>

            {/* Role / Designation Capsule Pill */}
            <span className={`text-[9px] font-black tracking-widest px-3 py-1.5 rounded-full uppercase border shadow-sm ${
              isPrincipal
                ? 'bg-purple-900 text-purple-100 border-purple-800'
                : isRegistrar
                  ? 'bg-purple-950 text-purple-200 border-purple-900/40'
                  : isIQAC
                    ? 'bg-blue-950 text-blue-100 border-blue-900/40'
                    : effectiveRole === 'HOD' 
                      ? 'bg-red-950 text-red-200 border-red-900/40' 
                      : 'bg-[#3B1013] text-red-100/90 border-red-950/50'
            }`}>
              {isPrincipal 
                ? 'Principal' 
                : isRegistrar 
                  ? 'Registrar' 
                  : isIQAC
                    ? 'IQAC Quality Coordinator'
                    : effectiveRole === 'HOD' 
                      ? 'Professor & Head (HOD)' 
                      : (user.designation && user.designation !== 'Registrar' && user.designation !== 'Principal' && user.designation !== 'IQAC Quality Coordinator' ? user.designation : 'Assistant Professor')}
            </span>

            {/* Special Condition Correction Badge (Only shows if required) */}
            {effectiveRole === 'Faculty' && activeTimelineRecord?.appraisalStatus === 'Not Approved' && (
              <span className="text-[9px] font-black bg-rose-50 text-rose-700 px-2.5 py-1.5 rounded-full uppercase border border-rose-200 shadow-sm animate-pulse">
                ⚠ Fix Needed
              </span>
            )}
            {effectiveRole === 'Faculty' && activeTimelineRecord?.appraisalStatus === 'Approved' && (
              <span className="text-[9px] font-black bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded uppercase border border-emerald-200">
                ✔ Approved
              </span>
            )}

            {/* Distinct White Capsule Sign Out Button */}
            <button 
              onClick={onSignOut} 
              className="text-[11px] font-bold text-[#4A1519] bg-white border border-gray-200 shadow-md rounded-full px-4 py-1.5 hover:bg-gray-50 hover:border-gray-300 transition-all font-sans"
            >
              Sign Out
            </button>

          </div>
        </div>

        {/* Bottom Sub-Header Row: Dark Maroon Control Bar */}
        <div className="w-full bg-[#4A1519] text-white px-6 py-2 shadow-sm border-b border-red-950/20 flex items-center justify-between">
          <span className="text-xs font-black tracking-wider uppercase opacity-95 flex items-center gap-2">
            {isPrincipal
              ? '🎓 PRINCIPAL APEX EXECUTIVE WORKBENCH (CAMPUS-WIDE ACCREDITATION & ANALYTICS)'
              : isRegistrar
                ? '🏛️ REGISTRAR INSTITUTIONAL GOVERNANCE WORKBENCH (CAMPUS-WIDE OVERSIGHT)'
                : isIQAC
                  ? '📊 IQAC ACCREDITATION & QUALITY AUDIT WORKBENCH (NAAC / NIRF BENCHMARKING)'
                  : effectiveRole === 'HOD' && hodWorkspaceMode === 'self_appraisal'
                    ? '📋 HOD SELF-APPRAISAL WORKBENCH (FACULTY MODE)'
                    : effectiveRole === 'HOD'
                      ? '🏢 HEAD OF DEPARTMENT EVALUATION WORKBENCH'
                      : '📋 FACULTY APPRAISAL WORKBENCH'}
          </span>
          <span className="text-[11px] font-semibold text-red-200">
            {isPrincipal || isRegistrar || isIQAC
              ? 'Institution-Wide Oversight • 16 Academic Departments'
              : user.department
                ? `Department of ${user.department} ${user.departmentName ? `• ${user.departmentName}` : ''}`
                : ''}
          </span>
        </div>
      </div>

      <main className="mx-auto w-full max-w-7xl px-6 py-8 lg:px-8">
        {effectiveRole === 'Faculty' && user?.isEligibleForAppraisal === false ? (
          <div className="max-w-4xl mx-auto my-8 p-8 bg-white rounded-2xl border border-slate-200 shadow-xl space-y-6 animate-in fade-in duration-300">
            <div className="flex items-center gap-4 border-b border-slate-100 pb-5">
              <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 text-2xl font-black shadow-inner flex-shrink-0">
                ⏳
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="bg-amber-100 text-amber-800 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full">
                    Service Eligibility Notice
                  </span>
                  <span className="text-xs text-slate-400 font-medium">TCE Governance Policy</span>
                </div>
                <h2 className="text-xl font-black text-slate-800 mt-1">Appraisal Workbench Locked (Probation Period)</h2>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Annual performance appraisal is accessible after completing 1 full year (365 days) of continuous college service.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200/80">
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-400">Faculty Name</p>
                <p className="text-sm font-extrabold text-slate-800 mt-0.5 truncate">{user?.name || 'Faculty Member'}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-400">Department</p>
                <p className="text-sm font-extrabold text-slate-800 mt-0.5">{user?.departmentName || user?.department || 'MCA'}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-400">Date of Joining (DOJ)</p>
                <p className="text-sm font-extrabold text-slate-800 mt-0.5">{user?.joiningDate || 'Pending Records'}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-400">Completed Service</p>
                <p className="text-sm font-extrabold text-amber-700 mt-0.5">{user?.monthsOfService || 0} Months ({user?.serviceDays || 0} Days)</p>
              </div>
            </div>

            <div className="p-5 bg-gradient-to-r from-amber-500/10 via-maroon-500/5 to-amber-500/10 rounded-xl border border-amber-300 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="space-y-1 text-center sm:text-left">
                <p className="text-xs font-extrabold text-amber-900 uppercase tracking-wider">Automated Unlock Date</p>
                <p className="text-lg font-black text-[#4A1519]">
                  Unlocks on: {user?.unlockDate || '1 Year From DOJ'}
                </p>
                <p className="text-[11px] text-slate-600 font-medium">
                  Your account is active. On your 365th day of service, your self-appraisal workbench will automatically open.
                </p>
              </div>
              <div className="bg-white px-4 py-2 rounded-lg border border-amber-200 shadow-sm text-center flex-shrink-0">
                <p className="text-[10px] font-bold uppercase text-slate-400">Days Remaining</p>
                <p className="text-2xl font-black text-amber-600 mt-0.5">{Math.max(0, 365 - (user?.serviceDays || 0))}</p>
              </div>
            </div>
          </div>
        ) : isReviewMode ? (
          renderOverview()
        ) : (
          <>
            {activeView === 'overview' && renderOverview()}
            {activeView === 'section1' && renderSectionOne()}
          </>
        )}
      </main>
      {submitSuccess ? (
        <div className="fixed right-4 top-4 z-50 rounded-lg border border-emerald-200 bg-white p-3.5 shadow-xl shadow-black/10 text-xs font-semibold text-emerald-800 flex items-center gap-2.5 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 flex-shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-slate-800">Success</span>
            <span className="text-slate-600 font-medium">{submitSuccess}</span>
          </div>
          <button
            onClick={() => setSubmitSuccess('')}
            className="ml-3 text-slate-400 hover:text-slate-700 transition p-1"
            title="Dismiss notification"
          >
            ✕
          </button>
        </div>
      ) : null}
    </div>

    {/* Department Leadership & Handover Management Modal */}
    <DepartmentManagementModal
      isOpen={isLeadershipModalOpen}
      onClose={() => setIsLeadershipModalOpen(false)}
      currentUser={user}
      onHodRotated={() => syncHistoryFromCloud(user, effectiveRole, isRegistrar ? selectedDeptFilter : user.department)}
    />

    {/* Faculty Registration & Master Roster Modal */}
    <FacultyRegistrationModal
      isOpen={isFacultyModalOpen}
      onClose={() => setIsFacultyModalOpen(false)}
    />

    {/* Formal Printable Document */}
    <AppraisalPrintDocument
      user={printRecordState?.user || user}
      timeline={printRecordState?.timeline || selectedTimeline}
      sectionData={printRecordState?.sectionData || currentSectionData}
      scores={printRecordState?.scores || scores}
      record={printRecordState?.record || activeTimelineRecord || {}}
      bannerSrc={tceBanner}
    />
  </>
  );
}

const STORAGE_USER_KEY = 'tce_appraisal_user';
const STORAGE_WORKSPACE_KEY = 'tce_appraisal_workspace';
// Shared inbox key â€” written by Faculty on submit, read by HOD on login.
const STORAGE_INBOX_KEY = 'tce_appraisal_inbox';

function getStoredAuthContext() {
  if (typeof window === 'undefined') {
    return { token: null, source: 'none' };
  }

  const userTokenFromKey = window.localStorage.getItem('userToken');
  const tokenFromKey = window.localStorage.getItem('token');
  const userProfileString = window.localStorage.getItem(STORAGE_USER_KEY);

  let userProfileObj = null;
  if (userProfileString) {
    try {
      userProfileObj = JSON.parse(userProfileString);
    } catch (error) {
      console.debug('[auth] Invalid user profile JSON in localStorage.', error);
    }
  }

  const token = userProfileObj?.token || userTokenFromKey || tokenFromKey || null;
  const source = userProfileObj?.token
    ? STORAGE_USER_KEY
    : userTokenFromKey
      ? 'userToken'
      : tokenFromKey
        ? 'token'
        : 'none';

  return { token, source };
}

function loadUserFromStorage() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const stored = window.localStorage.getItem(STORAGE_USER_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch (error) {
    console.error('Failed to load user from storage:', error);
    return null;
  }
}

function saveUserToStorage(userProfile) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(userProfile));
  } catch (error) {
    console.error('Failed to save user to storage:', error);
  }
}

function clearUserFromStorage() {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.removeItem(STORAGE_USER_KEY);
    window.localStorage.removeItem(STORAGE_WORKSPACE_KEY);
    window.localStorage.removeItem('userToken');
    window.localStorage.removeItem('token');
    // Do NOT remove STORAGE_INBOX_KEY â€” it must survive across sign-in sessions
    // so the HOD can read Faculty submissions after switching accounts.
  } catch (error) {
    console.error('Failed to clear storage:', error);
  }
}

function loadWorkspaceFromStorage() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const stored = window.localStorage.getItem(STORAGE_WORKSPACE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch (error) {
    console.error('Failed to load workspace from storage:', error);
    return null;
  }
}

function saveWorkspaceToStorage(workspaceState) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(
      STORAGE_WORKSPACE_KEY,
      JSON.stringify(workspaceState)
    );
  } catch (error) {
    console.error('Failed to save workspace to storage:', error);
  }
}

// Load the shared HOD inbox (all faculty submissions across timelines).
function loadInboxFromStorage() {
  if (typeof window === 'undefined') return {};
  try {
    const stored = window.localStorage.getItem(STORAGE_INBOX_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

// Merge a new faculty submission record into the shared inbox and persist it.
function pushRecordToInboxStorage(timeline, record) {
  if (typeof window === 'undefined') return;
  try {
    const current = loadInboxFromStorage();
    const timelineRows = current[timeline] || [];
    // Replace existing entry for the same faculty email, or append as new row.
    const existingIndex = timelineRows.findIndex(
      (r) => r.facultyEmail === record.facultyEmail
    );
    if (existingIndex !== -1) {
      timelineRows[existingIndex] = record;
    } else {
      timelineRows.push(record);
    }
    current[timeline] = timelineRows;
    window.localStorage.setItem(STORAGE_INBOX_KEY, JSON.stringify(current));
  } catch (error) {
    console.error('Failed to push record to inbox storage:', error);
  }
}

const googleClientId =
  import.meta.env.VITE_GOOGLE_CLIENT_ID ||
  (typeof window !== 'undefined' ? window.__GOOGLE_CLIENT_ID__ || '' : '');

export default function App() {
  const [user, setUser] = useState(() => loadUserFromStorage());

  const handleLogin = React.useCallback((userProfile) => {
    setUser(userProfile);
    saveUserToStorage(userProfile);
  }, []);

  const handleSignOut = React.useCallback(() => {
    clearUserFromStorage();
    setUser(null);
  }, []);

  if (user === null) {
    return <LandingPage googleClientId={googleClientId} onLogin={handleLogin} />;
  }

  return (
    <DashboardPage
      user={user}
      onSignOut={handleSignOut}
      onWorkspaceSave={saveWorkspaceToStorage}
      onWorkspaceLoad={loadWorkspaceFromStorage}
    />
  );
}
