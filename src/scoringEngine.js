const isFilled = (val) => typeof val === 'string' && val.trim().length > 0;
const toNum = (val) => {
  const n = Number(val);
  return Number.isFinite(n) ? n : 0;
};

// ── Standard Engineering Scoring Rubrics ──────────────────────────────────────
export const SUBSECTION_MAX_MARKS = {
  '1.1': 8, '1.2': 5, '1.3': 5, '1.4': 4, '1.5': 5, '1.6': 4, '1.7': 2, '1.8': 4, '1.9': 4, '1.10': 5, '1.11': 4,
  '2.1': 15, '2.2': 8, '2.3': 7, '2.4': 5, '2.5': 4, '2.6': 5, '2.7': 5, '2.8': 6,
  '3.1': 2, '3.2': 6, '3.3': 3, '3.4': 2, '3.5': 2,
  '4.1': 8, '4.2': 7,
  '5.1': 2, '5.2': 4, '5.3': 2, '5.4': 1, '5.5': 1,
  '6.1': 3, '6.2': 4, '6.3': 4, '6.4': 1, '6.5': 2, '6.6': 6,
  '7.1': 4, '7.2': 2, '7.3': 3, '7.4': 1,
  '8.1': 2, '8.2': 2, '8.3': 1,
  '9.1': 10, '9.2': 10, '9.3': 20,
};

// ── TSEDA Architecture Scoring Rubrics (COA Standards) ───────────────────────
export const SUBSECTION_MAX_MARKS_ARCH = {
  '1.1': 8, '1.2': 5, '1.3': 5, '1.4': 4, '1.5.1': 5, '1.5.2': 3, '1.6': 4, '1.7': 2, '1.8': 4, '1.9': 4, '1.10': 3, '1.11': 3,
  '2.1': 15, '2.2': 8, '2.3': 7, '2.4': 4, '2.5': 4, '2.6': 6, '2.7': 5, '2.8': 6,
  '3.1': 1, '3.2': 3, '3.3': 2, '3.4': 3, '3.5': 2, '3.6': 4,
  '4.1': 8, '4.2': 7,
  '5.1': 1, '5.2': 2, '5.3': 1, '5.4': 1, '5.5': 1, '5.6': 4,
  '6.1': 3, '6.2': 4, '6.3': 4, '6.4': 1, '6.5': 2, '6.6': 6,
  '7.1': 4, '7.2': 2, '7.3': 3, '7.4': 1,
  '8.1': 1, '8.2': 2, '8.3': 1, '8.4': 1,
  '9.1': 10, '9.2': 10, '9.3': 20,
};

export const SECTION_MAX_MARKS = {
  section1: 50,
  section2: 55,
  section3: 15,
  section4: 15,
  section5: 10,
  section6: 20,
  section7: 10,
  section8: 5,
  section9: 20,
  grandTotal: 200,
};

