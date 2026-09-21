import React from 'react';
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

export default function AppraisalPrintDocument({
  user,
  timeline,
  sectionData = {},
  scores = {},
  record = {},
  bannerSrc,
}) {
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

  const subRemarks = record.subsectionRemarks || {};
  const hodScores = record.hodSubsectionScores || {};
  
  // Calculate effective scores (automated + HoD manual overrides)
  const effectiveScoreObj = computeEffectiveScores(sectionData, hodScores);

  const renderTable = (title, columns, rows, subKey) => {
    const validRows = (rows || []).filter(isRowValid);
    const hasRemark = Boolean(subKey && subRemarks[subKey]);
    const maxMarks = subKey ? SUBSECTION_MAX_MARKS[subKey] : null;
    const autoMark = subKey ? effectiveScoreObj.autoMap[subKey] : null;
    const effMark = subKey ? effectiveScoreObj.effectiveMap[subKey] : null;
    const isOverridden = subKey && effMark !== null && autoMark !== null && effMark !== autoMark;

    if (validRows.length === 0 && !hasRemark && !isOverridden) return null;

    return (
      <div className="mb-4 break-inside-avoid">
        <div className="flex items-center justify-between mb-1.5">
          <h4 className="text-[11px] font-bold text-[#4A1519] uppercase tracking-wide">
            {title}
          </h4>
          {maxMarks !== null && (
            <div className="text-[10px] font-bold px-2 py-0.5 rounded border border-slate-300 bg-slate-50">
              Score: <span className="text-[#4A1519]">{effMark ?? 0}</span> / {maxMarks} Marks
              {isOverridden && (
                <span className="ml-1 text-[9px] font-bold text-amber-700 bg-amber-100 px-1 py-0.2 rounded">
                  ⚡ HoD Evaluated (Auto: {autoMark})
                </span>
              )}
            </div>
          )}
        </div>

        {validRows.length > 0 ? (
          <table className="w-full border-collapse border border-slate-300 text-[10px]">
            <thead>
              <tr className="bg-white text-slate-400 font-semibold border-b border-slate-300">
                <th className="border border-slate-300 px-2 py-1 text-center w-7">#</th>
                {columns.map((col, idx) => (
                  <th key={idx} className="border border-slate-300 px-2 py-1 text-left font-semibold">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {validRows.map((row, rIdx) => (
                <tr key={rIdx} className={rIdx % 2 === 1 ? 'bg-slate-50/60' : 'bg-white'}>
                  <td className="border border-slate-300 px-2 py-0.5 text-center font-medium text-slate-500">
                    {rIdx + 1}
                  </td>
                  {columns.map((col, cIdx) => {
                    const primaryVal = row[col.key];
                    const altVal = col.altKey ? row[col.altKey] : undefined;
                    const val = (primaryVal !== undefined && primaryVal !== null && String(primaryVal).trim() !== '')
                      ? primaryVal
                      : (altVal !== undefined && altVal !== null ? altVal : '');
                    const isLink = col.key === 'evidenceLink' || col.isLink;
                    const url = isLink ? formatExternalLink(val) : '';
                    return (
                      <td key={cIdx} className="border border-slate-300 px-2 py-0.5 text-slate-800 break-words">
                        {isLink && url ? (
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-700 underline font-semibold hover:text-blue-900 cursor-pointer"
                            style={{ color: '#1d4ed8', textDecoration: 'underline', pointerEvents: 'auto' }}
                          >
                            View Proof ↗
                          </a>
                        ) : (
                          val || '—'
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-[10px] text-slate-400 italic">No entries submitted.</p>
        )}

        {hasRemark && (
          <div className="mt-1 bg-amber-50/90 border-l-2 border-[#4A1519] px-2 py-0.5 text-[9.5px] italic text-slate-800">
            <strong className="font-semibold text-[#4A1519] not-italic">HoD Remark ({subKey}):</strong> "{subRemarks[subKey]}"
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="print-document hidden print:block bg-white text-slate-900 font-sans p-4 max-w-4xl mx-auto">
      {/* ── Institutional Header Banner ─────────────────────────────────── */}
      <div className="border-b-2 border-[#4A1519] pb-3 mb-3 text-center">
        {bannerSrc && (
          <img
            src={bannerSrc}
            alt="TCE Logo"
            className="h-14 mx-auto mb-2 object-contain"
          />
        )}
        <h1 className="text-base font-black text-[#4A1519] uppercase tracking-wider">
          Thiagarajar College of Engineering, Madurai - 625 015
        </h1>
        <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide">
          (A Govt. Aided Autonomous Institution Affiliated to Anna University)
        </p>
        <div className="inline-block bg-[#4A1519] text-white text-[11px] font-bold px-3 py-0.5 rounded-full uppercase tracking-widest mt-1.5">
          Faculty Performance Appraisal Report
        </div>
      </div>

      {/* ── Metadata & Profile Box ───────────────────────────────────────── */}
      <div className="border border-slate-300 rounded p-2.5 bg-slate-50/70 mb-4 break-inside-avoid text-[11px]">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          <div>
            <span className="font-bold text-slate-700">Faculty Name:</span>{' '}
            <span className="font-semibold text-slate-900">{user?.name || 'Faculty Member'}</span>
          </div>
          <div>
            <span className="font-bold text-slate-700">Academic Year:</span>{' '}
            <span className="font-semibold text-[#4A1519]">{timeline || '2024-2025'}</span>
          </div>
          <div>
            <span className="font-bold text-slate-700">Email ID:</span>{' '}
            <span className="font-mono text-slate-800">{user?.email || '—'}</span>
          </div>
          <div>
            <span className="font-bold text-slate-700">Date of Submission / Report:</span>{' '}
            <span className="font-medium text-slate-800">{submissionDate}</span>
          </div>
          <div>
            <span className="font-bold text-slate-700">Role / Designation:</span>{' '}
            <span className="font-medium text-slate-800">{user?.role || 'Faculty'}</span>
          </div>
          <div>
            <span className="font-bold text-slate-700">Appraisal Status:</span>{' '}
            <span
              className={`font-black uppercase px-2 py-0.2 rounded text-[10px] ${
                (record.appraisalStatus || '').toUpperCase() === 'RATIFIED' || (record.principalApprovalStatus || '').toUpperCase() === 'RATIFIED'
                  ? 'bg-emerald-100 text-emerald-900 border border-emerald-400'
                  : (record.appraisalStatus || '').toUpperCase() === 'APPROVED'
                  ? 'bg-green-100 text-green-800 border border-green-300'
                  : (record.appraisalStatus || '').toUpperCase() === 'FIX NEEDED' || (record.appraisalStatus || '').toUpperCase() === 'NOT APPROVED'
                  ? 'bg-rose-100 text-rose-800 border border-rose-300'
                  : 'bg-amber-100 text-amber-800 border border-amber-300'
              }`}
            >
              {(record.appraisalStatus || '').toUpperCase() === 'RATIFIED' || (record.principalApprovalStatus || '').toUpperCase() === 'RATIFIED'
                ? '🔒 Ratified & Locked'
                : (record.appraisalStatus || 'Pending')}
            </span>
          </div>
        </div>
      </div>

      {/* ── Executive Score Summary Matrix ────────────────────────────────── */}
      <div className="mb-5 break-inside-avoid">
        <div className="flex items-center justify-between mb-1.5 border-b border-slate-200 pb-0.5">
          <h3 className="text-[11px] font-black text-[#4A1519] uppercase tracking-wider">
            Executive Score Summary Matrix
          </h3>
          {effectiveScoreObj.hasAdjustments && (
            <span className="text-[9px] font-bold text-amber-800 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded">
              ⚡ Includes HoD Evaluated Marks
            </span>
          )}
        </div>
        <table className="w-full border-collapse border border-slate-300 text-[10px]">
          <thead>
            <tr className="bg-slate-100 text-slate-800 font-bold">
              <th className="border border-slate-300 px-2 py-1 text-left">Section</th>
              <th className="border border-slate-300 px-2 py-1 text-left">Assessment Area</th>
              <th className="border border-slate-300 px-2 py-1 text-center w-20">Max Marks</th>
              <th className="border border-slate-300 px-2 py-1 text-center w-28">Evaluated Score</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            <tr>
              <td className="border border-slate-300 px-2 py-0.5 font-bold text-slate-700">Section I</td>
              <td className="border border-slate-300 px-2 py-0.5">Teaching &amp; Learning</td>
              <td className="border border-slate-300 px-2 py-0.5 text-center font-semibold">50</td>
              <td className="border border-slate-300 px-2 py-0.5 text-center font-bold text-slate-900">{effectiveScoreObj.section1Total}</td>
            </tr>
            <tr>
              <td className="border border-slate-300 px-2 py-0.5 font-bold text-slate-700">Section II</td>
              <td className="border border-slate-300 px-2 py-0.5">Research Publications</td>
              <td className="border border-slate-300 px-2 py-0.5 text-center font-semibold">55</td>
              <td className="border border-slate-300 px-2 py-0.5 text-center font-bold text-slate-900">{effectiveScoreObj.section2Total}</td>
            </tr>
            <tr>
              <td className="border border-slate-300 px-2 py-0.5 font-bold text-slate-700">Section III</td>
              <td className="border border-slate-300 px-2 py-0.5">Patents &amp; Innovation</td>
              <td className="border border-slate-300 px-2 py-0.5 text-center font-semibold">15</td>
              <td className="border border-slate-300 px-2 py-0.5 text-center font-bold text-slate-900">{effectiveScoreObj.section3Total}</td>
            </tr>
            <tr>
              <td className="border border-slate-300 px-2 py-0.5 font-bold text-slate-700">Section IV</td>
              <td className="border border-slate-300 px-2 py-0.5">Sponsored Research &amp; Consultancy</td>
              <td className="border border-slate-300 px-2 py-0.5 text-center font-semibold">15</td>
              <td className="border border-slate-300 px-2 py-0.5 text-center font-bold text-slate-900">{effectiveScoreObj.section4Total}</td>
            </tr>
            <tr>
              <td className="border border-slate-300 px-2 py-0.5 font-bold text-slate-700">Section V</td>
              <td className="border border-slate-300 px-2 py-0.5">International Engagement &amp; Rankings</td>
              <td className="border border-slate-300 px-2 py-0.5 text-center font-semibold">10</td>
              <td className="border border-slate-300 px-2 py-0.5 text-center font-bold text-slate-900">{effectiveScoreObj.section5Total}</td>
            </tr>
            <tr>
              <td className="border border-slate-300 px-2 py-0.5 font-bold text-slate-700">Section VI</td>
              <td className="border border-slate-300 px-2 py-0.5">Faculty Development &amp; Professional Activities</td>
              <td className="border border-slate-300 px-2 py-0.5 text-center font-semibold">20</td>
              <td className="border border-slate-300 px-2 py-0.5 text-center font-bold text-slate-900">{effectiveScoreObj.section6Total}</td>
            </tr>
            <tr>
              <td className="border border-slate-300 px-2 py-0.5 font-bold text-slate-700">Section VII</td>
              <td className="border border-slate-300 px-2 py-0.5">Industry Interaction &amp; Internship</td>
              <td className="border border-slate-300 px-2 py-0.5 text-center font-semibold">10</td>
              <td className="border border-slate-300 px-2 py-0.5 text-center font-bold text-slate-900">{effectiveScoreObj.section7Total}</td>
            </tr>
            <tr>
              <td className="border border-slate-300 px-2 py-0.5 font-bold text-slate-700">Section VIII</td>
              <td className="border border-slate-300 px-2 py-0.5">Student Development Activities</td>
              <td className="border border-slate-300 px-2 py-0.5 text-center font-semibold">5</td>
              <td className="border border-slate-300 px-2 py-0.5 text-center font-bold text-slate-900">{effectiveScoreObj.section8Total}</td>
            </tr>
            <tr>
              <td className="border border-slate-300 px-2 py-0.5 font-bold text-slate-700">Section IX</td>
              <td className="border border-slate-300 px-2 py-0.5">Institutional Development</td>
              <td className="border border-slate-300 px-2 py-0.5 text-center font-semibold">20</td>
              <td className="border border-slate-300 px-2 py-0.5 text-center font-bold text-slate-900">{effectiveScoreObj.section9Total}</td>
            </tr>
            <tr className="bg-slate-100 font-black text-slate-900 border-t-2 border-slate-400">
              <td colSpan="2" className="border border-slate-300 px-2 py-1 text-right uppercase tracking-wider">
                Total Evaluated Score (Sections I - IX):
              </td>
              <td className="border border-slate-300 px-2 py-1 text-center font-bold">200</td>
              <td className="border border-slate-300 px-2 py-1 text-center font-black text-[#4A1519] text-xs">
                {effectiveScoreObj.grandTotal} / 200
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── Section I: Teaching & Learning ────────────────────────────────── */}
      <div className="mb-5">
        <div className="flex justify-between items-center text-slate-400 font-bold text-xs uppercase tracking-wider mb-2 border-b border-slate-100 pb-1">
          <span>SECTION I: TEACHING &amp; LEARNING</span>
          <span>SUBTOTAL: {effectiveScoreObj.section1Total} / 50</span>
        </div>
        {renderTable('1.1 Courses Handled', [
          { key: 'courseCode', label: 'Course Code' },
          { key: 'courseName', label: 'Course Name' },
          { key: 'type', label: 'Type' },
          { key: 'semester', label: 'Semester' },
          { key: 'evidenceLink', label: 'Evidence Link', isLink: true },
        ], sectionData.coursesHandled, '1.1')}
        {renderTable('1.2 Course File Compliance', [
          { key: 'courseCode', label: 'Course Code' },
          { key: 'courseName', label: 'Course Name' },
          { key: 'compliance', label: 'Compliance' },
          { key: 'evidenceLink', label: 'Evidence Link', isLink: true },
        ], sectionData.courseFiles, '1.2')}
        {renderTable('1.3 Course Design', [
          { key: 'courseCode', label: 'Course Code' },
          { key: 'courseName', label: 'Course Name' },
          { key: 'remarks', label: 'Details / Remarks' },
          { key: 'evidenceLink', label: 'Evidence Link', isLink: true },
        ], sectionData.coursesDesigned, '1.3')}
        {renderTable('1.4 Value-Added Courses', [
          { key: 'courseName', label: 'Course Name' },
          { key: 'particulars', label: 'Particulars' },
          { key: 'studentCount', label: 'Students Enrolled' },
          { key: 'evidenceLink', label: 'Evidence Link', isLink: true },
        ], sectionData.valueAdded, '1.4')}
        {renderTable('1.5 Innovative Teaching Methods', [
          { key: 'courseCode', label: 'Course Code' },
          { key: 'method', label: 'Method Employed' },
          { key: 'evidenceLink', label: 'Evidence Link', isLink: true },
        ], sectionData.innovativeMethods, '1.5')}
        {renderTable('1.6 Academic Collaborations', [
          { key: 'organization', label: 'Partner Organization' },
          { key: 'collaborationType', label: 'Collaboration Nature' },
          { key: 'evidenceLink', label: 'Evidence Link', isLink: true },
        ], sectionData.academicCollaborations, '1.6')}
        {sectionData.mentoring && (sectionData.mentoring.menteeCount || sectionData.mentoring.description) && (
          <div className="mb-3 border border-slate-300 rounded p-2 text-[10px] break-inside-avoid">
            <div className="flex justify-between items-center mb-0.5">
              <h4 className="font-bold text-[#4A1519] uppercase">1.7 Mentoring System</h4>
              <span className="font-bold text-slate-800">Score: {effectiveScoreObj.effectiveMap['1.7']} / 2 Marks</span>
            </div>
            <p><strong>Mentee Count:</strong> {sectionData.mentoring.menteeCount || '0'} | <strong>Batch:</strong> {sectionData.mentoring.batch || '—'}</p>
            <p className="mt-0.5"><strong>Description:</strong> {sectionData.mentoring.description || '—'}</p>
            {sectionData.mentoring.evidenceLink && (
              <p className="mt-0.5"><a href={formatExternalLink(sectionData.mentoring.evidenceLink)} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline font-medium cursor-pointer" style={{ color: '#1d4ed8', textDecoration: 'underline' }}>View Proof ↗</a></p>
            )}
            {subRemarks['1.7'] && (
              <div className="mt-1 bg-amber-50/90 border-l-2 border-[#4A1519] px-2 py-0.5 text-[9.5px] italic text-slate-800">
                <strong className="font-semibold text-[#4A1519] not-italic">HoD Remark (1.7):</strong> "{subRemarks['1.7']}"
              </div>
            )}
          </div>
        )}
        {renderTable('1.8 NPTEL / SWAYAM Certifications', [
          { key: 'courseName', label: 'Course Title' },
          { key: 'platform', label: 'Platform' },
          { key: 'certType', label: 'Grade' },
          { key: 'evidenceLink', label: 'Evidence Link', isLink: true },
        ], sectionData.certifications, '1.8')}
        {renderTable('1.9 Student Feedback', [
          { key: 'courseCode', label: 'Course Code' },
          { key: 'feedbackPct', label: 'Feedback %' },
          { key: 'evidenceLink', label: 'Evidence Link', isLink: true },
        ], sectionData.studentFeedback, '1.9')}
        {renderTable('1.10 Result Analysis', [
          { key: 'courseCode', label: 'Course Code' },
          { key: 'courseName', label: 'Course Name' },
          { key: 'passPercentage', label: 'Pass %' },
          { key: 'evidenceLink', label: 'Evidence Link', isLink: true },
        ], sectionData.resultAnalysis, '1.10')}
        {renderTable('1.11 CO Attainment', [
          { key: 'courseCode', label: 'Course Code' },
          { key: 'courseName', label: 'Course Name' },
          { key: 'attainmentPct', label: 'Attainment %' },
          { key: 'evidenceLink', label: 'Evidence Link', isLink: true },
        ], sectionData.coAttainment, '1.11')}
      </div>

      {/* ── Section II: Research Publications ─────────────────────────────── */}
      <div className="mb-5">
        <div className="flex justify-between items-center text-slate-400 font-bold text-xs uppercase tracking-wider mb-2 border-b border-slate-100 pb-1">
          <span>SECTION II: RESEARCH PUBLICATIONS</span>
          <span>SUBTOTAL: {effectiveScoreObj.section2Total} / 55</span>
        </div>
        {renderTable('2.1 Journal Publications (SCI / Scopus Indexed)', [
          { key: 'paperTitle', label: 'Paper Title' },
          { key: 'journalName', label: 'Journal Name' },
          { key: 'tier', label: 'Tier' },
          { key: 'evidenceLink', label: 'Evidence Link', isLink: true },
        ], sectionData.journalPapers, '2.1')}
        {sectionData.citationsReceived && sectionData.citationsReceived.totalCount && (
          <div className="mb-2.5 border border-slate-300 rounded p-1.5 text-[10px] break-inside-avoid flex flex-col gap-1">
            <div className="flex justify-between items-center">
              <span><strong>2.2 Citations Received (Last 3 Years):</strong> {sectionData.citationsReceived.totalCount} citations</span>
              <span className="font-bold">Score: {effectiveScoreObj.effectiveMap['2.2']} / 8 Marks</span>
            </div>
            {sectionData.citationsReceived.evidenceLink && (
              <span><a href={formatExternalLink(sectionData.citationsReceived.evidenceLink)} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline font-medium cursor-pointer" style={{ color: '#1d4ed8', textDecoration: 'underline' }}>View Proof ↗</a></span>
            )}
            {subRemarks['2.2'] && (
              <div className="mt-1 bg-amber-50/90 border-l-2 border-[#4A1519] px-2 py-0.5 text-[9.5px] italic text-slate-800">
                <strong className="font-semibold text-[#4A1519] not-italic">HoD Remark (2.2):</strong> "{subRemarks['2.2']}"
              </div>
            )}
          </div>
        )}
        {sectionData.q1Citations && sectionData.q1Citations.totalCount && (
          <div className="mb-2.5 border border-slate-300 rounded p-1.5 text-[10px] break-inside-avoid flex flex-col gap-1">
            <div className="flex justify-between items-center">
              <span><strong>2.3 Total Q1 Citations:</strong> {sectionData.q1Citations.totalCount} citations</span>
              <span className="font-bold">Score: {effectiveScoreObj.effectiveMap['2.3']} / 7 Marks</span>
            </div>
            {sectionData.q1Citations.evidenceLink && (
              <span><a href={formatExternalLink(sectionData.q1Citations.evidenceLink)} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline font-medium cursor-pointer" style={{ color: '#1d4ed8', textDecoration: 'underline' }}>View Proof ↗</a></span>
            )}
            {subRemarks['2.3'] && (
              <div className="mt-1 bg-amber-50/90 border-l-2 border-[#4A1519] px-2 py-0.5 text-[9.5px] italic text-slate-800">
                <strong className="font-semibold text-[#4A1519] not-italic">HoD Remark (2.3):</strong> "{subRemarks['2.3']}"
              </div>
            )}
          </div>
        )}
        {renderTable('2.4 Books / Book Chapters Published', [
          { key: 'title', label: 'Title' },
          { key: 'type', label: 'Type' },
          { key: 'evidenceLink', label: 'Evidence Link', isLink: true },
        ], sectionData.bookPublications, '2.4')}
        {renderTable('2.5 Conference Publications', [
          { key: 'paperTitle', label: 'Paper Title' },
          { key: 'proceedingName', label: 'Proceeding Name' },
          { key: 'evidenceLink', label: 'Evidence Link', isLink: true },
        ], sectionData.conferencePapers, '2.5')}
        {renderTable('2.6 Research Collaborations', [
          { key: 'title', label: 'Title' },
          { key: 'partner', label: 'Partner' },
          { key: 'type', label: 'Type' },
          { key: 'evidenceLink', label: 'Evidence Link', isLink: true },
        ], sectionData.researchCollaborations, '2.6')}
        {renderTable('2.7 PhD Scholars Guided (Registered)', [
          { key: 'scholarName', label: 'Scholar Name' },
          { key: 'researchArea', label: 'Research Area' },
          { key: 'evidenceLink', label: 'Evidence Link', isLink: true },
        ], sectionData.phdRegistered, '2.7')}
        {renderTable('2.8 PhD Scholars Guided (Degree Awarded)', [
          { key: 'scholarName', label: 'Scholar Name' },
          { key: 'researchArea', label: 'Research Area' },
          { key: 'evidenceLink', label: 'Evidence Link', isLink: true },
        ], sectionData.phdAwarded, '2.8')}
      </div>

      {/* ── Section III: Patents & Innovation ──────────────────────────────── */}
      <div className="mb-5">
        <div className="flex justify-between items-center text-slate-400 font-bold text-xs uppercase tracking-wider mb-2 border-b border-slate-100 pb-1">
          <span>SECTION III: PATENTS &amp; INNOVATION</span>
          <span>SUBTOTAL: {effectiveScoreObj.section3Total} / 15</span>
        </div>
        {renderTable('3.1 Patents Published', [
          { key: 'appNumber', label: 'Application No' },
          { key: 'title', label: 'Patent Title' },
          { key: 'inventors', label: 'Inventors' },
          { key: 'datePublished', label: 'Date Published' },
          { key: 'evidenceLink', label: 'Evidence Link', isLink: true },
        ], sectionData.patentsPublished, '3.1')}
        {renderTable('3.2 Patents Granted', [
          { key: 'refNumber', label: 'Patent Ref No' },
          { key: 'title', label: 'Patent Title' },
          { key: 'inventors', label: 'Inventors' },
          { key: 'dateGranted', label: 'Date Granted' },
          { key: 'evidenceLink', label: 'Evidence Link', isLink: true },
        ], sectionData.patentsGranted, '3.2')}
        {renderTable('3.3 Transfer of Technology', [
          { key: 'title', label: 'Technology Title' },
          { key: 'industryPartner', label: 'Partner' },
          { key: 'amount', label: 'Amount (Rs.)' },
          { key: 'evidenceLink', label: 'Evidence Link', isLink: true },
        ], sectionData.transferOfTechnology, '3.3')}
        {renderTable('3.4 Prototypes / Products Developed', [
          { key: 'title', label: 'Product Title' },
          { key: 'studentsInvolved', label: 'Students' },
          { key: 'date', label: 'Date' },
          { key: 'evidenceLink', label: 'Evidence Link', isLink: true },
        ], sectionData.prototypesDeveloped, '3.4')}
        {renderTable('3.5 Hackathon Mentoring & Prizes', [
          { key: 'eventName', label: 'Event' },
          { key: 'studentsMentored', label: 'Students' },
          { key: 'prize', label: 'Award' },
          { key: 'date', label: 'Date' },
          { key: 'evidenceLink', label: 'Evidence Link', isLink: true },
        ], sectionData.hackathonPrizes, '3.5')}
      </div>

      {/* ── Section IV: Sponsored Research & Consultancy ───────────────────── */}
      <div className="mb-5">
        <div className="flex justify-between items-center text-slate-400 font-bold text-xs uppercase tracking-wider mb-2 border-b border-slate-100 pb-1">
          <span>SECTION IV: SPONSORED RESEARCH &amp; CONSULTANCY</span>
          <span>SUBTOTAL: {effectiveScoreObj.section4Total} / 15</span>
        </div>
        {renderTable('4.1 Sponsored Research Projects', [
          { key: 'projectName', label: 'Project Name' },
          { key: 'fundingAgency', label: 'Agency' },
          { key: 'period', label: 'Period' },
          { key: 'amount', label: 'Amount (Rs.)' },
          { key: 'role', label: 'Role' },
          { key: 'status', label: 'Status' },
          { key: 'evidenceLink', label: 'Evidence Link', isLink: true },
        ], sectionData.researchProjects, '4.1')}
        {renderTable('4.2 Consultancy Projects', [
          { key: 'title', label: 'Consultancy Title' },
          { key: 'clientDetails', label: 'Client' },
          { key: 'period', label: 'Period' },
          { key: 'amount', label: 'Amount (Rs.)' },
          { key: 'facultyInvolved', label: 'Faculty' },
          { key: 'evidenceLink', label: 'Evidence Link', isLink: true },
        ], sectionData.consultancyProjects, '4.2')}
      </div>

      {/* ── Section V: International Engagement & Rankings ─────────────────── */}
      <div className="mb-5">
        <div className="flex justify-between items-center text-slate-400 font-bold text-xs uppercase tracking-wider mb-2 border-b border-slate-100 pb-1">
          <span>SECTION V: INTERNATIONAL ENGAGEMENT &amp; RANKINGS</span>
          <span>SUBTOTAL: {effectiveScoreObj.section5Total} / 10</span>
        </div>
        {renderTable('5.1 International Engagement / MoUs', [
          { key: 'institution', label: 'Partner Institution' },
          { key: 'activities', label: 'Activities' },
          { key: 'period', label: 'Period' },
          { key: 'outcomes', label: 'Outcomes' },
          { key: 'evidenceLink', label: 'Evidence Link', isLink: true },
        ], sectionData.internationalEngagement, '5.1')}
        {renderTable('5.2 Visiting / Adjunct Positions Abroad', [
          { key: 'institution', label: 'Host Institution' },
          { key: 'country', label: 'Country' },
          { key: 'durationDays', label: 'Days' },
          { key: 'period', label: 'Period' },
          { key: 'evidenceLink', label: 'Evidence Link', isLink: true },
        ], sectionData.visitingPositions, '5.2')}
        {renderTable('5.3 Foreign Faculty / Student Hosted', [
          { key: 'name', label: 'Visitor Name' },
          { key: 'affiliation', label: 'Affiliation' },
          { key: 'topics', label: 'Topics' },
          { key: 'period', label: 'Period' },
          { key: 'evidenceLink', label: 'Evidence Link', isLink: true },
        ], sectionData.foreignFaculty, '5.3')}
        {renderTable('5.4 QS / THE Reputation Survey Nominations', [
          { key: 'academicianDetails', label: 'Academician' },
          { key: 'university', label: 'University' },
          { key: 'submitted', label: 'Submitted' },
          { key: 'evidenceLink', label: 'Evidence Link', isLink: true },
        ], sectionData.reputationSurvey, '5.4')}
        {renderTable('5.5 NIRF Survey Nominations', [
          { key: 'employerDetails', label: 'Employer' },
          { key: 'submitted', label: 'Submitted' },
          { key: 'evidenceLink', label: 'Evidence Link', isLink: true },
        ], sectionData.nirfSurvey, '5.5')}
      </div>

      {/* ── Section VI: Faculty Development & Professional Activities ──────── */}
      <div className="mb-5">
        <div className="flex justify-between items-center text-slate-400 font-bold text-xs uppercase tracking-wider mb-2 border-b border-slate-100 pb-1">
          <span>SECTION VI: FACULTY DEVELOPMENT &amp; PROFESSIONAL ACTIVITIES</span>
          <span>SUBTOTAL: {effectiveScoreObj.section6Total} / 20</span>
        </div>
        {renderTable('6.1 FDP / STTP Attended', [
          { key: 'programName', label: 'Program Name' },
          { key: 'organizer', label: 'Organizer' },
          { key: 'duration', label: 'Days' },
          { key: 'dateRange', label: 'Start Date' },
          { key: 'endDate', label: 'End Date' },
          { key: 'evidenceLink', label: 'Evidence Link', isLink: true },
        ], sectionData.fdpAttended, '6.1')}
        {renderTable('6.2 Programs Organized', [
          { key: 'programName', label: 'Program Name' },
          { key: 'days', label: 'Days' },
          { key: 'dateRange', label: 'Start Date' },
          { key: 'endDate', label: 'End Date' },
          { key: 'role', label: 'Role' },
          { key: 'participants', label: 'Participants' },
          { key: 'evidenceLink', label: 'Evidence Link', isLink: true },
        ], sectionData.programsOrganized, '6.2')}
        {renderTable('6.3 Resource Person / Keynote Speaker', [
          { key: 'eventName', label: 'Event' },
          { key: 'level', label: 'Level' },
          { key: 'topic', label: 'Topic' },
          { key: 'date', label: 'Date' },
          { key: 'evidenceLink', label: 'Evidence Link', isLink: true },
        ], sectionData.resourcePerson, '6.3')}
        {renderTable('6.4 Professional Memberships', [
          { key: 'societyName', label: 'Society' },
          { key: 'membershipGrade', label: 'Grade' },
          { key: 'status', label: 'Status' },
          { key: 'evidenceLink', label: 'Evidence Link', isLink: true },
        ], sectionData.professionalMembership, '6.4')}
        {renderTable('6.5 Designation in Professional Body / Editorial Board', [
          { key: 'journalName', label: 'Journal / Body' },
          { key: 'role', label: 'Role' },
          { key: 'year', label: 'Year' },
          { key: 'evidenceLink', label: 'Evidence Link', isLink: true },
        ], sectionData.editorialBoard, '6.5')}
        {renderTable('6.6 MOOC Content Developed', [
          { key: 'courseName', label: 'Course Code & Name' },
          { key: 'courseId', label: 'Course ID / Staff ID / Roll No' },
          { key: 'weeks', label: 'Weeks' },
          { key: 'coFacultyCount', label: 'Modules / Co-Faculty' },
          { key: 'takersCount', label: 'Learners' },
          { key: 'evidenceLink', label: 'Evidence Link', isLink: true },
        ], sectionData.moocDeveloped, '6.6')}
      </div>

      {/* ── Section VII: Industry Interaction & Internship ─────────────────── */}
      <div className="mb-5">
        <div className="flex justify-between items-center text-slate-400 font-bold text-xs uppercase tracking-wider mb-2 border-b border-slate-100 pb-1">
          <span>SECTION VII: INDUSTRY INTERACTION &amp; INTERNSHIP</span>
          <span>SUBTOTAL: {effectiveScoreObj.section7Total} / 10</span>
        </div>
        {renderTable('7.1 Partial Course Delivery by Industry Experts', [
          { key: 'courseCode', label: 'Course' },
          { key: 'deliveryMode', label: 'Mode' },
          { key: 'industryName', label: 'Industry' },
          { key: 'expertName', label: 'Expert' },
          { key: 'hoursDelivered', label: 'Hours' },
          { key: 'dateConducted', label: 'Date' },
          { key: 'evidenceLink', label: 'Evidence Link', isLink: true },
        ], sectionData.partialDelivery, '7.1')}
        {renderTable('7.2 Accompanying Industrial Visits', [
          { key: 'industryName', label: 'Industry' },
          { key: 'location', label: 'Location' },
          { key: 'studentsCount', label: 'Students' },
          { key: 'visitDate', label: 'Date' },
          { key: 'evidenceLink', label: 'Evidence Link', isLink: true },
        ], sectionData.industrialVisits, '7.2')}
        {renderTable('7.3 Faculty Internships in Industry', [
          { key: 'industryName', label: 'Industry' },
          { key: 'durationDays', label: 'Days' },
          { key: 'outcomes', label: 'Outcomes' },
          { key: 'evidenceLink', label: 'Evidence Link', isLink: true },
        ], sectionData.facultyInternships, '7.3')}
        {renderTable('7.4 Employer / Alumni Engagement', [
          { key: 'companyName', label: 'Company' },
          { key: 'activityType', label: 'Type' },
          { key: 'outcomes', label: 'Outcomes' },
          { key: 'evidenceLink', label: 'Evidence Link', isLink: true },
        ], sectionData.employerEngagement, '7.4')}
      </div>

      {/* ── Section VIII: Student Development Activities ───────────────────── */}
      <div className="mb-5">
        <div className="flex justify-between items-center text-slate-400 font-bold text-xs uppercase tracking-wider mb-2 border-b border-slate-100 pb-1">
          <span>SECTION VIII: STUDENT DEVELOPMENT ACTIVITIES</span>
          <span>SUBTOTAL: {effectiveScoreObj.section8Total} / 5</span>
        </div>
        {renderTable('8.1 Student Project Publications', [
          { key: 'studentNames', label: 'Students' },
          { key: 'title', label: 'Paper Title' },
          { key: 'journalOrConference', label: 'Journal / Conf' },
          { key: 'publicationDate', label: 'Date' },
          { key: 'evidenceLink', label: 'Evidence Link', isLink: true },
        ], sectionData.projectPublications, '8.1')}
        {renderTable('8.2 Hackathon Mentoring', [
          { key: 'teamName', label: 'Team' },
          { key: 'studentsMentored', label: 'Students' },
          { key: 'eventName', label: 'Event' },
          { key: 'awardWon', label: 'Award' },
          { key: 'evidenceLink', label: 'Evidence Link', isLink: true },
        ], sectionData.hackathonMentoring, '8.2')}
        {renderTable('8.3 Startup & Incubation Support', [
          { key: 'startupName', label: 'Startup' },
          { key: 'studentNames', label: 'Students' },
          { key: 'incubationCenter', label: 'Center' },
          { key: 'evidenceLink', label: 'Evidence Link', isLink: true },
        ], sectionData.startupSupport, '8.3')}
      </div>

      {/* ── Section IX: Institutional Development ──────────────────────────── */}
      <div className="mb-5">
        <div className="flex justify-between items-center text-slate-400 font-bold text-xs uppercase tracking-wider mb-2 border-b border-slate-100 pb-1">
          <span>SECTION IX: INSTITUTIONAL DEVELOPMENT</span>
          <span>SUBTOTAL: {effectiveScoreObj.section9Total} / 20</span>
        </div>
        {renderTable('9.1 Department-Level Activities', [
          { key: 'role', label: 'Role' },
          { key: 'activityType', label: 'Type' },
          { key: 'involvementLevel', label: 'Level' },
          { key: 'completedSuccessfully', label: 'Completed' },
          { key: 'evidenceLink', label: 'Evidence Link', isLink: true },
        ], sectionData.deptActivities, '9.1')}
        {renderTable('9.2 College-Level Activities', [
          { key: 'role', label: 'Role' },
          { key: 'committeeLevel', label: 'Committee' },
          { key: 'natureOfInvolvement', label: 'Nature' },
          { key: 'completedSuccessfully', label: 'Completed' },
          { key: 'evidenceLink', label: 'Evidence Link', isLink: true },
        ], sectionData.collegeActivities, '9.2')}
        {renderTable('9.3 Administrative Responsibilities', [
          { key: 'role', label: 'Position / Role' },
          { key: 'evidenceLink', label: 'Evidence Link', isLink: true },
        ], sectionData.adminResponsibilities, '9.3')}
      </div>

      {/* ── HoD Feedback & Verification ────────────────────────────────────── */}
      {record.hodRemarks && (
        <div className="border border-slate-300 rounded p-2.5 bg-slate-50 mb-5 break-inside-avoid text-[10px]">
          <h4 className="font-bold text-[#4A1519] uppercase mb-0.5">Head of Department (HoD) Overall Remarks</h4>
          <p className="text-slate-800 italic">"{record.hodRemarks}"</p>
        </div>
      )}

      {/* ── Principal Institutional Endorsement & Commendation ──────────────── */}
      {(record.principalApprovalStatus === 'Ratified' || record.appraisalStatus === 'Ratified' || record.principalEndorsedAt) && (
        <div className="border-2 border-emerald-600 rounded-lg p-3 bg-emerald-50/60 mb-5 break-inside-avoid text-[10px]">
          <div className="flex items-center justify-between border-b border-emerald-200 pb-1.5 mb-1.5">
            <h4 className="font-bold text-emerald-900 uppercase flex items-center gap-1">
              <span>🎓</span> Principal Institutional Ratification &amp; Executive Seal
            </h4>
            <span className="font-semibold text-emerald-700 text-[9.5px]">
              {record.principalEndorsedAt
                ? `Digitally Endorsed on ${new Date(record.principalEndorsedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                : 'Formally Ratified by Principal'}
            </span>
          </div>
          {record.principalRemarks ? (
            <p className="text-emerald-950 italic mb-1.5">
              <strong className="not-italic font-semibold text-emerald-900">Executive Commendation:</strong> "{record.principalRemarks}"
            </p>
          ) : (
            <p className="text-emerald-800 italic mb-1.5">
              Formally reviewed and ratified for institutional accreditation &amp; NIRF reporting.
            </p>
          )}
          <div className="text-[9px] text-emerald-700 font-medium">
            🔒 Verification Hash: Document legally locked and certified under TCE Autonomous Academic Governance.
          </div>
        </div>
      )}

      {/* ── Signatures & Endorsement ───────────────────────────────────────── */}
      <div className="mt-8 pt-4 border-t-2 border-slate-300 break-inside-avoid">
        <div className="grid grid-cols-3 gap-6 text-center text-[10px]">
          <div>
            <div className="h-10"></div>
            <div className="border-t border-slate-400 pt-1 font-bold text-slate-800">
              Signature of Faculty Member
            </div>
            <div className="text-[9px] text-slate-500 mt-0.5">Date: {submissionDate}</div>
          </div>
          <div>
            <div className="h-10"></div>
            <div className="border-t border-slate-400 pt-1 font-bold text-slate-800">
              Signature of Head of Department
            </div>
            <div className="text-[9px] text-slate-500 mt-0.5">With Seal &amp; Date</div>
          </div>
          <div>
            <div className="h-10 flex flex-col items-center justify-end pb-1">
              {(record.principalApprovalStatus === 'Ratified' || record.principalEndorsedAt) && (
                <span className="text-[9px] font-black uppercase text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded">
                  🎓 Digitally Sealed
                </span>
              )}
            </div>
            <div className="border-t border-slate-400 pt-1 font-bold text-slate-800">
              Signature of Dean / Principal
            </div>
            <div className="text-[9px] text-slate-500 mt-0.5">
              {(record.principalApprovalStatus === 'Ratified' || record.principalEndorsedAt) && record.principalEndorsedAt
                ? `Ratified: ${new Date(record.principalEndorsedAt).toLocaleDateString('en-GB')}`
                : 'Institutional Seal & Date'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
