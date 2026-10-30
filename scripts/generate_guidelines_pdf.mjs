import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import fs from 'fs';
import path from 'path';

export function generateGuidelinesPDF(outputPath) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Header function for each page
  const addHeader = (data) => {
    // Only on page 1
    if (data.pageNumber === 1) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(20, 20, 20);
      doc.text('Thiagarajar College of Engineering: Madurai 625 015', pageWidth / 2, 14, { align: 'center' });

      doc.setFontSize(11);
      doc.text('Faculty Performance Appraisal – Evaluation Guidelines', pageWidth / 2, 20, { align: 'center' });

      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('(Engineering, AMCS, CA, S&H Departments)', pageWidth / 2, 25.5, { align: 'center' });
    }
  };

  // Add footer with page numbering
  const addFooter = (data) => {
    const pageCount = doc.internal.getNumberOfPages();
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(
      `Page ${data.pageNumber} of ${pageCount}`,
      pageWidth / 2,
      pageHeight - 8,
      { align: 'center' }
    );
    doc.text(
      'TCE Faculty Performance Appraisal — Official Evaluation Guidelines',
      12,
      pageHeight - 8
    );
  };

  const tableBody = [
    // Section I
    [{ content: 'I — Teaching and Learning   [ Section Max: 50 ]', colSpan: 3, styles: { fontStyle: 'bold', fillColor: [240, 243, 246], textColor: [20, 20, 20] } }, { content: '50', styles: { fontStyle: 'bold', halign: 'center', fillColor: [240, 243, 246] } }],
    ['1', 'Courses Handled Theory/Lab/TCP', '1 course = 3 | 2 courses = 6 | 3 or more courses = 8', '8'],
    ['2', 'Course File maintenance', 'Full compliance = 5 | Partial = 3', '5'],
    ['3', 'Course Design/Revision', 'Per course: 2', '5'],
    ['4', 'Value-Added / Industry supported Courses / Skill Development Programs Designed/Organized', 'Per course: 2', '4'],
    ['5', 'Innovative Teaching Methods Adopted (with evidence)', '≥3 methods = 5 | 2 methods = 4 | 1 method = 2', '5'],
    ['6', 'Academic Collaborations (Joint Teaching / Collaborative Activities with Professors from HLI)', 'Per Engagement', '4'],
    ['7', 'Mentoring System Effectiveness', 'HoD review: Good = 2 | Avg = 1', '2'],
    ['8', 'NPTEL / SWAYAM Certification (Count)', 'Per Certification: 2', '4'],
    ['9', 'Student Feedback', '>90% - 4, 80% to 90% - 3, 75% to 80% - 1', '4'],
    ['10', 'Result Analysis — Average Pass Percentage', '≥90% = 5 | 80–89% = 4 | 70–79% = 3 | 60–69% = 2 | <60% = 1', '5'],
    ['11', 'CO Attainment %', '≥70% = 4 | 60–69% = 3 | 50–59% = 2', '4'],
    [{ content: 'Section I Subtotal', colSpan: 3, styles: { fontStyle: 'bold', halign: 'right', fillColor: [248, 249, 250] } }, { content: '50', styles: { fontStyle: 'bold', halign: 'center', fillColor: [248, 249, 250] } }],

    // Section II
    [{ content: 'II — Research Publications   [ Section Max: 55 ] (For Calendar Year Jan-Dec)', colSpan: 3, styles: { fontStyle: 'bold', fillColor: [240, 243, 246], textColor: [20, 20, 20] } }, { content: '55', styles: { fontStyle: 'bold', halign: 'center', fillColor: [240, 243, 246] } }],
    ['1', 'Research Paper: SCI/Scopus indexed journals', 'Per Q1 paper: 6 | Per Q2 paper: 4 | Per Q3 paper: 2', '15'],
    ['2', 'Citations Received with TCE affiliations in the last 3 years', '≥50 = 8 | 25–49 = 5 | 15–24 = 4 | 5–14 = 3 | 1–4 = 1', '8'],
    ['3', 'Total Q1 Citations', '≥25 = 7 | 15–20 = 5 | 6–15 = 3 | 1–5 = 1', '7'],
    ['4', 'Book / Book Chapter Publication', 'Per book (Author): 5 | Per chapter Author / Editor: 2', '5'],
    ['5', 'National/International Conference Publications', 'Per paper (Scopus): 1', '4'],
    ['6', 'Research Paper: Collaborations with Premier Institutions or Industry Experts', 'Collaboration(s) per Paper\n(National/Industry: 2, International: 3)', '5'],
    ['7', 'PhD Scholars Guiding (Count)', 'Per scholar registered: 1', '5'],
    ['8', 'PhD Scholars Awarded in the Year', 'Per scholar awarded: 3', '6'],
    [{ content: 'Section II Subtotal', colSpan: 3, styles: { fontStyle: 'bold', halign: 'right', fillColor: [248, 249, 250] } }, { content: '55', styles: { fontStyle: 'bold', halign: 'center', fillColor: [248, 249, 250] } }],

    // Section III
    [{ content: 'III — Patents and Innovation   [ Section Max: 15 ]', colSpan: 3, styles: { fontStyle: 'bold', fillColor: [240, 243, 246], textColor: [20, 20, 20] } }, { content: '15', styles: { fontStyle: 'bold', halign: 'center', fillColor: [240, 243, 246] } }],
    ['1', 'Published Utility Patent', 'Per patent: 1', '2'],
    ['2', 'Granted Utility Patent', 'Per patent: 3', '6'],
    ['3', 'Transfer of Technology', 'Per ToT: 3', '3'],
    ['4', 'Prototype/Product Developed (with Students)', 'Per Product: 1', '2'],
    ['5', 'Hackathon Mentoring & Prizes won (with Students)', 'Per Prize: 2', '2'],
    [{ content: 'Section III Subtotal', colSpan: 3, styles: { fontStyle: 'bold', halign: 'right', fillColor: [248, 249, 250] } }, { content: '15', styles: { fontStyle: 'bold', halign: 'center', fillColor: [248, 249, 250] } }],

    // Section IV
    [{ content: 'IV — Sponsored Research & Consultancy   [ Section Max: 15 ]', colSpan: 3, styles: { fontStyle: 'bold', fillColor: [240, 243, 246], textColor: [20, 20, 20] } }, { content: '15', styles: { fontStyle: 'bold', halign: 'center', fillColor: [240, 243, 246] } }],
    ['1', 'Research Project (PI/Co-PI)', '≥₹20L = 8 | ₹15–20L = 5 | ₹10L–15L = 3 | ₹5L–10L = 2 |\n₹1L–5L = 1', '8'],
    ['2', 'Consultancy', '≥₹5L = 7 | ₹3L–5L = 5 | ₹1L–3L = 3 | <₹1L = 1', '7'],
    [{ content: 'Section IV Subtotal', colSpan: 3, styles: { fontStyle: 'bold', halign: 'right', fillColor: [248, 249, 250] } }, { content: '15', styles: { fontStyle: 'bold', halign: 'center', fillColor: [248, 249, 250] } }],

    // Section V
    [{ content: 'V — International Engagement & Rankings Contribution   [ Section Max: 10 ]', colSpan: 3, styles: { fontStyle: 'bold', fillColor: [240, 243, 246], textColor: [20, 20, 20] } }, { content: '10', styles: { fontStyle: 'bold', halign: 'center', fillColor: [240, 243, 246] } }],
    ['1', 'International Engagement / MoU', 'Per active collaboration / Engagement : 1', '2'],
    ['2', 'Visiting / Adjunct Position Abroad', '≥30 days = 4 | 15–30 days = 3 | 7–15 days = 2', '4'],
    ['3', 'Foreign Faculty / Student Hosted or Engaged', 'Per engagement: 1', '2'],
    ['4', 'QS/THE Reputation Survey Nominations', 'Submitted with evidence = 1 | Not = 0', '1'],
    ['5', 'NIRF Survey Nomination', 'Submitted with evidence = 1 | Not = 0', '1'],
    [{ content: 'Section V Subtotal', colSpan: 3, styles: { fontStyle: 'bold', halign: 'right', fillColor: [248, 249, 250] } }, { content: '10', styles: { fontStyle: 'bold', halign: 'center', fillColor: [248, 249, 250] } }],

    // Section VI
    [{ content: 'VI — Faculty Development & Professional Activities   [ Section Max: 20 ]', colSpan: 3, styles: { fontStyle: 'bold', fillColor: [240, 243, 246], textColor: [20, 20, 20] } }, { content: '20', styles: { fontStyle: 'bold', halign: 'center', fillColor: [240, 243, 246] } }],
    ['1', 'FDP / STTP Attended (5 days)', 'Per program: 2', '3'],
    ['2', 'Programs (FDP/STTP/Workshops/others) Organized', 'Per program (≥ 5 days) : 2 ; per program (2 - 4 days) : 1', '4'],
    ['3', 'Resource Person / Keynote Speaker', 'International = 2 | National = 1', '4'],
    ['4', 'Professional Society Membership', 'Active member = 1 | None = 0', '1'],
    ['5', 'Designation in Professional Body / Editorial Board', 'Holds position = 2 | None = 0', '2'],
    ['6', 'MOOCs Content Developed (TCE MOOCs)', 'Per course: 3', '6'],
    [{ content: 'Section VI Subtotal', colSpan: 3, styles: { fontStyle: 'bold', halign: 'right', fillColor: [248, 249, 250] } }, { content: '20', styles: { fontStyle: 'bold', halign: 'center', fillColor: [248, 249, 250] } }],

    // Section VII
    [{ content: 'VII — Industry Interaction & Internship   [ Section Max: 10 ]', colSpan: 3, styles: { fontStyle: 'bold', fillColor: [240, 243, 246], textColor: [20, 20, 20] } }, { content: '10', styles: { fontStyle: 'bold', halign: 'center', fillColor: [240, 243, 246] } }],
    ['1', 'Partial delivery of regular courses by industry experts', '≥6 hrs = 3 | 3 hrs = 2 | 1 - 2 hrs = 1', '4'],
    ['2', 'Accompanying Industrial Visit', 'Per visit: 1', '2'],
    ['3', 'Faculty Internship in Industries', '≥10 days = 3 | 5–7 days = 2 | < 2- 4 days = 1', '3'],
    ['4', 'Employer / Alumni Engagement Activity', 'Per activity: 1', '1'],
    [{ content: 'Section VII Subtotal', colSpan: 3, styles: { fontStyle: 'bold', halign: 'right', fillColor: [248, 249, 250] } }, { content: '10', styles: { fontStyle: 'bold', halign: 'center', fillColor: [248, 249, 250] } }],

    // Section VIII
    [{ content: 'VIII — Student Development Activities   [ Section Max: 5 ]', colSpan: 3, styles: { fontStyle: 'bold', fillColor: [240, 243, 246], textColor: [20, 20, 20] } }, { content: '5', styles: { fontStyle: 'bold', halign: 'center', fillColor: [240, 243, 246] } }],
    ['1', 'UG/PG Student Project Publication (Scopus)', 'Per publication: 2', '2'],
    ['2', 'Hackathon / Competition Mentoring', 'Per event: 1', '2'],
    ['3', 'Startup / Incubation Support / Tech-Club', 'Active mentoring = 1', '1'],
    [{ content: 'Section VIII Subtotal', colSpan: 3, styles: { fontStyle: 'bold', halign: 'right', fillColor: [248, 249, 250] } }, { content: '5', styles: { fontStyle: 'bold', halign: 'center', fillColor: [248, 249, 250] } }],

    // Section IX
    [{ content: 'IX — Institutional Development   [ Section Max: 20 ]', colSpan: 3, styles: { fontStyle: 'bold', fillColor: [240, 243, 246], textColor: [20, 20, 20] } }, { content: '20', styles: { fontStyle: 'bold', halign: 'center', fillColor: [240, 243, 246] } }],
    [
      '1',
      'Department Level Activities\n(Programme Coordinator, Laboratory section in-charge, Special classes for weaker students, GATE coaching to advanced learners, NBA Activities at Department Level, DLCs and Administrative Responsibilities such as Time Table, Board of Studies, Project Coordinators, CAT, Placement, Association/Professional Societies/Clubs, Students’ Course Registration, Students’ awards/prizes details, Magazine, Alumni, Class Committee Meeting, Guest Lecture, 5S, Branding, Conference/Community Engagement Programs Organizers/Convenors, …)',
      'DLCs and File Maintenance : 5\nDept. Activity and File Maintenance : 2 per Activity',
      '10',
    ],
    [
      '2',
      'College Level Activities\n(College Day, Graduation Day, Founders Day, MoUs Status review panel, Professional Societies Review panel, …)',
      '• Committee Members in College Level Activities: 3 per Activity\n• Members in Internal Review Committee: 5 per Committee\n• CLCs / Dy.Warden : 7\n• Associate Deans / Dy.Registrar / Dy.CoE: 10',
      '10',
    ],
    [
      '3',
      'Administrative Responsibilities\nRegistrar / Deans / CoE / Head IQAC / HoDs',
      'Full Institutional Leadership / Governance Allocation: 20',
      '20',
    ],
    [{ content: 'Section IX Subtotal', colSpan: 3, styles: { fontStyle: 'bold', halign: 'right', fillColor: [248, 249, 250] } }, { content: '20', styles: { fontStyle: 'bold', halign: 'center', fillColor: [248, 249, 250] } }],

    // Grand Total
    [{ content: 'GRAND TOTAL (out of 200)', colSpan: 3, styles: { fontStyle: 'bold', halign: 'right', fillColor: [74, 21, 25], textColor: [255, 255, 255], fontSize: 9 } }, { content: '200', styles: { fontStyle: 'bold', halign: 'center', fillColor: [74, 21, 25], textColor: [255, 255, 255], fontSize: 9 } }],
  ];

  autoTable(doc, {
    startY: 30,
    margin: { left: 10, right: 10, top: 28, bottom: 12 },
    head: [['S.No.', 'Activity', 'Scoring Rubric', 'Max Marks']],
    body: tableBody,
    theme: 'grid',
    styles: {
      fontSize: 8,
      cellPadding: 1.8,
      textColor: [30, 41, 59],
      lineColor: [203, 213, 225],
      lineWidth: 0.15,
      valign: 'middle',
    },
    headStyles: {
      fillColor: [74, 21, 25],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5,
      halign: 'center',
    },
    columnStyles: {
      0: { cellWidth: 12, halign: 'center' },
      1: { cellWidth: 70 },
      2: { cellWidth: 88 },
      3: { cellWidth: 20, halign: 'center', fontStyle: 'bold' },
    },
    didDrawPage: (data) => {
      addHeader(data);
      addFooter(data);
    },
  });

  // Now add the Weightage Basis table
  const finalY = doc.lastAutoTable.finalY + 6;
  if (finalY > pageHeight - 65) {
    doc.addPage();
  }

  const weightageStartY = finalY > pageHeight - 65 ? 20 : finalY;

  autoTable(doc, {
    startY: weightageStartY,
    margin: { left: 10, right: 10, top: 16, bottom: 12 },
    head: [['Section', 'Max Marks', '% of 200', 'Weightage Basis']],
    body: [
      ['I — Teaching and Learning', '50', '25%', 'NIRF TLR 30% • THE Teaching 29.5% • NBA core (CO/PO/OBE) ~50% • NAAC Criteria 1+2 ~25%'],
      ['II — Research & Book Publications', '55', '27.5%', 'NIRF RPC 30% • THE Research Env. + Quality 59% • QS Citations + Academic Rep ~50%'],
      ['III — Patents and Innovation', '15', '7.5%', 'NIRF RPC (IPR sub-component) • NAAC IPR • THE Industry partly'],
      ['IV — Sponsored Research & Consultancy', '15', '7.5%', 'NIRF RPC funding • THE Industry 4% + Research Income ~5% • NAAC Criteria 3'],
      ['V — International Engagement & Rankings', '10', '5%', 'QS International + IRN 15% • THE International Outlook 7.5%'],
      ['VI — Faculty Development & Professional Activities', '20', '10%', 'NAAC Criterion 6 ~10% • NBA Faculty Quality ~10% • NIRF FQE'],
      ['VII — Industry Interaction & Internship', '10', '5%', 'QS Employer Reputation 15% (partial) • THE Industry • NAAC + NIRF'],
      ['VIII — Student Development Activities', '5', '2.5%', 'NAAC + NBA student outcomes'],
      ['IX — Institutional Development', '20', '10%', 'NAAC Criteria 6+7 • NBA documentation • NIRF/THE/QS data submission'],
      [{ content: 'TOTAL', styles: { fontStyle: 'bold', halign: 'center' } }, { content: '200', styles: { fontStyle: 'bold', halign: 'center' } }, { content: '100%', styles: { fontStyle: 'bold', halign: 'center' } }, { content: 'Comprehensive Institutional Multi-Ranking Criteria', styles: { fontStyle: 'bold' } }],
    ],
    theme: 'grid',
    styles: {
      fontSize: 7.5,
      cellPadding: 1.5,
      textColor: [30, 41, 59],
      lineColor: [203, 213, 225],
      lineWidth: 0.15,
      valign: 'middle',
    },
    headStyles: {
      fillColor: [74, 21, 25],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'center',
    },
    columnStyles: {
      0: { cellWidth: 55, fontStyle: 'bold' },
      1: { cellWidth: 20, halign: 'center' },
      2: { cellWidth: 20, halign: 'center' },
      3: { cellWidth: 95 },
    },
    didDrawPage: (data) => {
      addFooter(data);
    },
  });

  const buffer = Buffer.from(doc.output('arraybuffer'));
  fs.writeFileSync(outputPath, buffer);
  console.log(`✓ Guidelines PDF generated successfully at: ${outputPath} (${buffer.length} bytes)`);
}

// Generate to public directory
const target = path.resolve('public/Faculty Appraisal Evaluation Guidelines.pdf');
generateGuidelinesPDF(target);
