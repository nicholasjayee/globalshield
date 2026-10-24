// Captures video stream state on MovieBox/mzfi.me and recovers playback when region-lock overlays trigger.

(() => {
  'use strict';

  window.__SS_MAIN = window.__SS_MAIN || {};
  const { Config, EventBridge } = window.__SS_MAIN;

  const FALLBACK_ID = 'ss-video-fallback';
  let lastVideoState = null;
  let lastLoggedSrc = null;

  const tryCaptureFromVideo = (video) => {
    if (!video || video.tagName !== 'VIDEO') return;

    const attrSrc = video.getAttribute && video.getAttribute('src');
    const propSrc = video.src;
    let src = attrSrc || propSrc;
    if (!src) {
      const source = video.querySelector && video.querySelector('source[src]');
      if (source) src = source.getAttribute('src');
    }
    if (!src || src.startsWith('blob:')) return;

    try {
      src = new URL(src, location.href).href;
    } catch (_) {}

    lastVideoState = {
      src,
      currentTime: video.currentTime || 0,
      volume: typeof video.volume === 'number' ? video.volume : 1,
      muted: !!video.muted,
      playbackRate: video.playbackRate || 1,
      crossorigin: video.getAttribute('crossorigin') || null,
      preload: video.getAttribute('preload') || 'metadata',
      poster: video.getAttribute('poster') || null
    };

    if (src !== lastLoggedSrc) {
      lastLoggedSrc = src;
      console.log('[SentinelShield] Captured streaming video source:', src.slice(0, 100));
    }
  };

  const scanForVideo = (root) => {
    const scope = root && root.nodeType === 1 ? root : document;
    if (scope.tagName === 'VIDEO') tryCaptureFromVideo(scope);
    if (scope.querySelectorAll) scope.querySelectorAll('video').forEach(tryCaptureFromVideo);
  };

  const mountFallbackVideo = () => {
    if (document.getElementById(FALLBACK_ID)) return;
    if (!lastVideoState || !lastVideoState.src) return;

    const cover = document.querySelector('.video-cover.pc-cover-img');
    if (!cover || !cover.querySelector('.pc-playerr')) return;

    const container =
      document.querySelector('.pc-video-inner') ||
      document.querySelector('.pc-video');
    if (!container) return;

    console.warn('[SentinelShield] Region-lock cover detected — mounting recovery fallback player');
    EventBridge.reportOverlayBlocked('region-lock-fallback');
    cover.style.setProperty('display', 'none', 'important');

    const wrapper = document.createElement('div');
    wrapper.id = FALLBACK_ID;
    wrapper.className = 'mb-video-fallback-compat';
    wrapper.style.cssText = 'position:relative;width:100%;height:100%;background:#000;z-index:9998;';

    const video = document.createElement('video');
    video.controls = true;
    video.autoplay = true;
    video.playsInline = true;
    video.preload = lastVideoState.preload;
    if (lastVideoState.crossorigin) video.setAttribute('crossorigin', lastVideoState.crossorigin);
    video.src = lastVideoState.src;
    video.volume = lastVideoState.volume;
    video.muted = lastVideoState.muted;
    video.playbackRate = lastVideoState.playbackRate;
    if (lastVideoState.poster) video.poster = lastVideoState.poster;
    video.style.cssText = 'width:100%;height:100%;display:block;background:#000;';

    video.addEventListener('loadedmetadata', () => {
      try {
        video.currentTime = lastVideoState.currentTime;
      } catch (_) {}
      video.play().catch(() => {});
    }, { once: true });
    video.addEventListener('error', () => {
      console.warn('[SentinelShield] Fallback video playback error:', video.error && video.error.code);
    });

    wrapper.appendChild(video);
    container.appendChild(wrapper);
  };

  const cleanupFallbackIfPlayerReturned = () => {
    if (!document.querySelector('.artplayer-app-pc video')) return;
    const fallback = document.getElementById(FALLBACK_ID);
    if (fallback) {
      console.log('[SentinelShield] Primary player returned — removing fallback player');
      fallback.remove();
    }
  };

  window.__SS_MAIN.FallbackPlayer = {
    init() {
      if (!Config.isStreamingTarget()) return;

      const captureObserver = new MutationObserver((mutations) => {
        if (!Config.isProtectionEnabled('pageGuards')) return;
        for (const mutation of mutations) {
          if (mutation.type === 'childList') {
            for (const node of mutation.addedNodes) {
              if (node.nodeType === 1) scanForVideo(node);
            }
          } else if (mutation.type === 'attributes' && mutation.target && mutation.target.tagName === 'VIDEO') {
            tryCaptureFromVideo(mutation.target);
          }
        }
        cleanupFallbackIfPlayerReturned();
        if (
          !document.querySelector('.artplayer-app-pc video') &&
          document.querySelector('.video-cover.pc-cover-img') &&
          document.querySelector('.pc-playerr')
        ) {
          mountFallbackVideo();
        }
      });

      const start = () => {
        captureObserver.observe(document.documentElement, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['src']
        });
        scanForVideo(document);
      };

      if (document.documentElement) start();
      else document.addEventListener('readystatechange', start, { once: true });

      let watchdogTicks = 0;
      const watchdog = setInterval(() => {
        if (Config.isProtectionEnabled('pageGuards')) {
          scanForVideo(document);
          cleanupFallbackIfPlayerReturned();
          if (
            !document.querySelector('.artplayer-app-pc video') &&
            document.querySelector('.video-cover.pc-cover-img') &&
            document.querySelector('.pc-playerr')
          ) {
            mountFallbackVideo();
          }
        }
        if (++watchdogTicks >= 20) clearInterval(watchdog);
      }, 1000);

      console.log('[SentinelShield] Streaming fallback player watcher active');
    }
  };
})();
