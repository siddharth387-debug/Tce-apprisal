import React, { useState, useRef, useEffect } from 'react';

/**
 * Validates and parses a URL scheme, hostname, and Google Drive/Docs identifiers.
 * Accepts both http and https.
 * @param {string} url
 * @returns {{ valid: boolean, isGoogle: boolean, fileId: string | null, resourceKey: string | null, error?: string }}
 */
export function parseLink(url) {
  if (typeof url !== 'string') {
    return { valid: false, isGoogle: false, fileId: null, resourceKey: null, error: 'Enter a valid link' };
  }
  const trimmed = url.trim();
  if (!trimmed || trimmed.length > 2048 || /\s/.test(trimmed)) {
    return { valid: false, isGoogle: false, fileId: null, resourceKey: null, error: 'Enter a valid link' };
  }

  // Must start with http:// or https:// (case insensitive)
  if (!/^https?:\/\//i.test(trimmed)) {
    return { valid: false, isGoogle: false, fileId: null, resourceKey: null, error: 'Enter a valid link' };
  }

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, isGoogle: false, fileId: null, resourceKey: null, error: 'Enter a valid link' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { valid: false, isGoogle: false, fileId: null, resourceKey: null, error: 'Enter a valid link' };
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!hostname || !hostname.includes('.') || hostname.endsWith('.') || hostname.startsWith('.')) {
    return { valid: false, isGoogle: false, fileId: null, resourceKey: null, error: 'Enter a valid link' };
  }

  const parts = hostname.split('.');
  if (parts.some((p) => !p) || parts[parts.length - 1].length < 2) {
    return { valid: false, isGoogle: false, fileId: null, resourceKey: null, error: 'Enter a valid link' };
  }

  const isGoogle = hostname === 'drive.google.com' || hostname === 'docs.google.com';
  if (isGoogle) {
    let fileId = null;
    const resourceKey = parsed.searchParams.get('resourcekey') || null;

    // Pattern 1: query param id=<id> (e.g. /open?id=<id>)
    const idParam = parsed.searchParams.get('id');
    if (idParam && /^[a-zA-Z0-9_-]+$/.test(idParam)) {
      fileId = idParam;
    }

    // Pattern 2: /file/d/<id>
    if (!fileId) {
      const fileMatch = parsed.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
      if (fileMatch) {
        fileId = fileMatch[1];
      }
    }

    // Pattern 3: /drive/folders/<id> or /drive/u/<n>/folders/<id> or /folders/<id>
    if (!fileId) {
      const folderMatch = parsed.pathname.match(/\/(?:drive\/(?:u\/\d+\/)?)?folders\/([a-zA-Z0-9_-]+)/);
      if (folderMatch) {
        fileId = folderMatch[1];
      }
    }

    // Pattern 4: /document|spreadsheets|presentation|forms/d/<id> (also forms/d/e/<id>)
    if (!fileId) {
      const docMatch = parsed.pathname.match(/\/(?:document|spreadsheets|presentation|forms)\/d\/(?:e\/)?([a-zA-Z0-9_-]+)/);
      if (docMatch) {
        fileId = docMatch[1];
      }
    }

    if (!fileId) {
      return {
        valid: false,
        isGoogle: true,
        fileId: null,
        resourceKey: null,
        error: 'Enter the full link of your file or folder',
      };
    }

    return {
      valid: true,
      isGoogle: true,
      fileId,
      resourceKey,
    };
  }

  // Non-Google valid link
  return {
    valid: true,
    isGoogle: false,
    fileId: null,
    resourceKey: null,
  };
}

/**
 * Validates interactive typing according to prefix rules:
 * - Must start with http:// or https:// (case insensitive, stored in lowercase prefix)
 * - Shorter values must be a prefix of http:// or https://
 * - Deletions always allowed
 * - Spaces rejected
 * @param {string} newVal
 * @param {string} prevVal
 * @returns {{ accepted: boolean, value?: string }}
 */
