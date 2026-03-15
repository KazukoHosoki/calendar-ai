// Content script: runs only on Google Calendar (calendar.google.com)
// Extracts visible event data from the currently opened event detail popup.

const CALENDAR_HOST = 'calendar.google.com';
const LOG_PREFIX = 'Calendar AI:';

function isCalendarPage() {
  try {
    return new URL(window.location.href).hostname === CALENDAR_HOST;
  } catch {
    return false;
  }
}

/** Safe text from element: value for inputs, otherwise textContent. Returns null if no element or empty. */
function getText(el) {
  if (!el) return null;
  try {
    const v = el.value;
    const t = (v !== undefined && v !== null ? String(v) : (el.textContent || '')).trim();
    return t === '' ? null : t;
  } catch {
    return null;
  }
}

/** Get dialog root. Tries multiple known containers for the event detail popup. */
function getEventDialog() {
  const selectors = [
    '[role="dialog"]',           // Primary: ARIA dialog role (stable)
    '[role="main"]',             // Fallback: some views use main for side panel
    '[data-view="event"]',       // If Google adds data-view
    'div[aria-modal="true"]'     // Modal overlay container
  ];
  for (const sel of selectors) {
    try {
      const el = document.querySelector(sel);
      if (el && el.offsetParent !== null) return el; // visible
    } catch (_) {}
  }
  return null;
}

/** Try multiple ways to get title. Returns null if missing. */
function extractTitle(dialog) {
  if (!dialog) return null;
  const titleSelectors = [
    () => dialog.querySelector('[placeholder="Add title"]'),                    // Main title input
    () => dialog.querySelector('[data-placeholder="Add title"]'),               // React/data placeholder
    () => dialog.querySelector('input[placeholder*="title"], textarea[placeholder*="title"]'),
    () => dialog.querySelector('[role="dialog"] h1, [role="dialog"] h2'),       // Heading in dialog
    () => dialog.querySelector('h1, h2'),                                       // Any heading in container
    () => dialog.querySelector('[role="heading"]'),                             // ARIA heading
    () => dialog.querySelector('.ui-sch-inline-edit-input')                     // Legacy inline-edit (unstable class)
  ];
  for (const fn of titleSelectors) {
    try {
      const el = fn();
      const text = getText(el);
      if (text) return text;
    } catch (_) {}
  }
  return null;
}