// ── Standard Engineering Automated Scoring Engine ─────────────────────────────
export function computeAutomatedScores(sectionData = {}) {
  const raw = sectionData || {};
  const safeData = {
    ...(raw.section1Data || {}),
    ...(raw.section2Data || {}),
    ...(raw.section3Data || {}),
    ...(raw.section4Data || {}),
    ...(raw.section5Data || {}),
    ...(raw.section6Data || {}),
    ...(raw.section7Data || {}),
    ...(raw.section8Data || {}),
    ...(raw.section9Data || {}),
    ...raw
  };

  // Section 1
  const validCoursesHandled = (safeData.coursesHandled || []).filter(
    (r) => isFilled(r.courseCode) && isFilled(r.courseName)
  ).length;
  let s1_1 = 0;
  if (validCoursesHandled === 1) s1_1 = 3;
  else if (validCoursesHandled === 2) s1_1 = 6;
  else if (validCoursesHandled >= 3) s1_1 = 8;

  const s1_2 = Math.min(
    (safeData.courseFiles || []).reduce((sum, r) => {
      if (!isFilled(r.courseCode) || !isFilled(r.compliance)) return sum;
      return sum + (r.compliance === 'Full' ? 5 : r.compliance === 'Partial' ? 3 : 0);
    }, 0),
    5
  );

  const s1_3 = Math.min(((safeData.coursesDesigned || []).filter((r) => isFilled(r.courseCode)).length) * 2, 5);
  const s1_4 = Math.min(((safeData.valueAdded || []).filter((r) => isFilled(r.courseName)).length) * 2, 4);

  const validInnovative = (safeData.innovativeMethods || []).filter((r) => isFilled(r.courseCode) && isFilled(r.method)).length;
  let s1_5 = 0;
  if (validInnovative === 1) s1_5 = 2;
  else if (validInnovative === 2) s1_5 = 4;
  else if (validInnovative >= 3) s1_5 = 5;

  const s1_6 = Math.min(((safeData.academicCollaborations || []).filter((r) => isFilled(r.organization)).length) * 4, 4);
  const s1_7 = safeData.mentoring && toNum(safeData.mentoring.menteeCount) > 0 ? 2 : 0;
  const s1_8 = Math.min(((safeData.certifications || []).filter((r) => isFilled(r.courseName)).length) * 2, 4);

  const s1_9 = Math.min(
    (safeData.studentFeedback || []).reduce((sum, r) => {
      const v = toNum(r.feedbackPct);
      if (v > 90) return sum + 4;
      if (v >= 80) return sum + 3;
      if (v >= 75) return sum + 1;
      return sum;
    }, 0),
    4
  );

  const s1_10 = Math.min(
    (safeData.resultAnalysis || []).reduce((sum, r) => {
      const v = toNum(r.passPercentage);
      if (v >= 90) return sum + 5;
      if (v >= 80) return sum + 4;
      if (v >= 70) return sum + 3;
      if (v >= 60) return sum + 2;
      if (v > 0) return sum + 1;
      return sum;
    }, 0),
    5
  );

  const s1_11 = Math.min(
    (safeData.coAttainment || []).reduce((sum, r) => {
      const v = toNum(r.attainmentPct);
      if (v >= 70) return sum + 4;
      if (v >= 60) return sum + 3;
      if (v >= 50) return sum + 2;
      return sum;
    }, 0),
    4
  );

  // Section 2
  const s2_1 = Math.min(
    (safeData.journalPapers || []).reduce((sum, r) => {
      if (!isFilled(r.paperTitle) && !isFilled(r.journalName)) return sum;
      const t = String(r.tier || r.quartile || '').toUpperCase().trim();
      if (t.includes('Q1')) return sum + 6;
      if (t.includes('Q2')) return sum + 4;
      if (t.includes('Q3')) return sum + 2;
      return sum;
    }, 0),
    15
  );

  const citVal = toNum(safeData.citationsReceived?.totalCount);
  let s2_2 = 0;
  if (citVal >= 50) s2_2 = 8;
  else if (citVal >= 25) s2_2 = 5;
  else if (citVal >= 15) s2_2 = 4;
  else if (citVal >= 5) s2_2 = 3;
  else if (citVal >= 1) s2_2 = 1;

  const q1CitVal = toNum(safeData.q1Citations?.totalCount);
  let s2_3 = 0;
  if (q1CitVal >= 25) s2_3 = 7;
  else if (q1CitVal >= 15) s2_3 = 5;
  else if (q1CitVal >= 6) s2_3 = 3;
  else if (q1CitVal >= 1) s2_3 = 1;

  const s2_4 = Math.min(
    (safeData.bookPublications || []).reduce((sum, r) => {
      if (!isFilled(r.title)) return sum;
      if (r.type === 'Book (Author)') return sum + 5;
      if (r.type === 'Chapter' || r.type === 'Editor') return sum + 2;
      return sum;
    }, 0),
    5
  );

  const s2_5 = Math.min((safeData.conferencePapers || []).filter((r) => isFilled(r.paperTitle) || isFilled(r.proceedingName)).length * 1, 4);
  const s2_6 = Math.min(
    (safeData.researchCollaborations || []).reduce((sum, r) => {
      if (!isFilled(r.title) || !isFilled(r.partner)) return sum;
      if (r.type === 'International') return sum + 3;
      if (r.type === 'National' || r.type === 'Industry') return sum + 2;
      return sum;
    }, 0),
    5
  );
  const s2_7 = Math.min((safeData.phdRegistered || []).filter((r) => isFilled(r.scholarName) && isFilled(r.researchArea)).length * 1, 5);
  const s2_8 = Math.min((safeData.phdAwarded || []).filter((r) => isFilled(r.scholarName) && isFilled(r.researchArea)).length * 3, 6);

  // Section 3
  const s3_1 = Math.min((safeData.patentsPublished || []).filter((r) => isFilled(r.title) || isFilled(r.refNumber) || isFilled(r.appNumber)).length * 1, 2);
  const s3_2 = Math.min((safeData.patentsGranted || []).filter((r) => isFilled(r.title) || isFilled(r.refNumber)).length * 3, 6);
  const s3_3 = Math.min((safeData.transferOfTechnology || []).filter((r) => isFilled(r.title) && isFilled(r.industryPartner)).length * 3, 3);
  const s3_4 = Math.min((safeData.prototypesDeveloped || []).filter((r) => isFilled(r.title)).length * 1, 2);
  const s3_5 = Math.min((safeData.hackathonPrizes || []).filter((r) => isFilled(r.eventName) && isFilled(r.prize)).length * 2, 2);

  // Section 4
  const s4_1 = Math.min(
    (safeData.researchProjects || []).reduce((sum, r) => {
      if (!isFilled(r.projectName)) return sum;
      const v = toNum(r.amount);
      if (v >= 2000000) return sum + 8;
      if (v >= 1500000) return sum + 5;
      if (v >= 1000000) return sum + 3;
      if (v >= 500000) return sum + 2;
      if (v >= 100000) return sum + 1;
      return sum;
    }, 0),
    8
  );

  const s4_2 = Math.min(
    (safeData.consultancyProjects || []).reduce((sum, r) => {
      if (!isFilled(r.title)) return sum;
      const v = toNum(r.amount);
      if (v >= 500000) return sum + 7;
      if (v >= 300000) return sum + 5;
      if (v >= 100000) return sum + 3;
      if (v > 0) return sum + 1;
      return sum;
    }, 0),
    7
  );

  // Section 5
  const s5_1 = Math.min((safeData.internationalEngagement || []).filter((r) => isFilled(r.institution) && isFilled(r.country)).length * 1, 2);
  const s5_2 = Math.min(
    (safeData.visitingPositions || []).reduce((sum, r) => {
      if (!isFilled(r.institution)) return sum;
      const v = toNum(r.duration || r.durationDays);
      if (v >= 30) return sum + 4;
      if (v >= 15) return sum + 3;
      if (v >= 7) return sum + 2;
      return sum;
    }, 0),
    4
  );
  const s5_3 = Math.min((safeData.foreignFaculty || []).filter((r) => isFilled(r.name) && isFilled(r.institution)).length * 1, 2);
  const s5_4 = Math.min((safeData.reputationSurvey || []).filter((r) => isFilled(r.surveyName) && (r.submitted || r.evidenceSubmitted || '').toLowerCase() === 'yes').length * 1, 1);
  const s5_5 = Math.min((safeData.nirfSurvey || []).filter((r) => isFilled(r.nominationDetails) && (r.submitted || r.evidenceSubmitted || '').toLowerCase() === 'yes').length * 1, 1);

  // Section 6
  const s6_1 = Math.min((safeData.fdpAttended || []).filter((r) => isFilled(r.programName) && isFilled(r.organizer)).length * 2, 3);
  const s6_2 = Math.min(
    (safeData.programsOrganized || []).reduce((sum, r) => {
      if (!isFilled(r.programName)) return sum;
      const d = toNum(r.days);
      if (d >= 5) return sum + 2;
      if (d >= 2) return sum + 1;
      return sum;
    }, 0),
    4
  );
  const s6_3 = Math.min(
    (safeData.resourcePerson || []).reduce((sum, r) => {
      if (!isFilled(r.eventName) || !isFilled(r.topic)) return sum;
      if (r.level === 'International') return sum + 2;
      if (r.level === 'National') return sum + 1;
      return sum;
    }, 0),
    4
  );
  const s6_4 = Math.min((safeData.professionalMembership || []).filter((r) => isFilled(r.societyName) && (r.status || '').toLowerCase() === 'active').length * 1, 1);
  const s6_5 = Math.min((safeData.editorialBoard || []).filter((r) => isFilled(r.bodyName) && isFilled(r.position)).length > 0 ? 2 : 0, 2);
  const s6_6 = Math.min((safeData.moocDeveloped || []).filter((r) => isFilled(r.courseName)).length * 3, 6);

  // Section 7
  const s7_1 = Math.min(
    (safeData.partialDelivery || []).reduce((sum, r) => {
      if (!isFilled(r.courseDetails) || !isFilled(r.industryName)) return sum;
      const h = parseFloat(r.duration || r.hoursDelivered || 0);
      if (h >= 6) return sum + 3;
      if (h >= 3) return sum + 2;
      if (h >= 1) return sum + 1;
      return sum;
    }, 0),
    4
  );
  const s7_2 = Math.min((safeData.industrialVisits || []).filter((r) => isFilled(r.visitDetails) && isFilled(r.industry || r.industryName)).length * 1, 2);
  const s7_3 = Math.min(
    (safeData.facultyInternships || []).reduce((sum, r) => {
      if (!isFilled(r.industryName)) return sum;
      const d = toNum(r.duration || r.durationDays);
      if (d >= 10) return sum + 3;
      if (d >= 5) return sum + 2;
      if (d >= 2) return sum + 1;
      return sum;
    }, 0),
    3
  );
  const s7_4 = Math.min((safeData.employerEngagement || []).filter((r) => isFilled(r.activityName) && isFilled(r.involvedParty || r.companyName)).length * 1, 1);

  // Section 8
  const s8_1 = Math.min((safeData.projectPublications || []).filter((r) => isFilled(r.title) && isFilled(r.students)).length * 2, 2);
  const s8_2 = Math.min((safeData.hackathonMentoring || []).filter((r) => isFilled(r.eventName) && (isFilled(r.students) || isFilled(r.teamName))).length * 1, 2);
  const s8_3 = Math.min((safeData.startupSupport || []).filter((r) => isFilled(r.startupName) && isFilled(r.role)).length > 0 ? 1 : 0, 1);

  // Section 9
  const s9_1 = Math.min(
    (safeData.deptActivities || []).reduce((sum, r) => {
      if (!isFilled(r.description)) return sum;
      if (r.type === 'DLCs and File Maintenance' || r.activityType === 'DLCs and File Maintenance') return sum + 5;
      if (r.type === 'Dept. Activity & File Maintenance' || r.activityType === 'Dept. Activity & File Maintenance') return sum + 2;
      return sum;
    }, 0),
    10
  );
  const s9_2 = Math.min(
    (safeData.collegeActivities || []).reduce((sum, r) => {
      if (!isFilled(r.description)) return sum;
      const cat = r.category || r.committeeLevel;
      if (cat === 'Committee Member') return sum + 3;
      if (cat === 'Internal Review Committee') return sum + 5;
      if (cat === 'CLC / Deputy Warden') return sum + 7;
      if (cat === 'Associate Dean / Deputy Registrar / Deputy CoE / Warden') return sum + 10;
      return sum;
    }, 0),
    10
  );
  const s9_3 = Math.min((safeData.adminResponsibilities || []).filter((r) => isFilled(r.role) && (isFilled(r.evidenceLink) || isFilled(r.appointmentLink))).length > 0 ? 20 : 0, 20);

  return {
    '1.1': s1_1, '1.2': s1_2, '1.3': s1_3, '1.4': s1_4, '1.5': s1_5, '1.6': s1_6, '1.7': s1_7, '1.8': s1_8, '1.9': s1_9, '1.10': s1_10, '1.11': s1_11,
    '2.1': s2_1, '2.2': s2_2, '2.3': s2_3, '2.4': s2_4, '2.5': s2_5, '2.6': s2_6, '2.7': s2_7, '2.8': s2_8,
    '3.1': s3_1, '3.2': s3_2, '3.3': s3_3, '3.4': s3_4, '3.5': s3_5,
    '4.1': s4_1, '4.2': s4_2,
    '5.1': s5_1, '5.2': s5_2, '5.3': s5_3, '5.4': s5_4, '5.5': s5_5,
    '6.1': s6_1, '6.2': s6_2, '6.3': s6_3, '6.4': s6_4, '6.5': s6_5, '6.6': s6_6,
    '7.1': s7_1, '7.2': s7_2, '7.3': s7_3, '7.4': s7_4,
    '8.1': s8_1, '8.2': s8_2, '8.3': s8_3,
    '9.1': s9_1, '9.2': s9_2, '9.3': s9_3,
  };
}

