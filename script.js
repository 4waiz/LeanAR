// 7-ID QR overlay: shows slide text (outlined) + right-side image over live camera.
// Overlay is created ONLY when a valid ID is seen; hidden otherwise.

document.addEventListener('DOMContentLoaded', () => {
  const video = document.getElementById('video');
  const infoOverlay = document.getElementById('info-overlay');

  const loader = document.getElementById('loader');
  const startBtn = document.getElementById('start-btn');
  const startLogo = document.getElementById('start-logo');
  const footer = document.querySelector('.footer');
  const scanResultP = document.querySelector('#scan-result p');
  const scanResultDiv = document.getElementById('scan-result');

  // Keep overlay clear of footer & lift on phones
  function setFooterHeightVar(){
    const h = footer?.offsetHeight || 28;
    document.documentElement.style.setProperty('--footer-h', `${h}px`);
  }
  function setOverlayLift(){
    const h = window.innerHeight;
    let lift = -4; if (h < 820) lift = -6; if (h < 740) lift = -8; if (h < 680) lift = -9.5;
    document.documentElement.style.setProperty('--overlay-lift', `${lift}vh`);
  }
  setFooterHeightVar(); setOverlayLift();
  window.addEventListener('resize', () => { setFooterHeightVar(); setOverlayLift(); });
  window.addEventListener('orientationchange', () => { setFooterHeightVar(); setOverlayLift(); });

  // -------------------- Slide Content (ID-1 … ID-7) --------------------
  const SLIDES = {
    'ID-1': {
      title: 'INVENTORY',
      def: 'Holding more inventory than is needed for production or customer orders. Raw materials, work-in-progress (WIP), or finished products.',
      desc: 'It results in higher storage costs, risk of obsolescence, and cash flow problems. It is often a consequence of overproduction, poor forecasting, or inefficient scheduling. Inventory also hides process inefficiencies, as it covers up potential problems like long setup times or unpredictable demand.',
      img: 'image1.png', alt: 'Inventory'
    },
    'ID-2': {
      title: 'TRANSPORTATION',
      def: 'Unnecessary movement of materials, products, or information between processes or locations.',
      desc: 'It includes any extra movement of items that does not add value to the product. Moving parts over long distances or between different facilities increases the risk of damage, adds to lead time, and consumes energy and resources without benefiting the customer.',
      img: 'image2.png', alt: 'Transportation'
    },
    'ID-3': {
      title: 'WAITING TIME',
      def: 'Time when people, equipment, materials or information are not in use, also called idle time.',
      desc: 'It occurs when workers or machines are forced to stand idle due to delays in receiving the next input, material, or instruction. This waste slows down production cycles, prolongs lead times, and creates bottlenecks in the workflow.',
      img: 'image3.png', alt: 'Waiting Time'
    },
    'ID-4': {
      title: 'OVERPRODUCTION',
      def: 'Producing more than what is immediately needed by the final customer, the next process or producing earlier than necessary.',
      desc: 'It leads to excess inventory and ties up resources in unsold goods. It often occurs when companies operate on forecasts instead of actual demand, resulting in products sitting in storage, increasing the risk of obsolescence, and consuming valuable space and capital.',
      img: 'image4.png', alt: 'Overproduction'
    },
    'ID-5': {
      title: 'MOVEMENT',
      def: 'Excessive or inefficient movement of people, equipment, or machinery within the production process.',
      desc: 'It includes walking long distances, reaching, bending, or stretching to retrieve tools or parts. This type of waste reduces worker efficiency and can lead to fatigue or injuries. Streamlining the workspace layout and ensuring tools and materials are within easy reach helps eliminate this waste.',
      img: 'image5.png', alt: 'Movement'
    },
    'ID-6': {
      title: 'OVERPROCESSING',
      def: 'Performing more work or adding more features than the customer requires.',
      desc: 'Overprocessing involves unnecessary activities or steps that do not enhance the product’s value from the customer’s perspective. For example, applying more finishes or inspections than needed or adding features that the customer doesn\'t request results in wasted time, resources, and labor.',
      img: 'image6.png', alt: 'Overprocessing'
    },
    'ID-7': {
      title: 'DEFECTS',
      def: 'Products or materials that do not meet quality standards, requiring rework, repairs, or disposal.',
      desc: 'Defects are costly because they lead to wasted materials, labor, and time. Rework consumes resources that could have been used for new production, while scrap results in complete loss. Defects can also harm customer satisfaction, leading to returns, warranty claims, or reputational damage.',
      img: 'image7.png', alt: 'Defects'
    }
  };
  // -------------------------------------------------------------------

  // Scanner core (BarcodeDetector → jsQR fallback)
  const LOST_TIMEOUT_MS = 4000;  // keep slide 4s after last good scan
  const JSQR_TARGET_W = 480;
  const SCAN_MIN_INTERVAL = 60;

  let scanning = false, activeId = null, lastSeenAt = 0, lastScanAt = 0;
  let streamRef = null, useBarcodeDetector = false, detector = null, rafId = null;
  let canvas = null, ctx = null;

  function updateStatus(message, isError = false){
    if (scanResultP) scanResultP.textContent = message || '';
    if (scanResultDiv) scanResultDiv.classList.toggle('hidden', !isError);
  }

  // Build/destroy overlay only when needed
  function renderSlide(slide){
    infoOverlay.innerHTML = `
      <div class="info-content">
        <div class="info-text">
          <h1 id="slide-title" class="outlined">${slide.title}</h1>
          <p class="outlined small"><span class="label">DEFINITION:</span> ${slide.def}</p>
          <p class="outlined small"><span class="label">DESCRIPTION:</span> ${slide.desc}</p>
        </div>
        <div class="info-image">
          <img id="slide-image" src="${slide.img}" alt="${slide.alt || slide.title}" />
        </div>
      </div>`;
    infoOverlay.classList.remove('hidden');
    infoOverlay.setAttribute('aria-hidden','false');
  }
  function hideSlide(){
    infoOverlay.classList.add('hidden');
    infoOverlay.setAttribute('aria-hidden','true');
    infoOverlay.innerHTML = '';
  }

  // Only show overlay when a valid ID-x is detected.
  function registerDetection(text){
    const now = performance.now();
    const slide = text ? SLIDES[text] : null;

    if (slide){
      if (text !== activeId){
        activeId = text;
        renderSlide(slide);
      }
      lastSeenAt = now;
      return;
    }

    // Unrecognized code? Hide right away.
    if (text && !slide){
      activeId = null;
      hideSlide();
      return;
    }

    // No code in view: wait for LOST_TIMEOUT_MS, then hide.
    if (activeId && (now - lastSeenAt) > LOST_TIMEOUT_MS){
      activeId = null; lastSeenAt = 0; hideSlide();
    }
  }

  async function ensureJsQR(){
    if (window.jsQR) return;
    await new Promise((resolve, reject)=>{
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
      s.onload = resolve; s.onerror = ()=>reject(new Error('Failed to load jsQR'));
      document.head.appendChild(s);
    });
    if (!window.jsQR) throw new Error('jsQR failed to load');
  }

  async function setupDetector(){
    useBarcodeDetector = 'BarcodeDetector' in window;
    if (useBarcodeDetector){
      try{
        const formats = await window.BarcodeDetector.getSupportedFormats();
        if (!formats.includes('qr_code')) useBarcodeDetector = false;
      }catch{ useBarcodeDetector = false; }
    }
    if (useBarcodeDetector) detector = new window.BarcodeDetector({ formats:['qr_code'] });
    else await ensureJsQR();
  }

  async function startCamera(){
    const constraints = {
      audio:false,
      video:{ facingMode:{ ideal:'environment' }, width:{ ideal:1280 }, height:{ ideal:720 } }
    };
    streamRef = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = streamRef;
    video.setAttribute('playsinline','true');
    await video.play();
    hideSlide(); // ensure overlay is hidden at start
  }

  function stopCamera(){
    if (rafId) cancelAnimationFrame(rafId);
    if (streamRef){ streamRef.getTracks().forEach(t=>t.stop()); streamRef = null; }
    scanning = false; activeId = null; hideSlide();
  }

  async function scanLoop(){
    if (!scanning) return;
    let detectedText = null;
    const now = performance.now();

    if (now - lastScanAt >= SCAN_MIN_INTERVAL){
      lastScanAt = now;
      try{
        if (video.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA){
          if (useBarcodeDetector){
            const codes = await detector.detect(video);
            if (codes && codes.length) detectedText = codes[0].rawValue || codes[0].displayValue;
          }else{
            if (!canvas){ canvas = document.createElement('canvas'); ctx = canvas.getContext('2d', { willReadFrequently: true }); }
            const vw = video.videoWidth, vh = video.videoHeight;
            const scale = JSQR_TARGET_W / Math.max(1, vw);
            canvas.width = Math.floor(vw * scale);
            canvas.height = Math.floor(vh * scale);
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const id = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = window.jsQR(id.data, canvas.width, canvas.height, { inversionAttempts:'dontInvert' });
            if (code && code.data) detectedText = code.data;
          }
        }
      }catch{}
    }

    registerDetection(detectedText);
    rafId = requestAnimationFrame(scanLoop);
  }

  async function startScanner(){
    try{
      if (!('mediaDevices' in navigator) || !navigator.mediaDevices.getUserMedia){
        throw new Error('Camera API not supported in this browser.');
      }
      loader.classList.remove('hidden');
      await startCamera();
      await setupDetector();

      scanning = true;
      startBtn.style.display = 'none';
      if (startLogo) startLogo.style.display = 'none';
      scanLoop();
    }catch(err){
      const msg =
        err?.name === 'NotAllowedError' ? 'Camera access denied. Enable camera permissions and retry.' :
        err?.name === 'NotFoundError'   ? 'No camera found on this device.' :
        (location.protocol !== 'https:' && location.hostname !== 'localhost')
          ? 'This must be served over HTTPS or localhost for camera access.'
          : `Could not start camera: ${err?.message || err}`;
      updateStatus(msg, true);
    }finally{
      loader.classList.add('hidden');
    }
  }

  function updateStatus(message, isError = false){
    if (scanResultP) scanResultP.textContent = message || '';
    if (scanResultDiv) scanResultDiv.classList.toggle('hidden', !isError);
  }

  startBtn.addEventListener('click', startScanner);
  window.addEventListener('beforeunload', stopCamera);
});
