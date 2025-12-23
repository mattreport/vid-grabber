// Content script to detect MP4 videos on the page

(function() {
  'use strict';

  // Cache for scan results
  let cachedVideos = null;
  let cacheValid = false;
  let lastScanTime = 0;
  const MIN_SCAN_INTERVAL = 2000; // Minimum 2 seconds between scans
  let debounceTimeout = null; // Moved from window to closure scope

  // Extract MP4 URLs from various sources
  function findMP4Videos(forceRefresh = false) {
    // Return cached results if valid and not forcing refresh
    if (!forceRefresh && cacheValid && cachedVideos) {
      return cachedVideos;
    }
    const videos = [];
    const seenUrls = new Set();

    // 1. Check <video> elements with src attribute
    document.querySelectorAll('video[src]').forEach(video => {
      const src = video.src;
      if (isMP4Url(src) && !seenUrls.has(src)) {
        seenUrls.add(src);
        videos.push({
          url: src,
          duration: video.duration || null,
          width: video.videoWidth || null,
          height: video.videoHeight || null,
          type: 'video-element'
        });
      }
    });

    // 2. Check <source> elements inside <video>
    document.querySelectorAll('video source[src]').forEach(source => {
      const src = source.src;
      const type = source.type || '';
      if ((isMP4Url(src) || type.includes('mp4')) && !seenUrls.has(src)) {
        seenUrls.add(src);
        const video = source.closest('video');
        videos.push({
          url: src,
          duration: video?.duration || null,
          width: video?.videoWidth || null,
          height: video?.videoHeight || null,
          type: 'source-element'
        });
      }
    });

    // 3. Check for MP4 links in <a> tags
    document.querySelectorAll('a[href]').forEach(link => {
      const href = link.href;
      if (isMP4Url(href) && !seenUrls.has(href)) {
        seenUrls.add(href);
        videos.push({
          url: href,
          duration: null,
          width: null,
          height: null,
          type: 'link'
        });
      }
    });

    // 4. Check for data attributes that might contain MP4 URLs
    document.querySelectorAll('[data-src], [data-video-src], [data-mp4], [data-video]').forEach(el => {
      const attrs = ['data-src', 'data-video-src', 'data-mp4', 'data-video'];
      attrs.forEach(attr => {
        const value = el.getAttribute(attr);
        if (value && isMP4Url(value) && !seenUrls.has(value)) {
          const absoluteUrl = new URL(value, window.location.href).href;
          if (!seenUrls.has(absoluteUrl)) {
            seenUrls.add(absoluteUrl);
            videos.push({
              url: absoluteUrl,
              duration: null,
              width: null,
              height: null,
              type: 'data-attribute'
            });
          }
        }
      });
    });

    // 5. Search for MP4 URLs in inline scripts (common pattern)
    document.querySelectorAll('script:not([src])').forEach(script => {
      const content = script.textContent;
      const mp4Regex = /["'](https?:\/\/[^"']+\.mp4[^"']*?)["']/gi;
      let match;
      while ((match = mp4Regex.exec(content)) !== null) {
        const url = match[1];
        if (!seenUrls.has(url)) {
          seenUrls.add(url);
          videos.push({
            url: url,
            duration: null,
            width: null,
            height: null,
            type: 'inline-script'
          });
        }
      }
    });

    // 6. Check object/embed elements
    document.querySelectorAll('object[data], embed[src]').forEach(el => {
      const src = el.data || el.src;
      if (src && isMP4Url(src) && !seenUrls.has(src)) {
        seenUrls.add(src);
        videos.push({
          url: src,
          duration: null,
          width: null,
          height: null,
          type: 'embed'
        });
      }
    });

    // Update cache
    cachedVideos = videos;
    cacheValid = true;
    return videos;
  }

  // Invalidate cache when DOM changes
  function invalidateCache() {
    cacheValid = false;
  }

  // Check if URL looks like an MP4 file
  function isMP4Url(url) {
    if (!url || typeof url !== 'string') return false;

    try {
      const urlObj = new URL(url, window.location.href);
      const pathname = urlObj.pathname.toLowerCase();

      // Direct .mp4 extension
      if (pathname.endsWith('.mp4')) return true;

      // Check for mp4 in query params (common for CDNs)
      const searchParams = urlObj.search.toLowerCase();
      if (searchParams.includes('format=mp4') || searchParams.includes('type=mp4')) {
        return true;
      }

      // Check for video CDN patterns
      if (pathname.includes('/mp4/') || pathname.includes('/video/')) {
        // Additional check for video-like paths
        if (pathname.match(/\.(mp4|video)/i)) return true;
      }

      return false;
    } catch (e) {
      return false;
    }
  }

  // Filter to keep only videos that look like "full" videos (not tiny clips/ads)
  function filterFullVideos(videos) {
    return videos.filter(video => {
      // If we have duration info, filter out very short clips (< 10 seconds)
      if (video.duration !== null && video.duration < 10) {
        return false;
      }

      // Filter out common ad/tracking patterns in URL
      const urlLower = video.url.toLowerCase();
      const adPatterns = [
        'doubleclick', 'googlesyndication', 'advertising',
        'ads.', 'ad-', 'tracker', 'pixel', 'beacon',
        'analytics', 'preroll', 'postroll'
      ];

      if (adPatterns.some(pattern => urlLower.includes(pattern))) {
        return false;
      }

      return true;
    });
  }

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getVideos') {
      // Force refresh when popup requests videos
      const allVideos = findMP4Videos(true);
      const filteredVideos = filterFullVideos(allVideos);

      // Add page info (only title, not full URL for privacy)
      const response = {
        videos: filteredVideos,
        pageTitle: document.title
      };

      sendResponse(response);
    }

    // Return true to indicate async response
    return true;
  });

  // Notify background script of video count (with throttling)
  function notifyBackground() {
    const now = Date.now();
    // Throttle: skip if called too recently
    if (now - lastScanTime < MIN_SCAN_INTERVAL) {
      return;
    }
    lastScanTime = now;

    const videos = filterFullVideos(findMP4Videos());
    chrome.runtime.sendMessage({
      action: 'videosFound',
      count: videos.length
    }).catch(() => {
      // Ignore errors if background isn't ready
    });
  }

  // Run initial scan after page loads
  if (document.readyState === 'complete') {
    notifyBackground();
  } else {
    window.addEventListener('load', notifyBackground);
  }

  // Watch for dynamic content changes (optimized)
  const observer = new MutationObserver((mutations) => {
    let hasNewVideo = false;
    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
        for (const node of mutation.addedNodes) {
          if (node.nodeName === 'VIDEO' ||
              (node.querySelectorAll && node.querySelectorAll('video, source').length > 0)) {
            hasNewVideo = true;
            break;
          }
        }
      }
      if (hasNewVideo) break;
    }

    if (hasNewVideo) {
      // Invalidate cache when new video elements detected
      invalidateCache();
      // Debounce the notification (using closure-scoped variable)
      clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(notifyBackground, 500);
    }
  });

  // Only observe if document.body exists
  if (document.body) {
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }
})();
