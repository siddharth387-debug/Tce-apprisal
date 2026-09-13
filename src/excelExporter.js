import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { computeEffectiveScores, SUBSECTION_MAX_MARKS } from './scoringEngine.js';

export const exportAppraisalToExcel = async ({
  user,
  timeline,
  sectionData = {},
  scores = {},
  record = {},
}) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'TCE Appraisal System';
  workbook.created = new Date();

  const effectiveScoreObj = computeEffectiveScores(sectionData, record.hodSubsectionScores || {});

  // =========================================================================
  // SHEET 1: THE SUMMARY (PRETTY PRINTABLE FORMAT)
  // =========================================================================
  const wsSummary = workbook.addWorksheet('Appraisal Summary', {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5 } }
  });

  // Set exact column widths to prevent squishing
  wsSummary.getColumn(1).width = 25; // Column A (Labels)
  wsSummary.getColumn(2).width = 45; // Column B (Values / Names)
  wsSummary.getColumn(3).width = 22; // Column C (Labels)
  wsSummary.getColumn(4).width = 25; // Column D (Values / Dates)

  // Header
  wsSummary.mergeCells('A1:D1');
  const title1 = wsSummary.getCell('A1');
  title1.value = 'THIAGARAJAR COLLEGE OF ENGINEERING, MADURAI - 625 015';
  title1.font = { bold: true, size: 14 };
  title1.alignment = { horizontal: 'center' };

  wsSummary.mergeCells('A2:D2');
  const title2 = wsSummary.getCell('A2');
  title2.value = 'FACULTY PERFORMANCE APPRAISAL SYSTEM - SUMMARY REPORT';
  title2.font = { bold: true, size: 12, color: { argb: 'FF800000' } }; // Maroon
  title2.alignment = { horizontal: 'center' };

  wsSummary.addRow([]); // Blank

  // Faculty Info
  wsSummary.addRow(['Faculty Name:', user?.name || 'Faculty Member', 'Academic Year:', timeline || '2024-2025']);
  wsSummary.addRow(['Email Address:', user?.email || '—', 'Date Generated:', new Date().toLocaleDateString('en-GB')]);
  wsSummary.addRow(['Designation:', user?.role || 'Faculty', 'Status:', record.appraisalStatus || 'Pending']);
  wsSummary.addRow(['Grand Total Score:', `${effectiveScoreObj.grandTotal} / 200 Marks`, 'Percentage:', `${((effectiveScoreObj.grandTotal / 200) * 100).toFixed(1)}%`]);

  [4, 5, 6, 7].forEach(r => {
    wsSummary.getCell(`A${r}`).font = { bold: true, color: { argb: 'FF475569' } };
    wsSummary.getCell(`C${r}`).font = { bold: true, color: { argb: 'FF475569' } };
  });

  wsSummary.addRow([]); // Blank

  // Matrix Header
  const matrixTitleRow = wsSummary.addRow(['EXECUTIVE SCORE SUMMARY MATRIX' + (effectiveScoreObj.hasAdjustments ? ' (Includes HoD Evaluated Marks)' : '')]);
  wsSummary.mergeCells(`A9:D9`);
  matrixTitleRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
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
  
  // Remarks
  const remarkTitle = wsSummary.addRow(['Head of Department (HoD) Remarks:']);
  remarkTitle.getCell(1).font = { bold: true };
  const remarkValue = wsSummary.addRow([record.hodRemarks || '—']);
  wsSummary.mergeCells(`A${remarkValue.number}:D${remarkValue.number}`);
  remarkValue.getCell(1).alignment = { wrapText: true, vertical: 'top' };
  wsSummary.getRow(remarkValue.number).height = 40;

  wsSummary.addRow([]);
  wsSummary.addRow([]);
  wsSummary.addRow([]);

  // Explicit Signature Block for Printing
  const sigRow1 = wsSummary.addRow(['Faculty Member Signature', '', 'Head of Department Signature', '']);
  sigRow1.getCell(1).font = { bold: true };
  sigRow1.getCell(3).font = { bold: true };
  
  const sigRow2 = wsSummary.addRow(['Name: ______________________', '', 'Name: ______________________', '']);
  const sigRow3 = wsSummary.addRow(['Date: ______________________', '', 'Date: ______________________', '']);

  // =========================================================================
  // SHEET 2: THE RAW DATA (FLAT DATABASE FORMAT FOR EASY FILTERING/COPYING)
  // =========================================================================
  const wsData = workbook.addWorksheet('Raw Data Export');
  
  // Freeze the top row so headers never scroll out of view
  wsData.views = [ { state: 'frozen', ySplit: 1 } ];

  const dataHeaders = [
    'Category', 'Sub-Category', 'Detail 1', 'Detail 2', 'Detail 3', 'Detail 4', 'Detail 5', 'Evidence Link'
  ];
  
  // Explicitly set headers AND widths
  wsData.columns = dataHeaders.map(h => ({ header: h, key: h, width: 25 }));
  
  // The first row is now automatically added as headers by exceljs, so we style it:
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
      // Pad empty strings if keys < 5
      while (row.length < 7) row.push('');
      row.push(item.evidenceLink || '');
      wsData.addRow(row);
    });
  };

  // Section 1
  pushFlatRows('Teaching', '1.1 Courses Handled', sectionData.coursesHandled, ['courseCode', 'courseName', 'type', 'semester']);
  pushFlatRows('Teaching', '1.2 Course File', sectionData.courseFiles, ['courseCode', 'courseName', 'compliance']);
  pushFlatRows('Teaching', '1.3 Course Design', sectionData.coursesDesigned, ['courseCode', 'courseName', 'remarks']);
  pushFlatRows('Teaching', '1.4 Value-Added', sectionData.valueAdded, ['courseName', 'particulars', 'studentCount']);
  pushFlatRows('Teaching', '1.5 Innovative Methods', sectionData.innovativeMethods, ['courseCode', 'method']);
  pushFlatRows('Teaching', '1.8 Certifications', sectionData.certifications, ['courseName', 'platform', 'certType']);
  pushFlatRows('Teaching', '1.9 Student Feedback', sectionData.studentFeedback, ['courseCode', 'feedbackPct']);
  pushFlatRows('Teaching', '1.10 Result Analysis', sectionData.resultAnalysis, ['courseCode', 'courseName', 'passPercentage']);
  pushFlatRows('Teaching', '1.11 CO Attainment', sectionData.coAttainment, ['courseCode', 'courseName', 'attainmentPct']);

  // Section 2 & 3 & 4 (Research)
  pushFlatRows('Research', '2.1 Journal Papers', sectionData.journalPapers, ['paperTitle', 'journalName', 'tier']);
  pushFlatRows('Research', '2.4 Books', sectionData.bookPublications, ['title', 'type']);
  pushFlatRows('Research', '2.5 Conferences', sectionData.conferencePapers, ['paperTitle', 'proceedingName']);
  pushFlatRows('Research', '3.1 Patents Pub', sectionData.patentsPublished, ['appNumber', 'title', 'inventors', 'datePublished']);
  pushFlatRows('Research', '3.2 Patents Grant', sectionData.patentsGranted, ['refNumber', 'title', 'inventors', 'dateGranted']);
  pushFlatRows('Research', '4.1 Sponsored Proj', sectionData.researchProjects, ['projectName', 'fundingAgency', 'amount', 'role', 'status']);
  pushFlatRows('Research', '4.2 Consultancy', sectionData.consultancyProjects, ['title', 'clientDetails', 'amount', 'facultyInvolved']);

  // Add auto filters to the data sheet
  wsData.autoFilter = {
    from: 'A1',
    to: `H${wsData.rowCount}`
  };

  // =========================================================================
  // WRITE FILE TO BROWSER
  // =========================================================================
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const facultyCleanName = (user?.name || 'Faculty').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  saveAs(blob, `TCE_Appraisal_${facultyCleanName}_${timeline || '2024-2025'}.xlsx`);
};