export function sanitizeLinkInput(newVal, prevVal = '') {
  if (newVal === prevVal) return { accepted: true, value: newVal };
  // Rule 3: Deleting is always allowed
  if (newVal.length < prevVal.length) {
    return { accepted: true, value: newVal };
  }

  // Spaces are never accepted
  if (/\s/.test(newVal)) {
    return { accepted: false };
  }

  const p1 = 'http://';
  const p2 = 'https://';
  const lower = newVal.toLowerCase();

  // Prefix matching while length <= 7
  if (newVal.length <= 7) {
    if (p1.startsWith(lower) || p2.startsWith(lower)) {
      return { accepted: true, value: lower };
    }
    return { accepted: false };
  }

  // Exactly https://
  if (newVal.length === 8 && p2 === lower) {
    return { accepted: true, value: lower };
  }

  // Completed prefix
  if (lower.startsWith(p2)) {
    return { accepted: true, value: 'https://' + newVal.slice(8) };
  }
  if (lower.startsWith(p1)) {
    return { accepted: true, value: 'http://' + newVal.slice(7) };
  }

  return { accepted: false };
}

/**
 * Shared Link Input Component for all appraisal sections.
 */
export default function AppLinkInput({
  value = '',
  onChange,
  onFocus,
  onBlur,
  disabled = false,
  placeholder = 'Enter Supporting Document Link',
  hasError = false,
  errorText = '',
  className = '',
}) {
  const [hintText, setHintText] = useState('');
  const [blurError, setBlurError] = useState(null);
  const hintTimerRef = useRef(null);

  const triggerHint = () => {
    if (hintTimerRef.current) {
      clearTimeout(hintTimerRef.current);
    }
    setHintText('Link must start with http:// or https://');
    hintTimerRef.current = setTimeout(() => {
      setHintText('');
      hintTimerRef.current = null;
    }, 2000);
  };

  useEffect(() => {
    return () => {
      if (hintTimerRef.current) {
        clearTimeout(hintTimerRef.current);
      }
    };
  }, []);

  const handleChange = (e) => {
    const rawVal = e.target.value;
    const result = sanitizeLinkInput(rawVal, value || '');
    if (result.accepted) {
      if (blurError) {
        // Clear blur error if value is now valid or empty
        if (!result.value || parseLink(result.value).valid) {
          setBlurError(null);
        }
      }
      if (onChange) {
        onChange(result.value);
      }
    } else {
      triggerHint();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = (e.clipboardData.getData('text') || '').trim();
    if (/^https?:\/\//i.test(pasted) && !/\s/.test(pasted)) {
      const normalized = pasted.replace(/^https?:\/\//i, (m) => m.toLowerCase());
      if (blurError) {
        if (!normalized || parseLink(normalized).valid) {
          setBlurError(null);
        }
      }
      if (onChange) {
        onChange(normalized);
      }
    } else {
      triggerHint();
    }
  };

  const handleBlur = (e) => {
    const currentVal = (value || '').trim();
    if (currentVal) {
      const parsed = parseLink(currentVal);
      if (!parsed.valid) {
        setBlurError(parsed.error || 'Enter a valid link');
      } else {
        setBlurError(null);
      }
    } else {
      setBlurError(null);
    }
    if (onBlur) {
      onBlur(e);
    }
  };

  const displayError = hintText || blurError || errorText;
  const isErr = Boolean(displayError || hasError);

  const baseInputClass = className || `w-full rounded-md border ${
    isErr ? 'border-red-400' : 'border-slate-200'
  } bg-white h-[38px] sm:h-7 py-1 px-2.5 text-xs text-slate-800 outline-none transition focus:border-[#4A1519] focus:ring-2 focus:ring-[#4A1519]/20 placeholder:text-[11px] placeholder:text-gray-400 disabled:bg-slate-100 disabled:cursor-not-allowed`;

  return (
    <div className="w-full">
      <input
        type="text"
        value={value ?? ''}
        onChange={handleChange}
        onPaste={handlePaste}
        onFocus={onFocus}
        onBlur={handleBlur}
        disabled={disabled}
        placeholder={placeholder}
        className={baseInputClass}
      />
      {displayError ? (
        <span className="mt-1 block text-[11px] sm:text-[10px] text-rose-600 font-medium break-words leading-tight">
          {displayError}
        </span>
      ) : null}
    </div>
  );
}
