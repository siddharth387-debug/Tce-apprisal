import React, { useState } from 'react';

/**
 * EngineeringAppraisalResources
 * Official downloadable documents for General Engineering departments (Engineering, AMCS, CA, S&H).
 * Strictly hidden for Architecture (TSEDA) via `isArch` guard.
 *
 * @param {boolean} isArch - Whether current appraisal context is Architecture / TSEDA
 * @param {'full' | 'compact'} variant - Layout style (full cards on Overview, compact bar on Form)
 */
export default function EngineeringAppraisalResources({ isArch = false, variant = 'full' }) {
  const [downloading, setDownloading] = useState(null);

  // Strictly exclude Architecture (TSEDA)
  if (isArch) {
    return null;
  }

  const baseUrl = import.meta.env.BASE_URL || '/';
  const cleanBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;

  const files = {
    guidelines: {
      url: `${cleanBase}Faculty%20Appraisal%20Evaluation%20Guidelines.pdf`,
      filename: 'Faculty Appraisal Evaluation Guidelines.pdf',
      title: 'Faculty Appraisal Evaluation Guidelines',
      category: 'Scoring Rubrics & Guidelines',
      format: 'PDF',
      size: '278 KB',
      color: 'rose',
      description: 'Official 3-page scoring rubrics for Sections I through IX with detailed mark breakdowns, minimum requirements, and weightage scales.',
    },
    template: {
      url: `${cleanBase}Faculty%20Appraisal%20Template%20Aug%202026.docx`,
      filename: 'Faculty Appraisal Template Aug 2026.docx',
      title: 'Faculty Appraisal Template Aug 2026',
      category: 'Official Offline Template',
      format: 'DOCX',
      size: '31 KB',
      color: 'blue',
      description: 'Official editable appraisal template (.docx) containing faculty profile details, metric tables for Sections I to IX, self-declaration, and HoD endorsement.',
    },
  };

  const handleDownloadFeedback = (key) => {
    setDownloading(key);
    setTimeout(() => setDownloading(null), 2500);
  };

  // Compact Toolbar Variant (for Form Workbench - Section One header)
  if (variant === 'compact') {
    return (
      <div className="rounded-xl border border-rose-200/80 bg-gradient-to-r from-rose-50/70 via-white to-amber-50/60 p-3 shadow-xs mb-3 print-hidden">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#4A1519] text-white shadow-xs text-xs font-bold">
              📚
            </span>
            <div>
              <p className="text-xs font-bold text-slate-800">
                Official Engineering Appraisal Guidelines &amp; Template
              </p>
              <p className="text-[10px] text-slate-500">
                Download official scoring rubrics and offline appraisal template (Engineering, AMCS, CA, S&amp;H)
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <a
              href={files.guidelines.url}
              download={files.guidelines.filename}
              onClick={() => handleDownloadFeedback('guidelines')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 shadow-xs transition active:scale-95"
              title="Download Faculty Appraisal Evaluation Guidelines (PDF)"
            >
              <svg className="w-3.5 h-3.5 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span>Rubrics PDF</span>
              <span className="text-[9px] px-1 py-0.2 bg-rose-100 text-rose-800 rounded font-semibold">PDF</span>
            </a>

            <a
              href={files.template.url}
              download={files.template.filename}
              onClick={() => handleDownloadFeedback('template')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 shadow-xs transition active:scale-95"
              title="Download Faculty Appraisal Template Aug 2026 (.docx)"
            >
              <svg className="w-3.5 h-3.5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <span>Appraisal Template</span>
              <span className="text-[9px] px-1 py-0.2 bg-blue-100 text-blue-800 rounded font-semibold">DOCX</span>
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Full Rich Dashboard Card Variant (for renderOverview dashboard)
  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white shadow-sm overflow-hidden transition-all duration-200 hover:border-slate-300 print-hidden">
      {/* Header bar */}
      <div className="border-b border-slate-100 bg-gradient-to-r from-rose-50/50 via-slate-50 to-amber-50/30 px-4 py-3 sm:px-5 sm:py-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#4A1519] text-white shadow-xs">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              Official Appraisal Guidelines &amp; Template
            </h3>
          </div>
        </div>
      </div>

      {/* Two Column Cards Grid */}
      <div className="p-4 sm:p-5 grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50/40">
        {/* Card 1: Evaluation Guidelines (PDF) */}
        <div className="relative flex flex-col justify-between rounded-xl border border-rose-200/90 bg-white p-4 shadow-xs hover:shadow-md hover:border-rose-300 transition-all duration-200 group">
          <div>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-700 border border-rose-100 group-hover:bg-rose-100/80 transition-colors">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 mt-0.5">
                    {files.guidelines.title}
                  </h4>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
            <a
              href={files.guidelines.url}
              download={files.guidelines.filename}
              onClick={() => handleDownloadFeedback('guidelines')}
              className="flex-1 inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold text-white bg-rose-700 hover:bg-rose-800 active:scale-95 shadow-xs transition"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <span>Download Rubrics (PDF)</span>
            </a>

            <a
              href={files.guidelines.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-rose-800 bg-white hover:bg-rose-50 border border-rose-200 shadow-xs transition"
              title="Open Guidelines in a new browser tab"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              <span>Preview</span>
            </a>
          </div>
        </div>

        {/* Card 2: Appraisal Template (DOCX) */}
        <div className="relative flex flex-col justify-between rounded-xl border border-blue-200/90 bg-white p-4 shadow-xs hover:shadow-md hover:border-blue-300 transition-all duration-200 group">
          <div>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700 border border-blue-100 group-hover:bg-blue-100/80 transition-colors">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 mt-0.5">
                    {files.template.title}
                  </h4>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
            <a
              href={files.template.url}
              download={files.template.filename}
              onClick={() => handleDownloadFeedback('template')}
              className="flex-1 inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold text-white bg-blue-700 hover:bg-blue-800 active:scale-95 shadow-xs transition"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <span>Download Appraisal Template (.docx)</span>
            </a>
          </div>
        </div>
      </div>

      {/* Footer Helper Note */}
      {downloading && (
        <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
          <span className="text-emerald-600 font-bold animate-pulse text-[10.5px]">
            ✓ Download started
          </span>
        </div>
      )}
    </div>
  );
}