// ── TSEDA Architecture Automated Scoring Engine (COA Guidelines) ──────────────
export function computeAutomatedScoresArch(sectionData = {}) {
  const raw = sectionData || {};
  const safeData = {
    ...(raw.section1Data || {}),
    ...(raw.section2Data || {}),
    ...(raw.section3Data || {}),
    ...(raw.section4Data || {}),
    ...(raw.section5Data || {}),
    ...(raw.section6Data || {}),
    ...(raw.section7Data || {}),
    ...(raw.section8Data || {}),
    ...(raw.section9Data || {}),
    ...raw
  };

  // Section 1 (Architecture Rubrics)
  const validCoursesHandled = (safeData.coursesHandled || []).filter(
    (r) => isFilled(r.courseCode) && isFilled(r.courseName)
  ).length;
  let s1_1 = 0;
  if (validCoursesHandled === 1) s1_1 = 3;
  else if (validCoursesHandled === 2) s1_1 = 6;
  else if (validCoursesHandled >= 3) s1_1 = 8;

  const s1_2 = Math.min(
    (safeData.courseFiles || []).reduce((sum, r) => {
      if (!isFilled(r.courseCode) || !isFilled(r.compliance)) return sum;
      return sum + (r.compliance === 'Full' || r.completed === 'Yes' ? 5 : 3);
    }, 0),
    5
  );

  const s1_3 = Math.min(((safeData.coursesDesigned || []).filter((r) => isFilled(r.courseCode) || isFilled(r.courseName)).length) * 2, 5);
  const s1_4 = Math.min(((safeData.valueAdded || []).filter((r) => isFilled(r.courseName) || isFilled(r.particulars)).length) * 2, 4);

  // 1.5.1 Innovative Teaching Methods (Pedagogy, Community, Design Thinking, Urban Field, Climate Sim)
  const validInnovative1 = (safeData.innovativePedagogy || safeData.innovativeMethods || []).filter(
    (r) => isFilled(r.courseCode) && isFilled(r.innovativeTeachingMethod || r.method)
  ).length;
  let s1_5_1 = 0;
  if (validInnovative1 === 1) s1_5_1 = 2;
  else if (validInnovative1 === 2) s1_5_1 = 4;
  else if (validInnovative1 >= 3) s1_5_1 = 5;

  // 1.5.2 Studio Based Teaching & Design Education
  const s1_5_2 = Math.min(
    ((safeData.studioTeaching || []).filter((r) => isFilled(r.courseName) && isFilled(r.activity)).length) * 2,
    3
  );

  // 1.6 Educational Tour and Case Study Visits (Tour = 4 | Case Study = 2)
  const s1_6 = Math.min(
    (safeData.educationalTours || safeData.academicCollaborations || []).reduce((sum, r) => {
      if (!isFilled(r.placesOfVisit) && !r.activity) return sum;
      const type = (r.activityType || r.activity || '').toLowerCase();
      if (type.includes('tour')) return sum + 4;
      return sum + 2;
    }, 0),
    4
  );

  // 1.7 Mentoring System Effectiveness (Good = 2 | Avg = 1)
  const s1_7 = Math.min(
    (safeData.mentoringSystem || [safeData.mentoring || {}]).reduce((sum, r) => {
      const rev = (r.hodReview || '').toLowerCase();
      if (rev === 'good' || rev === 'excellent') return sum + 2;
      if (rev === 'average' || rev === 'avg') return sum + 1;
      return sum + (toNum(r.menteeCount) > 0 ? 2 : 0);
    }, 0),
    2
  );

  const s1_8 = Math.min(((safeData.certifications || []).filter((r) => isFilled(r.courseName)).length) * 2, 4);

  // 1.9 Feedback (>90% = 4, 80-90% = 3, 75-80% = 1)
  const s1_9 = Math.min(
    (safeData.studentFeedback || []).reduce((sum, r) => {
      const v = toNum(r.score || r.feedbackPct);
      if (v > 90) return sum + 4;
      if (v >= 80) return sum + 3;
      if (v >= 75) return sum + 1;
      return sum;
    }, 0),
    4
  );

  // 1.10 Result Analysis — Pass % (>=90% = 3, 70-89% = 2, 60-69% = 1) -> Max 3 for Arch!
  const s1_10 = Math.min(
    (safeData.resultAnalysis || []).reduce((sum, r) => {
      const v = toNum(r.passPercentage);
      if (v >= 90) return sum + 3;
      if (v >= 70) return sum + 2;
      if (v >= 60) return sum + 1;
      return sum;
    }, 0),
    3
  );

  // 1.11 CO Attainment (>=70% = 3, 60-69% = 2, 50-59% = 1) -> Max 3 for Arch!
  const s1_11 = Math.min(
    (safeData.coAttainment || []).reduce((sum, r) => {
      const v = toNum(r.avgCoAttainment || r.attainmentPct);
      if (v >= 70) return sum + 3;
      if (v >= 60) return sum + 2;
      if (v >= 50) return sum + 1;
      return sum;
    }, 0),
    3
  );

  // Section 2 (Architecture Research & Book Publications)
  const s2_1 = Math.min(
    (safeData.journalPapers || []).reduce((sum, r) => {
      if (!isFilled(r.paperTitle) && !isFilled(r.journalName)) return sum;
      const t = String(r.tier || r.quartile || '').toUpperCase().trim();
      if (t.includes('Q1')) return sum + 6;
      if (t.includes('Q2')) return sum + 4;
      if (t.includes('Q3')) return sum + 2;
      return sum;
    }, 0),
    15
  );

  const citVal = toNum(safeData.scopusCitations?.totalCitations || safeData.citationsReceived?.totalCount);
  let s2_2 = 0;
  if (citVal >= 50) s2_2 = 8;
  else if (citVal >= 25) s2_2 = 5;
  else if (citVal >= 15) s2_2 = 4;
  else if (citVal >= 5) s2_2 = 3;
  else if (citVal >= 1) s2_2 = 1;

  const q1CitVal = toNum(safeData.q1Citations?.totalCitations || safeData.q1Citations?.totalCount);
  let s2_3 = 0;
  if (q1CitVal >= 25) s2_3 = 7;
  else if (q1CitVal >= 15) s2_3 = 5;
  else if (q1CitVal >= 6) s2_3 = 3;
  else if (q1CitVal >= 1) s2_3 = 1;

  const s2_4 = Math.min(
    (safeData.bookPublications || []).reduce((sum, r) => {
      if (!isFilled(r.title)) return sum;
      if ((r.publicationType || r.type || '').includes('Book')) return sum + 5;
      return sum + 2;
    }, 0),
    4
  );

  const s2_5 = Math.min((safeData.conferencePapers || []).filter((r) => isFilled(r.paperTitle) || isFilled(r.conferenceName)).length * 1, 4);
  
  // 2.6 Creative Scholarship and Professional Writing (Per writing = 2 | Max 6)
  const s2_6 = Math.min((safeData.creativeScholarship || safeData.researchCollaborations || []).filter((r) => isFilled(r.paperTitle) || isFilled(r.journalName) || isFilled(r.title)).length * 2, 6);

  const s2_7 = Math.min((safeData.phdRegistered || []).filter((r) => isFilled(r.scholarName)).length * 1, 5);
  const s2_8 = Math.min((safeData.phdAwarded || []).filter((r) => isFilled(r.scholarName)).length * 3, 6);

  // Section 3 (Patents & Architecture Innovation)
  const s3_1 = Math.min((safeData.patentsPublished || []).filter((r) => isFilled(r.title) || isFilled(r.patentRefNumber)).length * 1, 1);
  const s3_2 = Math.min((safeData.patentsGranted || []).filter((r) => isFilled(r.title) || isFilled(r.patentRefNumber)).length * 3, 3);
  const s3_3 = Math.min((safeData.transferOfTechnology || []).filter((r) => isFilled(r.title) && isFilled(r.industryPartner)).length * 2, 2);
  const s3_4 = Math.min((safeData.prototypesDeveloped || []).filter((r) => isFilled(r.titleOfProduct || r.title)).length * 1, 3);
  const s3_5 = Math.min((safeData.hackathonPrizes || []).filter((r) => isFilled(r.eventName) || isFilled(r.achievement)).length * 1, 2);
  const s3_6 = Math.min((safeData.designPatents || []).filter((r) => isFilled(r.title) || isFilled(r.patentRefNumber)).length * 2, 4);

  // Section 4 (Sponsored Research & Consultancy - Arch Rubrics)
  const s4_1 = Math.min(
    (safeData.researchProjects || []).reduce((sum, r) => {
      if (!isFilled(r.projectName)) return sum;
      const v = toNum(r.sanctionedAmount || r.amount);
      if (v >= 2000000) return sum + 8;
      if (v >= 1500000) return sum + 5;
      if (v >= 1000000) return sum + 3;
      if (v >= 500000) return sum + 2;
      if (v >= 100000) return sum + 1;
      return sum;
    }, 0),
    8
  );

  const s4_2 = Math.min(
    (safeData.consultancyProjects || []).reduce((sum, r) => {
      if (!isFilled(r.titleOfConsultancy || r.title)) return sum;
      const v = toNum(r.amountGenerated || r.amount);
      if (v >= 500000) return sum + 7;
      if (v >= 300000) return sum + 5;
      if (v >= 100000) return sum + 3;
      if (v > 0) return sum + 1;
      return sum;
    }, 0),
    7
  );

  // Section 5 (International Engagement & Architecture Collaborations)
  const s5_1 = Math.min((safeData.internationalEngagement || []).filter((r) => isFilled(r.partnerInstitution) || isFilled(r.country)).length * 1, 1);
  const s5_2 = Math.min(
    (safeData.visitingPositions || []).reduce((sum, r) => {
      if (!isFilled(r.institution)) return sum;
      const v = toNum(r.durationDays || r.duration);
      if (v >= 30) return sum + 2;
      if (v >= 1) return sum + 1;
      return sum;
    }, 0),
    2
  );
  const s5_3 = Math.min((safeData.foreignFaculty || []).filter((r) => isFilled(r.name) || isFilled(r.institution)).length * 1, 1);
  const s5_4 = Math.min((safeData.reputationSurvey || []).filter((r) => isFilled(r.surveyName) && (r.evidenceSubmitted || '').toLowerCase() === 'yes').length * 1, 1);
  const s5_5 = Math.min((safeData.nirfSurvey || []).filter((r) => isFilled(r.nominationDetails) && (r.evidenceSubmitted || '').toLowerCase() === 'yes').length * 1, 1);
  const s5_6 = Math.min((safeData.internationalDesignStudios || []).filter((r) => isFilled(r.institution) || isFilled(r.country)).length * 2, 4);

  // Section 6 (FDP & Professional Activities)
  const s6_1 = Math.min((safeData.fdpAttended || []).filter((r) => isFilled(r.programName) || isFilled(r.organizer)).length * 2, 3);
  const s6_2 = Math.min(
    (safeData.programsOrganized || []).reduce((sum, r) => {
      if (!isFilled(r.programName)) return sum;
      const d = toNum(r.numberOfDays || r.days);
      if (d >= 5) return sum + 2;
      if (d >= 2) return sum + 1;
      return sum;
    }, 0),
    4
  );
  const s6_3 = Math.min(
    (safeData.resourcePerson || []).reduce((sum, r) => {
      if (!isFilled(r.eventName) && !isFilled(r.topic)) return sum;
      if ((r.level || '').toLowerCase() === 'international') return sum + 2;
      return sum + 1;
    }, 0),
    4
  );
  const s6_4 = Math.min((safeData.professionalMembership || []).filter((r) => isFilled(r.societyName) && (r.status || '').toLowerCase() === 'active').length * 1, 1);
  const s6_5 = Math.min((safeData.editorialBoard || []).filter((r) => isFilled(r.bodyName) || isFilled(r.position)).length > 0 ? 2 : 0, 2);
  const s6_6 = Math.min((safeData.moocDeveloped || []).filter((r) => isFilled(r.courseName)).length * 3, 6);

  // Section 7 (Industry Interaction & Internship - Arch Rubrics)
  const s7_1 = Math.min(
    (safeData.partialDelivery || []).reduce((sum, r) => {
      if (!isFilled(r.courseDetails) && !isFilled(r.expertName)) return sum;
      const h = parseFloat(r.duration || r.hoursDelivered || 0);
      if (h >= 6) return sum + 3;
      if (h >= 3) return sum + 2;
      if (h >= 1) return sum + 1;
      return sum + 1;
    }, 0),
    4
  );
  const s7_2 = Math.min((safeData.industrialVisits || []).filter((r) => isFilled(r.visitDetails) || isFilled(r.industry)).length * 1, 2);
  const s7_3 = Math.min(
    (safeData.facultyInternships || []).reduce((sum, r) => {
      if (!isFilled(r.industryName)) return sum;
      const d = toNum(r.durationDays || r.duration);
      if (d >= 10) return sum + 3;
      if (d >= 5) return sum + 2;
      if (d >= 2) return sum + 1;
      return sum + 1;
    }, 0),
    3
  );
  const s7_4 = Math.min((safeData.employerEngagement || []).filter((r) => isFilled(r.activityName) || isFilled(r.employerInvolved)).length * 1, 1);

  // Section 8 (Student Development Activities & Exhibitions)
  const s8_1 = Math.min((safeData.projectPublications || []).filter((r) => isFilled(r.title) || isFilled(r.studentNames)).length * 1, 1);
  const s8_2 = Math.min((safeData.hackathonMentoring || []).filter((r) => isFilled(r.eventName) || isFilled(r.studentsMentored)).length * 1, 2);
  const s8_3 = Math.min((safeData.startupSupport || []).filter((r) => isFilled(r.startupName) || isFilled(r.role)).length > 0 ? 1 : 0, 1);
  const s8_4 = Math.min((safeData.studentExhibitions || []).filter((r) => isFilled(r.eventName) || isFilled(r.outcome)).length * 1, 1);

  // Section 9 (Institutional Contribution)
  const s9_1 = Math.min(
    (safeData.deptActivities || []).reduce((sum, r) => {
      if (!isFilled(r.description)) return sum;
      if ((r.activityDescription || r.description || '').includes('DLC')) return sum + 5;
      return sum + 2;
    }, 0),
    10
  );
  const s9_2 = Math.min(
    (safeData.collegeActivities || []).reduce((sum, r) => {
      if (!isFilled(r.description)) return sum;
      const cat = (r.category || r.description || '').toLowerCase();
      if (cat.includes('associate dean') || cat.includes('warden')) return sum + 10;
      if (cat.includes('clc')) return sum + 7;
      if (cat.includes('internal review')) return sum + 5;
      return sum + 3;
    }, 0),
    10
  );
  const s9_3 = Math.min((safeData.adminResponsibilities || []).filter((r) => isFilled(r.role) || isFilled(r.description)).length > 0 ? 20 : 0, 20);

  return {
    '1.1': s1_1, '1.2': s1_2, '1.3': s1_3, '1.4': s1_4, '1.5.1': s1_5_1, '1.5.2': s1_5_2, '1.6': s1_6, '1.7': s1_7, '1.8': s1_8, '1.9': s1_9, '1.10': s1_10, '1.11': s1_11,
    '2.1': s2_1, '2.2': s2_2, '2.3': s2_3, '2.4': s2_4, '2.5': s2_5, '2.6': s2_6, '2.7': s2_7, '2.8': s2_8,
    '3.1': s3_1, '3.2': s3_2, '3.3': s3_3, '3.4': s3_4, '3.5': s3_5, '3.6': s3_6,
    '4.1': s4_1, '4.2': s4_2,
    '5.1': s5_1, '5.2': s5_2, '5.3': s5_3, '5.4': s5_4, '5.5': s5_5, '5.6': s5_6,
    '6.1': s6_1, '6.2': s6_2, '6.3': s6_3, '6.4': s6_4, '6.5': s6_5, '6.6': s6_6,
    '7.1': s7_1, '7.2': s7_2, '7.3': s7_3, '7.4': s7_4,
    '8.1': s8_1, '8.2': s8_2, '8.3': s8_3, '8.4': s8_4,
    '9.1': s9_1, '9.2': s9_2, '9.3': s9_3,
  };
}

