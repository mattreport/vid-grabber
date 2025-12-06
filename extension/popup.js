// Popup script for MP4 Video Grabber

document.addEventListener('DOMContentLoaded', () => {
  const statusEl = document.getElementById('status');
  const videoListEl = document.getElementById('video-list');
  const noVideosEl = document.getElementById('no-videos');
  const refreshBtn = document.getElementById('refresh-btn');

  let currentPageTitle = '';

  // Initialize
  scanForVideos();

  // Refresh button
  refreshBtn.addEventListener('click', () => {
    refreshBtn.style.transform = 'rotate(360deg)';
    setTimeout(() => {
      refreshBtn.style.transform = '';
    }, 300);
    scanForVideos();
  });

  // Scan the current tab for videos
  async function scanForVideos() {
    showStatus();
    videoListEl.innerHTML = '';
    noVideosEl.classList.add('hidden');

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab?.id) {
        showNoVideos();
        return;
      }

      // Send message to content script
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'getVideos' });

      if (response && response.videos && response.videos.length > 0) {
        currentPageTitle = response.pageTitle || 'video';
        hideStatus();
        await displayVideos(response.videos);
      } else {
        showNoVideos();
      }
    } catch (error) {
      console.error('Error scanning for videos:', error);
      showNoVideos();
    }
  }

  // Display the list of found videos
  async function displayVideos(videos) {
    for (const video of videos) {
      const videoItem = await createVideoItem(video);
      videoListEl.appendChild(videoItem);
    }
  }

  // Create a video item element with thumbnail
  async function createVideoItem(video) {
    const item = document.createElement('div');
    item.className = 'video-item';

    const thumbnailContainer = document.createElement('div');
    thumbnailContainer.className = 'thumbnail-container';

    // Try to generate thumbnail
    const thumbnailResult = await generateThumbnail(video.url);

    if (thumbnailResult.success) {
      const img = document.createElement('img');
      img.className = 'thumbnail';
      img.src = thumbnailResult.thumbnail;
      img.alt = 'Video thumbnail';
      thumbnailContainer.appendChild(img);

      // Add duration badge if available
      if (thumbnailResult.duration) {
        const durationBadge = document.createElement('span');
        durationBadge.className = 'duration-badge';
        durationBadge.textContent = formatDuration(thumbnailResult.duration);
        thumbnailContainer.appendChild(durationBadge);
      }
    } else {
      // Placeholder if thumbnail generation fails
      const placeholder = document.createElement('div');
      placeholder.className = 'thumbnail-placeholder';
      placeholder.innerHTML = `
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
      `;
      thumbnailContainer.appendChild(placeholder);
    }

    item.appendChild(thumbnailContainer);

    // Video info section
    const infoDiv = document.createElement('div');
    infoDiv.className = 'video-info';

    const title = document.createElement('div');
    title.className = 'video-title';
    title.textContent = extractFilename(video.url);
    title.title = video.url;
    infoDiv.appendChild(title);

    const meta = document.createElement('div');
    meta.className = 'video-meta';

    // Resolution if available
    if (thumbnailResult.width && thumbnailResult.height) {
      const resolution = document.createElement('span');
      resolution.textContent = `${thumbnailResult.width}x${thumbnailResult.height}`;
      meta.appendChild(resolution);
    }

    // Source type
    const source = document.createElement('span');
    source.textContent = formatSourceType(video.type);
    meta.appendChild(source);

    infoDiv.appendChild(meta);

    // Download button
    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'download-btn';
    downloadBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
      Download MP4
    `;

    downloadBtn.addEventListener('click', () => {
      downloadVideo(video.url, downloadBtn);
    });

    infoDiv.appendChild(downloadBtn);
    item.appendChild(infoDiv);

    return item;
  }

  // Generate thumbnail at 10% into the video
  function generateThumbnail(videoUrl) {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.muted = true;
      video.preload = 'metadata';

      let resolved = false;

      const cleanup = () => {
        video.removeEventListener('loadedmetadata', onMetadata);
        video.removeEventListener('seeked', onSeeked);
        video.removeEventListener('error', onError);
        video.src = '';
        video.load();
      };

      const onMetadata = () => {
        if (resolved) return;

        // Seek to 10% of the video
        const seekTime = video.duration * 0.1;
        video.currentTime = seekTime;
      };

      const onSeeked = () => {
        if (resolved) return;
        resolved = true;

        try {
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth || 320;
          canvas.height = video.videoHeight || 180;

          const ctx = canvas.getContext('2d');
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

          const thumbnail = canvas.toDataURL('image/jpeg', 0.8);

          cleanup();
          resolve({
            success: true,
            thumbnail: thumbnail,
            duration: video.duration,
            width: video.videoWidth,
            height: video.videoHeight
          });
        } catch (e) {
          cleanup();
          resolve({ success: false });
        }
      };

      const onError = () => {
        if (resolved) return;
        resolved = true;
        cleanup();
        resolve({ success: false });
      };

      video.addEventListener('loadedmetadata', onMetadata);
      video.addEventListener('seeked', onSeeked);
      video.addEventListener('error', onError);

      // Timeout after 10 seconds
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve({ success: false });
        }
      }, 10000);

      video.src = videoUrl;
    });
  }

  // Download the video
  async function downloadVideo(url, button) {
    const originalContent = button.innerHTML;
    button.classList.add('downloading');
    button.innerHTML = `
      <span class="spinner"></span>
      Downloading...
    `;
    button.disabled = true;

    const filename = generateFilename(currentPageTitle);

    try {
      await chrome.runtime.sendMessage({
        action: 'download',
        url: url,
        filename: filename
      });

      button.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        Downloaded!
      `;

      setTimeout(() => {
        button.innerHTML = originalContent;
        button.classList.remove('downloading');
        button.disabled = false;
      }, 2000);

    } catch (error) {
      console.error('Download failed:', error);
      button.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
        Failed
      `;

      setTimeout(() => {
        button.innerHTML = originalContent;
        button.classList.remove('downloading');
        button.disabled = false;
      }, 2000);
    }
  }

  // Generate a filename from page title and timestamp
  function generateFilename(pageTitle) {
    // Clean the page title
    let cleanTitle = pageTitle
      .replace(/[<>:"/\\|?*]/g, '') // Remove invalid chars
      .replace(/\s+/g, '_')         // Replace spaces with underscores
      .substring(0, 50);            // Limit length

    if (!cleanTitle) {
      cleanTitle = 'video';
    }

    // Add timestamp
    const now = new Date();
    const timestamp = now.toISOString()
      .replace(/[-:]/g, '')
      .replace('T', '_')
      .substring(0, 15);

    return `${cleanTitle}_${timestamp}.mp4`;
  }

  // Extract filename from URL
  function extractFilename(url) {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const filename = pathname.split('/').pop();

      if (filename && filename.length > 0) {
        // Decode and clean up
        return decodeURIComponent(filename).substring(0, 60);
      }
    } catch (e) {}

    return 'video.mp4';
  }

  // Format duration in MM:SS or HH:MM:SS
  function formatDuration(seconds) {
    if (!seconds || isNaN(seconds)) return '';

    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  // Format source type for display
  function formatSourceType(type) {
    const types = {
      'video-element': 'Video Tag',
      'source-element': 'Source Tag',
      'link': 'Link',
      'data-attribute': 'Data Attr',
      'inline-script': 'Script',
      'embed': 'Embed'
    };
    return types[type] || type;
  }

  // UI helpers
  function showStatus() {
    statusEl.classList.remove('hidden');
  }

  function hideStatus() {
    statusEl.classList.add('hidden');
  }

  function showNoVideos() {
    statusEl.classList.add('hidden');
    noVideosEl.classList.remove('hidden');
  }
});
