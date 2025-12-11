// AR slides for ID-1 … ID-8. Overlay is injected only on valid scan.
// Keeps slide on screen for 4s after last good read.
// Includes 3D avatar with speech synthesis.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

document.addEventListener('DOMContentLoaded', () => {
  // Clear all caches and storage on every page load
  try {
    sessionStorage.clear();
    localStorage.clear();
    // Clear speech synthesis queue
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  } catch (e) {
    console.log('Cache clear:', e);
  }

  const video = document.getElementById('video');

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

  // Lip sync variables
  let mouthTarget = 0;           // Target mouth openness (0-1)
  let currentMouthValue = 0;     // Current interpolated mouth value
  let currentSpeechText = '';    // Text currently being spoken
  let speechStartTime = 0;       // When speech started
  let speechDuration = 0;        // Estimated total speech duration
  let lipSyncActive = false;     // Whether text-based lip sync is active

  // Phoneme to mouth openness mapping (0 = closed, 1 = fully open)
  const PHONEME_MAP = {
    // Vowels - mouth open
    'a': 0.9, 'e': 0.7, 'i': 0.5, 'o': 0.85, 'u': 0.6,
    'A': 0.9, 'E': 0.7, 'I': 0.5, 'O': 0.85, 'U': 0.6,
    // Semi-open consonants
    'w': 0.5, 'y': 0.4, 'r': 0.4, 'l': 0.35,
    'W': 0.5, 'Y': 0.4, 'R': 0.4, 'L': 0.35,
    // Soft consonants
    'h': 0.3, 'm': 0.1, 'n': 0.2, 'f': 0.25, 'v': 0.25,
    'H': 0.3, 'M': 0.1, 'N': 0.2, 'F': 0.25, 'V': 0.25,
    's': 0.2, 'z': 0.2, 'j': 0.3, 'c': 0.2,
    'S': 0.2, 'Z': 0.2, 'J': 0.3, 'C': 0.2,
    // Hard consonants - brief open
    'b': 0.15, 'p': 0.15, 'd': 0.2, 't': 0.15, 'g': 0.25, 'k': 0.2,
    'B': 0.15, 'P': 0.15, 'D': 0.2, 'T': 0.15, 'G': 0.25, 'K': 0.2,
    // Other
    'x': 0.2, 'q': 0.3, 'X': 0.2, 'Q': 0.3,
    // Space/punctuation - mouth closes
    ' ': 0, '.': 0, ',': 0, '!': 0, '?': 0, ':': 0, ';': 0,
    '-': 0, '\n': 0
  };

  // Q&A Feature variables
  let isListening = false;
  let recognition = null;
  let currentSlideContext = null;  // Store current slide info for Q&A context
  let qaInProgress = false;        // Flag to prevent overlapping Q&A sessions
  let isMuted = false;             // Track mute state

  // Pre-defined Q&A answers for each waste type
  const QA_ANSWERS = {
    'INVENTORY': {
      what: "Inventory waste is when you have more materials or products than needed. This ties up money and space that could be used elsewhere.",
      why: "Inventory waste happens because of overproduction, poor demand forecasting, or fear of running out of stock. It creates hidden costs.",
      how: "You can reduce inventory waste by implementing just-in-time delivery, improving demand forecasting, and reducing batch sizes.",
      example: "An example of inventory waste is a warehouse full of parts that sit for months before being used, or products that expire before being sold.",
      problem: "Inventory waste causes storage costs, risk of damage or obsolescence, tied-up capital, and can hide other production problems.",
      default: "Inventory waste occurs when we hold more stock than necessary. It increases costs and can lead to obsolescence."
    },
    'TRANSPORTATION': {
      what: "Transportation waste is unnecessary movement of materials or products between locations that adds no value to the final product.",
      why: "Transportation waste happens due to poor facility layout, distant suppliers, or inefficient routing. Every move costs time and money.",
      how: "Reduce transportation waste by optimizing facility layout, sourcing locally, and organizing workstations to minimize material movement.",
      example: "An example is moving parts across the factory multiple times, or shipping products to a warehouse before sending to customers.",
      problem: "Transportation waste increases lead time, fuel costs, risk of damage, and delays delivery to customers.",
      default: "Transportation waste is the unnecessary movement of materials. It adds cost without adding value to the product."
    },
    'WAITING TIME': {
      what: "Waiting time waste is when people, machines, or materials are idle because the next step isn't ready.",
      why: "Waiting happens due to unbalanced workloads, equipment breakdowns, missing materials, or poor scheduling.",
      how: "Reduce waiting by balancing workloads, preventive maintenance, keeping materials ready, and improving communication between teams.",
      example: "Examples include workers waiting for parts to arrive, machines sitting idle between batches, or approvals that take too long.",
      problem: "Waiting waste reduces productivity, increases lead time, and means you're paying for time that produces nothing.",
      default: "Waiting time waste is idle time when nothing productive is happening. It slows down the entire process."
    },
    'OVERPRODUCTION': {
      what: "Overproduction is making more products than customers need, or making them too early before they're needed.",
      why: "Overproduction happens from producing to forecast instead of actual orders, or trying to keep machines always running.",
      how: "Reduce overproduction by using pull systems, producing to actual demand, and reducing batch sizes.",
      example: "An example is a factory making 1000 units when only 500 are ordered, creating excess inventory that may never sell.",
      problem: "Overproduction is considered the worst waste because it causes all other wastes: inventory, transportation, waiting, and more.",
      default: "Overproduction means making more than needed. It's the most serious waste because it triggers other wastes."
    },
    'MOVEMENT': {
      what: "Movement waste is unnecessary motion by workers, like walking, reaching, or bending that doesn't add value.",
      why: "Movement waste comes from poor workplace layout, tools stored far away, or disorganized work areas.",
      how: "Reduce movement by organizing tools within arm's reach, improving workstation layout, and applying 5S methodology.",
      example: "Examples include walking across the shop to get tools, bending to pick up parts from the floor, or searching for equipment.",
      problem: "Movement waste causes fatigue, injuries, slower work, and takes time away from value-adding activities.",
      default: "Movement waste is unnecessary physical motion by workers. It reduces efficiency and can cause injuries."
    },
    'OVERPROCESSING': {
      what: "Overprocessing is doing more work than the customer requires or is willing to pay for.",
      why: "Overprocessing happens when we don't understand customer needs, use wrong tools, or have unclear standards.",
      how: "Reduce overprocessing by understanding what customers truly value, using right-sized equipment, and simplifying processes.",
      example: "Examples include polishing surfaces that won't be seen, adding features nobody uses, or using expensive materials when cheaper ones work.",
      problem: "Overprocessing wastes time, materials, and effort on things that don't increase product value for customers.",
      default: "Overprocessing means doing more work than necessary. It wastes resources on things customers don't need."
    },
    'DEFECTS': {
      what: "Defects are products or work that don't meet quality standards and need to be fixed, reworked, or scrapped.",
      why: "Defects happen from poor training, unclear instructions, inadequate tools, or lack of quality checks.",
      how: "Reduce defects by training workers, standardizing processes, adding quality checks, and fixing root causes.",
      example: "Examples include products that fail inspection, typos in documents, software bugs, or parts that don't fit properly.",
      problem: "Defects waste materials, require extra labor to fix, delay delivery, and can damage customer relationships.",
      default: "Defects are mistakes that require rework or scrapping. They waste time, materials, and hurt customer satisfaction."
    },
    'SKILLS NOT USED': {
      what: "Skills not used means failing to utilize the talents, knowledge, and creativity of your employees.",
      why: "This waste happens when management doesn't listen to workers, or people are assigned to jobs that don't match their skills.",
      how: "Use employee skills by encouraging suggestions, involving workers in problem-solving, and matching people to appropriate roles.",
      example: "Examples include ignoring improvement ideas from workers, not training people, or having engineers do simple data entry.",
      problem: "Not using skills leads to disengaged workers, missed improvement opportunities, and higher turnover.",
      default: "Skills not used means wasting human potential. When we don't tap into employee knowledge, everyone loses."
    }
  };

  // Get answer based on question keywords
  function getGenericAnswer(question, slideContext) {
    const q = question.toLowerCase();
    const answers = QA_ANSWERS[slideContext.title] || QA_ANSWERS['INVENTORY'];

    // Check for keywords in question
    if (q.includes('what') || q.includes('define') || q.includes('mean')) {
      return answers.what;
    } else if (q.includes('why') || q.includes('cause') || q.includes('reason')) {
      return answers.why;
    } else if (q.includes('how') || q.includes('reduce') || q.includes('fix') || q.includes('solve') || q.includes('prevent')) {
      return answers.how;
    } else if (q.includes('example') || q.includes('instance') || q.includes('like what')) {
      return answers.example;
    } else if (q.includes('problem') || q.includes('issue') || q.includes('bad') || q.includes('effect') || q.includes('impact')) {
      return answers.problem;
    } else {
      return answers.default;
    }
  }

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

    // Mouth movement - text-based lip sync
    if (isSpeaking && lipSyncActive && currentSpeechText) {
      // Subtle head movement while speaking (more natural)
      avatarModel.rotation.y = Math.sin(time * 0.8) * 0.04;
      avatarModel.rotation.x = Math.sin(time * 1.2) * 0.015;

      // Calculate current position in text based on elapsed time
      const elapsed = now - speechStartTime;
      const progress = Math.min(elapsed / speechDuration, 1);
      const charIndex = Math.floor(progress * currentSpeechText.length);

      // Get current character and its mouth shape
      const currentChar = currentSpeechText[charIndex] || ' ';
      const targetOpenness = PHONEME_MAP[currentChar] !== undefined ? PHONEME_MAP[currentChar] : 0.3;

      // Look ahead for smoother transitions
      const nextChar = currentSpeechText[charIndex + 1] || ' ';
      const nextOpenness = PHONEME_MAP[nextChar] !== undefined ? PHONEME_MAP[nextChar] : 0;

      // Blend current and next for smooth transition
      const charProgress = (progress * currentSpeechText.length) % 1;
      mouthTarget = targetOpenness * (1 - charProgress * 0.3) + nextOpenness * (charProgress * 0.3);

      // Smooth interpolation - different speeds for opening vs closing
      const lerpSpeed = mouthTarget > currentMouthValue ? 0.35 : 0.2;
      currentMouthValue = THREE.MathUtils.lerp(currentMouthValue, mouthTarget, lerpSpeed);

      // Clamp to valid range
      currentMouthValue = Math.max(0, Math.min(1, currentMouthValue));

      mouthParts.forEach((part) => {
        part.mesh.morphTargetInfluences[part.index] = currentMouthValue;
      });
    } else if (isSpeaking) {
      // Fallback if lip sync not active - subtle movement
      avatarModel.rotation.y = Math.sin(time * 0.8) * 0.04;
      avatarModel.rotation.x = Math.sin(time * 1.2) * 0.015;
      mouthTarget = 0.3 + Math.sin(time * 8) * 0.2;
      currentMouthValue = THREE.MathUtils.lerp(currentMouthValue, mouthTarget, 0.3);
      mouthParts.forEach((part) => {
        part.mesh.morphTargetInfluences[part.index] = currentMouthValue;
      });
    } else {
      // Not speaking - smoothly close mouth and reset head
      avatarModel.rotation.y = THREE.MathUtils.lerp(avatarModel.rotation.y, 0, 0.05);
      avatarModel.rotation.x = THREE.MathUtils.lerp(avatarModel.rotation.x, 0, 0.05);

      mouthTarget = 0;
      currentMouthValue = THREE.MathUtils.lerp(currentMouthValue, 0, 0.15);

      mouthParts.forEach((part) => {
        part.mesh.morphTargetInfluences[part.index] = currentMouthValue;
      });
    }

    avatarRenderer.render(avatarScene, avatarCamera);
  }

  // Start text-based lip sync
  function startTextLipSync(text, rate = 0.85) {
    currentSpeechText = text;
    speechStartTime = Date.now();
    // Estimate duration: ~80ms per character at rate 1.0, adjusted for speech rate
    // Also account for pauses at punctuation
    const pauseChars = (text.match(/[.,!?;:]/g) || []).length;
    const baseTime = text.length * 75; // 75ms per char
    const pauseTime = pauseChars * 300; // 300ms per punctuation pause
    speechDuration = (baseTime + pauseTime) / rate;
    lipSyncActive = true;
  }

  // Stop text-based lip sync
  function stopTextLipSync() {
    lipSyncActive = false;
    currentSpeechText = '';
    speechStartTime = 0;
    speechDuration = 0;
  }

  // Speech synthesis function
  function speakSlideContent(slide) {
    // Don't speak if muted
    if (isMuted) {
      speechFinished = true;
      return;
    }

    // Cancel any ongoing speech
    if (speechSynth.speaking) {
      speechSynth.cancel();
    }

    // Small delay to ensure cancel completes
    setTimeout(() => {
      // Build the speech text with natural pauses
      const textToSpeak = `${slide.title}... Definition: ${slide.def}... Description: ${slide.desc}`;

      currentUtterance = new SpeechSynthesisUtterance(textToSpeak);
      currentUtterance.rate = 0.85;   // Slower for more natural, clear speech
      currentUtterance.pitch = 1.05;  // Slightly higher for clarity
      currentUtterance.volume = 1.0;

      // Get a natural English voice (prefer high-quality voices)
      const voices = speechSynth.getVoices();
      const preferredVoice =
        voices.find((v) => v.name.includes('Google UK English Male')) ||
        voices.find((v) => v.name.includes('Microsoft David')) ||
        voices.find((v) => v.name.includes('Daniel')) ||
        voices.find((v) => v.name.includes('James')) ||
        voices.find((v) => v.name.includes('Male') && v.lang.startsWith('en')) ||
        voices.find((v) => v.lang.startsWith('en-GB')) ||
        voices.find((v) => v.lang.startsWith('en'));
      if (preferredVoice) {
        currentUtterance.voice = preferredVoice;
      }

      currentUtterance.onstart = () => {
        isSpeaking = true;
        startTextLipSync(textToSpeak, 0.85); // Start text-based lip sync
      };

      currentUtterance.onend = () => {
        isSpeaking = false;
        stopTextLipSync();
      };

      currentUtterance.onerror = (e) => {
        isSpeaking = false;
        stopTextLipSync();
        console.warn('Speech error:', e);
      };

      speechSynth.resume();
      speechSynth.speak(currentUtterance);

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
        stopTextLipSync();
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
    stopTextLipSync();
  }

  // Unlock speech synthesis (required for mobile browsers)
  function unlockSpeech() {
    // Create a silent utterance to unlock audio
    const unlock = new SpeechSynthesisUtterance('');
    unlock.volume = 0;
    speechSynth.speak(unlock);
    speechSynth.cancel();
  }

  // Greeting when scanner starts
  function speakGreeting() {
    const greetingText = "Hello!... Welcome to Scan AR... Let's find the 8 types of waste together!... Please go to Station 1, Inventory, so we can begin... Scan the QR code.";

    // Display text in story container (clean version without pauses)
    const displayText = `<p>Hello! Welcome to Scan AR.</p>
      <p>Let's find the 8 types of waste together!</p>
      <p>Please go to <strong>Station 1 "Inventory"</strong> so we can begin. Scan the QR code.</p>`;

    showStoryContent('SCAN AR', displayText, false, null);

    // Don't speak if muted, just hide after delay
    if (isMuted) {
      setTimeout(() => {
        hideStoryContent();
      }, 5000);
      return;
    }

    const greeting = new SpeechSynthesisUtterance(greetingText);
    greeting.rate = 0.85;   // Slower for more natural, clear speech
    greeting.pitch = 1.05;  // Slightly higher for clarity
    greeting.volume = 1.0;

    // Get a natural English voice (prefer high-quality voices)
    const voices = speechSynth.getVoices();
    const preferredVoice =
      voices.find((v) => v.name.includes('Google UK English Male')) ||
      voices.find((v) => v.name.includes('Microsoft David')) ||
      voices.find((v) => v.name.includes('Daniel')) ||
      voices.find((v) => v.name.includes('James')) ||
      voices.find((v) => v.name.includes('Male') && v.lang.startsWith('en')) ||
      voices.find((v) => v.lang.startsWith('en-GB')) ||
      voices.find((v) => v.lang.startsWith('en'));
    if (preferredVoice) {
      greeting.voice = preferredVoice;
    }

    greeting.onstart = () => {
      isSpeaking = true;
      startTextLipSync(greetingText, 0.85);
    };

    greeting.onend = () => {
      isSpeaking = false;
      stopTextLipSync();
      // Hide story container after speech ends
      hideStoryContent();
    };

    speechSynth.resume();
    speechSynth.speak(greeting);
  }

  // Generic speak function for Q&A responses (with lip sync)
  function speakText(text, onComplete = null) {
    // Don't speak if muted
    if (isMuted) {
      if (onComplete) onComplete();
      return;
    }

    if (speechSynth.speaking) {
      speechSynth.cancel();
    }

    setTimeout(() => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.85;
      utterance.pitch = 1.05;
      utterance.volume = 1.0;

      const voices = speechSynth.getVoices();
      const preferredVoice =
        voices.find((v) => v.name.includes('Google UK English Male')) ||
        voices.find((v) => v.name.includes('Microsoft David')) ||
        voices.find((v) => v.name.includes('Daniel')) ||
        voices.find((v) => v.name.includes('James')) ||
        voices.find((v) => v.name.includes('Male') && v.lang.startsWith('en')) ||
        voices.find((v) => v.lang.startsWith('en-GB')) ||
        voices.find((v) => v.lang.startsWith('en'));
      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }

      utterance.onstart = () => {
        isSpeaking = true;
        startTextLipSync(text, 0.85);
      };

      utterance.onend = () => {
        isSpeaking = false;
        stopTextLipSync();
        if (onComplete) onComplete();
      };

      utterance.onerror = () => {
        isSpeaking = false;
        stopTextLipSync();
        if (onComplete) onComplete();
      };

      speechSynth.resume();
      speechSynth.speak(utterance);
    }, 100);
  }

  // Detect iPad specifically (speech recognition is unreliable on iPad Safari)
  function isIPad() {
    // Check for iPad in user agent
    if (/iPad/.test(navigator.userAgent)) {
      return true;
    }
    // Modern iPads report as Mac with touch support
    if (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent)) {
      // Check screen size to differentiate from MacBooks with touchbar
      const isTabletSize = window.screen.width >= 768 && window.screen.width <= 1366;
      return isTabletSize;
    }
    return false;
  }

  // Initialize speech recognition - always create fresh instance
  function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('Speech recognition not supported');
      return null;
    }

    // Stop any existing recognition
    if (recognition) {
      try {
        recognition.abort();
      } catch (e) {
        // Ignore
      }
    }

    // Create fresh instance
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true; // Enable interim results for better feedback
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    return recognition;
  }

  // Show text input modal for typing question (fallback for iOS)
  function showTextInputModal() {
    // Remove existing modal if any
    const existingModal = document.getElementById('qa-text-modal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.id = 'qa-text-modal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.7);
      z-index: 100;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      box-sizing: border-box;
    `;

    modal.innerHTML = `
      <div style="
        background: linear-gradient(145deg, #fef9e7, #fcf3c9);
        border-radius: 20px;
        padding: 24px;
        max-width: 400px;
        width: 100%;
        box-shadow: 0 10px 40px rgba(0,0,0,0.5);
      ">
        <h3 style="margin: 0 0 16px; color: #1b5e20; font-size: 1.2rem; text-align: center;">
          Ask about ${currentSlideContext?.title || 'this topic'}
        </h3>
        <input type="text" id="qa-text-input" placeholder="Type your question here..."
          style="
            width: 100%;
            padding: 14px;
            font-size: 16px;
            border: 2px solid #c9a227;
            border-radius: 12px;
            margin-bottom: 16px;
            box-sizing: border-box;
          "
        />
        <div style="display: flex; gap: 12px;">
          <button id="qa-cancel-btn" style="
            flex: 1;
            padding: 12px;
            background: #ccc;
            border: none;
            border-radius: 12px;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
          ">Cancel</button>
          <button id="qa-submit-btn" style="
            flex: 1;
            padding: 12px;
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
            border: none;
            border-radius: 12px;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
          ">Ask</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const input = document.getElementById('qa-text-input');
    const submitBtn = document.getElementById('qa-submit-btn');
    const cancelBtn = document.getElementById('qa-cancel-btn');

    // Focus input
    setTimeout(() => input.focus(), 100);

    // Handle submit
    const handleSubmit = () => {
      const question = input.value.trim();
      modal.remove();
      if (question && currentSlideContext) {
        // Cancel any ongoing speech before answering
        if (speechSynth.speaking) {
          speechSynth.cancel();
        }
        const answer = getGenericAnswer(question, currentSlideContext);
        speakText(answer, () => {
          resetAskButton();
        });
      } else {
        resetAskButton();
      }
    };

    submitBtn.addEventListener('click', handleSubmit);
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') handleSubmit();
    });

    cancelBtn.addEventListener('click', () => {
      modal.remove();
      qaInProgress = false;
      resetAskButton();
    });

    // Close on background click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
        qaInProgress = false;
        resetAskButton();
      }
    });
  }

  // Cancel any ongoing Q&A operations
  function cancelOngoingQA() {
    // Stop any ongoing speech
    if (speechSynth.speaking) {
      speechSynth.cancel();
    }
    isSpeaking = false;
    stopTextLipSync();

    // Stop any ongoing recognition
    if (recognition) {
      try {
        recognition.abort();
      } catch (e) {}
    }
    isListening = false;

    // Clear timeout
    if (recognitionTimeout) {
      clearTimeout(recognitionTimeout);
      recognitionTimeout = null;
    }
  }

  // Start Q&A flow
  function startQAFlow() {
    if (!currentSlideContext) {
      console.log('No slide context for Q&A');
      return;
    }

    // If Q&A is already in progress, cancel it and start fresh
    if (qaInProgress) {
      console.log('Cancelling ongoing Q&A to start new one');
      cancelOngoingQA();
    }

    qaInProgress = true;
    const askBtn = document.getElementById('ask-question-btn');

    // Check if iPad - use text input directly (speech recognition is unreliable on iPad Safari)
    if (isIPad()) {
      if (askBtn) {
        askBtn.textContent = 'Type your question...';
        askBtn.disabled = true;
      }
      showTextInputModal();
      return;
    }

    // Non-iOS: use voice recognition
    if (askBtn) {
      askBtn.textContent = 'Listening...';
      askBtn.disabled = true;
    }

    // Avatar asks what question the user has
    const prompt = `What questions do you have regarding ${currentSlideContext.title}?`;
    speakText(prompt, () => {
      // Check if we were cancelled during speech
      if (!qaInProgress) return;

      // Small delay then start listening
      setTimeout(() => {
        if (qaInProgress) {
          startListening();
        }
      }, 300);
    });
  }

  // Timeout for recognition
  let recognitionTimeout = null;

  // Start listening for user's question
  function startListening() {
    // Always create fresh recognition instance
    recognition = initSpeechRecognition();

    if (!recognition) {
      speakText("Sorry, speech recognition is not supported in your browser. Please try a different browser.", () => {
        resetAskButton();
      });
      return;
    }

    isListening = true;

    // Clear any existing timeout
    if (recognitionTimeout) {
      clearTimeout(recognitionTimeout);
    }

    // Set timeout - if no response in 10 seconds, reset
    recognitionTimeout = setTimeout(() => {
      if (isListening) {
        console.log('Recognition timeout');
        try {
          recognition.abort();
        } catch (e) {}
        isListening = false;
        speakText("I didn't hear a question. Please tap the button to try again.", () => {
          resetAskButton();
        });
      }
    }, 10000);

    recognition.onresult = (event) => {
      clearTimeout(recognitionTimeout);
      const question = event.results[0][0].transcript;
      console.log('User asked:', question);
      isListening = false;

      // Get instant answer based on keywords
      const answer = getGenericAnswer(question, currentSlideContext);

      // Speak the answer immediately
      speakText(answer, () => {
        resetAskButton();
      });
    };

    recognition.onerror = (event) => {
      clearTimeout(recognitionTimeout);
      console.error('Speech recognition error:', event.error);
      isListening = false;

      if (event.error === 'no-speech') {
        speakText("I didn't hear anything. Please tap the button and try again.", () => {
          resetAskButton();
        });
      } else if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        speakText("Microphone access was denied. Please enable microphone permissions.", () => {
          resetAskButton();
        });
      } else {
        speakText("Sorry, there was an error. Please try again.", () => {
          resetAskButton();
        });
      }
    };

    recognition.onend = () => {
      clearTimeout(recognitionTimeout);
      if (isListening) {
        isListening = false;
        resetAskButton();
      }
    };

    try {
      recognition.start();
      console.log('Recognition started');
    } catch (e) {
      console.error('Recognition start error:', e);
      clearTimeout(recognitionTimeout);
      isListening = false;
      speakText("Could not start voice recognition. Please try again.", () => {
        resetAskButton();
      });
    }
  }

  // Reset the ask button to original state
  function resetAskButton() {
    // Clear any pending timeouts
    if (recognitionTimeout) {
      clearTimeout(recognitionTimeout);
      recognitionTimeout = null;
    }

    // Stop any ongoing recognition
    if (recognition && isListening) {
      try {
        recognition.abort();
      } catch (e) {}
    }
    isListening = false;
    qaInProgress = false;  // Mark Q&A as complete

    const askBtn = document.getElementById('ask-question-btn');
    if (askBtn) {
      askBtn.textContent = 'Ask me any question';
      askBtn.disabled = false;
    }
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

  // Show content in story container
  function showStoryContent(header, content, showAskBtn = false, imageUrl = null) {
    const storyContainer = document.getElementById('story-container');
    const storyHeader = document.getElementById('story-header');
    const storyText = document.getElementById('story-text');
    const askBtn = document.getElementById('ask-question-btn');
    const imageContainer = document.getElementById('slide-image-container');
    const slideImage = document.getElementById('slide-image');

    if (storyHeader) storyHeader.textContent = header;
    if (storyText) storyText.innerHTML = content;
    if (storyContainer) storyContainer.classList.remove('hidden');

    // Show/hide ask button
    if (askBtn) {
      if (showAskBtn) {
        askBtn.classList.remove('hidden');
        askBtn.textContent = 'Ask me any question';
        askBtn.disabled = false;
      } else {
        askBtn.classList.add('hidden');
      }
    }

    // Show/hide image
    if (imageContainer && slideImage) {
      if (imageUrl) {
        slideImage.src = imageUrl;
        slideImage.alt = header;
        imageContainer.classList.remove('hidden');
      } else {
        imageContainer.classList.add('hidden');
      }
    }
  }

  // Hide story container
  function hideStoryContent() {
    const storyContainer = document.getElementById('story-container');
    const imageContainer = document.getElementById('slide-image-container');
    const askBtn = document.getElementById('ask-question-btn');

    if (storyContainer) storyContainer.classList.add('hidden');
    if (imageContainer) imageContainer.classList.add('hidden');
    if (askBtn) askBtn.classList.add('hidden');
  }

  // Build + mount a slide card
  function renderSlide(slide) {
    // Store current slide context for Q&A
    currentSlideContext = slide;

    // Build content HTML
    const contentHTML = `
      <p><span class="label">Definition:</span> ${slide.def}</p>
      <p><span class="label">Description:</span> ${slide.desc}</p>
    `;

    // Show in story container
    showStoryContent(slide.title, contentHTML, true, slide.img);

    // Setup ask button click handler
    const askBtn = document.getElementById('ask-question-btn');
    if (askBtn) {
      // Remove old listeners by cloning
      const newBtn = askBtn.cloneNode(true);
      askBtn.parentNode.replaceChild(newBtn, askBtn);
      newBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        startQAFlow();
      });
    }

    // Avatar speaks the slide content
    speakSlideContent(slide);
  }

  function hideSlide() {
    hideStoryContent();
    stopSpeaking();
    currentSlideContext = null;
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

      // Avatar greets after 5 seconds (after camera is ready)
      setTimeout(() => {
        speakGreeting();
      }, 1000);

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

  // ---------- Mute Button Functionality ----------
  const muteBtn = document.getElementById('mute-btn');
  const muteIconOn = document.getElementById('mute-icon-on');
  const muteIconOff = document.getElementById('mute-icon-off');

  if (muteBtn) {
    muteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      isMuted = !isMuted;

      if (isMuted) {
        // Mute: stop current speech and prevent future speech
        if (speechSynth.speaking) {
          speechSynth.cancel();
        }
        isSpeaking = false;
        stopTextLipSync();
        muteBtn.classList.add('muted');
        muteIconOn.classList.add('hidden');
        muteIconOff.classList.remove('hidden');
      } else {
        // Unmute
        muteBtn.classList.remove('muted');
        muteIconOn.classList.remove('hidden');
        muteIconOff.classList.add('hidden');
      }
    });
  }

  // ---------- Fullscreen Image Functionality ----------
  const slideImage = document.getElementById('slide-image');
  const fullscreenOverlay = document.getElementById('fullscreen-image-overlay');
  const fullscreenImage = document.getElementById('fullscreen-image');
  const closeFullscreenBtn = document.getElementById('close-fullscreen-btn');

  // Function to open fullscreen
  function openFullscreen() {
    if (slideImage.src && fullscreenOverlay && fullscreenImage) {
      fullscreenImage.src = slideImage.src;
      fullscreenImage.alt = slideImage.alt;
      fullscreenOverlay.classList.remove('hidden');
      // Hide avatar during fullscreen
      if (avatarContainer) avatarContainer.style.display = 'none';
    }
  }

  // Function to close fullscreen
  function closeFullscreen() {
    if (fullscreenOverlay) {
      fullscreenOverlay.classList.add('hidden');
      // Show avatar again
      if (avatarContainer) avatarContainer.style.display = '';
    }
  }

  if (slideImage) {
    slideImage.addEventListener('click', (e) => {
      e.stopPropagation();
      openFullscreen();
    });
  }

  if (closeFullscreenBtn) {
    closeFullscreenBtn.addEventListener('click', closeFullscreen);
  }

  if (fullscreenOverlay) {
    // Close on background click
    fullscreenOverlay.addEventListener('click', (e) => {
      if (e.target === fullscreenOverlay) {
        closeFullscreen();
      }
    });
  }
});