export function computeEffectiveScores(sectionData = {}, hodSubsectionScores = {}, department = '') {
  const isArch = (department || '').toUpperCase() === 'ARCH' || (sectionData.department || '').toUpperCase() === 'ARCH';
  const autoMap = isArch ? computeAutomatedScoresArch(sectionData) : computeAutomatedScores(sectionData);
  const maxRubricsMap = isArch ? SUBSECTION_MAX_MARKS_ARCH : SUBSECTION_MAX_MARKS;
  const hodMap = hodSubsectionScores || {};
  const effectiveMap = {};
  let hasAdjustments = false;

  Object.keys(maxRubricsMap).forEach((key) => {
    const max = maxRubricsMap[key];
    const autoVal = autoMap[key] || 0;
    const hodValRaw = hodMap[key];

    if (hodValRaw !== undefined && hodValRaw !== null && String(hodValRaw).trim() !== '') {
      const parsed = Math.max(0, Math.min(Number(hodValRaw), max));
      effectiveMap[key] = parsed;
      if (parsed !== autoVal) {
        hasAdjustments = true;
      }
    } else {
      effectiveMap[key] = autoVal;
    }
  });

  const sec1Keys = isArch 
    ? ['1.1', '1.2', '1.3', '1.4', '1.5.1', '1.5.2', '1.6', '1.7', '1.8', '1.9', '1.10', '1.11']
    : ['1.1', '1.2', '1.3', '1.4', '1.5', '1.6', '1.7', '1.8', '1.9', '1.10', '1.11'];

  const sec3Keys = isArch
    ? ['3.1', '3.2', '3.3', '3.4', '3.5', '3.6']
    : ['3.1', '3.2', '3.3', '3.4', '3.5'];

  const sec5Keys = isArch
    ? ['5.1', '5.2', '5.3', '5.4', '5.5', '5.6']
    : ['5.1', '5.2', '5.3', '5.4', '5.5'];

  const sec8Keys = isArch
    ? ['8.1', '8.2', '8.3', '8.4']
    : ['8.1', '8.2', '8.3'];

  const section1Total = Math.min(
    SECTION_MAX_MARKS.section1,
    sec1Keys.reduce((s, k) => s + (effectiveMap[k] || 0), 0)
  );

  const section2Total = Math.min(
    SECTION_MAX_MARKS.section2,
    ['2.1', '2.2', '2.3', '2.4', '2.5', '2.6', '2.7', '2.8'].reduce((s, k) => s + (effectiveMap[k] || 0), 0)
  );

  const section3Total = Math.min(
    SECTION_MAX_MARKS.section3,
    sec3Keys.reduce((s, k) => s + (effectiveMap[k] || 0), 0)
  );

  const section4Total = Math.min(
    SECTION_MAX_MARKS.section4,
    ['4.1', '4.2'].reduce((s, k) => s + (effectiveMap[k] || 0), 0)
  );

  const section5Total = Math.min(
    SECTION_MAX_MARKS.section5,
    sec5Keys.reduce((s, k) => s + (effectiveMap[k] || 0), 0)
  );

  const section6Total = Math.min(
    SECTION_MAX_MARKS.section6,
    ['6.1', '6.2', '6.3', '6.4', '6.5', '6.6'].reduce((s, k) => s + (effectiveMap[k] || 0), 0)
  );

  const section7Total = Math.min(
    SECTION_MAX_MARKS.section7,
    ['7.1', '7.2', '7.3', '7.4'].reduce((s, k) => s + (effectiveMap[k] || 0), 0)
  );

  const section8Total = Math.min(
    SECTION_MAX_MARKS.section8,
    sec8Keys.reduce((s, k) => s + (effectiveMap[k] || 0), 0)
  );

  const section9Total = Math.min(
    SECTION_MAX_MARKS.section9,
    ['9.1', '9.2', '9.3'].reduce((s, k) => s + (effectiveMap[k] || 0), 0)
  );

  const grandTotal = Math.min(
    SECTION_MAX_MARKS.grandTotal,
    section1Total + section2Total + section3Total + section4Total + section5Total + section6Total + section7Total + section8Total + section9Total
  );

  const autoS1 = Math.min(SECTION_MAX_MARKS.section1, sec1Keys.reduce((s, k) => s + (autoMap[k] || 0), 0));
  const autoS2 = Math.min(SECTION_MAX_MARKS.section2, ['2.1', '2.2', '2.3', '2.4', '2.5', '2.6', '2.7', '2.8'].reduce((s, k) => s + (autoMap[k] || 0), 0));
  const autoS3 = Math.min(SECTION_MAX_MARKS.section3, sec3Keys.reduce((s, k) => s + (autoMap[k] || 0), 0));
  const autoS4 = Math.min(SECTION_MAX_MARKS.section4, ['4.1', '4.2'].reduce((s, k) => s + (autoMap[k] || 0), 0));
  const autoS5 = Math.min(SECTION_MAX_MARKS.section5, sec5Keys.reduce((s, k) => s + (autoMap[k] || 0), 0));
  const autoS6 = Math.min(SECTION_MAX_MARKS.section6, ['6.1', '6.2', '6.3', '6.4', '6.5', '6.6'].reduce((s, k) => s + (autoMap[k] || 0), 0));
  const autoS7 = Math.min(SECTION_MAX_MARKS.section7, ['7.1', '7.2', '7.3', '7.4'].reduce((s, k) => s + (autoMap[k] || 0), 0));
  const autoS8 = Math.min(SECTION_MAX_MARKS.section8, sec8Keys.reduce((s, k) => s + (autoMap[k] || 0), 0));
  const autoS9 = Math.min(SECTION_MAX_MARKS.section9, ['9.1', '9.2', '9.3'].reduce((s, k) => s + (autoMap[k] || 0), 0));
  const autoGrandTotal = Math.min(SECTION_MAX_MARKS.grandTotal, autoS1 + autoS2 + autoS3 + autoS4 + autoS5 + autoS6 + autoS7 + autoS8 + autoS9);

  return {
    autoMap,
    effectiveMap,
    section1Total,
    section2Total,
    section3Total,
    section4Total,
    section5Total,
    section6Total,
    section7Total,
    section8Total,
    section9Total,
    grandTotal,
    autoGrandTotal,
    hasAdjustments,
    isArch,
    total: section1Total,
    coursesHandled: effectiveMap['1.1'],
    courseFile: effectiveMap['1.2'],
    coursesDesigned: effectiveMap['1.3'],
    valueAdded: effectiveMap['1.4'],
    innovativeMethods: effectiveMap['1.5'] || effectiveMap['1.5.1'],
    academicCollaborations: effectiveMap['1.6'],
    mentoring: effectiveMap['1.7'],
    certifications: effectiveMap['1.8'],
    studentFeedback: effectiveMap['1.9'],
    resultAnalysis: effectiveMap['1.10'],
    coAttainment: effectiveMap['1.11'],
  };
}
