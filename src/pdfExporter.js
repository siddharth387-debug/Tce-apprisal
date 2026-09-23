import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { computeEffectiveScores, SUBSECTION_MAX_MARKS } from './scoringEngine.js';

const formatExternalLink = (url) => {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*?:/i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
};

const isRowValid = (row) => {
  if (!row || typeof row !== 'object') return false;
  return Object.entries(row).some(([key, val]) => {
    if (key === 'id' || key === '_id') return false;
    return val !== null && val !== undefined && String(val).trim() !== '';
  });
};

export const exportAppraisalToPDF = ({
  user,
  timeline,
  sectionData = {},
  scores = {},
  record = {},
}) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  let currentY = margin;

  const subRemarks = record.subsectionRemarks || {};
  const hodScores = record.hodSubsectionScores || {};
  const effectiveScoreObj = computeEffectiveScores(sectionData, hodScores);

  const submissionDate = record.submittedAt || record.createdAt
    ? new Date(record.submittedAt || record.createdAt).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : new Date().toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });

  const statusStr = (record.appraisalStatus || 'Pending').toUpperCase().trim();

  // ── 1. Institutional Header ───────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(74, 21, 25); // #4A1519
  doc.text('THIAGARAJAR COLLEGE OF ENGINEERING, MADURAI - 625 015', pageWidth / 2, currentY, { align: 'center' });
  currentY += 4;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139); // slate-500
  doc.text('(A Govt. Aided Autonomous Institution Affiliated to Anna University)', pageWidth / 2, currentY, { align: 'center' });
  currentY += 4.5;

  // Header Pill Badge
  doc.setFillColor(74, 21, 25);
  doc.roundedRect(pageWidth / 2 - 45, currentY - 3, 90, 5.5, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  doc.text('FACULTY PERFORMANCE APPRAISAL REPORT', pageWidth / 2, currentY + 0.8, { align: 'center' });
  currentY += 7;

  // ── 2. Faculty Profile Box ────────────────────────────────────────────────
  const boxX = margin;
  const boxWidth = pageWidth - margin * 2;
  const boxHeight = 18;
  doc.setFillColor(248, 250, 252); // slate-50
  doc.setDrawColor(203, 213, 225); // slate-300
  doc.setLineWidth(0.2);
  doc.roundedRect(boxX, currentY, boxWidth, boxHeight, 1.5, 1.5, 'FD');

  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85); // slate-700

  // Row 1
  doc.setFont('helvetica', 'bold');
  doc.text('Faculty Name:', boxX + 3, currentY + 4.5);
  doc.setFont('helvetica', 'normal');
  doc.text(String(user?.name || 'Faculty Member'), boxX + 24, currentY + 4.5);

  doc.setFont('helvetica', 'bold');
  doc.text('Academic Year:', boxX + boxWidth / 2 + 2, currentY + 4.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(74, 21, 25);
  doc.text(String(timeline || '2024-2025'), boxX + boxWidth / 2 + 26, currentY + 4.5);
  doc.setTextColor(51, 65, 85);

  // Row 2
  doc.setFont('helvetica', 'bold');
  doc.text('Email ID:', boxX + 3, currentY + 9.5);
  doc.setFont('helvetica', 'normal');
  doc.text(String(user?.email || '-'), boxX + 24, currentY + 9.5);

  doc.setFont('helvetica', 'bold');
  doc.text('Submission Date:', boxX + boxWidth / 2 + 2, currentY + 9.5);
  doc.setFont('helvetica', 'normal');
  doc.text(submissionDate, boxX + boxWidth / 2 + 26, currentY + 9.5);

  // Row 3
  doc.setFont('helvetica', 'bold');
  doc.text('Designation:', boxX + 3, currentY + 14.5);
  doc.setFont('helvetica', 'normal');
  doc.text(String(record?.designation || user?.designation || (user?.role === 'HOD' ? 'Professor & Head (HOD)' : 'Assistant Professor')), boxX + 24, currentY + 14.5);

  doc.setFont('helvetica', 'bold');
  doc.text('Appraisal Status:', boxX + boxWidth / 2 + 2, currentY + 14.5);
  const isRatified = statusStr === 'RATIFIED' || (record.principalApprovalStatus || '').toUpperCase() === 'RATIFIED';
  
  let badgeBg = [254, 243, 199];
  let badgeBorder = [252, 211, 77];
  let badgeText = [146, 64, 14];
  let badgeLabel = statusStr;

  if (isRatified) {
    badgeBg = [209, 250, 229];
    badgeBorder = [52, 211, 153];
    badgeText = [6, 95, 70];
    badgeLabel = 'RATIFIED & LOCKED';
  } else if (statusStr === 'APPROVED') {
    badgeBg = [220, 252, 231];
    badgeBorder = [134, 239, 172];
    badgeText = [22, 101, 52];
  } else if (statusStr === 'FIX NEEDED' || statusStr === 'NOT APPROVED' || statusStr === 'REJECTED') {
    badgeBg = [255, 228, 230];
    badgeBorder = [253, 164, 175];
    badgeText = [159, 18, 57];
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  const statusWidth = doc.getTextWidth(badgeLabel) + 4;
  const statusX = boxX + boxWidth / 2 + 26;
  const statusY = currentY + 11.5;
  doc.setFillColor(badgeBg[0], badgeBg[1], badgeBg[2]);
  doc.setDrawColor(badgeBorder[0], badgeBorder[1], badgeBorder[2]);
  doc.setLineWidth(0.15);
  doc.roundedRect(statusX, statusY, statusWidth, 4, 0.6, 0.6, 'FD');
  doc.setTextColor(badgeText[0], badgeText[1], badgeText[2]);
  doc.text(badgeLabel, statusX + 2, currentY + 14.4);

  currentY += boxHeight + 4;

  // ── 3. Executive Score Summary Matrix ─────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(74, 21, 25);
  doc.text('EXECUTIVE SCORE SUMMARY MATRIX' + (effectiveScoreObj.hasAdjustments ? ' (* Includes HoD Evaluated Marks)' : ''), margin, currentY);
  currentY += 2;

  autoTable(doc, {
    startY: currentY,
    margin: { left: margin, right: margin },
    theme: 'grid',
    styles: {
      fontSize: 7.5,
      cellPadding: 1.2,
      textColor: [30, 41, 59],
      lineColor: [203, 213, 225],
      lineWidth: 0.15,
    },
    headStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      lineColor: [203, 213, 225],
      lineWidth: 0.15,
    },
    head: [['Section', 'Assessment Area', 'Max Marks', 'Evaluated Score']],
    body: [
      ['Section I', 'Teaching & Learning', '50', String(effectiveScoreObj.section1Total)],
      ['Section II', 'Research Publications', '55', String(effectiveScoreObj.section2Total)],
      ['Section III', 'Patents & Innovation', '15', String(effectiveScoreObj.section3Total)],
      ['Section IV', 'Sponsored Research & Consultancy', '15', String(effectiveScoreObj.section4Total)],
      ['Section V', 'International Engagement & Rankings', '10', String(effectiveScoreObj.section5Total)],
      ['Section VI', 'Faculty Development & Professional Activities', '20', String(effectiveScoreObj.section6Total)],
      ['Section VII', 'Industry Interaction & Internship', '10', String(effectiveScoreObj.section7Total)],
      ['Section VIII', 'Student Development Activities', '5', String(effectiveScoreObj.section8Total)],
      ['Section IX', 'Institutional Development', '20', String(effectiveScoreObj.section9Total)],
      [
        { content: 'TOTAL EVALUATED SCORE (SECTIONS I - IX):', colSpan: 2, styles: { fontStyle: 'bold', halign: 'right', textColor: [15, 23, 42] } },
        { content: '200', styles: { fontStyle: 'bold', halign: 'center', textColor: [15, 23, 42] } },
        { content: `${effectiveScoreObj.grandTotal} / 200`, styles: { fontStyle: 'bold', textColor: [15, 23, 42], halign: 'center' } }
      ]
    ],
    columnStyles: {
      0: { cellWidth: 26, fontStyle: 'bold' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 22, halign: 'center', fontStyle: 'bold' },
      3: { cellWidth: 26, halign: 'center', fontStyle: 'bold' },
    },
  });

  currentY = doc.lastAutoTable.finalY + 4;

  // ── Helper: Render Section Subtitle ───────────────────────────────────────
  const renderSectionHeader = (sectionTitle, sectionScore, sectionMax) => {
    if (currentY > pageHeight - 35) {
      doc.addPage();
      currentY = margin;
    }
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.setLineWidth(0.3);
    doc.line(margin, currentY, pageWidth - margin, currentY);
    currentY += 4;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105); // slate-600
    doc.text(sectionTitle.toUpperCase(), margin, currentY);
    doc.setTextColor(30, 41, 59); // slate-800
    doc.text(`SUBTOTAL: ${sectionScore} / ${sectionMax}`, pageWidth - margin, currentY, { align: 'right' });
    currentY += 4.5;
  };

  // ── Helper: Render Subsection Table with 1:1 Exact Styling and Clickable Links ─
  const renderSectionTable = (title, columns, rows, subKey) => {
    const validRows = (rows || []).filter(isRowValid);
    const max = subKey ? SUBSECTION_MAX_MARKS[subKey] : null;
    const effMark = subKey ? effectiveScoreObj.effectiveMap[subKey] : null;
    const autoMark = subKey ? effectiveScoreObj.autoMap[subKey] : null;
    const isOverridden = subKey && effMark !== null && autoMark !== null && effMark !== autoMark;
    const hasRemark = Boolean(subKey && subRemarks[subKey]);

    if (validRows.length === 0 && !hasRemark && !isOverridden) return;

    if (currentY > pageHeight - 35) {
      doc.addPage();
      currentY = margin;
    }

    // Subsection Title (Maroon #4A1519)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(74, 21, 25);
    doc.text(title.toUpperCase(), margin, currentY);

    // Score Pill Badge on Right (Identical to CSS Component)
    if (max !== null) {
      const scoreStr = `${effMark ?? 0}`;
      const maxStr = ` / ${max} Marks${isOverridden ? ` (HoD: ${effMark}, Auto: ${autoMark})` : ''}`;
      const fullPillStr = `Score: ${scoreStr}${maxStr}`;
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      const textWidth = doc.getTextWidth(fullPillStr);
      const pillWidth = textWidth + 6;
      const pillHeight = 4.2;
      const pillX = pageWidth - margin - pillWidth;
      const pillY = currentY - 3.2;

      doc.setFillColor(248, 250, 252); // slate-50
      doc.setDrawColor(203, 213, 225); // slate-300
      doc.setLineWidth(0.2);
      doc.roundedRect(pillX, pillY, pillWidth, pillHeight, 0.8, 0.8, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(71, 85, 105); // slate-600
      doc.text('Score: ', pillX + 3, currentY);
      const scoreOffsetX = pillX + 3 + doc.getTextWidth('Score: ');
      doc.setTextColor(74, 21, 25); // maroon score
      doc.text(scoreStr, scoreOffsetX, currentY);
      const maxOffsetX = scoreOffsetX + doc.getTextWidth(scoreStr);
      doc.setTextColor(71, 85, 105); // slate-600
      doc.text(maxStr, maxOffsetX, currentY);
    }
    currentY += 2;

    const tableHeaders = ['#', ...columns.map(c => c.label)];
    const tableBody = validRows.map((r, rIdx) => {
      const rowData = [String(rIdx + 1)];
      columns.forEach(col => {
        const primaryVal = r[col.key];
        const altVal = col.altKey ? r[col.altKey] : undefined;
        const val = (primaryVal !== undefined && primaryVal !== null && String(primaryVal).trim() !== '')
          ? primaryVal
          : (altVal !== undefined && altVal !== null ? altVal : '');
        const isLink = col.key === 'evidenceLink' || col.isLink;
        if (isLink && val) {
          rowData.push({
            content: 'View Proof',
            rawUrl: formatExternalLink(val),
            isEvidenceLink: true,
          });
        } else {
          rowData.push(val || '-');
        }
      });
      return rowData;
    });

    if (validRows.length > 0) {
      autoTable(doc, {
        startY: currentY,
        margin: { left: margin, right: margin },
        theme: 'grid',
        styles: {
          fontSize: 7,
          cellPadding: 1.2,
          textColor: [30, 41, 59], // slate-800
          lineColor: [203, 213, 225], // slate-300
          lineWidth: 0.15,
        },
        headStyles: {
          fillColor: [255, 255, 255],
          textColor: [148, 163, 184], // slate-400 (exact match to text-slate-400)
          fontStyle: 'bold',
          lineColor: [203, 213, 225],
          lineWidth: 0.15,
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252], // slate-50/60
        },
        head: [tableHeaders],
        body: tableBody,
        columnStyles: {
          0: { cellWidth: 7, halign: 'center', textColor: [100, 116, 139], fontStyle: 'bold' },
        },
        didDrawCell: (data) => {
          if (data.cell.raw && typeof data.cell.raw === 'object' && data.cell.raw.isEvidenceLink && data.cell.raw.rawUrl) {
            const url = data.cell.raw.rawUrl;
            // Native ISO 32000 PDF Link Annotation
            doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url: url });
          }
        },
        willDrawCell: (data) => {
          if (data.cell.raw && typeof data.cell.raw === 'object' && data.cell.raw.isEvidenceLink) {
            data.cell.styles.textColor = [29, 78, 216]; // #1d4ed8 Blue
            data.cell.styles.fontStyle = 'bold';
          }
        }
      });
      currentY = doc.lastAutoTable.finalY + 2.5;
    }

    if (hasRemark) {
      if (currentY > pageHeight - 15) {
        doc.addPage();
        currentY = margin;
      }
      doc.setFillColor(254, 243, 199);
      doc.setDrawColor(74, 21, 25);
      doc.setLineWidth(0.3);
      doc.roundedRect(margin, currentY, pageWidth - margin * 2, 5.5, 1, 1, 'FD');
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(6.8);
      doc.setTextColor(74, 21, 25);
      doc.text(`HoD Remark (${subKey}): "${subRemarks[subKey]}"`, margin + 2, currentY + 3.8);
      currentY += 7.5;
    } else {
      currentY += 1.5;
    }
  };

  // ── Section I: Teaching & Learning ────────────────────────────────────────
  renderSectionHeader('SECTION I: Teaching & Learning', effectiveScoreObj.section1Total, 50);
  renderSectionTable('1.1 Courses Handled', [{ key: 'courseCode', label: 'Course Code' }, { key: 'courseName', label: 'Course Name' }, { key: 'type', label: 'Type' }, { key: 'semester', label: 'Semester' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.coursesHandled, '1.1');
  renderSectionTable('1.2 Course File Compliance', [{ key: 'courseCode', label: 'Course Code' }, { key: 'courseName', label: 'Course Name' }, { key: 'compliance', label: 'Compliance' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.courseFiles, '1.2');
  renderSectionTable('1.3 Course Design', [{ key: 'courseCode', label: 'Course Code' }, { key: 'courseName', label: 'Course Name' }, { key: 'remarks', label: 'Details / Remarks' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.coursesDesigned, '1.3');
  renderSectionTable('1.4 Value-Added Courses', [{ key: 'courseName', label: 'Course Name' }, { key: 'particulars', label: 'Particulars' }, { key: 'studentCount', label: 'Students Enrolled' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.valueAdded, '1.4');
  renderSectionTable('1.5 Innovative Teaching Methods', [{ key: 'courseCode', label: 'Course Code' }, { key: 'method', label: 'Method Employed' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.innovativeMethods, '1.5');
  renderSectionTable('1.6 Academic Collaborations', [{ key: 'organization', label: 'Partner Organization' }, { key: 'collaborationType', label: 'Collaboration Nature' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.academicCollaborations, '1.6');

  // 1.7 Mentoring System Card
  if (sectionData.mentoring && (sectionData.mentoring.menteeCount || sectionData.mentoring.description)) {
    if (currentY > pageHeight - 25) { doc.addPage(); currentY = margin; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(74, 21, 25);
    doc.text('1.7 MENTORING SYSTEM', margin, currentY);

    const mScoreStr = `${effectiveScoreObj.effectiveMap['1.7'] ?? 0}`;
    const mPillStr = `Score: ${mScoreStr} / 2 Marks`;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    const mTextWidth = doc.getTextWidth(mPillStr);
    const mPillWidth = mTextWidth + 6;
    const mPillX = pageWidth - margin - mPillWidth;
    const mPillY = currentY - 3.2;

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.2);
    doc.roundedRect(mPillX, mPillY, mPillWidth, 4.2, 0.8, 0.8, 'FD');

    doc.setTextColor(71, 85, 105);
    doc.text('Score: ', mPillX + 3, currentY);
    const mScoreOff = mPillX + 3 + doc.getTextWidth('Score: ');
    doc.setTextColor(74, 21, 25);
    doc.text(mScoreStr, mScoreOff, currentY);
    doc.setTextColor(71, 85, 105);
    doc.text(' / 2 Marks', mScoreOff + doc.getTextWidth(mScoreStr), currentY);
    currentY += 2;

    const mentoringUrl = formatExternalLink(sectionData.mentoring.evidenceLink);
    autoTable(doc, {
      startY: currentY,
      margin: { left: margin, right: margin },
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 1.2, textColor: [30, 41, 59], lineColor: [203, 213, 225], lineWidth: 0.15 },
      headStyles: { fillColor: [255, 255, 255], textColor: [148, 163, 184], fontStyle: 'bold', lineColor: [203, 213, 225], lineWidth: 0.15 },
      head: [['Mentee Count', 'Batch', 'Description', 'Evidence Link']],
      body: [[
        sectionData.mentoring.menteeCount || '0',
        sectionData.mentoring.batch || '-',
        sectionData.mentoring.description || '-',
        mentoringUrl ? { content: 'View Proof', rawUrl: mentoringUrl, isEvidenceLink: true } : '-'
      ]],
      didDrawCell: (data) => {
        if (data.cell.raw && typeof data.cell.raw === 'object' && data.cell.raw.isEvidenceLink && data.cell.raw.rawUrl) {
          doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url: data.cell.raw.rawUrl });
        }
      },
      willDrawCell: (data) => {
        if (data.cell.raw && typeof data.cell.raw === 'object' && data.cell.raw.isEvidenceLink) {
          data.cell.styles.textColor = [29, 78, 216];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    });
    currentY = doc.lastAutoTable.finalY + 3;
  }

  renderSectionTable('1.8 NPTEL / SWAYAM Certifications', [{ key: 'courseName', label: 'Course Title' }, { key: 'platform', label: 'Platform' }, { key: 'certType', label: 'Grade' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.certifications, '1.8');
  renderSectionTable('1.9 Student Feedback', [{ key: 'courseCode', label: 'Course Code' }, { key: 'feedbackPct', label: 'Feedback %' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.studentFeedback, '1.9');
  renderSectionTable('1.10 Result Analysis', [{ key: 'courseCode', label: 'Course Code' }, { key: 'courseName', label: 'Course Name' }, { key: 'passPercentage', label: 'Pass %' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.resultAnalysis, '1.10');
  renderSectionTable('1.11 CO Attainment', [{ key: 'courseCode', label: 'Course Code' }, { key: 'courseName', label: 'Course Name' }, { key: 'attainmentPct', label: 'Attainment %' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.coAttainment, '1.11');

  // ── Section II: Research Publications ─────────────────────────────────────
  renderSectionHeader('SECTION II: Research Publications', effectiveScoreObj.section2Total, 55);
  renderSectionTable('2.1 Journal Publications (SCI / Scopus Indexed)', [{ key: 'paperTitle', label: 'Paper Title' }, { key: 'journalName', label: 'Journal Name' }, { key: 'tier', label: 'Tier' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.journalPapers, '2.1');

  // 2.2 & 2.3 Citations Cards
  if (sectionData.citationsReceived?.totalCount || sectionData.q1Citations?.totalCount) {
    if (currentY > pageHeight - 25) { doc.addPage(); currentY = margin; }
    const citUrl = formatExternalLink(sectionData.citationsReceived?.evidenceLink);
    const q1Url = formatExternalLink(sectionData.q1Citations?.evidenceLink);

    autoTable(doc, {
      startY: currentY,
      margin: { left: margin, right: margin },
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 1.2, textColor: [30, 41, 59], lineColor: [203, 213, 225], lineWidth: 0.15 },
      headStyles: { fillColor: [255, 255, 255], textColor: [148, 163, 184], fontStyle: 'bold', lineColor: [203, 213, 225], lineWidth: 0.15 },
      head: [['Citation Metric', 'Count', 'Score Awarded', 'Evidence Link']],
      body: [
        [
          '2.2 Citations Received (Last 3 Years)',
          String(sectionData.citationsReceived?.totalCount || '0'),
          `${effectiveScoreObj.effectiveMap['2.2'] ?? 0} / 8 Marks`,
          citUrl ? { content: 'View Proof', rawUrl: citUrl, isEvidenceLink: true } : '-'
        ],
        [
          '2.3 Total Q1 Citations',
          String(sectionData.q1Citations?.totalCount || '0'),
          `${effectiveScoreObj.effectiveMap['2.3'] ?? 0} / 7 Marks`,
          q1Url ? { content: 'View Proof', rawUrl: q1Url, isEvidenceLink: true } : '-'
        ]
      ],
      didDrawCell: (data) => {
        if (data.cell.raw && typeof data.cell.raw === 'object' && data.cell.raw.isEvidenceLink && data.cell.raw.rawUrl) {
          doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url: data.cell.raw.rawUrl });
        }
      },
      willDrawCell: (data) => {
        if (data.cell.raw && typeof data.cell.raw === 'object' && data.cell.raw.isEvidenceLink) {
          data.cell.styles.textColor = [29, 78, 216];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    });
    currentY = doc.lastAutoTable.finalY + 3;
  }

  renderSectionTable('2.4 Books / Book Chapters Published', [{ key: 'title', label: 'Title' }, { key: 'type', label: 'Type' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.bookPublications, '2.4');
  renderSectionTable('2.5 Conference Publications', [{ key: 'paperTitle', label: 'Paper Title' }, { key: 'proceedingName', label: 'Proceeding Name' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.conferencePapers, '2.5');
  renderSectionTable('2.6 Research Collaborations', [{ key: 'title', label: 'Title' }, { key: 'partner', label: 'Partner' }, { key: 'type', label: 'Type' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.researchCollaborations, '2.6');
  renderSectionTable('2.7 PhD Scholars Guided (Registered)', [{ key: 'scholarName', label: 'Scholar Name' }, { key: 'researchArea', label: 'Research Area' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.phdRegistered, '2.7');
  renderSectionTable('2.8 PhD Scholars Guided (Degree Awarded)', [{ key: 'scholarName', label: 'Scholar Name' }, { key: 'researchArea', label: 'Research Area' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.phdAwarded, '2.8');

  // ── Section III: Patents & Innovation ─────────────────────────────────────
  renderSectionHeader('SECTION III: Patents & Innovation', effectiveScoreObj.section3Total, 15);
  renderSectionTable('3.1 Patents Published', [{ key: 'refNumber', altKey: 'appNumber', label: 'Application / Ref No' }, { key: 'title', label: 'Patent Title' }, { key: 'inventors', label: 'Inventors' }, { key: 'datePublished', label: 'Date Published' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.patentsPublished, '3.1');
  renderSectionTable('3.2 Patents Granted', [{ key: 'refNumber', label: 'Patent Ref No' }, { key: 'title', label: 'Patent Title' }, { key: 'inventors', label: 'Inventors' }, { key: 'dateGranted', label: 'Date Granted' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.patentsGranted, '3.2');
  renderSectionTable('3.3 Transfer of Technology', [{ key: 'title', label: 'Technology Title' }, { key: 'industryPartner', altKey: 'partner', label: 'Partner' }, { key: 'amount', label: 'Amount (Rs.)' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.transferOfTechnology, '3.3');
  renderSectionTable('3.4 Prototypes / Products Developed', [{ key: 'title', label: 'Product Title' }, { key: 'studentsInvolved', altKey: 'students', label: 'Students' }, { key: 'date', label: 'Date' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.prototypesDeveloped, '3.4');
  renderSectionTable('3.5 Hackathon Mentoring & Prizes', [{ key: 'eventName', label: 'Event' }, { key: 'studentsMentored', altKey: 'students', label: 'Students' }, { key: 'prize', altKey: 'awardWon', label: 'Award' }, { key: 'date', label: 'Date' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.hackathonPrizes, '3.5');

  // ── Section IV: Sponsored Research & Consultancy ──────────────────────────
  renderSectionHeader('SECTION IV: Sponsored Research & Consultancy', effectiveScoreObj.section4Total, 15);
  renderSectionTable('4.1 Sponsored Research Projects', [{ key: 'projectName', label: 'Project Name' }, { key: 'fundingAgency', label: 'Agency' }, { key: 'period', label: 'Period' }, { key: 'amount', label: 'Amount (Rs.)' }, { key: 'role', label: 'Role' }, { key: 'status', label: 'Status' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.researchProjects, '4.1');
  renderSectionTable('4.2 Consultancy Projects', [{ key: 'title', label: 'Consultancy Title' }, { key: 'clientDetails', label: 'Client' }, { key: 'period', label: 'Period' }, { key: 'amount', label: 'Amount (Rs.)' }, { key: 'facultyInvolved', label: 'Faculty' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.consultancyProjects, '4.2');

  // ── Section V: International Engagement & Rankings ────────────────────────
  renderSectionHeader('SECTION V: International Engagement & Rankings', effectiveScoreObj.section5Total, 10);
  renderSectionTable('5.1 International Engagement / MoUs', [{ key: 'institution', label: 'Partner Institution' }, { key: 'nature', altKey: 'activities', label: 'Activities / Nature' }, { key: 'country', label: 'Country' }, { key: 'period', label: 'Period' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.internationalEngagement, '5.1');
  renderSectionTable('5.2 Visiting / Adjunct Positions Abroad', [{ key: 'institution', label: 'Host Institution' }, { key: 'country', label: 'Country' }, { key: 'duration', altKey: 'durationDays', label: 'Duration / Days' }, { key: 'period', label: 'Period' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.visitingPositions, '5.2');
  renderSectionTable('5.3 Foreign Faculty / Student Hosted', [{ key: 'name', label: 'Visitor Name' }, { key: 'institution', altKey: 'affiliation', label: 'Institution' }, { key: 'engagementType', altKey: 'topics', label: 'Topics / Nature' }, { key: 'period', label: 'Period' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.foreignFaculty, '5.3');
  renderSectionTable('5.4 QS / THE Reputation Survey Nominations', [{ key: 'surveyName', altKey: 'academicianDetails', label: 'Survey / Academician' }, { key: 'evidenceSubmitted', altKey: 'university', label: 'University / Details' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.reputationSurvey, '5.4');
  renderSectionTable('5.5 NIRF Survey Nominations', [{ key: 'nominationDetails', altKey: 'employerDetails', label: 'Employer / Nomination' }, { key: 'evidenceSubmitted', label: 'Details' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.nirfSurvey, '5.5');

  // ── Section VI: Faculty Development & Professional Activities ─────────────
  renderSectionHeader('SECTION VI: Faculty Development & Professional Activities', effectiveScoreObj.section6Total, 20);
  renderSectionTable('6.1 FDP / STTP Attended', [{ key: 'programName', label: 'Program Name' }, { key: 'organizer', label: 'Organizer' }, { key: 'duration', label: 'Days' }, { key: 'dateRange', label: 'Dates' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.fdpAttended, '6.1');
  renderSectionTable('6.2 Programs Organized', [{ key: 'programName', label: 'Program Name' }, { key: 'days', label: 'Days' }, { key: 'dateRange', label: 'Dates' }, { key: 'role', label: 'Role' }, { key: 'participants', label: 'Participants' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.programsOrganized, '6.2');
  renderSectionTable('6.3 Resource Person / Keynote Speaker', [{ key: 'eventName', label: 'Event' }, { key: 'level', label: 'Level' }, { key: 'topic', label: 'Topic' }, { key: 'date', label: 'Date' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.resourcePerson, '6.3');
  renderSectionTable('6.4 Professional Memberships', [{ key: 'societyName', label: 'Society' }, { key: 'membershipType', altKey: 'membershipGrade', label: 'Grade / Type' }, { key: 'status', label: 'Status' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.professionalMembership, '6.4');
  renderSectionTable('6.5 Designation in Professional Body / Editorial Board', [{ key: 'bodyName', altKey: 'journalName', label: 'Journal / Body' }, { key: 'position', altKey: 'role', label: 'Role / Position' }, { key: 'period', altKey: 'year', label: 'Year / Period' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.editorialBoard, '6.5');
  renderSectionTable('6.6 MOOC Content Developed', [{ key: 'courseName', label: 'Course Name' }, { key: 'weeks', altKey: 'creditsOrWeeks', label: 'Weeks' }, { key: 'coFacultyCount', altKey: 'modules', label: 'Modules / Co-Faculty' }, { key: 'takersCount', altKey: 'learnersEnrolled', label: 'Learners' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.moocDeveloped, '6.6');

  // ── Section VII: Industry Interaction & Internship ────────────────────────
  renderSectionHeader('SECTION VII: Industry Interaction & Internship', effectiveScoreObj.section7Total, 10);
  renderSectionTable('7.1 Partial Course Delivery by Industry Experts', [{ key: 'courseDetails', altKey: 'courseCode', label: 'Course' }, { key: 'mode', altKey: 'deliveryMode', label: 'Mode' }, { key: 'industryName', label: 'Industry' }, { key: 'expertDetails', altKey: 'expertName', label: 'Expert' }, { key: 'duration', altKey: 'hoursDelivered', label: 'Hours / Duration' }, { key: 'date', altKey: 'dateConducted', label: 'Date' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.partialDelivery, '7.1');
  renderSectionTable('7.2 Accompanying Industrial Visits', [{ key: 'industry', altKey: 'industryName', label: 'Industry' }, { key: 'visitDetails', altKey: 'location', label: 'Location / Details' }, { key: 'studentsCount', label: 'Students' }, { key: 'date', altKey: 'visitDate', label: 'Date' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.industrialVisits, '7.2');
  renderSectionTable('7.3 Faculty Internships in Industry', [{ key: 'industryName', label: 'Industry' }, { key: 'duration', altKey: 'durationDays', label: 'Duration' }, { key: 'purpose', altKey: 'outcomes', label: 'Purpose / Outcomes' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.facultyInternships, '7.3');
  renderSectionTable('7.4 Employer / Alumni Engagement', [{ key: 'activityName', altKey: 'companyName', label: 'Company / Activity' }, { key: 'involvedParty', altKey: 'activityType', label: 'Type / Party' }, { key: 'date', altKey: 'outcomes', label: 'Date / Outcomes' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.employerEngagement, '7.4');

  // ── Section VIII: Student Development Activities ──────────────────────────
  renderSectionHeader('SECTION VIII: Student Development Activities', effectiveScoreObj.section8Total, 5);
  renderSectionTable('8.1 Student Project Publications', [{ key: 'title', label: 'Paper Title' }, { key: 'students', altKey: 'studentNames', label: 'Students' }, { key: 'journalDetails', altKey: 'journalOrConference', label: 'Journal / Conf' }, { key: 'date', altKey: 'publicationDate', label: 'Date' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.projectPublications, '8.1');
  renderSectionTable('8.2 Hackathon Mentoring', [{ key: 'eventName', altKey: 'teamName', label: 'Event / Team' }, { key: 'students', altKey: 'studentsMentored', label: 'Students' }, { key: 'outcome', altKey: 'awardWon', label: 'Award / Outcome' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.hackathonMentoring, '8.2');
  renderSectionTable('8.3 Startup & Incubation Support', [{ key: 'startupName', label: 'Startup' }, { key: 'role', altKey: 'studentNames', label: 'Role / Students' }, { key: 'duration', altKey: 'incubationCenter', label: 'Duration / Center' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.startupSupport, '8.3');

  // ── Section IX: Institutional Development ─────────────────────────────────
  renderSectionHeader('SECTION IX: Institutional Development', effectiveScoreObj.section9Total, 20);
  renderSectionTable('9.1 Department-Level Activities', [{ key: 'description', altKey: 'role', label: 'Role / Description' }, { key: 'type', altKey: 'activityType', label: 'Activity Type' }, { key: 'approval', altKey: 'completedSuccessfully', label: 'Status' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.deptActivities, '9.1');
  renderSectionTable('9.2 College-Level Activities', [{ key: 'description', altKey: 'role', label: 'Role / Description' }, { key: 'category', altKey: 'committeeLevel', label: 'Committee' }, { key: 'approval', altKey: 'completedSuccessfully', label: 'Status' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.collegeActivities, '9.2');
  renderSectionTable('9.3 Administrative Responsibilities', [{ key: 'role', label: 'Position / Role' }, { key: 'evidenceLink', label: 'Evidence Link' }], sectionData.adminResponsibilities, '9.3');

  // ── HoD Feedback & Verification ───────────────────────────────────────────
  if (record.hodRemarks) {
    if (currentY > pageHeight - 25) { doc.addPage(); currentY = margin; }
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(margin, currentY, pageWidth - margin * 2, 12, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(74, 21, 25);
    doc.text('HEAD OF DEPARTMENT (HOD) OVERALL REMARKS:', margin + 3, currentY + 4.5);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(50, 50, 50);
    doc.text(`"${record.hodRemarks}"`, margin + 3, currentY + 8.5);
    currentY += 16;
  }

  // ── Principal Institutional Ratification & Commendation ──────────────────
  if (record.principalApprovalStatus === 'Ratified' || record.appraisalStatus === 'Ratified' || record.principalEndorsedAt) {
    if (currentY > pageHeight - 35) { doc.addPage(); currentY = margin; }
    const endorseDateStr = record.principalEndorsedAt
      ? new Date(record.principalEndorsedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
      : 'Ratified';
    doc.setFillColor(240, 253, 244); // emerald-50
    doc.setDrawColor(16, 185, 129); // emerald-500
    doc.setLineWidth(0.3);
    doc.roundedRect(margin, currentY, pageWidth - margin * 2, 15, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(6, 95, 70); // emerald-800
    doc.text(`PRINCIPAL INSTITUTIONAL RATIFICATION & EXECUTIVE SEAL [Locked on ${endorseDateStr}]`, margin + 3, currentY + 4.5);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(4, 120, 87);
    const pRemarks = record.principalRemarks ? `"${record.principalRemarks}"` : 'Formally ratified for NAAC, NBA, and NIRF institutional accreditation compliance.';
    doc.text(pRemarks, margin + 3, currentY + 8.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text('Certified under TCE Autonomous Academic Governance.', margin + 3, currentY + 12.5);
    currentY += 19;
  }

  // ── Signatures & Endorsement Block ────────────────────────────────────────
  if (currentY > pageHeight - 30) { doc.addPage(); currentY = margin; }
  const sigY = currentY + 12;
  const colW = (pageWidth - margin * 2) / 3;

  doc.setDrawColor(148, 163, 184); // slate-400
  doc.setLineWidth(0.25);
  doc.line(margin + 5, sigY, margin + colW - 5, sigY);
  doc.line(margin + colW + 5, sigY, margin + colW * 2 - 5, sigY);
  doc.line(margin + colW * 2 + 5, sigY, margin + colW * 3 - 5, sigY);

  if (record.principalApprovalStatus === 'Ratified' || record.principalEndorsedAt) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(6, 95, 70);
    doc.text('[Digitally Ratified & Sealed]', margin + colW * 2.5, sigY - 2, { align: 'center' });
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(30, 41, 59);
  doc.text('Signature of Faculty Member', margin + colW / 2, sigY + 3.5, { align: 'center' });
  doc.text('Signature of Head of Department', margin + colW * 1.5, sigY + 3.5, { align: 'center' });
  doc.text('Signature of Dean / Principal', margin + colW * 2.5, sigY + 3.5, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text(`Date: ${submissionDate}`, margin + colW / 2, sigY + 6.5, { align: 'center' });
  doc.text('With Seal & Date', margin + colW * 1.5, sigY + 6.5, { align: 'center' });
  doc.text(
    (record.principalApprovalStatus === 'Ratified' || record.principalEndorsedAt) && record.principalEndorsedAt
      ? `Ratified: ${new Date(record.principalEndorsedAt).toLocaleDateString('en-GB')}`
      : 'Institutional Seal & Date',
    margin + colW * 2.5,
    sigY + 6.5,
    { align: 'center' }
  );

  // ── Save Native PDF File ──────────────────────────────────────────────────
  const facultyCleanName = (user?.name || 'Faculty').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `TCE_Appraisal_${facultyCleanName}_${timeline || '2024-2025'}.pdf`;
  doc.save(filename);
};

export const exportIqacRosterPDF = ({
  rows = [],
  timeline = 'All',
  departmentFilter = 'ALL',
  targetScore = 100,
  scoreFrom = 10,
  scoreTo = 20,
  scoreFilterMode = 'min',
  showExcludedArchive = false,
}) => {
  // Exclude soft-hidden faculty entries when exporting active audit list
  const activeRows = rows.filter((r) => {
    if (showExcludedArchive) return r.iqacExcluded === true;
    return !r.iqacExcluded;
  });

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 12;
  let currentY = margin;

  // Header Banner
  doc.setFillColor(74, 21, 25);
  doc.rect(margin, currentY, pageWidth - margin * 2, 22, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.text('THIAGARAJAR COLLEGE OF ENGINEERING, MADURAI', pageWidth / 2, currentY + 8, { align: 'center' });

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('INTERNAL QUALITY ASSURANCE CELL (IQAC) — ACCREDITATION AUDIT REPORT', pageWidth / 2, currentY + 15, { align: 'center' });

  currentY += 27;

  // Metadata Box
  doc.setDrawColor(200, 200, 200);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, currentY, pageWidth - margin * 2, 18, 2, 2, 'FD');

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text(`Audit View: ${showExcludedArchive ? 'Excluded Archive' : 'Active Audit Roster'}`, margin + 4, currentY + 6);
  
  const scoreFilterLabel = scoreFilterMode === 'range'
    ? `Score Range: ${scoreFrom} – ${scoreTo} / 200`
    : `Score Filter: ${scoreFilterMode === 'min' ? '≥' : '=='} ${targetScore} / 200`;
  doc.text(scoreFilterLabel, margin + 4, currentY + 12);

  doc.text(`Department: ${departmentFilter === 'ALL' ? 'All 16 Departments' : departmentFilter}`, pageWidth / 2, currentY + 6);
  doc.text(`Academic Year: ${timeline}`, pageWidth / 2, currentY + 12);

  doc.text(`Records: ${activeRows.length}`, pageWidth - margin - 35, currentY + 6);
  doc.text(`Generated: ${new Date().toLocaleDateString('en-GB')}`, pageWidth - margin - 35, currentY + 12);

  currentY += 24;

  // Roster Table Data
  const tableData = activeRows.map((r, idx) => [
    idx + 1,
    r.facultyName || r.name || 'Faculty Member',
    r.designation || 'Assistant Professor',
    (r.department || 'CSE').toUpperCase(),
    r.timeline || timeline,
    r.submittedAt || r.createdAt ? new Date(r.submittedAt || r.createdAt).toLocaleDateString('en-GB') : '—',
    `${r.convertedScore || 0} / 200`,
    ((r.iqacStatus || '').toUpperCase().includes('IQAC') || (r.appraisalStatus || '').toUpperCase().includes('IQAC')) ? 'IQAC Verified' : (r.appraisalStatus || 'Pending')
  ]);

  autoTable(doc, {
    startY: currentY,
    head: [['S.No', 'Faculty Name', 'Designation', 'Dept', 'Timeline', 'Date', 'Score', 'Status']],
    body: tableData,
    theme: 'grid',
    headStyles: {
      fillColor: [74, 21, 25],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5,
      halign: 'center'
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [51, 65, 85]
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 42, fontStyle: 'bold' },
      2: { cellWidth: 35 },
      3: { cellWidth: 16, halign: 'center' },
      4: { cellWidth: 20, halign: 'center' },
      5: { cellWidth: 20, halign: 'center' },
      6: { cellWidth: 20, halign: 'center', fontStyle: 'bold' },
      7: { cellWidth: 23, halign: 'center' }
    },
    margin: { left: margin, right: margin }
  });

  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(`Page ${i} of ${pageCount} — TCE IQAC Accreditation Quality Audit Report`, pageWidth / 2, 287, { align: 'center' });
  }

  const filename = `TCE_IQAC_Quality_Report_${departmentFilter}_${timeline}_${Date.now()}.pdf`;
  doc.save(filename);
};
