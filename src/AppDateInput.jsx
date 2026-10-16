import React, { useState, useEffect, useRef } from 'react';

/**
 * Parses any supported date input string (YYYY-MM-DD, DD.MM.YYYY, DD-MM-YYYY, DD/MM/YYYY)
 * into a valid ISO YYYY-MM-DD string, or returns 'invalid' / ''.
 */
export function parseDateStringToIso(str) {
  if (!str) return '';
  const s = String(str).trim();
  if (!s) return '';

  // ISO Format: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    if (dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d) {
      return s;
    }
    return 'invalid';
  }

  // Common Formats: DD.MM.YYYY, DD-MM-YYYY, DD/MM/YYYY
  const m1 = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (m1) {
    const d = parseInt(m1[1], 10);
    const m = parseInt(m1[2], 10);
    const y = parseInt(m1[3], 10);
    const dt = new Date(y, m - 1, d);
    if (dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    return 'invalid';
  }

  return 'invalid';
}

/**
 * Formats YYYY-MM-DD into display format DD.MM.YYYY
 */
export function formatIsoToDisplay(isoStr) {
  if (!isoStr || isoStr === 'invalid') return '';
  const parts = isoStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
  }
  return isoStr;
}

/**
 * Calculates inclusive calendar days between two dates: (end - start) + 1.
 * Safe against timezones and daylight-saving shifts using UTC date arithmetic.
 * Returns empty string '' if either date is missing/invalid or end < start.
 */
export function calculateInclusiveDays(startDateStr, endDateStr) {
  if (!startDateStr || !endDateStr) return '';
  const sIso = parseDateStringToIso(startDateStr);
  const eIso = parseDateStringToIso(endDateStr);
  if (!sIso || sIso === 'invalid' || !eIso || eIso === 'invalid') return '';
  const [sy, sm, sd] = sIso.split('-').map(Number);
  const [ey, em, ed] = eIso.split('-').map(Number);
  const startUtc = Date.UTC(sy, sm - 1, sd);
  const endUtc = Date.UTC(ey, em - 1, ed);
  if (endUtc < startUtc) return '';
  const diffDays = Math.round((endUtc - startUtc) / (1000 * 60 * 60 * 24));
  return String(diffDays + 1);
}

/**
/**
 * Calendar bounds named constants
 * - CALENDAR YEAR: 1 January Y to 31 December Y
 * - ACADEMIC YEAR: 1 July Y to 30 June Y+1
 */
export const YEAR_CALENDAR_BOUNDS = Object.freeze({
  startMonth: 1,  // January
  startDay: 1,
  endMonth: 12,   // December
  endDay: 31,
});

export const ACADEMIC_CALENDAR_BOUNDS = Object.freeze({
  startMonth: 7,  // July
  startDay: 1,
  endMonth: 6,    // June (following year)
  endDay: 30,
});

/**
 * SINGLE SOURCE OF TRUTH (Faculty Performance Appraisal Guidelines)
 * - CALENDAR YEAR (Jan to Dec): Section II: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6; Section III: 3.1, 3.2
 * - LEAVE UNTOUCHED: Section III: 3.3, 3.4, 3.5 (no change at all)
 * - ACADEMIC YEAR (Jul to Jun): Section II: 2.7, 2.8; Section I: all; Section IV: all;
 *   Section V: all; Section VI: all; Section VII, VIII, IX: all; and any unlisted section (e.g. 3.6).
 */
export const CALENDAR_BY_SUBSECTION = Object.freeze({
  // CALENDAR YEAR (1 Jan Y to 31 Dec Y)
  '2.1': 'year',
  '2.2': 'year',
  '2.3': 'year',
  '2.4': 'year',
  '2.5': 'year',
  '2.6': 'year',
  '3.1': 'year',
  '3.2': 'year',

  // UNTOUCHED (Section III: 3.3, 3.4, 3.5 stay as today)
  '3.3': 'none',
  '3.4': 'none',
  '3.5': 'none',

  // ACADEMIC YEAR (1 Jul Y to 30 Jun Y+1)
  '1.1': 'academic',
  '1.2': 'academic',
  '1.3': 'academic',
  '1.4': 'academic',
  '1.5': 'academic',
  '1.5.1': 'academic',
  '1.5.2': 'academic',
  '1.6': 'academic',
  '1.7': 'academic',
  '1.8': 'academic',
  '1.9': 'academic',
  '1.10': 'academic',
  '1.11': 'academic',

  '2.7': 'academic',
  '2.8': 'academic',

  '3.6': 'academic',

  '4.1': 'academic',
  '4.2': 'academic',

  '5.1': 'academic',
  '5.2': 'academic',
  '5.3': 'academic',
  '5.4': 'academic',
  '5.5': 'academic',

  '6.1': 'academic',
  '6.2': 'academic',
  '6.3': 'academic',
  '6.4': 'academic',
  '6.5': 'academic',
  '6.6': 'academic',

  '7.1': 'academic',
  '7.2': 'academic',
  '7.3': 'academic',
  '7.4': 'academic',

  '8.1': 'academic',
  '8.2': 'academic',
  '8.3': 'academic',
  '8.4': 'academic',

  '9.1': 'academic',
  '9.2': 'academic',
  '9.3': 'academic',
});

