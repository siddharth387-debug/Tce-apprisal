import * as XLSX from 'xlsx';
import { computeEffectiveScores, SUBSECTION_MAX_MARKS } from './scoringEngine.js';

export const exportAppraisalToExcel = ({
  user,
  timeline,
  sectionData = {},
  scores = {},
  record = {},
}) => {
  const wb = XLSX.utils.book_new();
  const subRemarks = record.subsectionRemarks || {};
  const hodScores = record.hodSubsectionScores || {};

  // Compute effective evaluated scores reflecting HoD overrides
  const effectiveScoreObj = computeEffectiveScores(sectionData, hodScores);

  // ── Sheet 1: Summary Sheet ─────────────────────────────────────────
  const summaryRows = [
    ['THIAGARAJAR COLLEGE OF ENGINEERING, MADURAI - 625 015'],
    ['FACULTY PERFORMANCE APPRAISAL SYSTEM - SUMMARY REPORT'],
    [''],
    ['Faculty Name:', user?.name || 'Faculty Member', '', 'Academic Assessment Year:', timeline || '2024-2025'],
    ['Email Address:', user?.email || '—', '', 'Date of Generation:', new Date().toLocaleDateString('en-GB')],
    ['Designation / Role:', user?.role || 'Faculty', '', 'Appraisal Status:', record.appraisalStatus || 'Pending'],
    ['Grand Total Score:', `${effectiveScoreObj.grandTotal} / 200 Marks`, '', 'Percentage:', `${((effectiveScoreObj.grandTotal / 200) * 100).toFixed(1)}%`],
    [''],
    ['EXECUTIVE SCORE SUMMARY MATRIX' + (effectiveScoreObj.hasAdjustments ? ' (Includes HoD Evaluated Marks)' : '')],
    ['Section', 'Assessment Domain', 'Maximum Marks', 'Evaluated Score'],
    ['Section I', 'Teaching & Learning', 50, effectiveScoreObj.section1Total],
    ['Section II', 'Research Publications', 55, effectiveScoreObj.section2Total],
    ['Section III', 'Patents & Innovation', 15, effectiveScoreObj.section3Total],
    ['Section IV', 'Sponsored Research & Consultancy', 15, effectiveScoreObj.section4Total],
    ['Section V', 'International Engagement & Rankings', 10, effectiveScoreObj.section5Total],
    ['Section VI', 'Faculty Development & Professional Activities', 20, effectiveScoreObj.section6Total],
    ['Section VII', 'Industry Interaction & Internship', 10, effectiveScoreObj.section7Total],
    ['Section VIII', 'Student Development Activities', 5, effectiveScoreObj.section8Total],
    ['Section IX', 'Institutional Development', 20, effectiveScoreObj.section9Total],
    ['TOTAL SCORE', 'Cumulative Score (Sections I - IX)', 200, effectiveScoreObj.grandTotal],
    [''],
    ['Head of Department (HoD) Overall Remarks:', record.hodRemarks || '—'],
  ];

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  
  // Set column widths for summary sheet
  wsSummary['!cols'] = [
    { wch: 18 },
    { wch: 45 },
    { wch: 18 },
    { wch: 25 },
    { wch: 25 },
  ];

  XLSX.utils.book_append_sheet(wb, wsSummary, 'Appraisal Summary');

  // ── Sheet 2: Detailed Appraisal Records ────────────────────────────
  const detailRows = [
    ['THIAGARAJAR COLLEGE OF ENGINEERING, MADURAI'],
    ['FACULTY PERFORMANCE APPRAISAL DETAILED SUBMISSION RECORDS'],
    [`Faculty: ${user?.name || 'Faculty Member'} | Email: ${user?.email || '—'} | Year: ${timeline || '2024-2025'} | Grand Total: ${effectiveScoreObj.grandTotal} / 200`],
    [''],
  ];

  const appendSectionTable = (sectionTitle, columns, data, subKey) => {
    const max = subKey ? SUBSECTION_MAX_MARKS[subKey] : null;
    const effMark = subKey ? effectiveScoreObj.effectiveMap[subKey] : null;
    const autoMark = subKey ? effectiveScoreObj.autoMap[subKey] : null;
    const isOverridden = subKey && effMark !== null && autoMark !== null && effMark !== autoMark;

    const headerTitle = max !== null
      ? `${sectionTitle.toUpperCase()} [Score: ${effMark ?? 0} / ${max} Marks${isOverridden ? ' - HoD Evaluated' : ''}]`
      : sectionTitle.toUpperCase();

    detailRows.push([headerTitle]);
    detailRows.push(['#', ...columns.map(c => c.label)]);
    
    const rows = (data || []).filter(r => r && typeof r === 'object' && Object.values(r).some(v => v !== null && v !== undefined && String(v).trim() !== ''));
    if (rows.length === 0) {
      detailRows.push(['—', 'No entries submitted for this subsection', ...columns.slice(1).map(() => '')]);
    } else {
      rows.forEach((row, idx) => {
        detailRows.push([idx + 1, ...columns.map(c => row[c.key] || '—')]);
      });
    }

    if (isOverridden) {
      detailRows.push(['', `⚡ HoD Evaluated Score (${subKey}):`, `${effMark} / ${max} Marks (Automated Rubric Score: ${autoMark})`, ...columns.slice(2).map(() => '')]);
    }

    if (subKey && subRemarks[subKey]) {
      detailRows.push(['', `💬 HoD Feedback (${subKey}):`, subRemarks[subKey], ...columns.slice(2).map(() => '')]);
    }

    detailRows.push(['']); // Blank separator row
  };

  // Section I
  detailRows.push([`SECTION I: TEACHING & LEARNING (Evaluated Score: ${effectiveScoreObj.section1Total} / 50 Marks)`]);
  detailRows.push(['']);
  appendSectionTable('1.1 Courses Handled', [{ key: 'courseCode', label: 'Course Code' }, { key: 'courseName', label: 'Course Name' }, { key: 'type', label: 'Type' }, { key: 'semester', label: 'Semester' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.coursesHandled, '1.1');
  appendSectionTable('1.2 Course File Compliance', [{ key: 'courseCode', label: 'Course Code' }, { key: 'courseName', label: 'Course Name' }, { key: 'compliance', label: 'Compliance' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.courseFiles, '1.2');
  appendSectionTable('1.3 Course Design', [{ key: 'courseCode', label: 'Course Code' }, { key: 'courseName', label: 'Course Name' }, { key: 'remarks', label: 'Remarks' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.coursesDesigned, '1.3');
  appendSectionTable('1.4 Value-Added Courses', [{ key: 'courseName', label: 'Course Name' }, { key: 'particulars', label: 'Particulars' }, { key: 'studentCount', label: 'Student Count' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.valueAdded, '1.4');
  appendSectionTable('1.5 Innovative Methods', [{ key: 'courseCode', label: 'Course Code' }, { key: 'method', label: 'Method' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.innovativeMethods, '1.5');
  appendSectionTable('1.6 Academic Collaborations', [{ key: 'organization', label: 'Organization' }, { key: 'collaborationType', label: 'Type' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.academicCollaborations, '1.6');
  if (sectionData.mentoring) {
    detailRows.push([`1.7 MENTORING SYSTEM [Score: ${effectiveScoreObj.effectiveMap['1.7']} / 2 Marks]`]);
    detailRows.push(['Mentee Count', 'Batch', 'Description', 'Evidence Link']);
    detailRows.push([sectionData.mentoring.menteeCount || '0', sectionData.mentoring.batch || '—', sectionData.mentoring.description || '—', sectionData.mentoring.evidenceLink || '—']);
    if (subRemarks['1.7']) {
      detailRows.push(['', '💬 HoD Feedback (1.7):', subRemarks['1.7']]);
    }
    detailRows.push(['']);
  }
  appendSectionTable('1.8 NPTEL Certifications', [{ key: 'courseName', label: 'Course Title' }, { key: 'platform', label: 'Platform' }, { key: 'certType', label: 'Grade' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.certifications, '1.8');
  appendSectionTable('1.9 Student Feedback', [{ key: 'courseCode', label: 'Course Code' }, { key: 'feedbackPct', label: 'Feedback %' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.studentFeedback, '1.9');
  appendSectionTable('1.10 Result Analysis', [{ key: 'courseCode', label: 'Course Code' }, { key: 'courseName', label: 'Course Name' }, { key: 'passPercentage', label: 'Pass %' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.resultAnalysis, '1.10');
  appendSectionTable('1.11 CO Attainment %', [{ key: 'courseCode', label: 'Course Code' }, { key: 'courseName', label: 'Course Name' }, { key: 'attainmentPct', label: 'Attainment %' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.coAttainment, '1.11');

  // Section II
  detailRows.push([`SECTION II: RESEARCH PUBLICATIONS (Evaluated Score: ${effectiveScoreObj.section2Total} / 55 Marks)`]);
  detailRows.push(['']);
  appendSectionTable('2.1 Journal Publications', [{ key: 'paperTitle', label: 'Paper Title' }, { key: 'journalName', label: 'Journal Name' }, { key: 'tier', label: 'Tier' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.journalPapers, '2.1');
  if (sectionData.citationsReceived) {
    detailRows.push([`2.2 CITATIONS RECEIVED (LAST 3 YEARS) [Score: ${effectiveScoreObj.effectiveMap['2.2']} / 8 Marks]`]);
    detailRows.push(['Total Count', 'Evidence Link']);
    detailRows.push([sectionData.citationsReceived.totalCount || '0', sectionData.citationsReceived.evidenceLink || '—']);
    if (subRemarks['2.2']) {
      detailRows.push(['', '💬 HoD Feedback (2.2):', subRemarks['2.2']]);
    }
    detailRows.push(['']);
  }
  if (sectionData.q1Citations) {
    detailRows.push([`2.3 TOTAL Q1 CITATIONS [Score: ${effectiveScoreObj.effectiveMap['2.3']} / 7 Marks]`]);
    detailRows.push(['Total Count', 'Evidence Link']);
    detailRows.push([sectionData.q1Citations.totalCount || '0', sectionData.q1Citations.evidenceLink || '—']);
    if (subRemarks['2.3']) {
      detailRows.push(['', '💬 HoD Feedback (2.3):', subRemarks['2.3']]);
    }
    detailRows.push(['']);
  }
  appendSectionTable('2.4 Books / Book Chapters', [{ key: 'title', label: 'Title' }, { key: 'type', label: 'Type' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.bookPublications, '2.4');
  appendSectionTable('2.5 Conference Publications', [{ key: 'paperTitle', label: 'Paper Title' }, { key: 'proceedingName', label: 'Proceeding Name' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.conferencePapers, '2.5');
  appendSectionTable('2.6 Research Collaborations', [{ key: 'title', label: 'Title' }, { key: 'partner', label: 'Partner' }, { key: 'type', label: 'Type' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.researchCollaborations, '2.6');
  appendSectionTable('2.7 PhD Scholars (Registered)', [{ key: 'scholarName', label: 'Scholar Name' }, { key: 'researchArea', label: 'Research Area' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.phdRegistered, '2.7');
  appendSectionTable('2.8 PhD Scholars (Degree Awarded)', [{ key: 'scholarName', label: 'Scholar Name' }, { key: 'researchArea', label: 'Research Area' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.phdAwarded, '2.8');

  // Section III
  detailRows.push([`SECTION III: PATENTS & INNOVATION (Evaluated Score: ${effectiveScoreObj.section3Total} / 15 Marks)`]);
  detailRows.push(['']);
  appendSectionTable('3.1 Patents Published', [{ key: 'appNumber', label: 'Application No' }, { key: 'title', label: 'Title' }, { key: 'inventors', label: 'Inventors' }, { key: 'datePublished', label: 'Date' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.patentsPublished, '3.1');
  appendSectionTable('3.2 Patents Granted', [{ key: 'refNumber', label: 'Ref No' }, { key: 'title', label: 'Title' }, { key: 'inventors', label: 'Inventors' }, { key: 'dateGranted', label: 'Date' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.patentsGranted, '3.2');
  appendSectionTable('3.3 Transfer of Technology', [{ key: 'title', label: 'Technology Title' }, { key: 'industryPartner', label: 'Partner' }, { key: 'amount', label: 'Amount (Rs.)' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.transferOfTechnology, '3.3');
  appendSectionTable('3.4 Prototypes / Products Developed', [{ key: 'title', label: 'Title' }, { key: 'studentsInvolved', label: 'Students' }, { key: 'date', label: 'Date' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.prototypesDeveloped, '3.4');
  appendSectionTable('3.5 Hackathon Mentoring & Prizes', [{ key: 'eventName', label: 'Event Name' }, { key: 'studentsMentored', label: 'Students' }, { key: 'prize', label: 'Prize' }, { key: 'date', label: 'Date' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.hackathonPrizes, '3.5');

  // Section IV
  detailRows.push([`SECTION IV: SPONSORED RESEARCH & CONSULTANCY (Evaluated Score: ${effectiveScoreObj.section4Total} / 15 Marks)`]);
  detailRows.push(['']);
  appendSectionTable('4.1 Sponsored Research Projects', [{ key: 'projectName', label: 'Project Name' }, { key: 'fundingAgency', label: 'Agency' }, { key: 'period', label: 'Period' }, { key: 'amount', label: 'Amount (Rs.)' }, { key: 'role', label: 'Role' }, { key: 'status', label: 'Status' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.researchProjects, '4.1');
  appendSectionTable('4.2 Consultancy Projects', [{ key: 'title', label: 'Title' }, { key: 'clientDetails', label: 'Client' }, { key: 'period', label: 'Period' }, { key: 'amount', label: 'Amount (Rs.)' }, { key: 'facultyInvolved', label: 'Faculty' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.consultancyProjects, '4.2');

  // Section V
  detailRows.push([`SECTION V: INTERNATIONAL ENGAGEMENT & RANKINGS (Evaluated Score: ${effectiveScoreObj.section5Total} / 10 Marks)`]);
  detailRows.push(['']);
  appendSectionTable('5.1 International Engagement / MoUs', [{ key: 'institution', label: 'Institution' }, { key: 'activities', label: 'Activities' }, { key: 'period', label: 'Period' }, { key: 'outcomes', label: 'Outcomes' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.internationalEngagement, '5.1');
  appendSectionTable('5.2 Visiting / Adjunct Positions', [{ key: 'institution', label: 'Institution' }, { key: 'country', label: 'Country' }, { key: 'durationDays', label: 'Days' }, { key: 'period', label: 'Period' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.visitingPositions, '5.2');
  appendSectionTable('5.3 Foreign Faculty / Student Hosted', [{ key: 'name', label: 'Name' }, { key: 'affiliation', label: 'Affiliation' }, { key: 'topics', label: 'Topics' }, { key: 'period', label: 'Period' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.foreignFaculty, '5.3');
  appendSectionTable('5.4 QS / THE Reputation Surveys', [{ key: 'academicianDetails', label: 'Academician' }, { key: 'university', label: 'University' }, { key: 'submitted', label: 'Submitted' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.reputationSurvey, '5.4');
  appendSectionTable('5.5 NIRF Survey Nominations', [{ key: 'employerDetails', label: 'Employer' }, { key: 'submitted', label: 'Submitted' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.nirfSurvey, '5.5');

  // Section VI
  detailRows.push([`SECTION VI: FACULTY DEVELOPMENT & PROFESSIONAL ACTIVITIES (Evaluated Score: ${effectiveScoreObj.section6Total} / 20 Marks)`]);
  detailRows.push(['']);
  appendSectionTable('6.1 FDP / STTP Attended', [{ key: 'programName', label: 'Program Name' }, { key: 'organizer', label: 'Organizer' }, { key: 'duration', label: 'Days' }, { key: 'dateRange', label: 'Dates' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.fdpAttended, '6.1');
  appendSectionTable('6.2 Programs Organized', [{ key: 'programName', label: 'Program Name' }, { key: 'days', label: 'Days' }, { key: 'dateRange', label: 'Dates' }, { key: 'role', label: 'Role' }, { key: 'participants', label: 'Participants' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.programsOrganized, '6.2');
  appendSectionTable('6.3 Resource Person / Keynote Speaker', [{ key: 'eventName', label: 'Event Name' }, { key: 'level', label: 'Level' }, { key: 'topic', label: 'Topic' }, { key: 'date', label: 'Date' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.resourcePerson, '6.3');
  appendSectionTable('6.4 Professional Memberships', [{ key: 'societyName', label: 'Society Name' }, { key: 'membershipGrade', label: 'Grade' }, { key: 'status', label: 'Status' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.professionalMembership, '6.4');
  appendSectionTable('6.5 Designation in Professional Body / Editorial Board', [{ key: 'journalName', label: 'Body / Journal' }, { key: 'role', label: 'Role' }, { key: 'year', label: 'Year' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.editorialBoard, '6.5');
  appendSectionTable('6.6 MOOC Content Developed', [{ key: 'courseName', label: 'Course Name' }, { key: 'creditsOrWeeks', label: 'Weeks' }, { key: 'modules', label: 'Modules' }, { key: 'learnersEnrolled', label: 'Learners' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.moocDeveloped, '6.6');

  // Section VII
  detailRows.push([`SECTION VII: INDUSTRY INTERACTION & INTERNSHIP (Evaluated Score: ${effectiveScoreObj.section7Total} / 10 Marks)`]);
  detailRows.push(['']);
  appendSectionTable('7.1 Partial Delivery by Industry Experts', [{ key: 'courseCode', label: 'Course' }, { key: 'deliveryMode', label: 'Mode' }, { key: 'industryName', label: 'Industry' }, { key: 'expertName', label: 'Expert' }, { key: 'hoursDelivered', label: 'Hours' }, { key: 'dateConducted', label: 'Date' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.partialDelivery, '7.1');
  appendSectionTable('7.2 Accompanying Industrial Visits', [{ key: 'industryName', label: 'Industry' }, { key: 'location', label: 'Location' }, { key: 'studentsCount', label: 'Students' }, { key: 'visitDate', label: 'Date' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.industrialVisits, '7.2');
  appendSectionTable('7.3 Faculty Internships in Industry', [{ key: 'industryName', label: 'Industry' }, { key: 'durationDays', label: 'Days' }, { key: 'outcomes', label: 'Outcomes' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.facultyInternships, '7.3');
  appendSectionTable('7.4 Employer / Alumni Engagement', [{ key: 'companyName', label: 'Company' }, { key: 'activityType', label: 'Type' }, { key: 'outcomes', label: 'Outcomes' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.employerEngagement, '7.4');

  // Section VIII
  detailRows.push([`SECTION VIII: STUDENT DEVELOPMENT ACTIVITIES (Evaluated Score: ${effectiveScoreObj.section8Total} / 5 Marks)`]);
  detailRows.push(['']);
  appendSectionTable('8.1 Student Project Publications', [{ key: 'studentNames', label: 'Students' }, { key: 'title', label: 'Title' }, { key: 'journalOrConference', label: 'Journal / Conf' }, { key: 'publicationDate', label: 'Date' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.projectPublications, '8.1');
  appendSectionTable('8.2 Hackathon Mentoring', [{ key: 'teamName', label: 'Team' }, { key: 'studentsMentored', label: 'Students' }, { key: 'eventName', label: 'Event' }, { key: 'awardWon', label: 'Award' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.hackathonMentoring, '8.2');
  appendSectionTable('8.3 Startup & Incubation Support', [{ key: 'startupName', label: 'Startup' }, { key: 'studentNames', label: 'Students' }, { key: 'incubationCenter', label: 'Center' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.startupSupport, '8.3');

  // Section IX
  detailRows.push([`SECTION IX: INSTITUTIONAL DEVELOPMENT (Evaluated Score: ${effectiveScoreObj.section9Total} / 20 Marks)`]);
  detailRows.push(['']);
  appendSectionTable('9.1 Department-Level Activities', [{ key: 'role', label: 'Role' }, { key: 'activityType', label: 'Type' }, { key: 'involvementLevel', label: 'Level' }, { key: 'completedSuccessfully', label: 'Completed' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.deptActivities, '9.1');
  appendSectionTable('9.2 College-Level Activities', [{ key: 'role', label: 'Role' }, { key: 'committeeLevel', label: 'Committee' }, { key: 'natureOfInvolvement', label: 'Nature' }, { key: 'completedSuccessfully', label: 'Completed' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.collegeActivities, '9.2');
  appendSectionTable('9.3 Administrative Responsibilities', [{ key: 'role', label: 'Position / Role' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.adminResponsibilities, '9.3');

  const wsDetail = XLSX.utils.aoa_to_sheet(detailRows);
  wsDetail['!cols'] = [
    { wch: 6 },
    { wch: 30 },
    { wch: 30 },
    { wch: 25 },
    { wch: 20 },
    { wch: 20 },
    { wch: 40 },
  ];

  XLSX.utils.book_append_sheet(wb, wsDetail, 'Detailed Submission');

  // ── Write Binary XLSX File ─────────────────────────────────────────
  const facultyCleanName = (user?.name || 'Faculty').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `TCE_Appraisal_${facultyCleanName}_${timeline || '2024-2025'}.xlsx`;
  XLSX.writeFile(wb, filename);
};
