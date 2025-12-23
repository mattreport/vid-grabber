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

// Validate URL before download
function isValidVideoUrl(url) {
  try {
    const urlObj = new URL(url);
    // Only allow http/https protocols
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      return false;
    }
    // Check for video-like URL patterns
    const pathname = urlObj.pathname.toLowerCase();
    if (pathname.endsWith('.mp4')) return true;
    if (pathname.includes('/mp4/') || pathname.includes('/video/')) return true;
    // Check query params for video indicators
    const search = urlObj.search.toLowerCase();
    if (search.includes('format=mp4') || search.includes('type=mp4')) return true;
    return false;
  } catch {
    return false;
  }
}

// Sanitize filename to prevent path traversal
function sanitizeFilename(filename) {
  if (!filename || typeof filename !== 'string') {
    return 'video.mp4';
  }
  return filename
    .replace(/\.\./g, '')           // Prevent path traversal
    .replace(/\x00/g, '')           // Remove null bytes
    .replace(/[<>:"/\\|?*]/g, '')   // Remove invalid chars
    .replace(/^\.+/, '')            // Remove leading dots
    .substring(0, 100) || 'video.mp4';
}

// Handle download requests
async function handleDownload(url, filename) {
  // Validate URL before downloading
  if (!isValidVideoUrl(url)) {
    throw new Error('Invalid or unsafe URL');
  }

  // Sanitize filename
  const safeFilename = sanitizeFilename(filename);

  try {
    await chrome.downloads.download({
      url: url,
      filename: safeFilename,
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
