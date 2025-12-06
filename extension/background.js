// Background service worker for MP4 Video Grabber

// Store video counts per tab for badge updates
const tabVideoCounts = new Map();

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'videosFound' && sender.tab) {
    const tabId = sender.tab.id;
    const count = message.count;

    tabVideoCounts.set(tabId, count);
    updateBadge(tabId, count);
  }

  if (message.action === 'download') {
    handleDownload(message.url, message.filename)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Async response
  }
});

// Update the extension badge with video count
function updateBadge(tabId, count) {
  if (count > 0) {
    chrome.action.setBadgeText({
      text: count.toString(),
      tabId: tabId
    });
    chrome.action.setBadgeBackgroundColor({
      color: '#7b68ee',
      tabId: tabId
    });
  } else {
    chrome.action.setBadgeText({
      text: '',
      tabId: tabId
    });
  }
}

// Handle download requests
async function handleDownload(url, filename) {
  try {
    await chrome.downloads.download({
      url: url,
      filename: filename,
      saveAs: true
    });
  } catch (error) {
    console.error('Download failed:', error);
    throw error;
  }
}

// Clean up when tabs are closed
chrome.tabs.onRemoved.addListener((tabId) => {
  tabVideoCounts.delete(tabId);
});

// Reset badge when tab is updated (navigates to new page)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading') {
    tabVideoCounts.delete(tabId);
    chrome.action.setBadgeText({
      text: '',
      tabId: tabId
    });
  }
});
