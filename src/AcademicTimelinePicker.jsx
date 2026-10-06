import React, { useState, useRef, useEffect, useMemo } from 'react';

/**
 * AcademicTimelinePicker
 * An interactive, decade-based calendar grid picker for academic appraisal periods.
 * Supports standard annual cycles (e.g., 2025-2026), multi-year project/promotion blocks (e.g., 2020-2025),
 * and "All Timelines" for reviewers (HOD / IQAC / Principal).
 * Usable both as a top-level appraisal timeline picker and inline within dynamic table rows.
 */
export default function AcademicTimelinePicker({
  value = '',
  onChange,
  isReviewMode = false,
  currentAcademicYear = '2025-2026',
  minYear = 2000,
  maxYear = 2100,
  hideLabel = false,
  isCompact = false,
  placeholder = 'Select Period',
  allowClear = false,
  disabled = false,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  // Extract starting year from value to determine the initial decade
  const initialYear = useMemo(() => {
    if (value && value !== 'All') {
      const match = String(value).match(/^(\d{4})/);
      if (match) return parseInt(match[1], 10);
    }
    const currentMatch = (currentAcademicYear || '').match(/^(\d{4})/);
    return currentMatch ? parseInt(currentMatch[1], 10) : new Date().getFullYear();
  }, [value, currentAcademicYear]);

  // Current decade starting year (e.g. 2020 for 2020-2029)
  const [decadeStart, setDecadeStart] = useState(() => Math.floor(initialYear / 10) * 10);

  // Custom multi-year range state
  const [showCustomRange, setShowCustomRange] = useState(false);
  const [customStart, setCustomStart] = useState(() => initialYear);
  const [customEnd, setCustomEnd] = useState(() => initialYear + 3);
  const [customError, setCustomError] = useState('');

  // Sync decade when value changes externally
  useEffect(() => {
    if (value && value !== 'All') {
      const match = String(value).match(/^(\d{4})/);
      if (match) {
        const parsed = parseInt(match[1], 10);
        if (!isNaN(parsed)) {
          setDecadeStart(Math.floor(parsed / 10) * 10);
          setCustomStart(parsed);
          const endMatch = String(value).match(/-(\d{4})$/);
          if (endMatch) {
            setCustomEnd(parseInt(endMatch[1], 10));
          } else {
            setCustomEnd(parsed + 1);
          }
        }
      }
    }
  }, [value]);

  // Close popup on click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
        setShowCustomRange(false);
        setCustomError('');
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        setShowCustomRange(false);
        setCustomError('');
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const decadeEnd = decadeStart + 9;

  // Generate 10 standard academic years for the active decade
  const decadeYears = useMemo(() => {
    const years = [];
    for (let y = decadeStart; y <= decadeEnd; y++) {
      if (y >= minYear && y < maxYear) {
        years.push(`${y}-${y + 1}`);
      }
    }
    return years;
  }, [decadeStart, decadeEnd, minYear, maxYear]);

  const handlePrevDecade = (e) => {
    e.stopPropagation();
    if (decadeStart - 10 >= minYear) {
      setDecadeStart((prev) => prev - 10);
    }
  };

  const handleNextDecade = (e) => {
    e.stopPropagation();
    if (decadeStart + 10 < maxYear) {
      setDecadeStart((prev) => prev + 10);
    }
  };

  const handleJumpToCurrent = (e) => {
    e.stopPropagation();
    const curMatch = (currentAcademicYear || '').match(/^(\d{4})/);
    const curYear = curMatch ? parseInt(curMatch[1], 10) : new Date().getFullYear();
    setDecadeStart(Math.floor(curYear / 10) * 10);
  };

  const handleSelectYear = (tl) => {
    onChange?.(tl);
    setIsOpen(false);
    setShowCustomRange(false);
    setCustomError('');
  };

  const handleApplyCustomRange = (e) => {
    e.preventDefault();
    const s = parseInt(customStart, 10);
    const end = parseInt(customEnd, 10);
    if (isNaN(s) || isNaN(end)) {
      setCustomError('Please enter valid 4-digit years.');
      return;
    }
    if (end <= s) {
      setCustomError('End year must be after start year.');
      return;
    }
    if (end - s > 25) {
      setCustomError('Period range cannot exceed 25 years.');
      return;
    }
    const rangeTimeline = `${s}-${end}`;
    onChange?.(rangeTimeline);
    setIsOpen(false);
    setShowCustomRange(false);
    setCustomError('');
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange?.('');
    setIsOpen(false);
  };

  const isCurrentActive = Boolean(value) && value === currentAcademicYear;

  return (
    <div className={`relative ${isCompact ? 'w-full' : 'inline-block'} text-left`} ref={containerRef}>
      {/* Label above trigger (optional for compact inline table fields) */}
      {!hideLabel && (
        <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
          Academic Period
        </span>
      )}

      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={
          isCompact
            ? `w-full h-7 py-0.5 px-2 flex items-center justify-between gap-1.5 rounded-md border text-xs shadow-xs transition-all outline-none ${
                disabled
                  ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                  : isOpen
                  ? 'border-[#4A1519] ring-2 ring-[#4A1519]/20 bg-white text-[#4A1519]'
                  : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50 hover:border-slate-300'
              }`
            : `h-8 inline-flex items-center gap-2 rounded-md border px-2.5 text-xs font-semibold shadow-sm transition-all outline-none ${
                disabled
                  ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                  : isOpen
                  ? 'border-[#4A1519] ring-2 ring-[#4A1519]/20 bg-slate-50 text-[#4A1519]'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-400'
              }`
        }
        title={disabled ? 'Disabled' : 'Click to select evaluation period or decade'}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <span className="text-xs shrink-0 select-none">📅</span>
          {value ? (
            <span className="font-semibold text-slate-900 truncate">
              {value === 'All' ? 'All Timelines / Submissions' : value}
            </span>
          ) : (
            <span className="text-slate-400 text-[11px] truncate">
              {placeholder}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {allowClear && Boolean(value) && !disabled && (
            <span
              role="button"
              tabIndex={0}
              onClick={handleClear}
              className="text-slate-400 hover:text-slate-700 p-0.5 rounded-full hover:bg-slate-100 text-[10px] leading-none select-none transition"
              title="Clear period"
            >
              ✕
            </span>
          )}
          {!isCompact && isCurrentActive && value !== 'All' && (
            <span className="hidden sm:inline-block rounded-full bg-emerald-100 px-1.5 py-0.2 text-[9.5px] font-bold text-emerald-800">
              Active
            </span>
          )}
          <svg
            className={`h-3 w-3 text-slate-400 transition-transform ${isOpen ? 'rotate-180 text-[#4A1519]' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Decade Calendar Grid Popover */}
      {isOpen && (
        <div
          className={`absolute ${
            isCompact ? 'left-0 sm:left-auto sm:right-0 md:left-0' : 'left-0 sm:left-auto sm:right-0'
          } z-50 mt-1.5 w-80 sm:w-96 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xl shadow-black/15 ring-1 ring-black/5 animate-in fade-in zoom-in-95 duration-100`}
        >
          {/* Review Mode: All Submissions Option */}
          {isReviewMode && (
            <div className="mb-2.5 pb-2.5 border-b border-slate-100">
              <button
                type="button"
                onClick={() => handleSelectYear('All')}
                className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  value === 'All'
                    ? 'bg-[#4A1519] text-white shadow-sm'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <span>🏛️</span> All Timelines / Submissions
                </span>
                {value === 'All' && <span className="text-[10px] uppercase font-bold">Selected</span>}
              </button>
            </div>
          )}

          {/* Decade Header Navigator */}
          <div className="flex items-center justify-between mb-3 px-1">
            <button
              type="button"
              onClick={handlePrevDecade}
              disabled={decadeStart - 10 < minYear}
              className="p-1 rounded-md hover:bg-slate-100 text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed transition"
              title="Previous Decade"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-slate-800 tracking-wide">
                Decade {decadeStart} – {decadeEnd}
              </span>
              <button
                type="button"
                onClick={handleJumpToCurrent}
                className="text-[10px] font-semibold text-[#4A1519] hover:underline px-1.5 py-0.5 rounded bg-[#4A1519]/5"
                title="Jump to current active year"
              >
                Today
              </button>
            </div>

            <button
              type="button"
              onClick={handleNextDecade}
              disabled={decadeStart + 10 >= maxYear}
              className="p-1 rounded-md hover:bg-slate-100 text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed transition"
              title="Next Decade"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Decade Years Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {decadeYears.map((tl) => {
              const isSelected = value === tl;
              const isCurrent = tl === currentAcademicYear;
              return (
                <button
                  key={tl}
                  type="button"
                  onClick={() => handleSelectYear(tl)}
                  className={`relative flex flex-col items-center justify-center p-2 rounded-lg border text-xs font-semibold transition-all ${
                    isSelected
                      ? 'border-[#4A1519] bg-[#4A1519] text-white shadow-sm ring-2 ring-[#4A1519]/30'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-[#4A1519]/40 hover:bg-[#4A1519]/5'
                  }`}
                >
                  <span className="font-bold">{tl}</span>
                  {isCurrent && (
                    <span
                      className={`text-[9px] font-medium tracking-tight mt-0.5 ${
                        isSelected ? 'text-amber-200' : 'text-emerald-700 font-bold'
                      }`}
                    >
                      ● Current
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Custom Range Drawer (for Multi-Year CAS / Promotion Reviews / Projects) */}
          <div className="mt-3 pt-2.5 border-t border-slate-100">
            {!showCustomRange ? (
              <button
                type="button"
                onClick={() => setShowCustomRange(true)}
                className="w-full flex items-center justify-center gap-1.5 text-[11px] font-semibold text-slate-500 hover:text-[#4A1519] py-1 transition"
              >
                <span>➕</span> Custom Multi-Year Range (CAS / Projects)
              </button>
            ) : (
              <form onSubmit={handleApplyCustomRange} className="space-y-2 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-700">Custom Multi-Year Period</span>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCustomRange(false);
                      setCustomError('');
                    }}
                    className="text-slate-400 hover:text-slate-600 text-xs"
                  >
                    ✕
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <label className="text-[9.5px] font-bold text-slate-500 uppercase block mb-0.5">Start Year</label>
                    <input
                      type="number"
                      min={minYear}
                      max={maxYear - 1}
                      value={customStart}
                      onChange={(e) => setCustomStart(e.target.value)}
                      className="w-full px-2 py-1 text-xs border border-slate-300 rounded bg-white text-slate-800 outline-none focus:border-[#4A1519]"
                    />
                  </div>
                  <span className="text-slate-400 mt-3 font-bold">—</span>
                  <div className="flex-1">
                    <label className="text-[9.5px] font-bold text-slate-500 uppercase block mb-0.5">End Year</label>
                    <input
                      type="number"
                      min={minYear + 1}
                      max={maxYear}
                      value={customEnd}
                      onChange={(e) => setCustomEnd(e.target.value)}
                      className="w-full px-2 py-1 text-xs border border-slate-300 rounded bg-white text-slate-800 outline-none focus:border-[#4A1519]"
                    />
                  </div>
                  <div className="pt-3">
                    <button
                      type="submit"
                      className="px-3 py-1 bg-[#4A1519] hover:bg-[#3B1013] text-white text-xs font-bold rounded shadow-sm transition"
                    >
                      Apply
                    </button>
                  </div>
                </div>

                {customError && (
                  <p className="text-[10.5px] font-medium text-red-600">{customError}</p>
                )}
                <p className="text-[9.5px] text-slate-500 leading-tight">
                  Example: 2021 to 2024 for multi-year sponsored project or committee tenure.
                </p>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
