document.addEventListener('DOMContentLoaded', () => {
    const qrReaderElement = document.getElementById('qr-reader');
    const modelContainer = document.getElementById('model-container');
    const scanResultElement = document.querySelector('#scan-result p');
    let html5QrCode;
    let lastScannedId = null; // To prevent re-rendering the same model

    // --- Model Mapping for Your QR Codes ---
    // Each ID corresponds to a different 3D object.
    const modelMapping = {
        "ID-1": {
            url: 'https://cdn.glitch.global/b129b07a-2647-411a-a89c-852b76a66601/astronaut.glb?v=1680320790145',
            scale: '0.8 0.8 0.8',
            animation: 'property: rotation; to: 0 360 0; loop: true; dur: 15000; easing: linear;',
            name: 'Astronaut'
        },
        "ID-2": {
            url: 'https://cdn.glitch.global/b129b07a-2647-411a-a89c-852b76a66601/duck.glb?v=1680320791438',
            scale: '0.01 0.01 0.01',
            animation: 'property: position; to: 0 0.2 0; dir: alternate; loop: true; dur: 2000;',
            name: 'Rubber Duck'
        },
        "ID-3": {
            url: 'https://cdn.glitch.global/e733880b-402a-414a-8533-9118534f3b57/robot_expressive.glb?v=1680320796328',
            scale: '0.5 0.5 0.5',
            animation: 'property: rotation; to: 0 -360 0; loop: true; dur: 10000;',
            name: 'Expressive Robot'
        },
        "ID-4": {
            url: 'https://cdn.glitch.global/e733880b-402a-414a-8533-9118534f3b57/helmet.glb?v=1680320793139',
            scale: '1.2 1.2 1.2',
            animation: 'property: rotation; to: 360 360 0; loop: true; dur: 20000;',
            name: 'Sci-Fi Helmet'
        }
        // You can add more IDs here, like "ID-5", etc.
    };

    function onScanSuccess(decodedText) {
        // Only act if the scanned ID is new
        if (decodedText !== lastScannedId) {
            lastScannedId = decodedText;
            const modelData = modelMapping[decodedText];

            if (modelData) {
                scanResultElement.textContent = `QR Code Found: ${decodedText} - Loading ${modelData.name}...`;
                displayModel(modelData);
            } else {
                scanResultElement.textContent = `QR Code "${decodedText}" not recognized.`;
                hideModel();
            }
        }
    }

    function onScanFailure(error) {
        // This function is called frequently when no QR code is in view.
        // We can use this to hide the model when the QR code is lost.
        if (lastScannedId) {
            scanResultElement.textContent = 'No QR Code in view. Ready to scan...';
            hideModel();
            lastScannedId = null; // Reset so we can scan again
        }
    }

    function displayModel(modelData) {
        modelContainer.style.display = 'block';
        // Create the A-Frame scene dynamically
        modelContainer.innerHTML = `
            <a-scene embedded vr-mode-ui="enabled: false" renderer="alpha: true; antialias: true;">
                <a-assets>
                    <a-asset-item id="model" src="${modelData.url}"></a-asset-item>
                </a-assets>

                <!-- 3D Model Entity -->
                <a-entity
                    gltf-model="#model"
                    scale="${modelData.scale}"
                    position="0 0 -2.5"
                    animation="${modelData.animation}">
                </a-entity>

                <!-- Lighting -->
                <a-light type="ambient" color="#FFF" intensity="0.7"></a-light>
                <a-light type="directional" color="#FFF" intensity="0.5" position="-1 1 2"></a-light>

                <!-- Transparent background to see the video -->
                <a-sky color="transparent" opacity="0"></a-sky>
                <a-camera position="0 0 0" look-controls-enabled="true" wasd-controls-enabled="false"></a-camera>
            </a-scene>
        `;
    }

    function hideModel() {
        modelContainer.style.display = 'none';
        modelContainer.innerHTML = ''; // Clear the scene
    }

    // --- Initialize the Scanner ---
    html5QrCode = new Html5Qrcode("qr-reader");
    const config = { fps: 10, qrbox: { width: 250, height: 250 } };

    html5QrCode.start(
        { facingMode: "environment" }, // Use the rear camera
        config,
        onScanSuccess,
        onScanFailure
    ).catch(err => {
        console.error("Unable to start scanning.", err);
        scanResultElement.textContent = "Error: Could not start camera.";
    });
});