import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import fs from 'fs';
import path from 'path';

function generateTsedaGuidelinesPDF() {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4',
  });

  const MAROON = [74, 21, 25]; // #4A1519
  const DARK_GRAY = [31, 41, 55];
  const LIGHT_GRAY = [243, 244, 246];

  let currentY = 32;

  // Header helper
  const printHeader = () => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12.5);
    doc.setTextColor(...MAROON);
    doc.text('Thiagarajar College of Engineering: Madurai 625 015', doc.internal.pageSize.getWidth() / 2, currentY, { align: 'center' });
    currentY += 15;

    doc.setFontSize(11);
    doc.setTextColor(...DARK_GRAY);
    doc.text('Faculty Performance Appraisal \u2013 Evaluation Guidelines', doc.internal.pageSize.getWidth() / 2, currentY, { align: 'center' });
    currentY += 14;

    doc.setFontSize(10.5);
    doc.setTextColor(...MAROON);
    doc.text('TSEDA (Department of Architecture)', doc.internal.pageSize.getWidth() / 2, currentY, { align: 'center' });
    currentY += 14;
  };

  printHeader();

  const head = [['S.No.', 'Activity', 'Scoring Rubric', 'Max Marks']];

  // Table body with sections
  const body = [
    // Section I
    [{ content: 'I \u2014 Teaching and Learning     [ Section Max: 50 ]', colSpan: 3, styles: { fontStyle: 'bold', fillColor: [254, 243, 199], textColor: [120, 53, 15] } }, { content: '50', styles: { fontStyle: 'bold', fillColor: [254, 243, 199], textColor: [120, 53, 15], halign: 'center' } }],
    ['1', 'Courses Handled Theory/Lab/TCP', '1 course = 3 | 2 courses = 6 | 3 or more courses = 8', '8'],
    ['2', 'Course File maintenance', 'Full compliance = 5 | Partial = 3', '5'],
    ['3', 'Course Design/Revision', 'Per course: 2', '5'],
    ['4', 'Value-Added / Industry supported Courses / Skill Development Programs Designed/Organized', 'Per course: 2', '4'],
    ['5.1', 'Innovative Teaching Methods Adopted (with evidence)', '\u22653 methods = 5 | 2 methods = 4 | 1 method = 2', '5'],
    ['5.2', 'Studio Based Teaching and Design Education', 'Per activity: 2', '3'],
    ['6', 'Educational Tour and Case Study Visits', 'Educational Tour : 4 | Per Case Study : 2', '4'],
    ['7', 'Mentoring System Effectiveness', 'HoD review: Good = 2 | Avg = 1', '2'],
    ['8', 'NPTEL / SWAYAM Certification (Count)', 'Per certification: 2', '4'],
    ['9', 'Student Feedback', '>90% - 4 | 80% to 90% - 3 | 75% to 80% - 1', '4'],
    ['10', 'Result Analysis \u2014 Average Pass Percentage', '\u226590% = 3 | 89\u201370% = 2 | 69\u201360% = 1', '3'],
    ['11', 'CO Attainment %', '\u226570% = 3 | 60\u201369% = 2 | 50\u201359% = 1', '3'],
    [{ content: 'Section I Subtotal', colSpan: 3, styles: { fontStyle: 'bold', halign: 'right', fillColor: [249, 250, 251] } }, { content: '50', styles: { fontStyle: 'bold', halign: 'center', fillColor: [249, 250, 251] } }],

    // Section II
    [{ content: 'II \u2014 Research & Book Publications     [ Section Max: 55 ] (Calendar Year)', colSpan: 3, styles: { fontStyle: 'bold', fillColor: [254, 243, 199], textColor: [120, 53, 15] } }, { content: '55', styles: { fontStyle: 'bold', fillColor: [254, 243, 199], textColor: [120, 53, 15], halign: 'center' } }],
    ['1', 'Research Paper: SCI/Scopus indexed Journals', 'Per Q1 paper: 6 | Per Q2 paper: 4 | Per Q3 paper: 2', '15'],
    ['2', 'Total Scopus Citations Received with TCE affiliations in the last 3 years', '\u226550 = 8 | 25\u201349 = 5 | 15\u201324 = 4 | 14\u20135 = 3 | 4\u20131 = 1', '8'],
    ['3', 'Total Q1 Scopus Citations with TCE affiliations in the last 3 years', '\u226525 = 7 | 15\u201320 = 5 | 6\u201315 = 3 | 1\u20135 = 1', '7'],
    ['4', 'Book / Book Chapter Publications', 'Per book (Author): 5 | Per chapter Author / Editor: 2', '4'],
    ['5', 'Conference Paper Publications', 'Per paper (Scopus): 1', '4'],
    ['6', 'Creative Scholarship and Professional Writing', 'Per writing: 2', '6'],
    ['7', 'No. of PhD Scholars pursuing', 'Per scholar registered: 1', '5'],
    ['8', 'No. of PhD Scholars Awarded in the Year', 'Per scholar awarded: 3', '6'],
    [{ content: 'Section II Subtotal (Calendar Year)', colSpan: 3, styles: { fontStyle: 'bold', halign: 'right', fillColor: [249, 250, 251] } }, { content: '55', styles: { fontStyle: 'bold', halign: 'center', fillColor: [249, 250, 251] } }],

    // Section III
    [{ content: 'III \u2014 Patents and Innovation     [ Section Max: 15 ] (Calendar Year)', colSpan: 3, styles: { fontStyle: 'bold', fillColor: [254, 243, 199], textColor: [120, 53, 15] } }, { content: '15', styles: { fontStyle: 'bold', fillColor: [254, 243, 199], textColor: [120, 53, 15], halign: 'center' } }],
    ['1', 'Number of Patents Published', 'Per patent: 1', '1'],
    ['2', 'Number of Patents Granted', 'Per patent: 3', '3'],
    ['3', 'Number of Transfer of Technology', 'Per ToT: 2', '2'],
    ['4', 'Number of Prototype/Product Developed (with Students)', 'Per Product: 1', '3'],
    ['5', 'Hackathon Mentoring & Prizes won (with Students)', 'Per Prize: 1', '2'],
    ['6', 'Design Patent Granted', 'Per patent: 2', '4'],
    [{ content: 'Section III Subtotal', colSpan: 3, styles: { fontStyle: 'bold', halign: 'right', fillColor: [249, 250, 251] } }, { content: '15', styles: { fontStyle: 'bold', halign: 'center', fillColor: [249, 250, 251] } }],

    // Section IV
    [{ content: 'IV \u2014 Sponsored Research & Consultancy     [ Section Max: 15 ] (Calendar Year)', colSpan: 3, styles: { fontStyle: 'bold', fillColor: [254, 243, 199], textColor: [120, 53, 15] } }, { content: '15', styles: { fontStyle: 'bold', fillColor: [254, 243, 199], textColor: [120, 53, 15], halign: 'center' } }],
    ['1', 'Sponsored Research Project (PI/Co-PI)', '\u2265\u20B920L = 8 | \u20B915\u201320L = 5 | \u20B910L\u201315L = 3 | \u20B95L\u201310L = 2 | \u20B91L\u20135L = 1', '8'],
    ['2', 'Consultancy work', '\u2265\u20B95L = 7 | \u20B93L\u20135L = 5 | 1L\u20133L = 3 | <\u20B91L = 1', '7'],
    [{ content: 'Section IV Subtotal', colSpan: 3, styles: { fontStyle: 'bold', halign: 'right', fillColor: [249, 250, 251] } }, { content: '15', styles: { fontStyle: 'bold', halign: 'center', fillColor: [249, 250, 251] } }],

    // Section V
    [{ content: 'V \u2014 International Engagement & Rankings Contribution     [ Section Max: 10 ]', colSpan: 3, styles: { fontStyle: 'bold', fillColor: [254, 243, 199], textColor: [120, 53, 15] } }, { content: '10', styles: { fontStyle: 'bold', fillColor: [254, 243, 199], textColor: [120, 53, 15], halign: 'center' } }],
    ['1', 'International Engagement / MoU', 'Per active collaboration / engagement : 1', '1'],
    ['2', 'Visiting / Adjunct Position Abroad', '\u226530 days = 2 | 1\u201329 days = 1', '2'],
    ['3', 'Foreign Faculty / Student Hosted or Engaged', 'Per engagement: 1', '1'],
    ['4', 'QS/THE Reputation Survey Nominations', 'Submitted with evidence = 1 | Not = 0', '1'],
    ['5', 'NIRF Survey Nomination', 'Submitted with evidence = 1 | Not = 0', '1'],
    ['6', 'International Design Studio or other Collaborations', 'Per collaboration: 2 (max 4)', '4'],
    [{ content: 'Section V Subtotal', colSpan: 3, styles: { fontStyle: 'bold', halign: 'right', fillColor: [249, 250, 251] } }, { content: '10', styles: { fontStyle: 'bold', halign: 'center', fillColor: [249, 250, 251] } }],

    // Section VI
    [{ content: 'VI \u2014 Faculty Development & Professional Activities     [ Section Max: 20 ]', colSpan: 3, styles: { fontStyle: 'bold', fillColor: [254, 243, 199], textColor: [120, 53, 15] } }, { content: '20', styles: { fontStyle: 'bold', fillColor: [254, 243, 199], textColor: [120, 53, 15], halign: 'center' } }],
    ['1', 'FDP / STTP Attended (5 days and above)', 'Per programme: 2', '3'],
    ['2', 'FDP Organized', 'Per FDP (\u2265 5 days) : 2 ; per FDP (2-4 days) : 1', '4'],
    ['3', 'Resource Person / Keynote Speaker', 'International = 2 | National = 1', '4'],
    ['4', 'Professional Society Membership', 'Active member = 1 | None = 0', '1'],
    ['5', 'Designation in Professional Body / Editorial Board', 'Holds position = 2 | None = 0', '2'],
    ['6', 'MOOCs Content Developed (TCE MOOCs)', 'Per course: 3', '6'],
    [{ content: 'Section VI Subtotal', colSpan: 3, styles: { fontStyle: 'bold', halign: 'right', fillColor: [249, 250, 251] } }, { content: '20', styles: { fontStyle: 'bold', halign: 'center', fillColor: [249, 250, 251] } }],

    // Section VII
    [{ content: 'VII \u2014 Industry Interaction & Internship     [ Section Max: 10 ]', colSpan: 3, styles: { fontStyle: 'bold', fillColor: [254, 243, 199], textColor: [120, 53, 15] } }, { content: '10', styles: { fontStyle: 'bold', fillColor: [254, 243, 199], textColor: [120, 53, 15], halign: 'center' } }],
    ['1', 'Partial delivery of regular courses by industry experts', '\u22656 hrs = 3 | 3 hrs = 2 | 1\u20132 hrs = 1', '4'],
    ['2', 'Accompanying Industrial Visit', 'Per visit: 1', '2'],
    ['3', 'Faculty Internship in Industries', '\u226510 days = 3 | 5\u20137 days = 2 | < 2\u20134 days = 1', '3'],
    ['4', 'Employer / Alumni Engagement Activity', 'Per activity: 1', '1'],
    [{ content: 'Section VII Subtotal', colSpan: 3, styles: { fontStyle: 'bold', halign: 'right', fillColor: [249, 250, 251] } }, { content: '10', styles: { fontStyle: 'bold', halign: 'center', fillColor: [249, 250, 251] } }],

    // Section VIII
    [{ content: 'VIII \u2014 Student Development Activities     [ Section Max: 5 ]', colSpan: 3, styles: { fontStyle: 'bold', fillColor: [254, 243, 199], textColor: [120, 53, 15] } }, { content: '5', styles: { fontStyle: 'bold', fillColor: [254, 243, 199], textColor: [120, 53, 15], halign: 'center' } }],
    ['1', 'UG/PG Student Project Publication / Conference Paper Guided (Scopus)', 'Per output: 1', '1'],
    ['2', 'Hackathon / Competition Mentoring - NASA/ZONASA/ INSDAG/IGBC/Other Professional Body Competitions', 'Per event: 1', '2'],
    ['3', 'Startup / Incubation Support / Tech-Club', 'Active mentoring = 1', '1'],
    ['4', 'Student Exhibitions', 'Per exhibition: 1', '1'],
    [{ content: 'Section VIII Subtotal', colSpan: 3, styles: { fontStyle: 'bold', halign: 'right', fillColor: [249, 250, 251] } }, { content: '5', styles: { fontStyle: 'bold', halign: 'center', fillColor: [249, 250, 251] } }],

    // Section IX
    [{ content: 'IX \u2014 Institutional Contribution     [ Section Max: 20 ]', colSpan: 3, styles: { fontStyle: 'bold', fillColor: [254, 243, 199], textColor: [120, 53, 15] } }, { content: '20', styles: { fontStyle: 'bold', fillColor: [254, 243, 199], textColor: [120, 53, 15], halign: 'center' } }],
    ['1', 'Department Level Activities (Programme Coordinator, Lab section in-charge, Special classes for weaker students, GATE coaching, NBA, DLCs, Time Table, BoS, CAT, Placement, 5S, Branding, ...)', 'DLCs and File Maintenance : 5\nDept. Activity and File Maintenance : 2 per Activity', '10'],
    ['2', 'College Level Activities (College Day, Graduation Day, Founders Day, MoUs Status review panel, Professional Societies Review panel, ...)', '- Committee Members in College Level Activities: 3 per Activity\n- Members in Internal Review Committee: 5 per Committee\n- CLCs / Dy.Warden : 7\n- Associate Deans / Dy.Registrar / Dy.CoE / Warden: 10', '10'],
    ['3', 'Administrative Responsibilities (Registrar / Deans / CoE / Head IQAC / HoDs)', 'Flat allocation', '20'],
    [{ content: 'Section IX Subtotal', colSpan: 3, styles: { fontStyle: 'bold', halign: 'right', fillColor: [249, 250, 251] } }, { content: '20', styles: { fontStyle: 'bold', halign: 'center', fillColor: [249, 250, 251] } }],

    // Grand Total
    [{ content: 'GRAND TOTAL (out of 200)', colSpan: 3, styles: { fontStyle: 'bold', halign: 'right', fillColor: [254, 226, 226], textColor: [153, 27, 27], fontSize: 10 } }, { content: '200', styles: { fontStyle: 'bold', halign: 'center', fillColor: [254, 226, 226], textColor: [153, 27, 27], fontSize: 10 } }]
  ];

  autoTable(doc, {
    startY: currentY,
    head: head,
    body: body,
    theme: 'grid',
    headStyles: {
      fillColor: MAROON,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
      fontSize: 9,
    },
    styles: {
      fontSize: 8.2,
      cellPadding: 3.5,
      textColor: DARK_GRAY,
      lineColor: [209, 213, 219],
      lineWidth: 0.5,
      valign: 'middle',
    },
    columnStyles: {
      0: { cellWidth: 32, halign: 'center' },
      1: { cellWidth: 175 },
      2: { cellWidth: 265 },
      3: { cellWidth: 48, halign: 'center', fontStyle: 'bold' },
    },
    margin: { left: 35, right: 35 },
  });

  // Now append Weightage Table
  doc.addPage();
  currentY = 32;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...MAROON);
  doc.text('Institutional Weightage Scheme \u2013 TSEDA (Department of Architecture)', doc.internal.pageSize.getWidth() / 2, currentY, { align: 'center' });
  currentY += 16;

  doc.setFontSize(9.5);
  doc.setTextColor(...DARK_GRAY);
  doc.text('Total Evaluation: 200 Marks (100% Normalized Weightage Distribution)', doc.internal.pageSize.getWidth() / 2, currentY, { align: 'center' });
  currentY += 14;

  const weightageHead = [['Section', 'Max Marks', '% of 200', 'Weightage Basis']];
  const weightageBody = [
    ['I \u2014 Teaching and Learning', '50', '25%', 'NIRF TLR 30% \u2022 THE Teaching 29.5% \u2022 NBA core (CO/PO/OBE) ~50% \u2022 NAAC Criteria 1+2 ~25%'],
    ['II \u2014 Research & Book Publications', '55', '27.5%', 'NIRF RPC 30% \u2022 THE Research Env. + Quality 59% \u2022 QS Citations + Academic Rep ~50%'],
    ['III \u2014 Patents and Innovation', '15', '7.5%', 'NIRF RPC (IPR sub-component) \u2022 NAAC IPR \u2022 THE Industry partly'],
    ['IV \u2014 Sponsored Research & Consultancy', '15', '7.5%', 'NIRF RPC funding \u2022 THE Industry 4% + Research Income ~5% \u2022 NAAC Criteria 3'],
    ['V \u2014 International Engagement & Rankings', '10', '5%', 'QS International + IRN 15% \u2022 THE International Outlook 7.5%'],
    ['VI \u2014 Faculty Development & Professional Activities', '20', '10%', 'NAAC Criterion 6 ~10% \u2022 NBA Faculty Quality ~10% \u2022 NIRF FQE'],
    ['VII \u2014 Industry Interaction & Internship', '10', '5%', 'QS Employer Reputation 15% (partial) \u2022 THE Industry \u2022 NAAC + NIRF'],
    ['VIII \u2014 Student Development Activities', '5', '2.5%', 'NAAC + NBA student outcomes'],
    ['IX \u2014 Institutional Development', '20', '10%', 'NAAC Criteria 6+7 \u2022 NBA documentation \u2022 NIRF/THE/QS data submission'],
    [{ content: 'TOTAL', styles: { fontStyle: 'bold', halign: 'right', fillColor: [254, 226, 226], textColor: [153, 27, 27] } }, { content: '200', styles: { fontStyle: 'bold', halign: 'center', fillColor: [254, 226, 226], textColor: [153, 27, 27] } }, { content: '100%', styles: { fontStyle: 'bold', halign: 'center', fillColor: [254, 226, 226], textColor: [153, 27, 27] } }, { content: 'Fully aligned with NAAC A++, NBA, NIRF, QS, THE Benchmarks', styles: { fontStyle: 'bold', fillColor: [254, 226, 226], textColor: [153, 27, 27] } }]
  ];

  autoTable(doc, {
    startY: currentY,
    head: weightageHead,
    body: weightageBody,
    theme: 'grid',
    headStyles: {
      fillColor: MAROON,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
      fontSize: 9,
    },
    styles: {
      fontSize: 8.5,
      cellPadding: 5,
      textColor: DARK_GRAY,
      lineColor: [209, 213, 219],
      lineWidth: 0.5,
      valign: 'middle',
    },
    columnStyles: {
      0: { cellWidth: 155, fontStyle: 'bold' },
      1: { cellWidth: 55, halign: 'center', fontStyle: 'bold' },
      2: { cellWidth: 55, halign: 'center' },
      3: { cellWidth: 255 },
    },
    margin: { left: 35, right: 35 },
  });

  // Page numbering footer
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(156, 163, 175);
    doc.text(`TSEDA Faculty Performance Appraisal Guidelines \u2022 Page ${i} of ${totalPages}`, doc.internal.pageSize.getWidth() / 2, doc.internal.pageSize.getHeight() - 16, { align: 'center' });
  }

  const outPath = path.join('public', 'TSEDA Faculty Appraisal Evaluation Guidelines.pdf');
  const pdfBytes = doc.output('arraybuffer');
  fs.writeFileSync(outPath, Buffer.from(pdfBytes));
  console.log(`Saved TSEDA guidelines PDF to ${outPath}`);

  const aliasPath = path.join('public', 'tseda_faculty_appraisal_evaluation_guidelines.pdf');
  fs.writeFileSync(aliasPath, Buffer.from(pdfBytes));
  console.log(`Saved alias to ${aliasPath}`);
}

generateTsedaGuidelinesPDF();
