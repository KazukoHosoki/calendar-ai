document.getElementById('run-analysis').addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab?.id) return;
    chrome.tabs.sendMessage(tab.id, { action: 'runAnalysis' }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn('Open a Google Calendar tab first.');
      }
    });
  });
});
