// Background service worker (Manifest v3)

const STORAGE_KEY = 'calendar_ai_rag_memory';

chrome.runtime.onInstalled.addListener(() => {
  console.log('Google Calendar AI extension installed.');
});

// Receive extracted meeting data from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'meetingData') {
    const { data } = message;
    console.log('Calendar AI (background): received meeting data', data);
    sendResponse({ status: 'received' });
    return true;
  }

  if (message.action === 'storeRagRecord') {
    const { record } = message;
    chrome.storage.local.get(STORAGE_KEY, (result) => {
      const list = Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
      list.push(record);
      chrome.storage.local.set({ [STORAGE_KEY]: list }, () => {
        if (chrome.runtime.lastError) {
          console.warn('Calendar AI (background): storage error', chrome.runtime.lastError);
          sendResponse({ status: 'error', error: chrome.runtime.lastError.message });
        } else {
          console.log('Calendar AI (background): stored RAG record, total count =', list.length);
          sendResponse({ status: 'stored', count: list.length });
        }
      });
    });
    return true; // keep channel open for async sendResponse
  }

  return true;
});
