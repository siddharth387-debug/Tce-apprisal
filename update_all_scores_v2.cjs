
const fs = require("fs");
let content = fs.readFileSync("src/App.jsx", "utf8");
content = content.replace(/\r\n/g, "\n");

const target = "  const rawSection2Sum = sub2_1 + sub2_2 + sub2_3 + sub2_4 + sub2_5 + sub2_6 + sub2_7 + sub2_8;";
const startIndex = content.indexOf(target);

if (startIndex === -1) {
  console.log("Error: Start target not found!");
  process.exit(1);
}

// Find the return block end
const searchFrom = content.substring(startIndex);
const endSnippet = "    grandTotal,\n  };\n}";
const endOffset = searchFrom.indexOf(endSnippet);

if (endOffset === -1) {
  console.log("Error: End target not found!");
  process.exit(1);
}

const endIndex = startIndex + endOffset + endSnippet.length;

const replacement = `  const rawSection2Sum = sub2_1 + sub2_2 + sub2_3 + sub2_4 + sub2_5 + sub2_6 + sub2_7 + sub2_8;
  const section2Total = Math.min(rawSection2Sum, 55);

  // --- Section III Scoring Engine ---
  const sub3_1 = Math.min((safeData.patentsPublished || []).filter(r => r.title || r.evidenceLink).length * 1, 2);
  const sub3_2 = Math.min((safeData.patentsGranted || []).filter(r => r.title || r.evidenceLink).length * 3, 6);
  const sub3_3 = Math.min((safeData.transferOfTechnology || []).filter(r => r.title || r.evidenceLink).length * 3, 3);
  const sub3_4 = Math.min((safeData.prototypesDeveloped || []).filter(r => r.title || r.evidenceLink).length * 1, 2);
  const sub3_5 = Math.min((safeData.hackathonPrizes || []).filter(r => r.eventName || r.evidenceLink).length * 2, 2);
  const section3Total = Math.min(sub3_1 + sub3_2 + sub3_3 + sub3_4 + sub3_5, 15);

  // --- Section IV Scoring Engine ---
  const sub4_1 = Math.min(
    (safeData.researchProjects || []).reduce((sum, row) => {
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
  const sub5_1 = Math.min((safeData.internationalEngagement || []).filter(r => r.institution || r.evidenceLink).length * 1, 2);
  const sub5_2 = Math.min(
    (safeData.visitingPositions || []).reduce((sum, row) => {
      const val = parseInt(row.duration || 0, 10);
      if (val >= 30) return sum + 4;
      if (val >= 15) return sum + 3;
      if (val >= 7) return sum + 2;
      return sum;
    }, 0),
    4
  );
  const sub5_3 = Math.min((safeData.foreignFaculty || []).filter(r => r.name || r.evidenceLink).length * 1, 2);
  const sub5_4 = Math.min((safeData.reputationSurvey || []).filter(r => (r.evidenceSubmitted || "").toLowerCase() === "yes").length * 1, 1);
  const sub5_5 = Math.min((safeData.nirfSurvey || []).filter(r => (r.evidenceSubmitted || "").toLowerCase() === "yes").length * 1, 1);
  const section5Total = Math.min(sub5_1 + sub5_2 + sub5_3 + sub5_4 + sub5_5, 10);

  // --- Section VI Scoring Engine ---
  const sub6_1 = Math.min((safeData.fdpAttended || []).filter(r => r.programName || r.evidenceLink).length * 2, 3);
  const sub6_2 = Math.min(
    (safeData.programsOrganized || []).reduce((sum, row) => {
      const days = parseInt(row.days || 0, 10);
      if (days >= 5) return sum + 2;
      if (days >= 2) return sum + 1;
      return sum;
    }, 0),
    4
  );
  const sub6_3 = Math.min(
    (safeData.resourcePerson || []).reduce((sum, row) => {
      if (row.level === "International") return sum + 2;
      if (row.level === "National") return sum + 1;
      return sum;
    }, 0),
    4
  );
  const sub6_4 = Math.min((safeData.professionalMembership || []).filter(r => (r.status || "").toLowerCase() === "active").length * 1, 1);
  const sub6_5 = Math.min((safeData.editorialBoard || []).filter(r => r.bodyName || r.position).length > 0 ? 2 : 0, 2);
  const sub6_6 = Math.min((safeData.moocDeveloped || []).filter(r => r.courseName || r.evidenceLink).length * 3, 6);
  const section6Total = Math.min(sub6_1 + sub6_2 + sub6_3 + sub6_4 + sub6_5 + sub6_6, 20);

  // --- Section VII Scoring Engine ---
  const sub7_1 = Math.min(
    (safeData.partialDelivery || []).reduce((sum, row) => {
      const hrs = parseFloat(row.duration || 0);
      if (hrs >= 6) return sum + 3;
      if (hrs >= 3) return sum + 2;
      if (hrs >= 1) return sum + 1;
      return sum;
    }, 0),
    4
  );
  const sub7_2 = Math.min((safeData.industrialVisits || []).filter(r => r.visitDetails || r.evidenceLink).length * 1, 2);
  const sub7_3 = Math.min(
    (safeData.facultyInternships || []).reduce((sum, row) => {
      const days = parseInt(row.duration || 0, 10);
      if (days >= 10) return sum + 3;
      if (days >= 5) return sum + 2;
      if (days >= 2) return sum + 1;
      return sum;
    }, 0),
    3
  );
  const sub7_4 = Math.min((safeData.employerEngagement || []).filter(r => r.activityName || r.evidenceLink).length * 1, 1);
  const section7Total = Math.min(sub7_1 + sub7_2 + sub7_3 + sub7_4, 10);

  // --- Section VIII Scoring Engine ---
  const sub8_1 = Math.min((safeData.projectPublications || []).filter(r => r.title || r.evidenceLink).length * 2, 2);
  const sub8_2 = Math.min((safeData.hackathonMentoring || []).filter(r => r.eventName || r.evidenceLink).length * 1, 2);
  const sub8_3 = Math.min((safeData.startupSupport || []).filter(r => r.startupName || r.evidenceLink).length > 0 ? 1 : 0, 1);
  const section8Total = Math.min(sub8_1 + sub8_2 + sub8_3, 5);

  // --- Section IX Scoring Engine ---
  const sub9_1 = Math.min(
    (safeData.deptActivities || []).reduce((sum, row) => {
      if (row.type === "DLCs and File Maintenance") return sum + 5;
      if (row.type === "Dept. Activity & File Maintenance") return sum + 2;
      return sum;
    }, 0),
    10
  );
  const sub9_2 = Math.min(
    (safeData.collegeActivities || []).reduce((sum, row) => {
      if (row.category === "Committee Member") return sum + 3;
      if (row.category === "Internal Review Committee") return sum + 5;
      if (row.category === "CLC / Deputy Warden") return sum + 7;
      if (row.category === "Associate Dean / Deputy Registrar / Deputy CoE / Warden") return sum + 10;
      return sum;
    }, 0),
    10
  );
  const sub9_3 = Math.min((safeData.adminResponsibilities || []).filter(r => r.role || r.evidenceLink).length > 0 ? 20 : 0, 20);
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
\`;

const result = content.substring(0, startIndex) + replacement + content.substring(endIndex);
fs.writeFileSync("src/App.jsx", result);
console.log("Replaced scoring successfully!");

