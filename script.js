
// EDGE 3D QR Scanner (BarcodeDetector + jsQR fallback)
// Overlays are lightweight & local (no external GLTF) for speed & iOS compatibility.
// - ID-1: EDGE Ring (torus-knot, spinning)
// - ID-2: UFO (bobbing saucer, lights)
// - ID-3: Apple (primitives)
// - ID-4: 2D Duck (SVG)
// Also: removes overlay if code not seen for 2s; throttled jsQR and downscaled frames for speed.

document.addEventListener('DOMContentLoaded', () => {
  const video = document.getElementById('video');
  const modelContainer = document.getElementById('model-container');
  const scanResultP = document.querySelector('#scan-result p');
  const scanResultDiv = document.getElementById('scan-result');
  const loader = document.getElementById('loader');
  const startBtn = document.getElementById('start-btn');

  // Tuning
  const LOST_TIMEOUT_MS = 2000;       // clear overlay if not seen for this long
  const JSQR_TARGET_W = 480;          // downscale width for jsQR speed
  const SCAN_MIN_INTERVAL = 60;       // min ms between scans (~16=60fps; 60=~16fps)

  // State
  let scanning = false;
  let activeId = null;
  let lastSeenAt = 0;
  let lastScanAt = 0;

  // Camera / detection state
  let streamRef = null;
  let useBarcodeDetector = false;
  let detector = null;
  let rafId = null;
  let canvas = null, ctx = null;

  function updateStatus(message, isError = false) {
    scanResultP.textContent = message;
    scanResultDiv.style.backgroundColor = isError ? '#FFD2D2' : '#e3f2fd';
    scanResultDiv.style.color = isError ? '#D8000C' : '#0d47a1';
  }

  // Overlay builders (no GLTF, all local)
  const overlays = {
    'ID-1': { mode: 'edgeRing', name: 'EDGE Ring' },
    'ID-2': { mode: 'ufo3d',    name: 'UFO' },
    'ID-3': { mode: 'apple3d',  name: '3D Apple' },
    'ID-4': { mode: 'duck2d',   name: '2D Duck' },
  };

  function sceneWrap(inner) {
    return `
      <a-scene embedded renderer="alpha: true; antialias: true" background="color: #0000" vr-mode-ui="enabled: false">
        ${inner}
        <a-light type="ambient" intensity="1"></a-light>
        <a-light type="directional" intensity="0.7" position="-1 1 2"></a-light>
        <a-camera wasd-controls-enabled="false" look-controls="enabled: false" position="0 0.5 2"></a-camera>
      </a-scene>
    `;
  }

  function showOverlay(def) {
    modelContainer.innerHTML = '';

    if (def.mode === 'edgeRing') {
      const inner = `
        <a-entity position="0 0 -2.5" animation="property: rotation; to: 0 360 0; loop: true; dur: 12000; easing: linear">
          <a-torus-knot p="2" q="3" radius="0.9" radius-tubular="0.08"
                        material="color: #00d1b2; metalness: 0.4; roughness: 0.3"></a-torus-knot>
        </a-entity>`;
      modelContainer.innerHTML = sceneWrap(inner);
      return;
    }

    if (def.mode === 'ufo3d') {
      const inner = `
        <a-entity position="0 0 -2.5" animation="property: position; to: 0 0.2 -2.5; dir: alternate; loop: true; dur: 1500">
          <a-cylinder height="0.18" radius="0.9" color="#8e9eab"
                      material="metalness:0.6; roughness:0.2"></a-cylinder>
          <a-sphere radius="0.5" position="0 0.35 0" color="#cfd8dc"
                    material="metalness:0.1; roughness:0.9"></a-sphere>
          <a-ring position="0 0.05 0" radius-inner="0.25" radius-outer="0.85"
                  material="color:#4dd0e1; opacity:0.6; transparent:true"></a-ring>
          <a-sphere radius="0.06" position="0.6 0.02 0" color="#ff5252"></a-sphere>
          <a-sphere radius="0.06" position="-0.6 0.02 0" color="#ff5252"></a-sphere>
          <a-sphere radius="0.06" position="0 0.02 0.6" color="#ff5252"></a-sphere>
          <a-sphere radius="0.06" position="0 0.02 -0.6" color="#ff5252"></a-sphere>
        </a-entity>`;
      modelContainer.innerHTML = sceneWrap(inner);
      return;
    }

    if (def.mode === 'apple3d') {
      const inner = `
        <a-sphere position="0 0 -2.5" radius="0.7" color="#d32f2f">
          <a-animation attribute="rotation" to="0 360 0" dur="15000" repeat="indefinite" easing="linear"></a-animation>
        </a-sphere>
        <a-cylinder position="0 0.65 -2.2" radius="0.05" height="0.25" color="#6d4c41"></a-cylinder>
        <a-plane position="0.12 0.8 -2.2" rotation="0 0 35" width="0.35" height="0.2" color="#43a047" material="side: double"></a-plane>`;
      modelContainer.innerHTML = sceneWrap(inner);
      return;
    }

    if (def.mode === 'duck2d') {
      const wrapper = document.createElement('div');
      wrapper.className = 'overlay-2d center-bob';
      wrapper.innerHTML = `
        <svg viewBox="0 0 128 96" width="150" height="112" xmlns="http://www.w3.org/2000/svg">
          <g>
            <ellipse cx="86" cy="72" rx="36" ry="10" fill="rgba(0,0,0,.15)"></ellipse>
            <circle cx="40" cy="48" r="22" fill="#ffeb3b" stroke="#fbc02d" stroke-width="2"></circle>
            <ellipse cx="78" cy="58" rx="38" ry="26" fill="#ffeb3b" stroke="#fbc02d" stroke-width="2"></ellipse>
            <path d="M34 52 q8 6 18 0 q-8 -6 -18 0" fill="#ff9800" stroke="#f57c00" stroke-width="2"></path>
            <circle cx="48" cy="44" r="3" fill="#263238"></circle>
            <path d="M92 40 q20 12 0 24" fill="#81c784" stroke="#388e3c" stroke-width="2"></path>
          </g>
        </svg>`;
      modelContainer.appendChild(wrapper);
      return;
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
    if (!window.jsQR) throw new Error('jsQR failed to load');
  }

  async function setupDetector() {
    useBarcodeDetector = 'BarcodeDetector' in window;
    if (useBarcodeDetector) {
      try {
        const formats = await window.BarcodeDetector.getSupportedFormats();
        if (!formats.includes('qr_code')) useBarcodeDetector = false;
      } catch (_) { useBarcodeDetector = false; }
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
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
    };
    streamRef = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = streamRef;
    video.setAttribute('playsinline', 'true'); // iOS
    await video.play();
  }

  function stopCamera() {
    if (rafId) cancelAnimationFrame(rafId);
    if (streamRef) { streamRef.getTracks().forEach(t => t.stop()); streamRef = null; }
    scanning = false;
    activeId = null;
  }

  function handleRecognizedText(text) {
    const def = overlays[text];
    if (def) {
      updateStatus(`Success! Overlay: ${def.name}`);
      showOverlay(def);
    } else {
      updateStatus(`QR "${text}" not recognized. Expect ID-1, ID-2, ID-3, or ID-4.`);
      clearOverlay();
    }
  }

  function registerDetection(text) {
    const now = performance.now();
    if (text) {
      if (text !== activeId) {
        activeId = text;
        handleRecognizedText(text);
      }
      lastSeenAt = now;
    } else {
      if (activeId && (now - lastSeenAt) > LOST_TIMEOUT_MS) {
        activeId = null;
        lastSeenAt = 0;
        clearOverlay();
        updateStatus('Lost QR. Searching…');
      }
    }
  }

  async function scanLoop() {
    if (!scanning) return;

    let detectedText = null;
    const now = performance.now();
    if (now - lastScanAt >= SCAN_MIN_INTERVAL) {
      lastScanAt = now;
      try {
        if (video.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
          if (useBarcodeDetector) {
            const codes = await detector.detect(video);
            if (codes && codes.length) detectedText = codes[0].rawValue || codes[0].displayValue;
          } else {
            if (!canvas) { canvas = document.createElement('canvas'); ctx = canvas.getContext('2d', { willReadFrequently: true }); }
            // Downscale frame to speed up jsQR
            const vw = video.videoWidth, vh = video.videoHeight;
            const scale = JSQR_TARGET_W / Math.max(1, vw);
            canvas.width = Math.floor(vw * scale);
            canvas.height = Math.floor(vh * scale);
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = window.jsQR(imageData.data, canvas.width, canvas.height, { inversionAttempts: 'dontInvert' });
            if (code && code.data) detectedText = code.data;
          }
        }
      } catch (e) {
        console.warn('scan error', e);
      }
    }

    registerDetection(detectedText);
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
      updateStatus('Ready. Scan ID-1 / ID-2 / ID-3 / ID-4.');
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
  window.addEventListener('beforeunload', stopCamera);
});
