// main-world/privacy/fingerprint-shield.js
// Advanced anti-fingerprinting defenses: Canvas, OffscreenCanvas, WebGL/WebGL2,
// AudioContext/OfflineAudioContext, hardware entropy normalization, and native masquerading.

(() => {
  'use strict';

  window.__SS_MAIN = window.__SS_MAIN || {};
  const { Config, EventBridge } = window.__SS_MAIN;

  // Session-persistent PRNG seed for deterministic per-session micro-perturbations
  const seedBuffer = new Uint32Array(2);
  crypto.getRandomValues(seedBuffer);
  const SESSION_SEED = seedBuffer[0];
  const SESSION_SEED_2 = seedBuffer[1];

  // Vector-level rate-limiter for telemetry reporting to prevent legitimate web apps
  // (e.g. WhatsApp Web avatar rendering, voice note waveform decoding) from causing
  // false-positive counter explosions while ensuring micro-perturbations always execute.
  const vectorTimestamps = new Map();
  const reportFingerprintVector = (vector) => {
    if (!Config.isProtectionEnabled('antiFingerprinting')) return;
    const now = Date.now();
    const last = vectorTimestamps.get(vector) || 0;
    // Report each distinct vector at most once per 10 seconds per page context
    if (now - last > 10000) {
      vectorTimestamps.set(vector, now);
      EventBridge.reportFingerprintBlocked(vector);
    }
  };

  // Utility to make hooked functions appear native to anti-tampering fingerprint probes
  const masquerade = (fn, originalName = '') => {
    try {
      const name = originalName || fn.name || '';
      Object.defineProperty(fn, 'name', { value: name, configurable: true });
      fn.toString = () => `function ${name}() { [native code] }`;
    } catch (_) {}
    return fn;
  };

  // Canvas pixel perturbation (subtle micro-noise across non-transparent pixels)
  const perturbImageData = (imageData, width, height) => {
    if (!imageData?.data?.length || width <= 0 || height <= 0) return false;
    const data = imageData.data;
    const len = data.length;
    const totalPixels = width * height;
    // For small test canvases (e.g. CreepJS 20x20 = 400 pixels), ensure ~5% noise for test recognition
    const stride = totalPixels <= 1000 ? 16 : Math.max(16, Math.floor(len / 1000));
    for (let i = 0; i < len; i += stride * 4) {
      if (data[i + 3] > 0) { // non-transparent
        const channel = (SESSION_SEED_2 + (i >> 2)) % 3; // R, G, or B
        data[i + channel] ^= 1;
      }
    }
    return true;
  };

  const poisonCanvasCopy = (canvas) => {
    if (!canvas || canvas.width === 0 || canvas.height === 0) return null;
    try {
      const copy = document.createElement('canvas');
      copy.width = canvas.width;
      copy.height = canvas.height;
      const ctx = copy.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;
      ctx.drawImage(canvas, 0, 0);
      const imgData = ctx.getImageData(0, 0, copy.width, copy.height);
      perturbImageData(imgData, copy.width, copy.height);
      ctx.putImageData(imgData, 0, 0);
      return copy;
    } catch (_) {
      return null;
    }
  };

  window.__SS_MAIN.FingerprintShield = {
    init() {
      // ═════════════════════════════════════════════════════════════════════
      // 1. CANVAS & OFFSCREENCANVAS FINGERPRINT DEFENSE
      // ═════════════════════════════════════════════════════════════════════
      try {
        if (window.CanvasRenderingContext2D) {
          const origGetImageData = CanvasRenderingContext2D.prototype.getImageData;
          CanvasRenderingContext2D.prototype.getImageData = masquerade(function (x, y, w, h, ...rest) {
            const imageData = origGetImageData.call(this, x, y, w, h, ...rest);
            if (!Config.isProtectionEnabled('antiFingerprinting')) return imageData;
            if (perturbImageData(imageData, w, h)) {
              reportFingerprintVector('canvas-getImageData');
            }
            return imageData;
          }, 'getImageData');

          // Jitter TextMetrics to block font measurement profiling
          const origMeasureText = CanvasRenderingContext2D.prototype.measureText;
          CanvasRenderingContext2D.prototype.measureText = masquerade(function (text) {
            const metrics = origMeasureText.call(this, text);
            if (!Config.isProtectionEnabled('antiFingerprinting')) return metrics;
            // Slight sub-pixel jitter
            const delta = ((SESSION_SEED & 3) - 1) * 0.00001;
            try {
              const width = metrics.width + delta;
              return new Proxy(metrics, {
                get(target, prop) {
                  if (prop === 'width') return width;
                  return Reflect.get(target, prop);
                }
              });
            } catch (_) {
              return metrics;
            }
          }, 'measureText');
        }

        if (window.HTMLCanvasElement) {
          const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
          HTMLCanvasElement.prototype.toDataURL = masquerade(function (...args) {
            if (!Config.isProtectionEnabled('antiFingerprinting')) {
              return origToDataURL.apply(this, args);
            }
            const copy = poisonCanvasCopy(this);
            if (copy) {
              reportFingerprintVector('canvas-toDataURL');
              return origToDataURL.apply(copy, args);
            }
            return origToDataURL.apply(this, args);
          }, 'toDataURL');

          const origToBlob = HTMLCanvasElement.prototype.toBlob;
          if (origToBlob) {
            HTMLCanvasElement.prototype.toBlob = masquerade(function (callback, ...args) {
              if (!Config.isProtectionEnabled('antiFingerprinting')) {
                return origToBlob.call(this, callback, ...args);
              }
              const copy = poisonCanvasCopy(this);
              if (copy) {
                reportFingerprintVector('canvas-toBlob');
                return origToBlob.call(copy, callback, ...args);
              }
              return origToBlob.call(this, callback, ...args);
            }, 'toBlob');
          }
        }

        // OffscreenCanvas protection for worker and modern background fingerprinting
        if (window.OffscreenCanvasRenderingContext2D) {
          const origOffscreenGetImageData = OffscreenCanvasRenderingContext2D.prototype.getImageData;
          OffscreenCanvasRenderingContext2D.prototype.getImageData = masquerade(function (x, y, w, h, ...rest) {
            const imageData = origOffscreenGetImageData.call(this, x, y, w, h, ...rest);
            if (!Config.isProtectionEnabled('antiFingerprinting')) return imageData;
            if (perturbImageData(imageData, w, h)) {
              reportFingerprintVector('offscreen-canvas-probe');
            }
            return imageData;
          }, 'getImageData');
        }
      } catch (e) {
        console.warn('[SentinelShield] Canvas protection notice:', e);
      }

      // ═════════════════════════════════════════════════════════════════════
      // 2. WEBGL & WEBGL2 HARDWARE & SHADER DEFENSE
      // ═════════════════════════════════════════════════════════════════════
      const maskWebGL = (ContextPrototype, name) => {
        if (!ContextPrototype || !ContextPrototype.prototype) return;

        const origGetParameter = ContextPrototype.prototype.getParameter;
        const origGetExtension = ContextPrototype.prototype.getExtension;
        const origGetSupportedExtensions = ContextPrototype.prototype.getSupportedExtensions;
        const origGetShaderPrecisionFormat = ContextPrototype.prototype.getShaderPrecisionFormat;
        const origReadPixels = ContextPrototype.prototype.readPixels;

        const UNMASKED_VENDOR_WEBGL = 37445;
        const UNMASKED_RENDERER_WEBGL = 37446;

        // Mask renderer and vendor strings (both unmasked debug and standard WebGL queries)
        ContextPrototype.prototype.getParameter = masquerade(function (pname) {
          if (!Config.isProtectionEnabled('antiFingerprinting')) {
            return origGetParameter.call(this, pname);
          }
          if (pname === UNMASKED_RENDERER_WEBGL || pname === 7937) {
            reportFingerprintVector('webgl-renderer-query');
            return 'ANGLE (Generic High Performance WebGL Engine)';
          }
          if (pname === UNMASKED_VENDOR_WEBGL || pname === 7936) {
            reportFingerprintVector('webgl-vendor-query');
            return 'Google Inc. (Generic WebGL)';
          }
          // Normalize MAX_TEXTURE_SIZE to standard desktop tier (16384)
          if (pname === 3379) return 16384;
          return origGetParameter.call(this, pname);
        }, 'getParameter');

        // Suppress debug renderer extension
        ContextPrototype.prototype.getExtension = masquerade(function (extName) {
          if (!Config.isProtectionEnabled('antiFingerprinting')) {
            return origGetExtension.call(this, extName);
          }
          if (extName === 'WEBGL_debug_renderer_info') {
            reportFingerprintVector('webgl-debug-extension');
            return null;
          }
          return origGetExtension.call(this, extName);
        }, 'getExtension');

        // Standardize extensions list
        if (origGetSupportedExtensions) {
          ContextPrototype.prototype.getSupportedExtensions = masquerade(function () {
            const list = origGetSupportedExtensions.call(this);
            if (!Config.isProtectionEnabled('antiFingerprinting')) return list;
            if (Array.isArray(list)) {
              return list.filter(item => item !== 'WEBGL_debug_renderer_info');
            }
            return list;
          }, 'getSupportedExtensions');
        }

        // Standardize shader precision formats across devices
        if (origGetShaderPrecisionFormat) {
          ContextPrototype.prototype.getShaderPrecisionFormat = masquerade(function (shaderType, precisionType) {
            const format = origGetShaderPrecisionFormat.call(this, shaderType, precisionType);
            if (!Config.isProtectionEnabled('antiFingerprinting')) return format;
            if (format) {
              return {
                rangeMin: 127,
                rangeMax: 127,
                precision: 23
              };
            }
            return format;
          }, 'getShaderPrecisionFormat');
        }

        // Micro-perturb WebGL readPixels buffer (scrambles render hashes)
        if (origReadPixels) {
          ContextPrototype.prototype.readPixels = masquerade(function (x, y, w, h, format, type, pixels) {
            origReadPixels.call(this, x, y, w, h, format, type, pixels);
            if (!Config.isProtectionEnabled('antiFingerprinting')) return;
            if (pixels && pixels.length > 0) {
              const idx = (SESSION_SEED % pixels.length);
              pixels[idx] ^= 1;
              reportFingerprintVector('webgl-readpixels-probe');
            }
          }, 'readPixels');
        }
      };

      if (window.WebGLRenderingContext) maskWebGL(window.WebGLRenderingContext, 'WebGL');
      if (window.WebGL2RenderingContext) maskWebGL(window.WebGL2RenderingContext, 'WebGL2');

      // ═════════════════════════════════════════════════════════════════════
      // 3. AUDIOCONTEXT & OFFLINEAUDIOCONTEXT SYNTHESIS DEFENSE
      // ═════════════════════════════════════════════════════════════════════
      try {
        // (a) AudioBuffer.prototype.getChannelData
        if (window.AudioBuffer && window.AudioBuffer.prototype.getChannelData) {
          const origGetChannelData = AudioBuffer.prototype.getChannelData;
          const perturbedBuffers = new WeakSet();
          AudioBuffer.prototype.getChannelData = masquerade(function (channel) {
            const buffer = origGetChannelData.call(this, channel);
            if (!Config.isProtectionEnabled('antiFingerprinting')) return buffer;
            if (buffer && buffer.length > 0 && !perturbedBuffers.has(this)) {
              perturbedBuffers.add(this);
              // In-place perturbation preserves object reference identity (prevents anti-tamper trap flags)
              const idx = (SESSION_SEED % Math.min(buffer.length, 500));
              buffer[idx] += ((SESSION_SEED & 1) ? 1 : -1) * 0.0000001;
              reportFingerprintVector('audio-channeldata-probe');
            }
            return buffer;
          }, 'getChannelData');
        }

        // (b) OfflineAudioContext.prototype.startRendering (FingerprintJS primary audio probe)
        if (window.OfflineAudioContext && window.OfflineAudioContext.prototype.startRendering) {
          const origStartRendering = window.OfflineAudioContext.prototype.startRendering;
          window.OfflineAudioContext.prototype.startRendering = masquerade(function () {
            if (!Config.isProtectionEnabled('antiFingerprinting')) {
              return origStartRendering.call(this);
            }
            reportFingerprintVector('offline-audio-fingerprint');
            return origStartRendering.call(this).then(renderedBuffer => {
              if (renderedBuffer && renderedBuffer.numberOfChannels > 0) {
                try {
                  const data = renderedBuffer.getChannelData(0);
                  if (data && data.length > 0) {
                    const noise = ((SESSION_SEED & 1) ? 1 : -1) * 0.0000001;
                    // Perturb sample within first 500 samples where frequency/sum hash is calculated
                    const idx = (SESSION_SEED % Math.min(data.length, 500));
                    data[idx] += noise;
                  }
                } catch (_) {}
              }
              return renderedBuffer;
            });
          }, 'startRendering');
        }

        // (c) AnalyserNode frequency data perturbation
        if (window.AnalyserNode) {
          const origGetFloatFreq = AnalyserNode.prototype.getFloatFrequencyData;
          if (origGetFloatFreq) {
            AnalyserNode.prototype.getFloatFrequencyData = masquerade(function (array) {
              origGetFloatFreq.call(this, array);
              if (!Config.isProtectionEnabled('antiFingerprinting')) return;
              if (array && array.length > 0) {
                array[0] += ((SESSION_SEED & 1) ? 0.0001 : -0.0001);
                reportFingerprintVector('analyser-frequency-probe');
              }
            }, 'getFloatFrequencyData');
          }
        }
      } catch (e) {
        console.warn('[SentinelShield] Audio protection notice:', e);
      }

      // ═════════════════════════════════════════════════════════════════════
      // 4. HARDWARE & PLATFORM ENTROPY NORMALIZATION
      // ═════════════════════════════════════════════════════════════════════
      // (a) Hardware Concurrency (CPU Cores) -> normalize to 8
      try {
        const originalHardwareConcurrency = navigator.hardwareConcurrency;
        Object.defineProperty(navigator, 'hardwareConcurrency', {
          get: masquerade(() => Config.isProtectionEnabled('antiFingerprinting')
            ? 8
            : originalHardwareConcurrency, 'get hardwareConcurrency'),
          configurable: true,
          enumerable: true
        });
      } catch (_) {}

      // (b) Device Memory (RAM) -> normalize to 8 GB
      try {
        if ('deviceMemory' in navigator) {
          const originalDeviceMemory = navigator.deviceMemory;
          Object.defineProperty(navigator, 'deviceMemory', {
            get: masquerade(() => Config.isProtectionEnabled('antiFingerprinting')
              ? 8
              : originalDeviceMemory, 'get deviceMemory'),
            configurable: true,
            enumerable: true
          });
        }
      } catch (_) {}

      // (c) Client Hints / High-entropy User Agent Data
      try {
        if (navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) {
          const origGetHighEntropy = navigator.userAgentData.getHighEntropyValues;
          navigator.userAgentData.getHighEntropyValues = masquerade(function (hints) {
            if (!Config.isProtectionEnabled('antiFingerprinting')) {
              return origGetHighEntropy.call(this, hints);
            }
            reportFingerprintVector('client-hints-probe');
            return origGetHighEntropy.call(this, hints).then(values => {
              if (values) {
                // Sanitize exact architecture and model leakage
                if (values.architecture) values.architecture = 'x86';
                if (values.bitness) values.bitness = '64';
                if (values.model) values.model = '';
                if (values.platformVersion) values.platformVersion = '15.0.0';
              }
              return values;
            });
          }, 'getHighEntropyValues');
        }
      } catch (_) {}

      // (d) Media Devices enumeration (Hardware peripheral fingerprinting)
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
          const origEnumerateDevices = navigator.mediaDevices.enumerateDevices;
          navigator.mediaDevices.enumerateDevices = masquerade(function () {
            // Check if user has active permissions
            return origEnumerateDevices.call(navigator.mediaDevices).then(devices => {
              if (!Config.isProtectionEnabled('antiFingerprinting')) return devices;
              // Return standard generic dummy device list if unpermissioned (empty label)
              const hasLabels = devices.some(d => d.label && d.label.length > 0);
              if (hasLabels) return devices;

              reportFingerprintVector('media-devices-enumeration');
              return [
                { deviceId: 'default', kind: 'audioinput', label: '', groupId: 'default' },
                { deviceId: 'default', kind: 'videoinput', label: '', groupId: 'default' },
                { deviceId: 'default', kind: 'audiooutput', label: '', groupId: 'default' }
              ];
            });
          }, 'enumerateDevices');
        }
      } catch (_) {}

      // (e) Speech Synthesis voices enumeration
      try {
        if (window.speechSynthesis && window.speechSynthesis.getVoices) {
          const origGetVoices = window.speechSynthesis.getVoices;
          window.speechSynthesis.getVoices = masquerade(function () {
            const list = origGetVoices.call(window.speechSynthesis);
            if (!Config.isProtectionEnabled('antiFingerprinting')) return list;
            // Limit to standard top voices to prevent system-level OS voice fingerprinting
            if (Array.isArray(list) && list.length > 3) {
              return list.slice(0, 3);
            }
            return list;
          }, 'getVoices');
        }
      } catch (_) {}

      // (f) Battery Status API Privacy Guard
      try {
        if (navigator.getBattery) {
          const origGetBattery = navigator.getBattery.bind(navigator);
          Object.defineProperty(navigator, 'getBattery', {
            configurable: true,
            value: masquerade(function () {
              if (!Config.isProtectionEnabled('antiFingerprinting')) {
                return origGetBattery();
              }
              reportFingerprintVector('battery-status-query');
              return Promise.resolve({
                charging: true,
                chargingTime: 0,
                dischargingTime: Infinity,
                level: 1.0,
                addEventListener: () => {},
                removeEventListener: () => {}
              });
            }, 'getBattery')
          });
        }
      } catch (_) {}

      console.log('[SentinelShield] Advanced anti-fingerprinting shield active');
    }
  };
})();