/**
 * Computes calendar range boundaries based on the selected batch (e.g. '2025 - 2026')
 * - 'year': 01 Jan {startYear} to 31 Dec {startYear}
 * - 'academic': 01 Jul {startYear} to 30 Jun {endYear}
 * - 'none' (or unlisted): no range restriction
 */
export function getCalendarRangeForBatch(batch, calendarType = 'none') {
  const cType = (calendarType || 'none').toLowerCase();
  if (!batch || cType === 'none' || (cType !== 'year' && cType !== 'academic')) {
    return { minDate: undefined, maxDate: undefined, label: '', calendarName: '', hint: '' };
  }
  const match = String(batch).match(/(\d{4})/g);
  const startYear = match && match[0] ? parseInt(match[0], 10) : 2025;
  const endYear = match && match[1] ? parseInt(match[1], 10) : startYear + 1;

  if (cType === 'year') {
    const sm = String(YEAR_CALENDAR_BOUNDS.startMonth).padStart(2, '0');
    const sd = String(YEAR_CALENDAR_BOUNDS.startDay).padStart(2, '0');
    const em = String(YEAR_CALENDAR_BOUNDS.endMonth).padStart(2, '0');
    const ed = String(YEAR_CALENDAR_BOUNDS.endDay).padStart(2, '0');
    return {
      minDate: `${startYear}-${sm}-${sd}`,
      maxDate: `${startYear}-${em}-${ed}`,
      label: `01 Jan ${startYear} - 31 Dec ${startYear}`,
      calendarName: 'Calendar Year',
      hint: `Calendar Year ${startYear}: 01 Jan ${startYear} - 31 Dec ${startYear}`,
      startYear,
      endYear: startYear,
    };
  }
  if (cType === 'academic') {
    const sm = String(ACADEMIC_CALENDAR_BOUNDS.startMonth).padStart(2, '0');
    const sd = String(ACADEMIC_CALENDAR_BOUNDS.startDay).padStart(2, '0');
    const em = String(ACADEMIC_CALENDAR_BOUNDS.endMonth).padStart(2, '0');
    const ed = String(ACADEMIC_CALENDAR_BOUNDS.endDay).padStart(2, '0');
    return {
      minDate: `${startYear}-${sm}-${sd}`,
      maxDate: `${endYear}-${em}-${ed}`,
      label: `01 Jul ${startYear} - 30 Jun ${endYear}`,
      calendarName: 'Academic Year',
      hint: `Academic Year ${startYear}-${endYear}: 01 Jul ${startYear} - 30 Jun ${endYear}`,
      startYear,
      endYear,
    };
  }
  return { minDate: undefined, maxDate: undefined, label: '', calendarName: '', hint: '' };
}

/**
 * Adds (durationDays - 1) days to startDate (YYYY-MM-DD)
 * Example: start 09.10.2026 with duration 3 -> 11.10.2026
 */
export function computeExpectedEndDate(startDateStr, durationDays) {
  if (!startDateStr || !durationDays || durationDays <= 0) return '';
  const iso = parseDateStringToIso(startDateStr);
  if (!iso || iso === 'invalid') return '';
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + (Number(durationDays) - 1));
  const ey = dt.getFullYear();
  const em = String(dt.getMonth() + 1).padStart(2, '0');
  const ed = String(dt.getDate()).padStart(2, '0');
  return `${ey}-${em}-${ed}`;
}

/**
 * Shared Date Input Component
 * Supports both typing (auto-formatting / validation) and native/browser calendar picking.
 * Enforces calendar bounds (Year Calendar vs Academic Calendar) and custom date constraints.
 * Default calendarType is 'none' (unrestricted).
 */