/** Extract visible date/time text. Returns null if missing. */
function extractTime(dialog) {
  if (!dialog) return null;
  const timeSelectors = [
    () => dialog.querySelector('[aria-label*="Date"], [aria-label*="Time"], [aria-label*="date"], [aria-label*="time"]'),
    () => dialog.querySelector('[data-start-time]')?.closest('[aria-label], [title]'),
    () => Array.from(dialog.querySelectorAll('[role="button"], span, div')).find(el => {
      const t = (el.getAttribute('aria-label') || el.textContent || '').trim();
      return t && /\d{1,2}:\d{2}/.test(t) && /AM|PM|am|pm|\d/.test(t);
    })
  ];
  for (const fn of timeSelectors) {
    try {
      const el = fn();
      if (el) {
        const text = (el.getAttribute('aria-label') || el.textContent || '').trim();
        if (text) return text;
      }
    } catch (_) {}
  }
  const dialogText = (dialog.innerText || dialog.textContent || '');
  const timePatterns = [
    /\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?\s*[–\-–]\s*\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?/,
    /(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*,?\s*[^\n]+?\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?/,
    /\d{1,2}\/\d{1,2}\/\d{2,4}\s+,?\s*\d{1,2}:\d{2}/
  ];
  for (const re of timePatterns) {
    const m = dialogText.match(re);
    if (m && m[0]) return m[0].trim();
  }
  return null;
}

/** Extract participants list and/or organizer text. Returns { participants: string[]|null, organizer: string|null }. */
function extractParticipantsAndOrganizer(dialog) {
  const out = { participants: null, organizer: null };
  if (!dialog) return out;

  const emails = new Set();
  try {
    dialog.querySelectorAll('[data-email]').forEach(el => {
      const e = (el.getAttribute('data-email') || '').trim();
      if (e && e.includes('@')) emails.add(e);
    });
  } catch (_) {}

  const dialogText = dialog.innerText || '';
  const emailRe = /[\w.-]+@[\w.-]+\.\w+/g;
  let match;
  while ((match = emailRe.exec(dialogText)) !== null) emails.add(match[0]);

  if (emails.size > 0) out.participants = Array.from(emails);

  const organizerSelectors = [
    () => dialog.querySelector('[aria-label*="rganizer"], [aria-label*="rganiser"]'),
    () => Array.from(dialog.querySelectorAll('span, div')).find(el => {
      const t = (el.textContent || '').trim();
      return /^Organizer(s)?\s*$/i.test(t) || /^Organiser(s)?\s*$/i.test(t);
    })?.nextElementSibling || null,
    () => {
      const i = dialogText.search(/\bOrganizer(s)?\s*:?\s*/i);
      if (i === -1) return null;
      const slice = dialogText.slice(i, i + 200);
      const emailMatch = slice.match(/[\w.-]+@[\w.-]+\.\w+/);
      return emailMatch ? `Organizer: ${emailMatch[0]}` : slice.split('\n')[0].trim() || null;
    }
  ];
  for (const fn of organizerSelectors) {
    try {
      const el = fn();
      if (el && el.nodeType === 1) {
        const text = getText(el) || (el.getAttribute('aria-label') || '').trim();
        if (text) { out.organizer = text; break; }
      } else if (typeof el === 'string' && el) {
        out.organizer = el;
        break;
      }
    } catch (_) {}
  }
  return out;
}

/** Extract visible description text. Returns null if missing. */
function extractDescription(dialog) {
  if (!dialog) return null;
  const descSelectors = [
    () => dialog.querySelector('[placeholder="Add description"]'),
    () => dialog.querySelector('[data-placeholder="Add description"]'),
    () => dialog.querySelector('textarea[placeholder*="description"], input[placeholder*="description"]'),
    () => dialog.querySelector('[aria-label*="escription"]'),
    () => {
      const label = Array.from(dialog.querySelectorAll('span, div')).find(el =>
        /^Description\s*$/i.test((el.textContent || '').trim())
      );
      return label?.nextElementSibling || label?.parentElement;
    }
  ];
  for (const fn of descSelectors) {
    try {
      const el = fn();
      const text = getText(el);
      if (text) return text;
    } catch (_) {}
  }
  return null;
}

/**
 * Extract all visible event data from the currently opened event detail popup.
 * Missing fields are null (participants is null or array).
 */
function extractMeetingData() {
  const dialog = getEventDialog();
  const title = extractTitle(dialog);
  const time = extractTime(dialog);
  const { participants, organizer } = extractParticipantsAndOrganizer(dialog);
  const description = extractDescription(dialog);

  return {
    title: title ?? null,
    time: time ?? null,
    participants: participants ?? null,
    organizer: organizer ?? null,
    description: description ?? null
  };
}

/** Log each extracted field clearly; use null for missing. */
function logExtractedData(data) {
  console.log(`${LOG_PREFIX} ---- Extracted event data ----`);
  console.log(`${LOG_PREFIX} title →`, data.title);
  console.log(`${LOG_PREFIX} time →`, data.time);
  console.log(`${LOG_PREFIX} participants →`, data.participants);
  console.log(`${LOG_PREFIX} organizer →`, data.organizer);
  console.log(`${LOG_PREFIX} description →`, data.description);
  console.log(`${LOG_PREFIX} -----------------------------`);
}

/** Create a URL-safe slug from title (lowercase, alphanumeric + hyphens). */
function titleToSlug(title) {
  if (!title || typeof title !== 'string') return 'untitled';
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'untitled';
}

/**
 * Build structured JSON object for RAG / LoRA dataset.
 * meeting_id = timestamp + title slug for uniqueness and traceability.
 */
function buildRagRecord(extracted, rawTextSnapshot) {
  const now = new Date();
  const ts = now.getTime();
  const slug = titleToSlug(extracted.title);
  const meeting_id = `${ts}_${slug}`;

  return {
    meeting_id,
    captured_at: now.toISOString(),
    source: 'google_calendar',
    title: extracted.title ?? null,
    time_text: extracted.time ?? null,
    participants: Array.isArray(extracted.participants) ? extracted.participants : [],
    organizer: extracted.organizer ?? null,
    description: extracted.description ?? null,
    raw_text_snapshot: rawTextSnapshot ?? null
  };
}

/** Log the final RAG JSON object clearly in console. */
function logRagRecord(record) {
  console.log(`${LOG_PREFIX} ---- RAG record (JSON) ----`);
  console.log(JSON.stringify(record, null, 2));
  console.log(`${LOG_PREFIX} ---------------------------`);
}

function onRunAnalysis() {
  if (!isCalendarPage()) {
    console.warn(`${LOG_PREFIX} Not on Google Calendar.`);
    return null;
  }

  const dialog = getEventDialog();
  const meetingData = extractMeetingData();
  logExtractedData(meetingData);

  const rawTextSnapshot = dialog ? (dialog.innerText || dialog.textContent || null) : null;
  const ragRecord = buildRagRecord(meetingData, rawTextSnapshot);
  logRagRecord(ragRecord);

  chrome.runtime.sendMessage(
    { action: 'meetingData', data: meetingData },
    () => {
      if (chrome.runtime.lastError) {
        console.warn(`${LOG_PREFIX} Background error`, chrome.runtime.lastError);
      }
    }
  );

  chrome.runtime.sendMessage(
    { action: 'storeRagRecord', record: ragRecord },
    () => {
      if (chrome.runtime.lastError) {
        console.warn(`${LOG_PREFIX} Storage error`, chrome.runtime.lastError);
      }
    }
  );

  return meetingData;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'runAnalysis') {
    const result = onRunAnalysis();
    sendResponse({ ok: true, data: result });
  }
  return true;
});
