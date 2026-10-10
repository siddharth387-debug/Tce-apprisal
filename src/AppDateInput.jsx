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
 * Computes calendar range boundaries based on the selected batch (e.g. '2025 - 2026')
 * - 'year': 01 Jan {startYear} to 31 Dec {startYear}
 * - 'academic': 01 Jul {startYear} to 30 Jun {endYear}
 */
export function getCalendarRangeForBatch(batch, calendarType) {
  if (!batch || calendarType === 'none' || !calendarType) {
    return { minDate: undefined, maxDate: undefined, label: '', calendarName: '' };
  }
  const match = String(batch).match(/(\d{4})/g);
  const startYear = match && match[0] ? parseInt(match[0], 10) : 2025;
  const endYear = match && match[1] ? parseInt(match[1], 10) : startYear + 1;

  if (calendarType === 'year') {
    return {
      minDate: `${startYear}-01-01`,
      maxDate: `${startYear}-12-31`,
      label: `01 Jan ${startYear} to 31 Dec ${startYear}`,
      calendarName: 'Year Calendar',
      startYear,
      endYear,
    };
  }
  if (calendarType === 'academic') {
    return {
      minDate: `${startYear}-07-01`,
      maxDate: `${endYear}-06-30`,
      label: `01 Jul ${startYear} to 30 Jun ${endYear}`,
      calendarName: 'Academic Calendar',
      startYear,
      endYear,
    };
  }
  return { minDate: undefined, maxDate: undefined, label: '', calendarName: '' };
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
 */
export default function AppDateInput({
  value = '',
  onChange,
  calendarType = 'none',
  batch = '2025 - 2026',
  minDate: customMinDate,
  maxDate: customMaxDate,
  exactDate, // for Issue 11 where ONLY a single specific date is selectable
  startDateForOrdering, // start date if this input is an END date (Issue 14)
  disabled = false,
  placeholder = 'Select Date',
  className = '',
  onFocus,
  onBlur,
  errorText = '',
}) {
  const range = getCalendarRangeForBatch(batch, calendarType);

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
    if (range.minDate && range.maxDate) {
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
        className={`w-full rounded-md border ${
          hasError ? 'border-red-400 bg-red-50/20' : 'border-slate-200 bg-white'
        } py-0.5 px-2 text-xs text-slate-800 outline-none transition focus:border-[#4A1519] focus:ring-2 focus:ring-[#4A1519]/20 disabled:bg-slate-100 disabled:cursor-not-allowed ${className}`}
      />
      {validationError ? (
        <span className="mt-0.5 block text-[10px] text-rose-600 font-medium">
          {validationError}
        </span>
      ) : null}
    </div>
  );
}
