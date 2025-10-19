// EDGE 3D QR Scanner (no html5-qrcode)
// Strategy: Use native BarcodeDetector when available, otherwise fallback to jsQR.
// Works on HTTPS or localhost. Click 'Start Scanner' to begin.

document.addEventListener('DOMContentLoaded', () => {
  const video = document.getElementById('video');
  const modelContainer = document.getElementById('model-container');
  const scanResultP = document.querySelector('#scan-result p');
  const scanResultDiv = document.getElementById('scan-result');
  const loader = document.getElementById('loader');
  const startBtn = document.getElementById('start-btn');

  let scanning = false;
  let lastText = null;
  let streamRef = null;
  let useBarcodeDetector = false;
  let detector = null;
  let rafId = null;
  let canvas = null, ctx = null;

  function updateStatus(message, isError = false) {
    scanResultP.textContent = message;
    if (isError) {
      scanResultDiv.style.backgroundColor = '#FFD2D2';
      scanResultDiv.style.color = '#D8000C';
    } else {
      scanResultDiv.style.backgroundColor = '#e9ecef';
      scanResultDiv.style.color = '#333';
    }
  }

  // Models for the two IDs
  const modelMapping = {
    'ID-1': {
      url: 'https://cdn.glitch.global/b129b07a-2647-411a-a89c-852b76a66601/astronaut.glb?v=1680320790145',
      scale: '0.8 0.8 0.8',
      animation: 'property: rotation; to: 0 360 0; loop: true; dur: 15000; easing: linear;',
      name: 'Astronaut'
    },
    'ID-2': {
      url: 'https://cdn.glitch.global/b129b07a-2647-411a-a89c-852b76a66601/duck.glb?v=1680320791438',
      scale: '0.01 0.01 0.01',
      animation: 'property: position; to: 0 0.2 0; dir: alternate; loop: true; dur: 2000;',
      name: 'Rubber Duck'
    }
  };

  function showOverlay(modelData) {
    modelContainer.innerHTML = `
      <a-scene embedded renderer="alpha: true; antialias: true;" vr-mode-ui="enabled: false">
        <a-assets>
          <a-asset-item id="mdl" src="${modelData.url}"></a-asset-item>
        </a-assets>
        <a-entity id="model-entity" gltf-model="#mdl" scale="${modelData.scale}" position="0 0 -2.5"
                  animation="${modelData.animation}"></a-entity>
        <a-light type="ambient" intensity="0.8"></a-light>
        <a-light type="directional" intensity="0.6" position="-1 1 2"></a-light>
        <a-sky color="transparent" material="opacity: 0"></a-sky>
        <a-camera position="0 0.5 2" look-controls="enabled: true" wasd-controls-enabled="false"></a-camera>
      </a-scene>
    `;

    const entity = document.getElementById('model-entity');
    if (entity) {
      loader.classList.remove('hidden');
      entity.addEventListener('model-loaded', () => loader.classList.add('hidden'));
    }
  }

  function clearOverlay() {
    modelContainer.innerHTML = '';
    loader.classList.add('hidden');
  }

  async function ensureJsQR() {
    if (window.jsQR) return;
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('Failed to load jsQR fallback'));
      document.head.appendChild(s);
    });
    if (!window.jsQR) {
      throw new Error('jsQR failed to load');
    }
  }

  async function setupDetector() {
    useBarcodeDetector = 'BarcodeDetector' in window;
    if (useBarcodeDetector) {
      try {
        const formats = await window.BarcodeDetector.getSupportedFormats();
        if (!formats.includes('qr_code')) {
          useBarcodeDetector = false;
        }
      } catch (_) {
        useBarcodeDetector = false;
      }
    }
    if (useBarcodeDetector) {
      detector = new window.BarcodeDetector({ formats: ['qr_code'] });
      updateStatus('Using native BarcodeDetector.');
    } else {
      await ensureJsQR();
      updateStatus('Using jsQR fallback.');
    }
  }

  async function startCamera() {
    const constraints = {
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    };
    streamRef = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = streamRef;
    video.setAttribute('playsinline', 'true'); // iOS
    await video.play();
  }

  function stopCamera() {
    if (rafId) cancelAnimationFrame(rafId);
    if (streamRef) {
      streamRef.getTracks().forEach(t => t.stop());
      streamRef = null;
    }
    scanning = false;
  }

  function handleText(text) {
    if (!text || text === lastText) return;
    lastText = text;
    const modelData = modelMapping[text];
    if (modelData) {
      updateStatus(`Success! Loading ${modelData.name}...`);
      showOverlay(modelData);
    } else {
      updateStatus(`QR "${text}" not recognized. Expect ID-1 or ID-2.`);
      clearOverlay();
    }
  }

  async function scanLoop() {
    if (!scanning) return;

    try {
      if (video.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
        if (useBarcodeDetector) {
          const codes = await detector.detect(video);
          if (codes && codes.length) {
            const text = codes[0].rawValue || codes[0].displayValue;
            handleText(text);
          }
        } else {
          if (!canvas) {
            canvas = document.createElement('canvas');
            ctx = canvas.getContext('2d', { willReadFrequently: true });
          }
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = window.jsQR(imageData.data, canvas.width, canvas.height, { inversionAttempts: 'dontInvert' });
          if (code && code.data) {
            handleText(code.data);
          }
        }
      }
    } catch (e) {
      console.warn('scan error', e);
    }

    rafId = requestAnimationFrame(scanLoop);
  }

  async function startScanner() {
    try {
      if (!('mediaDevices' in navigator) || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API not supported in this browser.');
      }

      updateStatus('Starting camera...');
      await startCamera();

      updateStatus('Preparing QR detection...');
      await setupDetector();

      scanning = true;
      startBtn.style.display = 'none';
      updateStatus('Ready. Point the camera at a QR code containing ID-1 or ID-2.');
      scanLoop();
    } catch (err) {
      console.error('Initialization failed:', err);
      if (err?.name === 'NotAllowedError') {
        updateStatus('Camera access denied. Enable camera permissions and retry.', true);
      } else if (err?.name === 'NotFoundError') {
        updateStatus('No camera found on this device.', true);
      } else if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
        updateStatus('This must be served over HTTPS or localhost for camera access.', true);
      } else {
        updateStatus(`Could not start camera: ${err?.message || err}`, true);
      }
    }
  }

  startBtn.addEventListener('click', startScanner);

  // Cleanup on unload
  window.addEventListener('beforeunload', stopCamera);
});
