document.addEventListener('DOMContentLoaded', () => {
    const modelContainer = document.getElementById('model-container');
    const scanResultP = document.querySelector('#scan-result p');
    const scanResultDiv = document.getElementById('scan-result');
    const loader = document.getElementById('loader');
    let html5QrCode;
    let lastScannedId = null;

    // --- NEW: Function to update the status message on screen ---
    function updateStatus(message, isError = false) {
        scanResultP.textContent = message;
        if (isError) {
            scanResultDiv.style.backgroundColor = '#FFD2D2'; // Light red
            scanResultDiv.style.color = '#D8000C'; // Dark red
        } else {
            scanResultDiv.style.backgroundColor = '#e9ecef';
            scanResultDiv.style.color = '#333';
        }
    }

    const modelMapping = {
        "ID-1": { url: 'https://cdn.glitch.global/b129b07a-2647-411a-a89c-852b76a66601/astronaut.glb?v=1680320790145', scale: '0.8 0.8 0.8', animation: 'property: rotation; to: 0 360 0; loop: true; dur: 15000; easing: linear;', name: 'Astronaut' },
        "ID-2": { url: 'https://cdn.glitch.global/b129b07a-2647-411a-a89c-852b76a66601/duck.glb?v=1680320791438', scale: '0.01 0.01 0.01', animation: 'property: position; to: 0 0.2 0; dir: alternate; loop: true; dur: 2000;', name: 'Rubber Duck' },
        "ID-3": { url: 'https://cdn.glitch.global/e733880b-402a-414a-8533-9118534f3b57/robot_expressive.glb?v=1680320796328', scale: '0.5 0.5 0.5', animation: 'property: rotation; to: 0 -360 0; loop: true; dur: 10000;', name: 'Expressive Robot' },
        "ID-4": { url: 'https://cdn.glitch.global/e733880b-402a-414a-8533-9118534f3b57/helmet.glb?v=1680320793139', scale: '1.2 1.2 1.2', animation: 'property: rotation; to: 360 360 0; loop: true; dur: 20000;', name: 'Sci-Fi Helmet' }
    };

    function onScanSuccess(decodedText) {
        if (decodedText !== lastScannedId) {
            lastScannedId = decodedText;
            const modelData = modelMapping[decodedText];
            if (modelData) {
                updateStatus(`Success! Loading ${modelData.name}...`);
                loader.classList.remove('hidden');
                displayModel(modelData);
            } else {
                updateStatus(`QR Code "${decodedText}" is not recognized.`);
                hideModel();
            }
        }
    }

    function onScanFailure(error) {
        if (lastScannedId) {
            updateStatus('No QR Code in view. Ready to scan...');
            hideModel();
            lastScannedId = null;
        }
    }

    function displayModel(modelData) {
        modelContainer.style.display = 'block';
        modelContainer.innerHTML = `
            <a-scene embedded vr-mode-ui="enabled: false" renderer="alpha: true; antialias: true;">
                <a-assets><a-asset-item id="model" src="${modelData.url}"></a-asset-item></a-assets>
                <a-entity id="model-entity" gltf-model="#model" scale="${modelData.scale}" position="0 0 -2.5" animation="${modelData.animation}"></a-entity>
                <a-light type="ambient" color="#FFF" intensity="0.7"></a-light>
                <a-light type="directional" color="#FFF" intensity="0.5" position="-1 1 2"></a-light>
                <a-sky color="transparent" opacity="0"></a-sky>
                <a-camera position="0 0.5 2" look-controls="enabled: true" wasd-controls-enabled="false" mouse-cursor></a-camera>
            </a-scene>
        `;
        const modelEntity = document.querySelector('#model-entity');
        modelEntity.addEventListener('model-loaded', () => loader.classList.add('hidden'));
    }

    function hideModel() {
        modelContainer.style.display = 'none';
        modelContainer.innerHTML = '';
        loader.classList.add('hidden');
    }

    // --- Main Function to Start the Scanner ---
    async function startScanner() {
        updateStatus("Initializing scanner...");
        html5QrCode = new Html5Qrcode("qr-reader");

        try {
            // Check for available cameras first
            const cameras = await Html5Qrcode.getCameras();
            if (!cameras || cameras.length === 0) {
                throw new Error("No cameras found on this device.");
            }

            const qrboxFunction = (w, h) => ({ width: Math.floor(Math.min(w, h) * 0.7), height: Math.floor(Math.min(w, h) * 0.7) });
            const config = { fps: 10, qrbox: qrboxFunction };

            updateStatus("Starting camera... Please grant permission.");
            
            await html5QrCode.start({ facingMode: "environment" }, config, onScanSuccess, onScanFailure);
            
            updateStatus("Ready to scan...");

        } catch (err) {
            console.error("Camera initialization failed:", err);
            // Provide specific error messages to the user
            if (err.name === 'NotAllowedError') {
                updateStatus("Error: Camera access was denied. Please enable camera permissions in your browser settings and refresh.", true);
            } else if (err.name === 'NotFoundError') {
                updateStatus("Error: No camera was found on this device.", true);
            } else {
                updateStatus(`Error: Could not start camera. ${err.message}`, true);
            }
        }
    }

    // Run the main function
    startScanner();
});