// AR slides for ID-1 … ID-8. Overlay is injected only on valid scan.
// Keeps slide on screen for 4s after last good read.
// Includes 3D avatar with speech synthesis.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

document.addEventListener('DOMContentLoaded', () => {
  const video = document.getElementById('video');
  const infoOverlay = document.getElementById('info-overlay');

  const loader = document.getElementById('loader');
  const startBtn = document.getElementById('start-btn');
  const startLogo = document.getElementById('start-logo');
  const footer = document.querySelector('.footer');
  const scanResultP = document.querySelector('#scan-result p');
  const scanResultDiv = document.getElementById('scan-result');

  /* ---------- Avatar Setup ---------- */
  const avatarContainer = document.getElementById('avatar-container');
  const avatarLoading = document.getElementById('avatar-loading');
  const MODEL_PATH = './muhammad.glb';

  let avatarScene, avatarCamera, avatarRenderer, avatarModel;
  let mouthParts = [], eyeParts = [];
  let nextBlinkTime = 0;
  let isSpeaking = false;
  let speechFinished = false;  // Track if speech has completed
  let speechSynth = window.speechSynthesis;
  let currentUtterance = null;

  function initAvatar() {
    avatarScene = new THREE.Scene();
    avatarScene.background = null; // Transparent background

    avatarCamera = new THREE.PerspectiveCamera(
      45,
      avatarContainer.clientWidth / avatarContainer.clientHeight,
      0.1,
      100
    );
    avatarCamera.position.set(0, 1.7, 0.6);

    avatarRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    avatarRenderer.setSize(avatarContainer.clientWidth, avatarContainer.clientHeight);
    avatarRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    avatarRenderer.outputColorSpace = THREE.SRGBColorSpace;
    avatarContainer.appendChild(avatarRenderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
    avatarScene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(1, 2, 3);
    avatarScene.add(dirLight);
    const backLight = new THREE.DirectionalLight(0xffffff, 0.5);
    backLight.position.set(-1, 1, -2);
    avatarScene.add(backLight);

    // Load avatar model
    const gltfLoader = new GLTFLoader();
    gltfLoader.load(
      MODEL_PATH,
      (gltf) => {
        avatarModel = gltf.scene;
        avatarScene.add(avatarModel);
        avatarLoading.style.display = 'none';

        // Find morph targets for mouth and eyes
        const mouthNames = ['jawOpen', 'mouthOpen', 'viseme_aa', 'viseme_OH', 'MouthOpen', 'v_aa'];
        const eyeNames = ['eyeBlinkLeft', 'eyeBlinkRight', 'eyesClosed', 'blink', 'EyeBlink_L', 'EyeBlink_R'];

        avatarModel.traverse((child) => {
          if (child.isMesh && child.morphTargetDictionary) {
            // Check Mouth
            for (let name of mouthNames) {
              if (child.morphTargetDictionary[name] !== undefined) {
                mouthParts.push({ mesh: child, index: child.morphTargetDictionary[name] });
                break;
              }
            }
            // Check Eyes
            for (let name of eyeNames) {
              if (child.morphTargetDictionary[name] !== undefined) {
                eyeParts.push({ mesh: child, index: child.morphTargetDictionary[name] });
              }
            }
          }
        });

        // Position camera to frame the face
        const box = new THREE.Box3().setFromObject(avatarModel);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const faceHeight = box.max.y - size.y * 0.12;
        avatarCamera.position.set(center.x, faceHeight, center.z + 0.55);
        avatarCamera.lookAt(center.x, faceHeight, center.z);
      },
      undefined,
      (error) => {
        console.error('Avatar load error:', error);
        avatarLoading.textContent = 'Avatar Error';
      }
    );

    // Handle resize
    window.addEventListener('resize', () => {
      if (avatarRenderer && avatarContainer) {
        avatarCamera.aspect = avatarContainer.clientWidth / avatarContainer.clientHeight;
        avatarCamera.updateProjectionMatrix();
        avatarRenderer.setSize(avatarContainer.clientWidth, avatarContainer.clientHeight);
      }
    });

    // Start animation loop
    animateAvatar();
  }

  function animateAvatar() {
    requestAnimationFrame(animateAvatar);

    if (!avatarModel) {
      avatarRenderer.render(avatarScene, avatarCamera);
      return;
    }

    const now = Date.now();
    const time = now * 0.001;

    // Eye blinking (always active)
    let blinkValue = 0;
    if (now > nextBlinkTime) {
      if (now < nextBlinkTime + 150) {
        blinkValue = 1;
      } else {
        nextBlinkTime = now + Math.random() * 3000 + 2000;
      }
    }
    eyeParts.forEach((part) => {
      part.mesh.morphTargetInfluences[part.index] = blinkValue;
    });

    // Mouth movement when speaking
    if (isSpeaking) {
      // Head bobbing while speaking
      avatarModel.rotation.y = Math.sin(time * 1.5) * 0.08;
      avatarModel.rotation.x = Math.sin(time * 2) * 0.02;

      // Mouth animation synced to speech rhythm
      const mouthValue = ((Math.sin(now * 0.025) + 1) / 2) * 0.5;
      mouthParts.forEach((part) => {
        part.mesh.morphTargetInfluences[part.index] = mouthValue;
      });
    } else {
      // Smooth reset when not speaking
      avatarModel.rotation.y = THREE.MathUtils.lerp(avatarModel.rotation.y, 0, 0.1);
      avatarModel.rotation.x = THREE.MathUtils.lerp(avatarModel.rotation.x, 0, 0.1);

      mouthParts.forEach((part) => {
        const current = part.mesh.morphTargetInfluences[part.index];
        part.mesh.morphTargetInfluences[part.index] = THREE.MathUtils.lerp(current, 0, 0.1);
      });
    }

    avatarRenderer.render(avatarScene, avatarCamera);
  }

  // Speech synthesis function
  function speakSlideContent(slide) {
    // Cancel any ongoing speech
    if (speechSynth.speaking) {
      speechSynth.cancel();
    }

    // Small delay to ensure cancel completes
    setTimeout(() => {
      // Build the speech text
      const textToSpeak = `${slide.title}. Definition: ${slide.def}. Description: ${slide.desc}`;

      currentUtterance = new SpeechSynthesisUtterance(textToSpeak);
      currentUtterance.rate = 0.85;  // Slightly slower for gravitas
      currentUtterance.pitch = 0.7;  // Lower pitch for deep male voice
      currentUtterance.volume = 1.0;

      // Try to get a deep male voice
      const voices = speechSynth.getVoices();
      // Prefer male voices, especially deeper ones
      const preferredVoice =
        voices.find((v) => v.name.includes('Google UK English Male')) ||
        voices.find((v) => v.name.includes('Male') && v.lang.startsWith('en')) ||
        voices.find((v) => v.name.includes('Daniel')) ||  // macOS deep male
        voices.find((v) => v.name.includes('David')) ||   // Windows male
        voices.find((v) => v.name.includes('James')) ||
        voices.find((v) => v.lang.startsWith('en') && v.name.toLowerCase().includes('male')) ||
        voices.find((v) => v.lang.startsWith('en'));
      if (preferredVoice) {
        currentUtterance.voice = preferredVoice;
      }

      currentUtterance.onstart = () => {
        isSpeaking = true;
      };

      currentUtterance.onend = () => {
        isSpeaking = false;
      };

      currentUtterance.onerror = (e) => {
        isSpeaking = false;
        console.warn('Speech error:', e);
      };

      // Chrome bug workaround: speech can get stuck, so we resume it
      speechSynth.resume();
      speechSynth.speak(currentUtterance);

      // Chrome bug: long texts can pause, keep it alive
      const keepAlive = setInterval(() => {
        if (!speechSynth.speaking) {
          clearInterval(keepAlive);
        } else {
          speechSynth.pause();
          speechSynth.resume();
        }
      }, 10000);

      currentUtterance.onend = () => {
        isSpeaking = false;
        speechFinished = true;  // Mark speech as complete
        clearInterval(keepAlive);
        // Check if we should hide the slide now
        checkHideSlide();
      };
    }, 100);
  }

  // Check if slide should be hidden (only after speech finishes and no active QR)
  function checkHideSlide() {
    if (speechFinished && activeId && !currentlySeesQR) {
      activeId = null;
      hideSlide();
    }
  }

  function stopSpeaking() {
    if (speechSynth.speaking) {
      speechSynth.cancel();
    }
    isSpeaking = false;
  }

  // Unlock speech synthesis (required for mobile browsers)
  function unlockSpeech() {
    // Create a silent utterance to unlock audio
    const unlock = new SpeechSynthesisUtterance('');
    unlock.volume = 0;
    speechSynth.speak(unlock);
    speechSynth.cancel();

    // Also try speaking a short word to fully prime it
    const prime = new SpeechSynthesisUtterance('.');
    prime.volume = 0.01;
    prime.rate = 10;
    speechSynth.speak(prime);
  }

  // Initialize avatar
  initAvatar();

  // Ensure voices are loaded
  let voicesLoaded = false;
  function loadVoices() {
    const voices = speechSynth.getVoices();
    if (voices.length > 0) {
      voicesLoaded = true;
    }
    return voices;
  }

  // Load voices immediately and on change
  loadVoices();
  if (speechSynth.onvoiceschanged !== undefined) {
    speechSynth.onvoiceschanged = loadVoices;
  }

  /* ---------- UI tuning vars ---------- */
  function setFooterHeightVar() {
    const h = footer?.offsetHeight || 28;
    document.documentElement.style.setProperty('--footer-h', `${h}px`);
  }
  function setOverlayLift() {
    const h = window.innerHeight;
    let lift = -4;
    if (h < 820) lift = -6;
    if (h < 740) lift = -8;
    if (h < 680) lift = -9.5;
    document.documentElement.style.setProperty('--overlay-lift', `${lift}vh`);
  }
  function setStrokeForDPR() {
    const dpr = window.devicePixelRatio || 1;
    const h1 = dpr >= 3 ? 0.6 : dpr >= 2 ? 0.7 : 0.8;
    const body = dpr >= 3 ? 0.45 : dpr >= 2 ? 0.55 : 0.6;
    document.documentElement.style.setProperty('--stroke-h1', `${h1}px`);
    document.documentElement.style.setProperty('--stroke-body', `${body}px`);
  }
  setFooterHeightVar();
  setOverlayLift();
  setStrokeForDPR();
  window.addEventListener('resize', () => {
    setFooterHeightVar();
    setOverlayLift();
  });
  window.addEventListener('orientationchange', () => {
    setFooterHeightVar();
    setOverlayLift();
    setStrokeForDPR();
  });

  /* ---------- Slide Content ---------- */
  const SLIDES = {
    'ID-1': {
      title: 'INVENTORY',
      def: 'Holding more inventory than is needed for production or customer orders. Raw materials, work-in-progress, or finished products.',
      desc: 'It results in higher storage costs, risk of obsolescence, and cash flow problems. It is often a consequence of overproduction, poor forecasting, or inefficient scheduling.',
      img: 'image1.png',
      alt: 'Inventory',
    },
    'ID-2': {
      title: 'TRANSPORTATION',
      def: 'Unnecessary movement of materials, products, or information between processes or locations.',
      desc: 'It includes any extra movement of items that does not add value to the product. Moving parts over long distances increases the risk of damage and adds to lead time.',
      img: 'image2.png',
      alt: 'Transportation',
    },
    'ID-3': {
      title: 'WAITING TIME',
      def: 'Time when people, equipment, materials or information are not in use, also called idle time.',
      desc: 'It occurs when workers or machines are forced to stand idle due to delays. This waste slows down production cycles and creates bottlenecks in the workflow.',
      img: 'image3.png',
      alt: 'Waiting Time',
    },
    'ID-4': {
      title: 'OVERPRODUCTION',
      def: 'Producing more than what is immediately needed by the final customer, the next process or producing earlier than necessary.',
      desc: 'It leads to excess inventory and ties up resources in unsold goods. It often occurs when companies operate on forecasts instead of actual demand.',
      img: 'image4.png',
      alt: 'Overproduction',
    },
    'ID-5': {
      title: 'MOVEMENT',
      def: 'Excessive or inefficient movement of people, equipment, or machinery within the production process.',
      desc: 'It includes walking long distances, reaching, bending, or stretching to retrieve tools or parts. This reduces worker efficiency and can lead to fatigue or injuries.',
      img: 'image5.png',
      alt: 'Movement',
    },
    'ID-6': {
      title: 'OVERPROCESSING',
      def: 'Performing more work or adding more features than the customer requires.',
      desc: 'Overprocessing involves unnecessary activities that do not enhance the product value from the customer perspective. This results in wasted time, resources, and labor.',
      img: 'image6.png',
      alt: 'Overprocessing',
    },
    'ID-7': {
      title: 'DEFECTS',
      def: 'Products or materials that do not meet quality standards, requiring rework, repairs, or disposal.',
      desc: 'Defects are costly because they lead to wasted materials, labor, and time. Rework consumes resources that could have been used for new production.',
      img: 'image7.png',
      alt: 'Defects',
    },
    'ID-8': {
      title: 'SKILLS NOT USED',
      def: 'The failure to fully utilize the skills, knowledge, and creativity of employees, along with the failure to leverage available data.',
      desc: 'This occurs when companies do not take advantage of the full potential of their workforce. Employees may not be involved in decision-making or process optimization.',
      img: 'image8.png',
      alt: 'Skills Not Used',
    },
  };

  /* ---------- Scanner core ---------- */
  const JSQR_TARGET_W = 480;
  const SCAN_MIN_INTERVAL = 60;

  let scanning = false,
    activeId = null,
    lastScanAt = 0;
  let currentlySeesQR = false;  // Track if QR is currently visible
  let streamRef = null,
    useBarcodeDetector = false,
    detector = null,
    rafId = null;
  let canvas = null,
    ctx = null;

  function updateStatus(message, isError = false) {
    if (scanResultP) scanResultP.textContent = message || '';
    if (scanResultDiv) scanResultDiv.classList.toggle('hidden', !isError);
  }

  // Build + mount a slide card
  function renderSlide(slide) {
    infoOverlay.innerHTML = `
      <div class="info-content">
        <div class="info-text">
          <h1 id="slide-title" class="outlined h1">${slide.title}</h1>
          <p class="outlined small"><span class="label">DEFINITION:</span> ${slide.def}</p>
          <p class="outlined small"><span class="label">DESCRIPTION:</span> ${slide.desc}</p>
        </div>
        <div class="info-image">
          <img id="slide-image" src="${slide.img}" alt="${slide.alt || slide.title}" />
        </div>
      </div>`;
    infoOverlay.classList.remove('hidden');
    infoOverlay.setAttribute('aria-hidden', 'false');

    // Avatar speaks the slide content
    speakSlideContent(slide);
  }

  function hideSlide() {
    infoOverlay.classList.add('hidden');
    infoOverlay.setAttribute('aria-hidden', 'true');
    infoOverlay.innerHTML = '';
    stopSpeaking();
  }

  // Only show overlay when a valid ID-x is detected.
  // Slide stays until speech finishes OR a new QR code is scanned.
  function registerDetection(text) {
    const slide = text ? SLIDES[text] : null;

    if (slide) {
      currentlySeesQR = true;

      // New QR code detected - switch to it immediately
      if (text !== activeId) {
        speechFinished = false;  // Reset speech tracking
        activeId = text;
        renderSlide(slide);
      }
      return;
    }

    // Unrecognized code? Only hide if not currently speaking
    if (text && !slide) {
      currentlySeesQR = false;
      if (speechFinished || !isSpeaking) {
        activeId = null;
        hideSlide();
      }
      return;
    }

    // No code in view - mark it, but don't hide until speech finishes
    currentlySeesQR = false;

    // If speech is done and QR is gone, hide the slide
    if (speechFinished && activeId) {
      activeId = null;
      hideSlide();
    }
  }

  async function ensureJsQR() {
    if (window.jsQR) return;
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('Failed to load jsQR'));
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
      } catch {
        useBarcodeDetector = false;
      }
    }
    if (useBarcodeDetector) detector = new window.BarcodeDetector({ formats: ['qr_code'] });
    else await ensureJsQR();
  }

  async function startCamera() {
    const constraints = {
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    };
    streamRef = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = streamRef;
    video.setAttribute('playsinline', 'true');
    await video.play();
    hideSlide();
  }

  function stopCamera() {
    if (rafId) cancelAnimationFrame(rafId);
    if (streamRef) {
      streamRef.getTracks().forEach((t) => t.stop());
      streamRef = null;
    }
    scanning = false;
    activeId = null;
    hideSlide();
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
            if (!canvas) {
              canvas = document.createElement('canvas');
              ctx = canvas.getContext('2d', { willReadFrequently: true });
            }
            const vw = video.videoWidth,
              vh = video.videoHeight;
            const scale = JSQR_TARGET_W / Math.max(1, vw);
            canvas.width = Math.floor(vw * scale);
            canvas.height = Math.floor(vh * scale);
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const id = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = window.jsQR(id.data, canvas.width, canvas.height, {
              inversionAttempts: 'dontInvert',
            });
            if (code && code.data) detectedText = code.data;
          }
        }
      } catch {}
    }

    registerDetection(detectedText);
    rafId = requestAnimationFrame(scanLoop);
  }

  async function startScanner() {
    try {
      if (!('mediaDevices' in navigator) || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API not supported in this browser.');
      }

      // Unlock speech synthesis on user interaction (required for mobile)
      unlockSpeech();

      loader.classList.remove('hidden');
      await startCamera();
      await setupDetector();

      scanning = true;
      startBtn.style.display = 'none';
      if (startLogo) startLogo.style.display = 'none';
      scanLoop();
    } catch (err) {
      const msg =
        err?.name === 'NotAllowedError'
          ? 'Camera access denied. Enable camera permissions and retry.'
          : err?.name === 'NotFoundError'
            ? 'No camera found on this device.'
            : location.protocol !== 'https:' && location.hostname !== 'localhost'
              ? 'This must be served over HTTPS or localhost for camera access.'
              : `Could not start camera: ${err?.message || err}`;
      updateStatus(msg, true);
    } finally {
      loader.classList.add('hidden');
    }
  }

  startBtn.addEventListener('click', startScanner);
  window.addEventListener('beforeunload', stopCamera);
});
