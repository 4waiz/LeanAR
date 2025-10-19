document.addEventListener('DOMContentLoaded', () => {
  const modelContainer = document.getElementById('model-container');
  const scanResultP = document.querySelector('#scan-result p');
  const scanResultDiv = document.getElementById('scan-result');
  const loader = document.getElementById('loader');
  const startBtn = document.getElementById('start-btn');

  let html5QrCode = null;
  let lastScannedId = null;

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

  // Map payloads -> models (same IDs you requested)
  const modelMapping = {
    "ID-1": {
      url: "https://cdn.glitch.global/b129b07a-2647-411a-a89c-852b76a66601/astronaut.glb?v=1680320790145",
      scale: "0.8 0.8 0.8",
      animation: "property: rotation; to: 0 360 0; loop: true; dur: 15000; easing: linear;",
      name: "Astronaut"
    },
    "ID-2": {
      url: "https://cdn.glitch.global/b129b07a-2647-411a-a89c-852b76a66601/duck.glb?v=1680320791438",
      scale: "0.01 0.01 0.01",
      animation: "property: position; to: 0 0.2 0; dir: alternate; loop: true; dur: 2000;",
      name: "Rubber Duck"
    }
    // You can add more: "ID-3": {...}, "ID-4": {...}
  };

  function showOverlay(modelData) {
    // Transparent scene over the camera (no sky, alpha renderer)
    modelContainer.innerHTML = `
      <a-scene embedded
               renderer="alpha: true; antialias: true;"
               vr-mode-ui="enabled: false">
        <a-assets>
          <a-asset-item id="model" src="${modelData.url}"></a-asset-item>
        </a-assets>

        <a-entity id="model-entity"
                  gltf-model="#model"
                  scale="${modelData.scale}"
                  position="0 0 -2.5"
                  animation="${modelData.animation}">
        </a-entity>

        <a-light type="ambient" intensity="0.8"></a-light>
        <a-light type="directional" intensity="0.6" position="-1 1 2"></a-light>

        <a-sky color="transparent" material="opacity: 0"></a-sky>
        <a-camera position="0 0.5 2" look-controls="enabled: true"
                  wasd-controls-enabled="false"></a-camera>
      </a-scene>
    `;

    const entity = document.getElementById('model-entity');
    if (entity) {
      loader.classList.remove('hidden');
      entity.addEventListener('model-loaded', () => {
        loader.classList.add('hidden');
      });
    }
  }

  function clearOverlay() {
    modelContainer.innerHTML = '';
    loader.classList.add('hidden');
  }

  function onScanSuccess(decodedText) {
    // Only react to changes and only for known IDs
    if (decodedText !== lastScannedId) {
      lastScannedId = decodedText;
      const modelData = modelMapping[decodedText];

      if (modelData) {
        updateStatus(`Success! Loading ${modelData.name}...`);
        showOverlay(modelData);
      } else {
        updateStatus(`QR "${decodedText}" not recognized. Expect ID-1 or ID-2.`);
        clearOverlay();
      }
    }
  }

  function onScanFailure() {
    // Keep scanning silently; when nothing is seen, we don't spam messages
  }
  async function ensureHtml5QrcodeLoaded() {
  if (window.Html5Qrcode) return;

  // Fallback loader (second CDN) if primary failed for any reason
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/html5-qrcode@2.3.8/minified/html5-qrcode.min.js';
    s.onload = resolve;
    s.onerror = () => reject(new Error('Failed to load html5-qrcode library'));
    document.head.appendChild(s);
  });

  if (!window.Html5Qrcode) {
    throw new Error('Html5Qrcode still not available after loading.');
  }
}

  async function startScanner() {
    try {
      updateStatus("Initializing scanner...");
      html5QrCode = new Html5Qrcode("qr-reader");

      const cameras = await Html5Qrcode.getCameras();
      if (!cameras || cameras.length === 0) {
        throw new Error("No cameras found on this device.");
      }

      const qrbox = (w, h) => {
        const s = Math.floor(Math.min(w, h) * 0.7);
        return { width: s, height: s };
      };
      const config = { fps: 10, qrbox };

      updateStatus("Starting camera... please allow permission.");
      await html5QrCode.start({ facingMode: "environment" }, config, onScanSuccess, onScanFailure);
      updateStatus("Ready. Point the camera at a QR code containing ID-1 or ID-2.");
      startBtn.style.display = 'none'; // hide once started
    } catch (err) {
      console.error("Camera initialization failed:", err);
      if (err?.name === 'NotAllowedError') {
        updateStatus("Camera access denied. Enable camera in browser settings and retry.", true);
      } else if (err?.name === 'NotFoundError') {
        updateStatus("No camera found on this device.", true);
      } else if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
        updateStatus("This must be served over HTTPS or localhost for camera access.", true);
      } else {
        updateStatus(`Could not start camera: ${err?.message || err}`, true);
      }
    }
  }

  // Require a tap (better iOS support)
  startBtn.addEventListener('click', startScanner);
});
