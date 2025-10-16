document.addEventListener('DOMContentLoaded', () => {
    const qrReaderElement = document.getElementById('qr-reader');
    const modelContainer = document.getElementById('model-container');
    const scanResultElement = document.querySelector('#scan-result p');
    const loader = document.getElementById('loader'); // Get the loader element
    let html5QrCode;
    let lastScannedId = null;

    // Model mapping is the same
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
                scanResultElement.textContent = `QR Found: Loading ${modelData.name}...`;
                loader.classList.remove('hidden'); // Show loader
                displayModel(modelData);
            } else {
                scanResultElement.textContent = `QR Code "${decodedText}" not recognized.`;
                hideModel();
            }
        }
    }

    function onScanFailure(error) {
        if (lastScannedId) {
            scanResultElement.textContent = 'No QR Code in view. Ready to scan...';
            hideModel();
            lastScannedId = null;
        }
    }

    function displayModel(modelData) {
        modelContainer.style.display = 'block';
        modelContainer.innerHTML = `
            <a-scene embedded vr-mode-ui="enabled: false" renderer="alpha: true; antialias: true;">
                <a-assets>
                    <a-asset-item id="model" src="${modelData.url}"></a-asset-item>
                </a-assets>

                <a-entity id="model-entity" gltf-model="#model" scale="${modelData.scale}" position="0 0 -2.5" animation="${modelData.animation}"></a-entity>

                <a-light type="ambient" color="#FFF" intensity="0.7"></a-light>
                <a-light type="directional" color="#FFF" intensity="0.5" position="-1 1 2"></a-light>

                <a-sky color="transparent" opacity="0"></a-sky>

                <!-- UPGRADED CAMERA: look-controls allows drag-to-rotate. Position is pulled back slightly. -->
                <a-camera position="0 0.5 2" look-controls-enabled="true" wasd-controls-enabled="false" mouse-cursor=""></a-camera>
            </a-scene>
        `;

        // Listen for the model-loaded event
        const modelEntity = document.querySelector('#model-entity');
        modelEntity.addEventListener('model-loaded', () => {
            loader.classList.add('hidden'); // Hide loader when model is ready
        });
    }

    function hideModel() {
        modelContainer.style.display = 'none';
        modelContainer.innerHTML = '';
        loader.classList.add('hidden'); // Also hide loader when model is hidden
    }

    // --- Initialize the Scanner (Using responsive settings) ---
    html5QrCode = new Html5QrCode("qr-reader");
    const qrboxFunction = (viewfinderWidth, viewfinderHeight) => {
        let minEdgeSize = Math.min(viewfinderWidth, viewfinderHeight);
        let qrboxSize = Math.floor(minEdgeSize * 0.7);
        return { width: qrboxSize, height: qrboxSize };
    };
    const config = { fps: 10, qrbox: qrboxFunction };

    html5QrCode.start({ facingMode: "environment" }, config, onScanSuccess, onScanFailure)
        .catch(err => {
            console.error("Camera initialization failed.", err);
            scanResultElement.textContent = "Error: Could not start camera.";
        });
});