export default function AppDateInput({
  value = '',
  onChange,
  calendarType = 'none',
  subsectionId,
  batch = '2025 - 2026',
  minDate: customMinDate,
  maxDate: customMaxDate,
  exactDate, // for Issue 11 where ONLY a single specific date is selectable
  startDateForOrdering, // start date if this input is an END date (Issue 14)
  disabled = false,
  placeholder = 'Select Date',
  title = '',
  ariaLabel = '',
  className = '',
  onFocus,
  onBlur,
  errorText = '',
}) {
  const [userInteracted, setUserInteracted] = useState(false);

  const isUntouchedSubsection = Boolean(
    subsectionId && ['3.3', '3.4', '3.5'].includes(String(subsectionId).trim())
  );

  let resolvedType = 'none';
  if (!isUntouchedSubsection) {
    if (subsectionId && CALENDAR_BY_SUBSECTION[subsectionId]) {
      resolvedType = CALENDAR_BY_SUBSECTION[subsectionId];
    } else if (calendarType && calendarType !== 'none') {
      resolvedType = calendarType;
    } else {
      resolvedType = 'academic';
    }
  }
  const range = getCalendarRangeForBatch(batch, resolvedType);

  // Effective min & max bounds for the date input
  let effectiveMin = exactDate || customMinDate || range.minDate;
  let effectiveMax = exactDate || customMaxDate || range.maxDate;

  // End date cannot be earlier than start date
  if (startDateForOrdering) {
    const isoStart = parseDateStringToIso(startDateForOrdering);
    if (isoStart && isoStart !== 'invalid') {
      if (!effectiveMin || isoStart > effectiveMin) {
        effectiveMin = isoStart;
      }
    }
  }

  // Handle typing or pasting in the date field
  const handleNativeChange = (e) => {
    setUserInteracted(true);
    const raw = e.target.value;
    if (!raw) {
      onChange('');
      return;
    }
    const iso = parseDateStringToIso(raw);
    if (iso && iso !== 'invalid') {
      onChange(iso);
    } else {
      // Keep raw input so user can finish typing
      onChange(raw);
    }
  };

  const handlePaste = (e) => {
    setUserInteracted(true);
    const pasted = e.clipboardData.getData('text');
    const iso = parseDateStringToIso(pasted);
    if (iso && iso !== 'invalid') {
      e.preventDefault();
      onChange(iso);
    }
  };

  // Determine current validation error
  const getValidationError = () => {
    if (disabled || !value) return '';
    const iso = parseDateStringToIso(value);
    if (iso === 'invalid') {
      return 'Enter a valid date (DD.MM.YYYY or YYYY-MM-DD)';
    }
    if (exactDate && iso !== exactDate) {
      return `Must be exactly ${formatIsoToDisplay(exactDate)} (start + duration - 1 days)`;
    }
    if (startDateForOrdering) {
      const isoStart = parseDateStringToIso(startDateForOrdering);
      if (isoStart && isoStart !== 'invalid' && iso < isoStart) {
        return 'End date cannot be earlier than start date';
      }
    }
    if (userInteracted && range.minDate && range.maxDate) {
      if (iso < range.minDate || iso > range.maxDate) {
        return `Date must be within ${range.calendarName} (${range.label})`;
      }
    }
    return '';
  };

  const validationError = disabled ? '' : (errorText || getValidationError());
  const hasError = Boolean(validationError);

  // Ensure value provided to input is in YYYY-MM-DD format if valid ISO
  const inputValue = parseDateStringToIso(value) !== 'invalid' ? (parseDateStringToIso(value) || '') : value;

  return (
    <div className="flex flex-col min-w-0 w-full">
      <input
        type="date"
        value={inputValue}
        min={effectiveMin}
        max={effectiveMax}
        onChange={handleNativeChange}
        onPaste={handlePaste}
        onFocus={onFocus}
        onBlur={onBlur}
        disabled={disabled}
        placeholder={placeholder}
        title={title || placeholder || 'dd-mm-yyyy'}
        aria-label={ariaLabel || title || placeholder || 'dd-mm-yyyy'}
        className={`w-full rounded-md border ${
          hasError ? 'border-red-400 bg-red-50/20' : 'border-slate-200 bg-white'
        } h-[38px] sm:h-7 py-0.5 px-2 text-xs text-slate-800 outline-none transition focus:border-[#4A1519] focus:ring-2 focus:ring-[#4A1519]/20 disabled:bg-slate-100 disabled:cursor-not-allowed truncate whitespace-nowrap ${className}`}
      />
      {validationError ? (
        <span className="mt-1 block text-[11px] sm:text-[10px] text-rose-600 font-medium break-words leading-tight">
          {validationError}
        </span>
      ) : null}
      {!isUntouchedSubsection && range.hint ? (
        <span className="mt-0.5 block text-[10px] sm:text-[9.5px] text-slate-500 font-normal leading-tight select-none">
          {range.hint}
        </span>
      ) : null}
    </div>
  );
}
