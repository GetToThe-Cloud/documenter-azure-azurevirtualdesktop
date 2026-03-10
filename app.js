// Azure Virtual Desktop Inventory - Client Application

const APP_VERSION = '1.0.0';
console.log(`🚀 AVD Inventory app.js loaded - Version ${APP_VERSION}`);

let inventoryData = null;
let diagramData = null;
let network = null;

// WAF Configuration - Loaded from server on startup
let wafConfig = null;

console.log('⏳ WAF configuration will be loaded from server...');

// Load WAF configuration from server
async function loadWAFConfiguration() {
    try {
        console.log('📋 Loading WAF configuration from server...');
        const response = await fetch('/api/waf/config');
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        wafConfig = await response.json();
        console.log('✅ WAF configuration loaded successfully from server');
        console.log(`   Version: ${wafConfig.version}`);
        console.log(`   Pillars: ${Object.keys(wafConfig.pillars || {}).length}`);
        return true;
    } catch (error) {
        console.error('❌ Failed to load WAF configuration:', error);
        showWarningAlert('WAF Assessment', 'Failed to load WAF configuration. Assessment features may not work properly.');
        return false;
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    console.log('📄 DOM Content Loaded - Initializing app...');
    
    // Load WAF configuration from server
    await loadWAFConfiguration();
    
    // Display version number in footer
    const versionElement = document.getElementById('appVersion');
    if (versionElement) {
        versionElement.textContent = `Version: ${APP_VERSION}`;
    }
    checkAuthStatus();
    // Auto-refresh disabled - use manual refresh button to reload inventory
});

// Check authentication status
async function checkAuthStatus() {
    try {
        console.log('🔐 Checking Azure authentication status...');
        const response = await fetch('/api/auth/status');
        const data = await response.json();
        
        console.log('📡 Auth status response:', data);
        
        const authStatusDiv = document.getElementById('authStatus');
        
        if (data.authenticated) {
            console.log('✅ Authenticated as:', data.context.account);
            authStatusDiv.className = 'auth-status authenticated';
            authStatusDiv.innerHTML = `✓ Connected to Azure as <strong>${data.context.account}</strong> | Subscription: <strong>${data.context.subscription}</strong>`;
            
            document.getElementById('authRequired').style.display = 'none';
            await loadInventoryData();
        } else {
            console.log('⚠️ Not authenticated - requesting login');
            authStatusDiv.className = 'auth-status not-authenticated';
            authStatusDiv.innerHTML = '⚠ Not authenticated with Azure. Initiating login...';
            
            // Show authentication required UI
            document.getElementById('authRequired').style.display = 'flex';
            
            // Automatically request Azure login
            await requestAzureLogin();
        }
    } catch (error) {
        console.error('❌ Error checking auth status:', error);
    }
}

// Request Azure login (with rate limiting to prevent multiple simultaneous requests)
let loginInProgress = false;
async function requestAzureLogin() {
    if (loginInProgress) {
        console.log('Login already in progress, skipping duplicate request');
        return;
    }
    
    loginInProgress = true;
    const authStatusDiv = document.getElementById('authStatus');
    
    try {
        authStatusDiv.innerHTML = '🔐 Requesting Azure login... Please check your browser or terminal for authentication instructions.';
        
        const response = await fetch('/api/auth/login', { method: 'POST' });
        const data = await response.json();
        
        if (data.success) {
            authStatusDiv.innerHTML = '✓ Authentication successful! Loading data...';
            await checkAuthStatus();
        } else {
            authStatusDiv.className = 'auth-status not-authenticated';
            authStatusDiv.innerHTML = `⚠ Authentication required. ${data.message || 'Please sign in to Azure.'}`;
        }
    } catch (error) {
        console.error('Error requesting Azure login:', error);
        authStatusDiv.className = 'auth-status not-authenticated';
        authStatusDiv.innerHTML = '⚠ Authentication request failed. Please check the server console or click the button below to retry.';
    } finally {
        loginInProgress = false;
    }
}

// Authenticate with Azure (manual trigger)
async function authenticateAzure() {
    await requestAzureLogin();
}

// Load inventory data
async function loadInventoryData() {
    try {
        console.log('🔄 Starting inventory data load...');
        showLoading('Connecting to Azure API...');
        
        console.log('📡 Fetching inventory data from /api/inventory/data');
        updateLoadingProgress('Collecting Azure resources... (this may take a few minutes)', 20);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 600000); // 10 minute timeout
        
        const response = await fetch('/api/inventory/data', {
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        
        console.log(`📥 Received response with status: ${response.status}`);
        
        if (response.status === 401) {
            console.warn('⚠️ Unauthorized - Authentication required');
            hideLoading();
            await checkAuthStatus();
            return;
        }
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        updateLoadingProgress('Parsing inventory data...', 60);
        inventoryData = await response.json();
        console.log('✅ Inventory data parsed successfully', inventoryData);
        
        if (inventoryData.error) {
            console.error('❌ Error in inventory data:', inventoryData.error);
            alert('Error loading inventory: ' + inventoryData.error);
            hideLoading();
            return;
        }
        
        updateLoadingProgress('Rendering dashboard...', 80);
        updateLastUpdateTime();
        
        // Render explanations
        try {
            if (inventoryData.explanation) {
                const expl = inventoryData.explanation;
                if (expl.overview) document.getElementById('overviewExplanation').textContent = expl.overview;
                if (expl.hostPools) document.getElementById('hostPoolsExplanation').textContent = expl.hostPools;
                if (expl.sessionHosts) document.getElementById('sessionHostsExplanation').textContent = expl.sessionHosts;
                if (expl.scalingPlans) document.getElementById('scalingPlansExplanation').textContent = expl.scalingPlans;
                if (expl.virtualNetworks) document.getElementById('vnetsExplanation').textContent = expl.virtualNetworks;
                if (expl.computeGalleries) document.getElementById('galleriesExplanation').textContent = expl.computeGalleries;
            }
        } catch (explError) {
            console.warn('⚠️ Error setting explanations:', explError);
        }
        
        console.log('🎨 Rendering UI components...');
        try { renderOverview(); } catch (e) { console.error('❌ Error rendering overview:', e); }
        try { renderHostPools(); } catch (e) { console.error('❌ Error rendering host pools:', e); }
        try { renderSessionHosts(); } catch (e) { console.error('❌ Error rendering session hosts:', e); }
        try { renderWorkspaces(); } catch (e) { console.error('❌ Error rendering workspaces:', e); }
        try { renderApplicationGroups(); } catch (e) { console.error('❌ Error rendering application groups:', e); }
        try { renderScalingPlans(); } catch (e) { console.error('❌ Error rendering scaling plans:', e); }
        try { renderVNets(); } catch (e) { console.error('❌ Error rendering VNets:', e); }
        try { renderComputeGalleries(); } catch (e) { console.error('❌ Error rendering compute galleries:', e); }
        
        updateLoadingProgress('Complete!', 100);
        console.log('✅ Inventory dashboard loaded successfully');
        
    } catch (error) {
        if (error.name === 'AbortError') {
            console.error('❌ Request timed out after 10 minutes');
            alert('Request timed out after 10 minutes. The inventory collection is taking longer than expected. This can happen with very large environments. Please check the server console for details and try again.');
        } else {
            console.error('❌ Error loading inventory data:', error);
            alert('Error loading inventory: ' + error.message + '. Check the browser console for details.');
        }
    } finally {
        setTimeout(() => hideLoading(), 500); // Small delay to show completion
    }
}

// Refresh inventory
async function refreshInventory() {
    try {
        console.log('🔄 Manually refreshing inventory...');
        showLoading('Refreshing inventory...');
        updateLoadingProgress('Requesting fresh data from Azure...', 30);
        
        const response = await fetch('/api/inventory/refresh', { method: 'POST' });
        const data = await response.json();
        
        console.log('📥 Refresh response:', data);
        
        if (data.success) {
            updateLoadingProgress('Loading updated inventory...', 60);
            await loadInventoryData();
        } else {
            console.error('❌ Refresh failed:', data.error);
            alert('Failed to refresh inventory: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('❌ Error refreshing inventory:', error);
        alert('Error refreshing inventory: ' + error.message);
    } finally {
        hideLoading();
    }
}

// Update last update time
function updateLastUpdateTime() {
    if (inventoryData && inventoryData.collectionTime) {
        const date = new Date(inventoryData.collectionTime);
        const formatted = date.toLocaleString('en-US', { 
            month: 'short', 
            day: 'numeric', 
            year: 'numeric',
            hour: '2-digit', 
            minute: '2-digit' 
        });
        document.getElementById('lastUpdate').textContent = `Last updated: ${formatted}`;
    }
}

// Render overview section
function renderOverview() {
    if (!inventoryData) return;
    
    const summary = inventoryData.summary;
    
    document.getElementById('totalHostPools').textContent = summary.totalHostPools;
    document.getElementById('totalSessionHosts').textContent = summary.totalSessionHosts;
    document.getElementById('availableHosts').textContent = summary.availableSessionHosts;
    document.getElementById('unavailableHosts').textContent = summary.unavailableSessionHosts;
    document.getElementById('totalWorkspaces').textContent = summary.totalWorkspaces;
    document.getElementById('totalAppGroups').textContent = summary.totalApplicationGroups;
    document.getElementById('totalScalingPlans').textContent = summary.totalScalingPlans || 0;
    document.getElementById('totalVNets').textContent = summary.totalVNets || 0;
    document.getElementById('totalGalleries').textContent = summary.totalComputeGalleries || 0;
    
    // Render subscriptions
    const subsList = document.getElementById('subscriptionsList');
    subsList.innerHTML = '<h3 style="margin-bottom: 1rem;">Subscriptions</h3>';
    
    inventoryData.subscriptions.forEach(sub => {
        const subDiv = document.createElement('div');
        subDiv.className = 'subscription-section';
        subDiv.innerHTML = `
            <div class="subscription-header">
                <h3>${sub.name}</h3>
                <div style="font-size: 0.9rem; margin-top: 0.5rem; opacity: 0.9;">
                    ID: ${sub.id}
                </div>
            </div>
            <div class="subscription-content">
                <div class="data-item-details">
                    <div class="data-field">
                        <div class="data-field-label">Host Pools</div>
                        <div class="data-field-value">${sub.hostPools.length}</div>
                    </div>
                    <div class="data-field">
                        <div class="data-field-label">Workspaces</div>
                        <div class="data-field-value">${sub.workspaces.length}</div>
                    </div>
                    <div class="data-field">
                        <div class="data-field-label">Application Groups</div>
                        <div class="data-field-value">${sub.applicationGroups.length}</div>
                    </div>
                    <div class="data-field">
                        <div class="data-field-label">Scaling Plans</div>
                        <div class="data-field-value">${sub.scalingPlans ? sub.scalingPlans.length : 0}</div>
                    </div>
                    <div class="data-field">
                        <div class="data-field-label">Virtual Networks</div>
                        <div class="data-field-value">${sub.virtualNetworks ? sub.virtualNetworks.length : 0}</div>
                    </div>
                    <div class="data-field">
                        <div class="data-field-label">Compute Galleries</div>
                        <div class="data-field-value">${sub.computeGalleries ? sub.computeGalleries.length : 0}</div>
                    </div>
                    <div class="data-field">
                        <div class="data-field-label">Tenant ID</div>
                        <div class="data-field-value" style="font-size: 0.85rem;">${sub.tenantId}</div>
                    </div>
                </div>
            </div>
        `;
        subsList.appendChild(subDiv);
    });
}

// Render host pools
function renderHostPools() {
    if (!inventoryData) return;
    
    const container = document.getElementById('hostPoolsList');
    container.innerHTML = '';
    
    let hpCount = 0;
    inventoryData.subscriptions.forEach(sub => {
        sub.hostPools.forEach(hp => {
            hpCount++;
            const hpDiv = document.createElement('div');
            hpDiv.className = 'data-item';
            
            const tokenStatus = hp.registrationToken.exists 
                ? (hp.registrationToken.expired ? '🔴 Expired' : '🟢 Valid')
                : '⚫ Not Available';
            
            hpDiv.innerHTML = `
                <div class="data-item-header">
                    <h3>${hp.name}</h3>
                    <span class="badge badge-info">${hp.hostPoolType}</span>
                </div>
                <div class="data-item-details">
                    <div class="data-field">
                        <div class="data-field-label">Resource Group</div>
                        <div class="data-field-value">${hp.resourceGroup}</div>
                    </div>
                    <div class="data-field">
                        <div class="data-field-label">Location</div>
                        <div class="data-field-value">${hp.location}</div>
                    </div>
                    <div class="data-field">
                        <div class="data-field-label">Load Balancer</div>
                        <div class="data-field-value">${hp.loadBalancerType}</div>
                    </div>
                    <div class="data-field">
                        <div class="data-field-label">Max Session Limit</div>
                        <div class="data-field-value">${hp.maxSessionLimit}</div>
                    </div>
                    <div class="data-field">
                        <div class="data-field-label">Session Hosts</div>
                        <div class="data-field-value">${hp.sessionHostCount} total (${hp.availableHosts} available)</div>
                    </div>
                    <div class="data-field">
                        <div class="data-field-label">Registration Token</div>
                        <div class="data-field-value">${tokenStatus}</div>
                    </div>
                    ${hp.scalingPlanReference ? `
                    <div class="data-field">
                        <div class="data-field-label">Scaling Plan</div>
                        <div class="data-field-value"><span class="badge badge-success">✓ ${hp.scalingPlanReference}</span></div>
                    </div>
                    ` : ''}
                </div>
            `;
            container.appendChild(hpDiv);
        });
    });
    
    if (hpCount === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary);">No host pools found.</p>';
    }
}

// Render session hosts
function renderSessionHosts() {
    if (!inventoryData) return;
    
    const container = document.getElementById('sessionHostsList');
    container.innerHTML = '';
    
    let shCount = 0;
    inventoryData.subscriptions.forEach(sub => {
        sub.hostPools.forEach(hp => {
            if (hp.sessionHosts.length > 0) {
                const hpSection = document.createElement('div');
                hpSection.style.marginBottom = '2rem';
                hpSection.innerHTML = `<h3 style="margin-bottom: 1rem; color: var(--secondary-color);">${hp.name}</h3>`;
                
                const table = document.createElement('div');
                table.className = 'table-container';
                table.innerHTML = `
                    <table>
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Status</th>
                                <th>VM Size</th>
                                <th>Sessions</th>
                                <th>Allow New Session</th>
                                <th>VNet</th>
                                <th>Private IP</th>
                                <th>Image Source</th>
                                <th>OS Version</th>
                                <th>Agent Version</th>
                                <th>Last Heartbeat</th>
                            </tr>
                        </thead>
                        <tbody id="sh-${hp.name.replace(/[^a-zA-Z0-9]/g, '')}"></tbody>
                    </table>
                `;
                hpSection.appendChild(table);
                container.appendChild(hpSection);
                
                const tbody = hpSection.querySelector('tbody');
                hp.sessionHosts.forEach(sh => {
                    shCount++;
                    const statusBadge = sh.status === 'Available' ? 'badge-success' : 'badge-danger';
                    const lastHB = sh.lastHeartBeat ? new Date(sh.lastHeartBeat).toLocaleString() : 'N/A';
                    const vnetInfo = sh.network ? `${sh.network.vnetName || 'N/A'}/${sh.network.subnetName || 'N/A'}` : 'N/A';
                    const privateIP = sh.network?.privateIP || 'N/A';
                    
                    let imageSource = 'N/A';
                    if (sh.image) {
                        if (sh.image.type === 'Gallery') {
                            imageSource = `🖼️ ${sh.image.imageName || 'Unknown'} (v${sh.image.version || '?'})`;
                        } else if (sh.image.type === 'Marketplace') {
                            imageSource = `🏪 ${sh.image.publisher || 'Unknown'}/${sh.image.offer || 'Unknown'}`;
                        }
                    }
                    
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${sh.name}</td>
                        <td><span class="badge ${statusBadge}">${sh.status}</span></td>
                        <td style="font-size: 0.85rem;">${sh.vmSize || 'N/A'}</td>
                        <td>${sh.sessions}</td>
                        <td>${sh.allowNewSession ? '✓' : '✗'}</td>
                        <td style="font-size: 0.85rem;">${vnetInfo}</td>
                        <td style="font-size: 0.85rem;">${privateIP}</td>
                        <td style="font-size: 0.85rem;">${imageSource}</td>
                        <td>${sh.osVersion || 'N/A'}</td>
                        <td>${sh.agentVersion || 'N/A'}</td>
                        <td style="font-size: 0.85rem;">${lastHB}</td>
                    `;
                    tbody.appendChild(row);
                });
            }
        });
    });
    
    if (shCount === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary);">No session hosts found.</p>';
    }
}

// Render workspaces
function renderWorkspaces() {
    if (!inventoryData) return;
    
    const container = document.getElementById('workspacesList');
    container.innerHTML = '';
    
    let wsCount = 0;
    inventoryData.subscriptions.forEach(sub => {
        sub.workspaces.forEach(ws => {
            wsCount++;
            const wsDiv = document.createElement('div');
            wsDiv.className = 'data-item';
            wsDiv.innerHTML = `
                <h3>${ws.name}</h3>
                <div class="data-item-details">
                    <div class="data-field">
                        <div class="data-field-label">Friendly Name</div>
                        <div class="data-field-value">${ws.friendlyName || 'N/A'}</div>
                    </div>
                    <div class="data-field">
                        <div class="data-field-label">Resource Group</div>
                        <div class="data-field-value">${ws.resourceGroup}</div>
                    </div>
                    <div class="data-field">
                        <div class="data-field-label">Location</div>
                        <div class="data-field-value">${ws.location}</div>
                    </div>
                    <div class="data-field">
                        <div class="data-field-label">Application Groups</div>
                        <div class="data-field-value">${ws.applicationGroupReferences ? ws.applicationGroupReferences.length : 0}</div>
                    </div>
                </div>
                ${ws.description ? `<p style="margin-top: 1rem; color: var(--text-secondary);">${ws.description}</p>` : ''}
            `;
            container.appendChild(wsDiv);
        });
    });
    
    if (wsCount === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary);">No workspaces found.</p>';
    }
}

// Render application groups
function renderApplicationGroups() {
    if (!inventoryData) return;
    
    const container = document.getElementById('appGroupsList');
    container.innerHTML = '';
    
    let agCount = 0;
    inventoryData.subscriptions.forEach(sub => {
        sub.applicationGroups.forEach(ag => {
            agCount++;
            const agDiv = document.createElement('div');
            agDiv.className = 'data-item';
            
            let appsHTML = '';
            if (ag.applications && ag.applications.length > 0) {
                appsHTML = `
                    <div style="margin-top: 1rem;">
                        <div class="data-field-label">Published Applications</div>
                        <div class="table-container" style="margin-top: 0.5rem;">
                            <table style="font-size: 0.85rem;">
                                <thead>
                                    <tr>
                                        <th>Name</th>
                                        <th>Friendly Name</th>
                                        <th>File Path</th>
                                        <th>Show in Portal</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${ag.applications.map(app => `
                                        <tr>
                                            <td>${app.name}</td>
                                            <td>${app.friendlyName || 'N/A'}</td>
                                            <td style="font-size: 0.8rem;">${app.filePath || 'N/A'}</td>
                                            <td>${app.showInPortal ? '✓' : '✗'}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;
            }
            
            agDiv.innerHTML = `
                <div class="data-item-header">
                    <h3>${ag.name}</h3>
                    <span class="badge badge-info">${ag.applicationGroupType}</span>
                </div>
                <div class="data-item-details">
                    <div class="data-field">
                        <div class="data-field-label">Friendly Name</div>
                        <div class="data-field-value">${ag.friendlyName || 'N/A'}</div>
                    </div>
                    <div class="data-field">
                        <div class="data-field-label">Resource Group</div>
                        <div class="data-field-value">${ag.resourceGroup}</div>
                    </div>
                    <div class="data-field">
                        <div class="data-field-label">Location</div>
                        <div class="data-field-value">${ag.location}</div>
                    </div>
                    <div class="data-field">
                        <div class="data-field-label">Applications</div>
                        <div class="data-field-value">${ag.applications.length}</div>
                    </div>
                </div>
                ${appsHTML}
            `;
            container.appendChild(agDiv);
        });
    });
    
    if (agCount === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary);">No application groups found.</p>';
    }
}

// Render scaling plans
function renderScalingPlans() {
    if (!inventoryData) return;
    
    const container = document.getElementById('scalingPlansList');
    container.innerHTML = '';
    
    let spCount = 0;
    inventoryData.subscriptions.forEach(sub => {
        if (sub.scalingPlans) {
            sub.scalingPlans.forEach(sp => {
                spCount++;
                const spDiv = document.createElement('div');
                spDiv.className = 'data-item';
                
                let schedulesHTML = '';
                if (sp.schedules && sp.schedules.length > 0) {
                    schedulesHTML = `
                        <div style="margin-top: 1rem;">
                            <div class="data-field-label">Schedules</div>
                            <div class="table-container" style="margin-top: 0.5rem;">
                                <table style="font-size: 0.85rem;">
                                    <thead>
                                        <tr>
                                            <th>Name</th>
                                            <th>Days</th>
                                            <th>Ramp Up</th>
                                            <th>Peak</th>
                                            <th>Ramp Down</th>
                                            <th>Off Peak</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${sp.schedules.map(schedule => `
                                            <tr>
                                                <td>${schedule.name || 'N/A'}</td>
                                                <td>${schedule.daysOfWeek || 'N/A'}</td>
                                                <td>${schedule.rampUpStartTime || 'N/A'}</td>
                                                <td>${schedule.peakStartTime || 'N/A'}</td>
                                                <td>${schedule.rampDownStartTime || 'N/A'}</td>
                                                <td>${schedule.offPeakStartTime || 'N/A'}</td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    `;
                }
                
                let hostPoolRefsHTML = '';
                if (sp.hostPoolReferences && sp.hostPoolReferences.length > 0) {
                    hostPoolRefsHTML = `
                        <div style="margin-top: 1rem;">
                            <div class="data-field-label">Assigned Host Pools</div>
                            <div style="margin-top: 0.5rem;">
                                ${sp.hostPoolReferences.map(hpRef => {
                                    const hpName = hpRef.hostPoolArmPath.split('/').pop();
                                    const enabledBadge = hpRef.scalingPlanEnabled ? 'badge-success' : 'badge-warning';
                                    const enabledText = hpRef.scalingPlanEnabled ? 'Enabled' : 'Disabled';
                                    return `<span class="badge ${enabledBadge}" style="margin-right: 0.5rem; margin-bottom: 0.5rem;">${hpName}: ${enabledText}</span>`;
                                }).join('')}
                            </div>
                        </div>
                    `;
                }
                
                spDiv.innerHTML = `
                    <div class="data-item-header">
                        <h3>${sp.name}</h3>
                        <span class="badge badge-info">${sp.hostPoolType || 'N/A'}</span>
                    </div>
                    <div class="data-item-details">
                        <div class="data-field">
                            <div class="data-field-label">Friendly Name</div>
                            <div class="data-field-value">${sp.friendlyName || 'N/A'}</div>
                        </div>
                        <div class="data-field">
                            <div class="data-field-label">Resource Group</div>
                            <div class="data-field-value">${sp.resourceGroup}</div>
                        </div>
                        <div class="data-field">
                            <div class="data-field-label">Location</div>
                            <div class="data-field-value">${sp.location}</div>
                        </div>
                        <div class="data-field">
                            <div class="data-field-label">Time Zone</div>
                            <div class="data-field-value">${sp.timeZone || 'N/A'}</div>
                        </div>
                        <div class="data-field">
                            <div class="data-field-label">Exclusion Tag</div>
                            <div class="data-field-value">${sp.exclusionTag || 'None'}</div>
                        </div>
                        <div class="data-field">
                            <div class="data-field-label">Schedules</div>
                            <div class="data-field-value">${sp.schedules ? sp.schedules.length : 0}</div>
                        </div>
                    </div>
                    ${schedulesHTML}
                    ${hostPoolRefsHTML}
                `;
                container.appendChild(spDiv);
            });
        }
    });
    
    if (spCount === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary);">No scaling plans found.</p>';
    }
}

// Render virtual networks
function renderVNets() {
    if (!inventoryData) return;
    
    const container = document.getElementById('vnetsList');
    container.innerHTML = '';
    
    let vnetCount = 0;
    inventoryData.subscriptions.forEach(sub => {
        if (sub.virtualNetworks) {
            sub.virtualNetworks.forEach(vnet => {
                vnetCount++;
                const vnetDiv = document.createElement('div');
                vnetDiv.className = 'data-item';
                
                let subnetsHTML = '';
                if (vnet.subnets && vnet.subnets.length > 0) {
                    subnetsHTML = `
                        <div style="margin-top: 1rem;">
                            <div class="data-field-label">Subnets</div>
                            <div class="table-container" style="margin-top: 0.5rem;">
                                <table style="font-size: 0.85rem;">
                                    <thead>
                                        <tr>
                                            <th>Name</th>
                                            <th>Address Prefix</th>
                                            <th>Connected Devices</th>
                                            <th>AVD Session Hosts</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${vnet.subnets.map(subnet => `
                                            <tr>
                                                <td>${subnet.name}</td>
                                                <td>${subnet.addressPrefix}</td>
                                                <td>${subnet.connectedDevices || 0}</td>
                                                <td>${subnet.connectedSessionHosts || 0}</td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    `;
                }
                
                let peeringsHTML = '';
                if (vnet.peerings && vnet.peerings.length > 0) {
                    peeringsHTML = `
                        <div style="margin-top: 1rem;">
                            <div class="data-field-label">VNet Peerings</div>
                            <div class="table-container" style="margin-top: 0.5rem;">
                                <table style="font-size: 0.85rem;">
                                    <thead>
                                        <tr>
                                            <th>Name</th>
                                            <th>Remote VNet</th>
                                            <th>Peering State</th>
                                            <th>Allow Forwarded Traffic</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${vnet.peerings.map(peer => `
                                            <tr>
                                                <td>${peer.name}</td>
                                                <td style="font-size: 0.8rem;">${peer.remoteVNet}</td>
                                                <td><span class="badge ${peer.peeringState === 'Connected' ? 'badge-success' : 'badge-warning'}">${peer.peeringState}</span></td>
                                                <td>${peer.allowForwardedTraffic ? '✓' : '✗'}</td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    `;
                }
                
                vnetDiv.innerHTML = `
                    <div class="data-item-header">
                        <h3>${vnet.name}</h3>
                        <span class="badge badge-success">AVD Network</span>
                        ${vnet.connectedSessionHosts ? `<span class="badge badge-info">${vnet.connectedSessionHosts} Session Hosts</span>` : ''}
                    </div>
                    <div class="data-item-details">
                        <div class="data-field">
                            <div class="data-field-label">Resource Group</div>
                            <div class="data-field-value">${vnet.resourceGroup}</div>
                        </div>
                        <div class="data-field">
                            <div class="data-field-label">Location</div>
                            <div class="data-field-value">${vnet.location}</div>
                        </div>
                        <div class="data-field">
                            <div class="data-field-label">Address Space</div>
                            <div class="data-field-value">${vnet.addressSpace}</div>
                        </div>
                        <div class="data-field">
                            <div class="data-field-label">DNS Servers</div>
                            <div class="data-field-value">${vnet.dnsServers || 'Default (Azure-provided)'}</div>
                        </div>
                        <div class="data-field">
                            <div class="data-field-label">Subnets</div>
                            <div class="data-field-value">${vnet.subnets ? vnet.subnets.length : 0}</div>
                        </div>
                        <div class="data-field">
                            <div class="data-field-label">Peerings</div>
                            <div class="data-field-value">${vnet.peerings ? vnet.peerings.length : 0}</div>
                        </div>
                    </div>
                    ${subnetsHTML}
                    ${peeringsHTML}
                `;
                container.appendChild(vnetDiv);
            });
        }
    });
    
    if (vnetCount === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary);">No AVD-connected virtual networks found.</p>';
    }
}

// Render compute galleries
function renderComputeGalleries() {
    if (!inventoryData) return;
    
    const container = document.getElementById('galleriesList');
    if (!container) {
        console.error('❌ galleriesList container not found');
        return;
    }
    container.innerHTML = '';
    
    let galleryCount = 0;
    const subscriptions = inventoryData.subscriptions || [];
    subscriptions.forEach(sub => {
        if (sub.computeGalleries && Array.isArray(sub.computeGalleries)) {
            sub.computeGalleries.forEach(gallery => {
                galleryCount++;
                const galleryDiv = document.createElement('div');
                galleryDiv.className = 'data-item';
                
                let imagesHTML = '';
                if (gallery.images && gallery.images.length > 0) {
                    imagesHTML = `
                        <div style="margin-top: 1rem;">
                            <div class="data-field-label">Images</div>
                            ${gallery.images.map(image => {
                                let versionsHTML = '';
                                if (image.versions && image.versions.length > 0) {
                                    versionsHTML = `
                                        <div class="table-container" style="margin-top: 0.5rem;">
                                            <table style="font-size: 0.85rem;">
                                                <thead>
                                                    <tr>
                                                        <th>Version</th>
                                                        <th>Location</th>
                                                        <th>Provisioning State</th>
                                                        <th>Used By</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    ${image.versions.map(version => `
                                                        <tr>
                                                            <td><strong>${version.name || 'N/A'}</strong></td>
                                                            <td>${version.location || 'N/A'}</td>
                                                            <td><span class="badge ${version.provisioningState === 'Succeeded' ? 'badge-success' : 'badge-warning'}">${version.provisioningState || 'Unknown'}</span></td>
                                                            <td>${version.usedBy && version.usedBy.length > 0 ? version.usedBy.join(', ') : 'Not in use'}</td>
                                                        </tr>
                                                    `).join('')}
                                                </tbody>
                                            </table>
                                        </div>
                                    `;
                                }
                                
                                return `
                                    <div style="margin-bottom: 1.5rem; padding: 1rem; background: rgba(255,255,255,0.02); border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);">
                                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                                            <h4 style="margin: 0; color: var(--secondary-color);">🖼️ ${image.name}</h4>
                                            <span class="badge badge-info">${image.osType || 'N/A'}</span>
                                        </div>
                                        <div class="data-item-details">
                                            <div class="data-field">
                                                <div class="data-field-label">OS State</div>
                                                <div class="data-field-value">${image.osState || 'N/A'}</div>
                                            </div>
                                            <div class="data-field">
                                                <div class="data-field-label">Hyper-V Generation</div>
                                                <div class="data-field-value">${image.hyperVGeneration || 'N/A'}</div>
                                            </div>
                                            <div class="data-field">
                                                <div class="data-field-label">Versions</div>
                                                <div class="data-field-value">${image.versions ? image.versions.length : 0}</div>
                                            </div>
                                            <div class="data-field">
                                                <div class="data-field-label">Description</div>
                                                <div class="data-field-value">${image.description || 'No description'}</div>
                                            </div>
                                        </div>
                                        ${versionsHTML}
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    `;
                }
                
                galleryDiv.innerHTML = `
                    <div class="data-item-header">
                        <h3>${gallery.name}</h3>
                        <span class="badge badge-success">${gallery.provisioningState || 'N/A'}</span>
                    </div>
                    <div class="data-item-details">
                        <div class="data-field">
                            <div class="data-field-label">Resource Group</div>
                            <div class="data-field-value">${gallery.resourceGroup}</div>
                        </div>
                        <div class="data-field">
                            <div class="data-field-label">Location</div>
                            <div class="data-field-value">${gallery.location}</div>
                        </div>
                        <div class="data-field">
                            <div class="data-field-label">Images</div>
                            <div class="data-field-value">${gallery.images ? gallery.images.length : 0}</div>
                        </div>
                        <div class="data-field">
                            <div class="data-field-label">Description</div>
                            <div class="data-field-value">${gallery.description || 'No description'}</div>
                        </div>
                    </div>
                    ${imagesHTML}
                `;
                container.appendChild(galleryDiv);
            });
        }
    });
    
    if (galleryCount === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary);">No Azure Compute Galleries found.</p>';
    }
}

// Show section
function showSection(sectionId) {
    // Update navigation
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
    });
    document.querySelector(`[data-section="${sectionId}"]`).classList.add('active');
    
    // Update content
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.remove('active');
    });
    document.getElementById(sectionId).classList.add('active');
    
    // Load diagram if needed
    if (sectionId === 'diagram' && !diagramData) {
        loadDiagram();
    }
    
    // Display WAF config if needed
    if (sectionId === 'wafconfig') {
        displayWAFConfig();
    }
}

// Load and render diagram
async function loadDiagram() {
    try {
        showLoading();
        const response = await fetch('/api/diagram/connections');
        
        if (response.status === 401) {
            console.log('Not authenticated for diagram. Skipping diagram load.');
            // Hide diagram section if authentication is required
            const diagramSection = document.getElementById('networkDiagram');
            if (diagramSection && diagramSection.parentElement) {
                diagramSection.parentElement.style.display = 'none';
            }
            return;
        }
        
        diagramData = await response.json();
        
        if (diagramData.error) {
            console.error('Error loading diagram:', diagramData.error);
            const diagramSection = document.getElementById('networkDiagram');
            if (diagramSection) {
                diagramSection.innerHTML = `<div style="padding: 20px; text-align: center; color: #dc3545;">Error loading diagram: ${diagramData.error}</div>`;
            }
            return;
        }
        
        renderDiagram();
    } catch (error) {
        console.error('Error loading diagram:', error);
        const diagramSection = document.getElementById('networkDiagram');
        if (diagramSection) {
            diagramSection.innerHTML = `<div style="padding: 20px; text-align: center; color: #dc3545;">Failed to load diagram. Please check server connection.</div>`;
        }
    } finally {
        hideLoading();
    }
}

// Render diagram with vis.js
function renderDiagram() {
    if (!diagramData) return;
    
    const container = document.getElementById('networkDiagram');
    
    // Define colors for different node types
    const colorMap = {
        subscription: { background: '#0078d4', border: '#005a9e' },
        hostpool: { background: '#50e6ff', border: '#00b7c3' },
        sessionhost: { background: '#107c10', border: '#0b5a08' },
        workspace: { background: '#ffaa44', border: '#dd8800' },
        applicationgroup: { background: '#8764b8', border: '#674ea7' },
        scalingplan: { background: '#f7630c', border: '#c04d0a' },
        vnet: { background: '#0078d4', border: '#004578' }
    };
    
    // Prepare nodes and edges
    const nodes = diagramData.nodes.map(node => ({
        id: node.id,
        label: node.label,
        color: colorMap[node.type] || { background: '#666', border: '#333' },
        font: { color: '#ffffff' },
        shape: 'box',
        margin: 10
    }));
    
    const edges = diagramData.edges.map(edge => ({
        from: edge.from,
        to: edge.to,
        label: edge.label,
        arrows: 'to',
        font: { size: 10, color: '#999999' }
    }));
    
    const data = { nodes, edges };
    
    const options = {
        physics: {
            enabled: true,
            barnesHut: {
                gravitationalConstant: -2000,
                springLength: 200,
                springConstant: 0.04
            },
            stabilization: {
                iterations: 200
            }
        },
        layout: {
            hierarchical: {
                enabled: true,
                direction: 'UD',
                sortMethod: 'directed',
                levelSeparation: 150,
                nodeSpacing: 200
            }
        },
        nodes: {
            font: {
                size: 14
            }
        },
        edges: {
            smooth: {
                type: 'cubicBezier',
                forceDirection: 'vertical'
            }
        }
    };
    
    network = new vis.Network(container, data, options);
}

// Export inventory data to JSON
function exportToJSON() {
    if (!inventoryData) {
        alert('No inventory data available to export');
        return;
    }
    
    try {
        const jsonString = JSON.stringify(inventoryData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `AVD-Inventory-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        console.log('✅ Inventory data exported to JSON successfully');
    } catch (error) {
        console.error('❌ Error exporting to JSON:', error);
        alert('Error exporting to JSON: ' + error.message);
    }
}

// Helper function to evaluate conditions
function evaluateCondition(condition, data, allHostPools, allScalingPlans, allGalleries, allVNets, allSessionHosts, allApplicationGroups, summary) {
    const { field, operator, value, matchField, matchValue, matchOperator, matchCondition, pattern, uniqueCount } = condition;
    
    let fieldData;
    switch (field) {
        case 'hostPools':
            fieldData = allHostPools;
            break;
        case 'scalingPlans':
            fieldData = allScalingPlans;
            break;
        case 'computeGalleries':
            fieldData = allGalleries;
            break;
        case 'virtualNetworks':
            fieldData = allVNets;
            break;
        case 'sessionHosts':
            fieldData = allSessionHosts;
            break;
        case 'applicationGroups':
            fieldData = allApplicationGroups;
            break;
        case 'summary.totalHostPools':
            return evaluateOperator(summary.totalHostPools, operator, value);
        case 'summary.totalSessionHosts':
            return evaluateOperator(summary.totalSessionHosts, operator, value);
        case 'summary.totalVNets':
            return evaluateOperator(summary.totalVNets, operator, value);
        case 'summary.totalWorkspaces':
            return evaluateOperator(summary.totalWorkspaces, operator, value);
        case 'summary.totalApplicationGroups':
            return evaluateOperator(summary.totalApplicationGroups, operator, value);
        case 'summary.totalScalingPlans':
            return evaluateOperator(summary.totalScalingPlans, operator, value);
        case 'summary.totalComputeGalleries':
            return evaluateOperator(summary.totalComputeGalleries, operator, value);
        case 'summary.totalVirtualNetworks':
            return evaluateOperator(summary.totalVirtualNetworks, operator, value);
        default:
            fieldData = null;
    }
    
    if (!fieldData && !field.startsWith('summary.')) return false;
    
    switch (operator) {
        case 'count':
            const count = fieldData.filter(item => {
                if (matchCondition) {
                    return evaluateComplexCondition(item, matchCondition);
                }
                if (matchField) {
                    return item[matchField] === matchValue;
                }
                return true;
            }).length;
            return eval(`${count} ${value}`);
            
        case 'contains':
            return fieldData.some(item => {
                const itemValue = item[matchField]?.toLowerCase() || '';
                return value.some(term => itemValue.includes(term));
            });
            
        case 'all':
            return fieldData.every(item => {
                if (matchOperator === 'exists') {
                    return item[matchField] !== undefined && item[matchField] !== null;
                }
                if (matchOperator) {
                    return evaluateOperator(item[matchField], matchOperator, matchValue);
                }
                return item[matchField] === matchValue;
            });
            
        case 'some':
            return fieldData.some(item => {
                if (matchCondition) {
                    return evaluateComplexCondition(item, matchCondition);
                }
                if (matchOperator) {
                    return evaluateOperator(item[matchField], matchOperator, matchValue);
                }
                return item[matchField] === matchValue;
            });
            
        case 'none':
            return !fieldData.some(item => item[matchField] === matchValue);
            
        case 'pattern':
            const regex = new RegExp(pattern, 'i');
            return fieldData.every(item => regex.test(item[matchField]));
            
        case 'uniqueCount':
            const uniqueValues = new Set(fieldData.map(item => item[matchField]));
            return eval(`${uniqueValues.size} ${value}`);
            
        default:
            return false;
    }
}

// Helper function to get field value from a path like "summary.totalHostPools"
function getFieldValue(fieldPath, data, summary, allHostPools, allScalingPlans, allGalleries, allVNets, allSessionHosts, allApplicationGroups) {
    if (fieldPath.startsWith('summary.')) {
        const fieldName = fieldPath.substring(8); // Remove "summary." prefix
        return summary[fieldName];
    }
    
    // Handle other cases if needed
    switch (fieldPath) {
        case 'hostPools':
            return allHostPools.length;
        case 'scalingPlans':
            return allScalingPlans.length;
        case 'computeGalleries':
            return allGalleries.length;
        case 'virtualNetworks':
            return allVNets.length;
        case 'sessionHosts':
            return allSessionHosts.length;
        case 'applicationGroups':
            return allApplicationGroups.length;
        default:
            return null;
    }
}

function evaluateOperator(fieldValue, operator, compareValue) {
    switch (operator) {
        case '>=':
            return fieldValue >= compareValue;
        case '>':
            return fieldValue > compareValue;
        case '<=':
            return fieldValue <= compareValue;
        case '<':
            return fieldValue < compareValue;
        case '===':
            return fieldValue === compareValue;
        case '!==':
            return fieldValue !== compareValue;
        case 'between':
            return true; // Handled separately
        case 'exists':
            return fieldValue !== undefined && fieldValue !== null;
        default:
            return false;
    }
}

function evaluateComplexCondition(item, condition) {
    const { field, value, operator, and } = condition;
    let result = false;
    
    if (operator === 'between') {
        result = item[field] >= condition.minValue && item[field] <= condition.maxValue;
    } else if (operator) {
        result = evaluateOperator(item[field], operator, value);
    } else {
        result = item[field] === value;
    }
    
    if (and) {
        return result && evaluateComplexCondition(item, and);
    }
    
    return result;
}

// Perform WAF Assessment using configuration
function performWAFAssessmentWithConfig(data, config) {
    if (!config) {
        console.warn('WAF config not loaded, falling back to legacy assessment');
        return performWAFAssessment(data);
    }
    
    const summary = data.summary;
    const allHostPools = data.subscriptions.flatMap(sub => sub.hostPools || []);
    const allScalingPlans = data.subscriptions.flatMap(sub => sub.scalingPlans || []);
    const allGalleries = data.subscriptions.flatMap(sub => sub.computeGalleries || []);
    const allVNets = data.subscriptions.flatMap(sub => sub.virtualNetworks || []);
    const allSessionHosts = allHostPools.flatMap(hp => hp.sessionHosts || []);
    const allApplicationGroups = data.subscriptions.flatMap(sub => sub.applicationGroups || []);
    
    const assessment = {};
    
    // Calculate common metrics used by rules
    const availabilityRate = summary.totalSessionHosts > 0 ? (summary.availableSessionHosts / summary.totalSessionHosts) * 100 : 0;
    const pooledHostPools = allHostPools.filter(hp => hp.hostPoolType === 'Pooled').length;
    const pooledRatio = allHostPools.length > 0 ? pooledHostPools / allHostPools.length : 0;
    const totalCapacity = allHostPools.reduce((sum, hp) => sum + (hp.sessionHostCount * (hp.maxSessionLimit || 10)), 0);
    const utilizationRate = totalCapacity > 0 ? (summary.totalUserSessions / totalCapacity) * 100 : 0;
    const avgHostsPerPool = allHostPools.length > 0 ? summary.totalSessionHosts / allHostPools.length : 0;
    const totalResources = summary.totalHostPools + summary.totalWorkspaces + summary.totalApplicationGroups;
    const avgAvailableHosts = allHostPools.length > 0 ? allHostPools.reduce((sum, hp) => sum + hp.availableHosts, 0) / allHostPools.length : 0;
    const disconnectedRatio = summary.totalUserSessions > 0 ? summary.disconnectedUserSessions / summary.totalUserSessions : 0;
    
    // Process each pillar
    for (const [pillarKey, pillar] of Object.entries(config.pillars)) {
        let pillarScore = 0;
        const findings = [];
        const recommendations = [];
        
        pillar.rules.forEach(rule => {
            let ruleScore = 0;
            let ruleMessage = '';
            let ruleRecommendation = '';
            
            // Handle rules with calculations
            if (rule.calculation) {
                let calcValue;
                switch (rule.calculation) {
                    case 'availabilityRate':
                        calcValue = availabilityRate;
                        break;
                    case 'pooledRatio':
                        calcValue = pooledRatio;
                        break;
                    case 'utilizationRate':
                        calcValue = utilizationRate;
                        break;
                    case 'avgHostsPerPool':
                        calcValue = avgHostsPerPool;
                        break;
                    case 'totalResources':
                        calcValue = totalResources;
                        break;
                    case 'avgAvailableHosts':
                        calcValue = avgAvailableHosts;
                        break;
                    case 'disconnectedRatio':
                        calcValue = disconnectedRatio * 100;
                        break;
                }
                
                if (rule.thresholds) {
                    for (const threshold of rule.thresholds) {
                        let matches = false;
                        
                        if (threshold.operator === 'between') {
                            matches = calcValue >= threshold.minValue && calcValue <= threshold.maxValue;
                        } else {
                            matches = evaluateOperator(calcValue, threshold.operator, threshold.value);
                        }
                        
                        if (matches) {
                            ruleScore = threshold.points;
                            ruleMessage = threshold.message.replace('{value}', calcValue.toFixed(1));
                            ruleRecommendation = threshold.recommendation || '';
                            break;
                        }
                    }
                }
            }
            // Handle rules with conditions
            else if (rule.condition) {
                const conditionMet = evaluateCondition(
                    rule.condition, data, allHostPools, allScalingPlans, 
                    allGalleries, allVNets, allSessionHosts, allApplicationGroups, summary
                );
                
                // Get the actual field value for message replacement
                const fieldValue = getFieldValue(
                    rule.condition.field, data, summary, allHostPools, allScalingPlans,
                    allGalleries, allVNets, allSessionHosts, allApplicationGroups
                );
                
                if (conditionMet) {
                    ruleScore = rule.points;
                    ruleMessage = rule.successMessage || '';
                } else {
                    ruleMessage = rule.warningMessage || rule.failureMessage || '';
                    ruleRecommendation = rule.recommendation || '';
                }
                
                // Replace placeholders with actual values
                if (ruleMessage) {
                    ruleMessage = ruleMessage
                        .replace('{value}', fieldValue !== null ? fieldValue : 'N/A')
                        .replace('{count}', allHostPools.length);
                }
            }
            
            pillarScore += ruleScore;
            
            if (ruleMessage) {
                findings.push(ruleMessage);
            }
            if (ruleRecommendation) {
                recommendations.push(ruleRecommendation);
            }
        });
        
        const score = Math.round((pillarScore / pillar.maxChecks) * 100);
        const status = score >= 80 ? 'excellent' : 
                      score >= 60 ? 'good' : 
                      score >= 40 ? 'fair' : 'needs improvement';
        
        assessment[pillarKey] = {
            score,
            findings,
            recommendations,
            status
        };
    }
    
    return assessment;
}

// Perform Well-Architected Framework Assessment for AVD (Legacy)
function performWAFAssessment(data) {
    const summary = data.summary;
    const allHostPools = data.subscriptions.flatMap(sub => sub.hostPools || []);
    const allScalingPlans = data.subscriptions.flatMap(sub => sub.scalingPlans || []);
    const allGalleries = data.subscriptions.flatMap(sub => sub.computeGalleries || []);
    const allVNets = data.subscriptions.flatMap(sub => sub.virtualNetworks || []);
    const allSessionHosts = allHostPools.flatMap(hp => hp.sessionHosts || []);
    
    const assessment = {
        reliability: { score: 0, findings: [], recommendations: [], status: '' },
        security: { score: 0, findings: [], recommendations: [], status: '' },
        costOptimization: { score: 0, findings: [], recommendations: [], status: '' },
        operationalExcellence: { score: 0, findings: [], recommendations: [], status: '' },
        performance: { score: 0, findings: [], recommendations: [], status: '' }
    };
    
    // === RELIABILITY ASSESSMENT ===
    let reliabilityScore = 0;
    const reliabilityChecks = 10;
    
    // Multiple host pools for redundancy
    if (summary.totalHostPools >= 2) {
        reliabilityScore += 2;
        assessment.reliability.findings.push('✓ Multiple host pools provide redundancy and failover capability');
    } else if (summary.totalHostPools === 1) {
        assessment.reliability.findings.push('⚠ Single host pool - consider multiple host pools for redundancy');
        assessment.reliability.recommendations.push('Deploy at least 2 host pools across different regions or availability zones for high availability');
    } else {
        assessment.reliability.findings.push('✗ No host pools deployed');
    }
    
    // Session host availability
    const availabilityRate = summary.totalSessionHosts > 0 ? (summary.availableSessionHosts / summary.totalSessionHosts) * 100 : 0;
    if (availabilityRate >= 90) {
        reliabilityScore += 2;
        assessment.reliability.findings.push(`✓ Excellent session host availability (${availabilityRate.toFixed(1)}%)`);
    } else if (availabilityRate >= 75) {
        reliabilityScore += 1;
        assessment.reliability.findings.push(`⚠ Good session host availability (${availabilityRate.toFixed(1)}%) - monitor unavailable hosts`);
    } else if (summary.totalSessionHosts > 0) {
        assessment.reliability.findings.push(`✗ Low session host availability (${availabilityRate.toFixed(1)}%) - investigate unavailable hosts`);
        assessment.reliability.recommendations.push('Investigate and resolve issues with unavailable session hosts');
    }
    
    // Validation environment (host pool with "test", "val", "dev" in name)
    const hasValidationEnv = allHostPools.some(hp => 
        hp.name.toLowerCase().includes('test') || 
        hp.name.toLowerCase().includes('val') || 
        hp.name.toLowerCase().includes('dev')
    );
    if (hasValidationEnv) {
        reliabilityScore += 1;
        assessment.reliability.findings.push('✓ Validation/test environment detected for testing updates before production');
    } else {
        assessment.reliability.findings.push('⚠ No validation environment detected');
        assessment.reliability.recommendations.push('Create a validation host pool to test updates before deploying to production');
    }
    
    // Session host health
    const healthyHosts = allSessionHosts.filter(sh => sh.status === 'Available').length;
    if (healthyHosts === allSessionHosts.length && allSessionHosts.length > 0) {
        reliabilityScore += 1;
        assessment.reliability.findings.push('✓ All session hosts are healthy and available');
    } else if (healthyHosts > 0) {
        assessment.reliability.findings.push(`⚠ ${allSessionHosts.length - healthyHosts} out of ${allSessionHosts.length} session hosts are unhealthy or unavailable`);
    }
    
    // Pooled host pools for resiliency
    const pooledHostPools = allHostPools.filter(hp => hp.hostPoolType === 'Pooled').length;
    if (pooledHostPools > 0) {
        reliabilityScore += 1;
        assessment.reliability.findings.push(`✓ Pooled host pools (${pooledHostPools}) provide better resiliency than personal desktops`);
    }
    
    // Multiple VNets for network redundancy
    if (summary.totalVNets >= 2) {
        reliabilityScore += 1;
        assessment.reliability.findings.push(`✓ Multiple virtual networks (${summary.totalVNets}) support network redundancy`);
    } else if (summary.totalVNets === 1) {
        assessment.reliability.findings.push('⚠ Single virtual network - consider multi-region networking for DR');
        assessment.reliability.recommendations.push('Consider deploying session hosts in multiple regions with separate VNets for disaster recovery');
    }
    
    // Compute galleries for image availability
    if (allGalleries.length > 0) {
        reliabilityScore += 1;
        assessment.reliability.findings.push('✓ Compute galleries enable consistent and reliable image deployment');
    } else {
        assessment.reliability.findings.push('⚠ No compute galleries - consider using galleries for standardized image management');
        assessment.reliability.recommendations.push('Create Azure Compute Gallery for centralized image management and version control');
    }
    
    // Registration token management
    const expiredTokens = allHostPools.filter(hp => hp.registrationToken?.expired).length;
    if (expiredTokens === 0 && allHostPools.length > 0) {
        reliabilityScore += 1;
        assessment.reliability.findings.push('✓ All registration tokens are valid - hosts can join host pools');
    } else if (expiredTokens > 0) {
        assessment.reliability.findings.push(`⚠ ${expiredTokens} host pool(s) have expired registration tokens`);
        assessment.reliability.recommendations.push('Renew expired registration tokens to allow new session hosts to join host pools');
    }
    
    // Sufficient capacity
    const hasOverCapacity = allHostPools.some(hp => hp.sessionHostCount >= 3);
    if (hasOverCapacity) {
        reliabilityScore += 1;
        assessment.reliability.findings.push('✓ Host pools have sufficient capacity for load distribution and failover');
    } else if (allHostPools.length > 0) {
        assessment.reliability.findings.push('⚠ Consider adding more session hosts per host pool for redundancy');
        assessment.reliability.recommendations.push('Deploy at least 3 session hosts per host pool to handle failures');
    }
    
    assessment.reliability.score = Math.round((reliabilityScore / reliabilityChecks) * 100);
    assessment.reliability.status = assessment.reliability.score >= 80 ? 'excellent' : 
                                   assessment.reliability.score >= 60 ? 'good' : 
                                   assessment.reliability.score >= 40 ? 'fair' : 'needs improvement';
    
    // === SECURITY ASSESSMENT ===
    let securityScore = 0;
    const securityChecks = 10;
    
    // Network isolation
    if (summary.totalVNets > 0) {
        securityScore += 2;
        assessment.security.findings.push('✓ Session hosts are deployed in virtual networks providing network isolation');
    } else {
        assessment.security.findings.push('✗ No virtual networks detected - network security may be inadequate');
        assessment.security.recommendations.push('Deploy session hosts in virtual networks with proper network security groups');
    }
    
    // Load balancer type (breadth-first is more secure for pooled)
    const breadthFirstPools = allHostPools.filter(hp => hp.loadBalancerType === 'BreadthFirst' && hp.hostPoolType === 'Pooled').length;
    if (breadthFirstPools > 0) {
        securityScore += 1;
        assessment.security.findings.push('✓ Breadth-first load balancing distributes users across all hosts, reducing attack surface per host');
    }
    
    // Personal host pools (better isolation)
    const personalPools = allHostPools.filter(hp => hp.hostPoolType === 'Personal').length;
    if (personalPools > 0 && allHostPools.length > 0) {
        securityScore += 1;
        assessment.security.findings.push(`✓ Personal host pools (${personalPools}) provide user-level isolation for sensitive workloads`);
    }
    
    // Registration token security (should be expired when not actively adding hosts)
    const validTokens = allHostPools.filter(hp => hp.registrationToken?.exists && !hp.registrationToken?.expired).length;
    if (validTokens === 0) {
        securityScore += 1;
        assessment.security.findings.push('✓ No active registration tokens - reduces unauthorized host enrollment risk');
    } else {
        assessment.security.findings.push(`⚠ ${validTokens} host pool(s) have active registration tokens - rotate when not actively adding hosts`);
        assessment.security.recommendations.push('Expire registration tokens when not actively adding session hosts to prevent unauthorized enrollment');
    }
    
    // Multiple workspaces (segmentation)
    if (summary.totalWorkspaces >= 2) {
        securityScore += 1;
        assessment.security.findings.push(`✓ Multiple workspaces (${summary.totalWorkspaces}) enable user access segmentation`);
    } else if (summary.totalWorkspaces === 1) {
        assessment.security.findings.push('⚠ Single workspace - consider multiple workspaces for different user groups');
    }
    
    // Application groups for access control
    if (summary.totalApplicationGroups >= 2) {
        securityScore += 1;
        assessment.security.findings.push(`✓ Multiple application groups (${summary.totalApplicationGroups}) support granular access control`);
    } else if (summary.totalApplicationGroups === 1) {
        assessment.security.findings.push('⚠ Single application group - consider additional groups for role-based access');
        assessment.security.recommendations.push('Create multiple application groups to implement principle of least privilege');
    }
    
    // Image management security
    if (allGalleries.length > 0) {
        securityScore += 1;
        assessment.security.findings.push('✓ Compute galleries enable secure, versioned image deployment');
    } else {
        assessment.security.findings.push('⚠ No compute galleries - consider using galleries for secure image management');
    }
    
    // Session host resource groups (organized security boundaries)
    const uniqueRGs = new Set(allHostPools.map(hp => hp.resourceGroup)).size;
    if (uniqueRGs >= 2) {
        securityScore += 1;
        assessment.security.findings.push(`✓ Multiple resource groups (${uniqueRGs}) provide security boundaries`);
    }
    
    // Check for desktop app groups (full desktop access requires more security)
    const desktopAppGroups = data.subscriptions.flatMap(sub => sub.applicationGroups || [])
        .filter(ag => ag.applicationGroupType === 'Desktop').length;
    if (desktopAppGroups > 0) {
        securityScore += 1;
        assessment.security.findings.push('✓ Desktop application groups detected - ensure MFA and conditional access policies are enforced');
    }
    
    // Session host count per host pool (smaller = better containment)
    const avgHostsPerPool = allHostPools.length > 0 ? summary.totalSessionHosts / allHostPools.length : 0;
    if (avgHostsPerPool > 0 && avgHostsPerPool <= 20) {
        securityScore += 1;
        assessment.security.findings.push('✓ Reasonable session host count per pool supports security incident containment');
    } else if (avgHostsPerPool > 20) {
        assessment.security.findings.push('⚠ High session host count per pool - consider splitting for better security boundaries');
        assessment.security.recommendations.push('Limit host pools to 20-30 session hosts for easier security management and incident response');
    }
    
    assessment.security.score = Math.round((securityScore / securityChecks) * 100);
    assessment.security.status = assessment.security.score >= 80 ? 'excellent' : 
                                assessment.security.score >= 60 ? 'good' : 
                                assessment.security.score >= 40 ? 'fair' : 'needs improvement';
    
    // === COST OPTIMIZATION ASSESSMENT ===
    let costScore = 0;
    const costChecks = 10;
    
    // Scaling plans (critical for cost optimization)
    if (summary.totalScalingPlans > 0) {
        costScore += 3;
        assessment.costOptimization.findings.push(`✓ Scaling plans configured (${summary.totalScalingPlans}) - automatically start/stop hosts based on demand`);
    } else {
        assessment.costOptimization.findings.push('✗ No scaling plans - session hosts run continuously, increasing costs');
        assessment.costOptimization.recommendations.push('Implement scaling plans to automatically start/stop session hosts based on schedule anddemand');
    }
    
    // Pooled vs Personal (pooled is more cost-effective)
    const pooledRatio = allHostPools.length > 0 ? 
        pooledHostPools / allHostPools.length : 0;
    if (pooledRatio >= 0.7) {
        costScore += 2;
        assessment.costOptimization.findings.push(`✓ Primarily pooled host pools (${pooledHostPools}/${allHostPools.length}) - optimal cost efficiency through resource sharing`);
    } else if (pooledHostPools > 0) {
        costScore += 1;
        assessment.costOptimization.findings.push(`⚠ Mix of pooled and personal host pools - consider pooled for cost savings where appropriate`);
    } else if (personalPools > 0) {
        assessment.costOptimization.findings.push('⚠ Only personal host pools - higher costs per user');
        assessment.costOptimization.recommendations.push('Evaluate if task workers can use pooled host pools for significant cost savings');
    }
    
    // Utilization check (active sessions vs capacity)
    const totalCapacity = allHostPools.reduce((sum, hp) => 
        sum + (hp.sessionHostCount * (hp.maxSessionLimit || 10)), 0);
    const utilizationRate = totalCapacity > 0 ? 
        (summary.totalUserSessions / totalCapacity) * 100 : 0;
    
    if (utilizationRate >= 60 && utilizationRate <= 80) {
        costScore += 2;
        assessment.costOptimization.findings.push(`✓ Good capacity utilization (${utilizationRate.toFixed(1)}%) - avoiding over-provisioning`);
    } else if (utilizationRate < 60 && summary.totalSessionHosts > 0) {
        costScore += 1;
        assessment.costOptimization.findings.push(`⚠ Low capacity utilization (${utilizationRate.toFixed(1)}%) - consider reducing capacity or implementing scaling`);
        assessment.costOptimization.recommendations.push('Review capacity and implement scaling plans to match actual demand');
    } else if (utilizationRate > 80) {
        assessment.costOptimization.findings.push(`⚠ High utilization (${utilizationRate.toFixed(1)}%) - users may experience degraded performance`);
        assessment.costOptimization.recommendations.push('Add capacity or optimize session limits to prevent performance issues');
    }
    
    // Appropriate session limits
    const hasOptimalSessionLimits = allHostPools.some(hp => 
        hp.hostPoolType === 'Pooled' && hp.maxSessionLimit >= 10 && hp.maxSessionLimit <= 25
    );
    if (hasOptimalSessionLimits) {
        costScore += 1;
        assessment.costOptimization.findings.push('✓ Optimal session limits configured (10-25) for cost-performance balance');
    } else if (allHostPools.some(hp => hp.hostPoolType === 'Pooled' && hp.maxSessionLimit < 10)) {
        assessment.costOptimization.findings.push('⚠ Low session limits may result in over-provisioning');
        assessment.costOptimization.recommendations.push('Review and optimize session limits based on workload requirements');
    }
    
    // Compute galleries (reuse reduces deployment costs)
    if (allGalleries.length > 0) {
        costScore += 1;
        assessment.costOptimization.findings.push('✓ Compute galleries reduce deployment time and costs through image reuse');
    } else {
        assessment.costOptimization.recommendations.push('Use compute galleries to reduce image management overhead and deployment costs');
    }
    
    // Right-sized deployment (not over-deploying host pools)
    if (allHostPools.length > 0 && allHostPools.length <= 5) {
        costScore += 1;
        assessment.costOptimization.findings.push('✓ Reasonable number of host pools - avoiding management overhead');
    } else if (allHostPools.length > 5) {
        assessment.costOptimization.findings.push(`⚠ Multiple host pools (${allHostPools.length}) - consolidate where possible to reduce management costs`);
        assessment.costOptimization.recommendations.push('Evaluate if host pools can be consolidated to reduce operational overhead');
    }
    
    assessment.costOptimization.score = Math.round((costScore / costChecks) * 100);
    assessment.costOptimization.status = assessment.costOptimization.score >= 80 ? 'excellent' : 
                                        assessment.costOptimization.score >= 60 ? 'good' : 
                                        assessment.costOptimization.score >= 40 ? 'fair' : 'needs improvement';
    
    // === OPERATIONAL EXCELLENCE ASSESSMENT ===
    let opexScore = 0;
    const opexChecks = 10;
    
    // Scaling plans (automation)
    if (summary.totalScalingPlans > 0) {
        opexScore += 2;
        assessment.operationalExcellence.findings.push(`✓ Scaling plans (${summary.totalScalingPlans}) automate capacity management`);
    } else {
        assessment.operationalExcellence.findings.push('✗ No scaling plans - manual capacity management increases operational burden');
        assessment.operationalExcellence.recommendations.push('Implement scaling plans to automate session host lifecycle management');
    }
    
    // Compute galleries (standardization)
    if (allGalleries.length > 0) {
        opexScore += 2;
        const totalImages = allGalleries.reduce((sum, g) => sum + (g.images?.length || 0), 0);
        assessment.operationalExcellence.findings.push(`✓ Compute galleries (${allGalleries.length}) with ${totalImages} images support standardized deployments`);
    } else {
        assessment.operationalExcellence.findings.push('✗ No compute galleries - missing centralized image management');
        assessment.operationalExcellence.recommendations.push('Create compute galleries for version-controlled, standardized image  deployment');
    }
    
    // Validation environment
    if (hasValidationEnv) {
        opexScore += 1;
        assessment.operationalExcellence.findings.push('✓ Validation environment supports controlled update deployment');
    } else {
        assessment.operationalExcellence.recommendations.push('Deploy a validation host pool for testing updates before production rollout');
    }
    
    // Application groups organization
    if (summary.totalApplicationGroups >= 2) {
        opexScore += 1;
        assessment.operationalExcellence.findings.push(`✓ Multiple application groups (${summary.totalApplicationGroups}) enable organized access management`);
    }
    
    // Workspace organization
    if (summary.totalWorkspaces >= 1) {
        opexScore += 1;
        assessment.operationalExcellence.findings.push(`✓ Workspaces configured (${summary.totalWorkspaces}) for end-user application delivery`);
    }
    
    // Resource naming consistency (check if names follow patterns)
    const hasNamingPattern = allHostPools.every(hp => 
        hp.name.match(/^[a-z]+(-[a-z0-9]+)+$/i) || 
        hp.name.match(/^[a-z]+_[a-z0-9_]+$/i)
    );
    if (hasNamingPattern && allHostPools.length > 0) {
        opexScore += 1;
        assessment.operationalExcellence.findings.push('✓ Consistent resource naming convention detected');
    } else if (allHostPools.length > 1) {
        assessment.operationalExcellence.findings.push('⚠ Inconsistent naming patterns - implement naming conventions for better resource management');
        assessment.operationalExcellence.recommendations.push('Establish and enforce naming conventions for all AVD resources');
    }
    
    // Load balancing configured
    const hasConfiguredLB = allHostPools.every(hp => hp.loadBalancerType);
    if (hasConfiguredLB && allHostPools.length > 0) {
        opexScore += 1;
        assessment.operationalExcellence.findings.push('✓ Load balancing configured on all host pools for optimal session distribution');
    }
    
    // Session host health monitoring
    if (summary.totalSessionHosts > 0) {
        opexScore += 1;
        assessment.operationalExcellence.findings.push('✓ Session host inventory available for health monitoring');
    }
    
    // Reasonable complexity (not too many resources to manage)
    const totalResources = summary.totalHostPools + summary.totalWorkspaces + summary.totalApplicationGroups;
    if (totalResources > 0 && totalResources <= 20) {
        opexScore += 1;
        assessment.operationalExcellence.findings.push('✓ Manageable resource complexity for operational efficiency');
    } else if (totalResources > 20) {
        assessment.operationalExcellence.findings.push('⚠ High resource count may increase operational complexity');
        assessment.operationalExcellence.recommendations.push('Review architecture for potential consolidation opportunities');
    }
    
    assessment.operationalExcellence.score = Math.round((opexScore / opexChecks) * 100);
    assessment.operationalExcellence.status = assessment.operationalExcellence.score >= 80 ? 'excellent' : 
                                             assessment.operationalExcellence.score >= 60 ? 'good' : 
                                             assessment.operationalExcellence.score >= 40 ? 'fair' : 'needs improvement';
    
    // === PERFORMANCE EFFICIENCY ASSESSMENT ===
    let perfScore = 0;
    const perfChecks = 10;
    
    // Load balancing strategy
    const depthFirstForPersonal = allHostPools.filter(hp => 
        hp.hostPoolType === 'Personal' && hp.loadBalancerType === 'Persistent'
    ).length;
    const breadthFirstForPooled = allHostPools.filter(hp => 
        hp.hostPoolType === 'Pooled' && hp.loadBalancerType === 'BreadthFirst'
    ).length;
    
    if (depthFirstForPersonal + breadthFirstForPooled === allHostPools.length && allHostPools.length > 0) {
        perfScore += 2;
        assessment.performance.findings.push('✓ Optimal load balancing strategy for each host pool type');
    } else if (breadthFirstForPooled > 0) {
        perfScore += 1;
        assessment.performance.findings.push('⚠ Review load balancing configuration for optimal performance');
        assessment.performance.recommendations.push('Use BreadthFirst for Pooled and Persistent for Personal host pools');
    }
    
    // Session limits configuration
    const hasSessionLimits = allHostPools.every(hp => hp.maxSessionLimit > 0);
    if (hasSessionLimits && allHostPools.length > 0) {
        perfScore += 1;
        assessment.performance.findings.push('✓ Session limits configured to prevent overloading session hosts');
    }
    
    // Optimal session limits for pooled
    const optimalPooledLimits = allHostPools.filter(hp => 
        hp.hostPoolType === 'Pooled' && hp.maxSessionLimit >= 5 && hp.maxSessionLimit <= 25
    ).length;
    if (optimalPooledLimits === pooledHostPools && pooledHostPools > 0) {
        perfScore += 2;
        assessment.performance.findings.push('✓ Session limits within recommended range (5-25) for pooled host pools');
    } else if (pooledHostPools > 0) {
        perfScore += 1;
        assessment.performance.findings.push('⚠ Review session limits for pooled host pools (recommended: 5-25 based on workload)');
        assessment.performance.recommendations.push('Adjust session limits based on CPU, memory, and workload type for optimal performance');
    }
    
    // Multiple session hosts for performance distribution
    const avgAvailableHosts = allHostPools.length > 0 ? 
        allHostPools.reduce((sum, hp) => sum + hp.availableHosts, 0) / allHostPools.length : 0;
    if (avgAvailableHosts >= 3) {
        perfScore += 1;
        assessment.performance.findings.push(`✓ Average ${avgAvailableHosts.toFixed(1)} available hosts per pool supports performance distribution`);
    } else if (allHostPools.length > 0) {
        assessment.performance.findings.push('⚠ Low average available hosts per pool - may impact performance during peak usage');
        assessment.performance.recommendations.push('Deploy at least 3 session hosts per host pool for performance distribution');
    }
    
    // Network connectivity
    if (summary.totalVNets > 0) {
        perfScore += 1;
        assessment.performance.findings.push('✓ Virtual network connectivity configured for optimized network performance');
    }
    
    // Proper distribution of resources across locations
    const locations = new Set(allHostPools.map(hp => hp.location)).size;
    if (locations >= 2) {
        perfScore += 1;
        assessment.performance.findings.push(`✓ Multi-region deployment (${locations} regions) reduces latency for distributed users`);
    } else if (locations === 1 && allHostPools.length > 0) {
        assessment.performance.findings.push('⚠ Single region deployment - consider multi-region for global user base');
        assessment.performance.recommendations.push('Deploy host pools in regions closest to user populations for reduced latency');
    }
    
    // Compute galleries (faster deployments)
    if (allGalleries.length > 0) {
        perfScore += 1;
        assessment.performance.findings.push('✓ Compute galleries enable faster session host deployment and updates');
    }
    
    // Current utilization vs capacity
    if (utilizationRate > 0 && utilizationRate < 70) {
        perfScore += 1;
        assessment.performance.findings.push(`✓ Current utilization (${utilizationRate.toFixed(1)}%) below threshold - sufficient headroom for performance`);
    } else if (utilizationRate >= 70 && utilizationRate <= 85) {
        assessment.performance.findings.push(`⚠ Moderate utilization (${utilizationRate.toFixed(1)}%) - monitor for performance impact`);
    } else if (utilizationRate > 85) {
        assessment.performance.findings.push(`✗ High utilization (${utilizationRate.toFixed(1)}%) - likely performance degradation`);
        assessment.performance.recommendations.push('Add session host capacity immediately to prevent performance issues');
    }
    
    // Active session distribution
    if (summary.disconnectedUserSessions > 0) {
        const disconnectedRatio = summary.disconnectedUserSessions / summary.totalUserSessions;
        if (disconnectedRatio < 0.2) {
            perfScore += 1;
            assessment.performance.findings.push('✓ Low disconnected session ratio indicates good user experience');
        } else {
            assessment.performance.findings.push(`⚠ ${(disconnectedRatio * 100).toFixed(1)}% disconnected sessions - investigate session stability`);
            assessment.performance.recommendations.push('Investigate causes of user session disconnections (network, host performance, etc.)');
        }
    }
    
    assessment.performance.score = Math.round((perfScore / perfChecks) * 100);
    assessment.performance.status = assessment.performance.score >= 80 ? 'excellent' : 
                                   assessment.performance.score >= 60 ? 'good' : 
                                   assessment.performance.score >= 40 ? 'fair' : 'needs improvement';
    
    return assessment;
}

// Export to PDF
async function exportToPDF() {
    try {
        showLoading();
        
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');
        
        const margin = 15;
        const pageHeight = 297;
        const pageWidth = 210;
        const maxWidth = pageWidth - (margin * 2);
        const lineHeight = 6;
        let yPos = 20;
        
        // Helper functions
        function addText(text, fontSize = 10, bold = false, color = [0, 0, 0]) {
            if (yPos > pageHeight - 15) {
                pdf.addPage();
                yPos = 20;
            }
            pdf.setFontSize(fontSize);
            pdf.setFont(undefined, bold ? 'bold' : 'normal');
            pdf.setTextColor(...color);
            const lines = pdf.splitTextToSize(text, maxWidth);
            lines.forEach(line => {
                pdf.text(line, margin, yPos);
                yPos += lineHeight;
            });
            pdf.setTextColor(0, 0, 0);
        }
        
        function addBullet(text, indent = 0) {
            if (yPos > pageHeight - 10) {
                pdf.addPage();
                yPos = 20;
            }
            const cleanText = text
                .replace(/✓/g, '[+]')
                .replace(/✗/g, '[-]')
                .replace(/⚠/g, '[!]');
            const bulletMargin = margin + indent;
            pdf.text('-', bulletMargin, yPos);
            const lines = pdf.splitTextToSize(cleanText, maxWidth - indent - 5);
            lines.forEach((line, idx) => {
                pdf.text(line, bulletMargin + 5, yPos);
                if (idx < lines.length - 1) yPos += lineHeight;
            });
            yPos += lineHeight;
        }
        
        function addSubSection(title) {
            if (yPos > pageHeight - 15) {
                pdf.addPage();
                yPos = 20;
            }
            pdf.setFontSize(11);
            pdf.setFont(undefined, 'bold');
            pdf.setTextColor(41, 128, 185);
            pdf.text(title, margin, yPos);
            yPos += 7;
            pdf.setTextColor(0, 0, 0);
        }
        
        function getScoreColor(percentage) {
            if (percentage >= 80) return [16, 185, 129];
            if (percentage >= 60) return [245, 158, 11];
            if (percentage >= 40) return [251, 146, 60];
            return [239, 68, 68];
        }
        
        // Function to capture architecture diagram
        async function captureArchitectureDiagram() {
            const diagramContainer = document.getElementById('networkDiagram');
            if (!diagramContainer) {
                console.log('Diagram container not found');
                return null;
            }
            
            // Check if diagram is hidden or has no content
            const canvas = diagramContainer.querySelector('canvas');
            if (!canvas) {
                console.log('Diagram canvas not found - diagram may not be loaded');
                return null;
            }
            
            // Check if container is visible
            const style = window.getComputedStyle(diagramContainer);
            if (style.display === 'none' || style.visibility === 'hidden') {
                console.log('Diagram is hidden, skipping capture');
                return null;
            }
            
            try {
                const capturedCanvas = await html2canvas(diagramContainer, {
                    backgroundColor: '#ffffff',
                    scale: 2,
                    logging: false,
                    useCORS: true
                });
                console.log('Diagram captured successfully');
                return capturedCanvas.toDataURL('image/png');
            } catch (error) {
                console.error('Error capturing diagram:', error);
                return null;
            }
        }
        
        // Capture diagram before generating PDF
        const diagramImage = await captureArchitectureDiagram();
        
        // === COVER PAGE ===
        pdf.setFontSize(24);
        pdf.setFont(undefined, 'bold');
        pdf.setTextColor(0, 120, 212);
        pdf.text('Azure Virtual Desktop', margin, yPos);
        yPos += 10;
        pdf.text('Assessment Report', margin, yPos);
        yPos += 15;
        
        pdf.setFontSize(12);
        pdf.setTextColor(0, 0, 0);
        pdf.setFont(undefined, 'normal');
        pdf.text(`Generated: ${new Date().toLocaleString()}`, margin, yPos);
        yPos += 7;
        pdf.setFontSize(10);
        pdf.setTextColor(100, 100, 100);
        pdf.text(`Report Version: ${APP_VERSION}`, margin, yPos);
        pdf.setTextColor(0, 0, 0);
        pdf.setFontSize(12);
        yPos += 10;
        
        if (inventoryData && inventoryData.subscriptions.length > 0) {
            pdf.text(`Subscription: ${inventoryData.subscriptions[0].name}`, margin, yPos);
            yPos += 7;
            pdf.text(`Tenant ID: ${inventoryData.subscriptions[0].tenantId}`, margin, yPos);
        }
        yPos += 20;
        
        pdf.setFontSize(10);
        addText('This report provides a comprehensive assessment of your Azure Virtual Desktop environment against Microsoft Well-Architected Framework best practices, including reliability, security, cost optimization, operational excellence, and performance efficiency.');
        
        // === EXECUTIVE SUMMARY ===
        pdf.addPage();
        yPos = 20;
        
        addText('EXECUTIVE SUMMARY', 16, true, [0, 120, 212]);
        yPos += 5;
        
        if (inventoryData) {
            const summary = inventoryData.summary;
            
            addSubSection('Resource Inventory');
            addBullet(`Host Pools: ${summary.totalHostPools || 0}`);
            addBullet(`Session Hosts: ${summary.totalSessionHosts || 0} (${summary.availableSessionHosts || 0} available, ${summary.unavailableSessionHosts || 0} unavailable)`);
            addBullet(`User Sessions: ${summary.totalUserSessions || 0} (${summary.activeUserSessions || 0} active, ${summary.disconnectedUserSessions || 0} disconnected)`);
            addBullet(`Workspaces: ${summary.totalWorkspaces || 0}`);
            addBullet(`Application Groups: ${summary.totalApplicationGroups || 0}`);
            addBullet(`Scaling Plans: ${summary.totalScalingPlans || 0}`);
            addBullet(`Virtual Networks: ${summary.totalVNets || 0}`);
            addBullet(`Compute Galleries: ${summary.totalComputeGalleries || 0}`);
            yPos += 5;
            
            // Perform WAF Assessment
            const wafAssessment = wafConfig ? 
                performWAFAssessmentWithConfig(inventoryData, wafConfig) : 
                performWAFAssessment(inventoryData);
            
            addSubSection('Well-Architected Framework Assessment');
            
            // Overall Score
            const overallScore = Math.round(
                (wafAssessment.reliability.score +
                 wafAssessment.security.score +
                 wafAssessment.costOptimization.score +
                 wafAssessment.operationalExcellence.score +
                 wafAssessment.performance.score) / 5
            );
            
            pdf.setFontSize(12);
            pdf.setFont(undefined, 'bold');
            const scoreColor = getScoreColor(overallScore);
            pdf.setTextColor(...scoreColor);
            pdf.text(`Overall WAF Score: ${overallScore}%`, margin, yPos);
            yPos += 8;
            pdf.setTextColor(0, 0, 0);
            pdf.setFont(undefined, 'normal');
            pdf.setFontSize(10);
            
            addText('This assessment evaluates your AVD environment across five pillars of the Well-Architected Framework. Scores reflect compliance with Microsoft best practices for Azure Virtual Desktop deployments.');
            yPos += 5;
            
            // === WAF PILLARS ASSESSMENT ===
            pdf.addPage();
            yPos = 20;
            
            addText('WELL-ARCHITECTED FRAMEWORK ASSESSMENT', 16, true, [0, 120, 212]);
            yPos += 5;
            
            // Pillar 1: Reliability
            addSubSection(`Reliability - ${wafAssessment.reliability.score}%`);
            const relColor = getScoreColor(wafAssessment.reliability.score);
            pdf.setTextColor(...relColor);
            addBullet(`Status: [${wafAssessment.reliability.status.toUpperCase()}]`);
            pdf.setTextColor(0, 0, 0);
            
            addText('Findings:', 10, true);
            wafAssessment.reliability.findings.forEach(finding => {
                addBullet(finding, 2);
            });
            yPos += 3;
            
            if (wafAssessment.reliability.recommendations.length > 0) {
                addText('Recommendations:', 10, true);
                wafAssessment.reliability.recommendations.forEach(rec => {
                    addBullet(rec, 2);
                });
            }
            yPos += 5;
            
            // Pillar 2: Security
            addSubSection(`Security - ${wafAssessment.security.score}%`);
            const secColor = getScoreColor(wafAssessment.security.score);
            pdf.setTextColor(...secColor);
            addBullet(`Status: [${wafAssessment.security.status.toUpperCase()}]`);
            pdf.setTextColor(0, 0, 0);
            
            addText('Findings:', 10, true);
            wafAssessment.security.findings.forEach(finding => {
                addBullet(finding, 2);
            });
            yPos += 3;
            
            if (wafAssessment.security.recommendations.length > 0) {
                addText('Recommendations:', 10, true);
                wafAssessment.security.recommendations.forEach(rec => {
                    addBullet(rec, 2);
                });
            }
            yPos += 5;
            
            // Pillar 3: Cost Optimization
            if (yPos > pageHeight - 60) {
                pdf.addPage();
                yPos = 20;
            }
            
            addSubSection(`Cost Optimization - ${wafAssessment.costOptimization.score}%`);
            const costColor = getScoreColor(wafAssessment.costOptimization.score);
            pdf.setTextColor(...costColor);
            addBullet(`Status: [${wafAssessment.costOptimization.status.toUpperCase()}]`);
            pdf.setTextColor(0, 0, 0);
            
            addText('Findings:', 10, true);
            wafAssessment.costOptimization.findings.forEach(finding => {
                addBullet(finding, 2);
            });
            yPos += 3;
            
            if (wafAssessment.costOptimization.recommendations.length > 0) {
                addText('Recommendations:', 10, true);
                wafAssessment.costOptimization.recommendations.forEach(rec => {
                    addBullet(rec, 2);
                });
            }
            yPos += 5;
            
            // Pillar 4: Operational Excellence
            if (yPos > pageHeight - 60) {
                pdf.addPage();
                yPos = 20;
            }
            
            addSubSection(`Operational Excellence - ${wafAssessment.operationalExcellence.score}%`);
            const opexColor = getScoreColor(wafAssessment.operationalExcellence.score);
            pdf.setTextColor(...opexColor);
            addBullet(`Status: [${wafAssessment.operationalExcellence.status.toUpperCase()}]`);
            pdf.setTextColor(0, 0, 0);
            
            addText('Findings:', 10, true);
            wafAssessment.operationalExcellence.findings.forEach(finding => {
                addBullet(finding, 2);
            });
            yPos += 3;
            
            if (wafAssessment.operationalExcellence.recommendations.length > 0) {
                addText('Recommendations:', 10, true);
                wafAssessment.operationalExcellence.recommendations.forEach(rec => {
                    addBullet(rec, 2);
                });
            }
            yPos += 5;
            
            // Pillar 5: Performance Efficiency
            if (yPos > pageHeight - 60) {
                pdf.addPage();
                yPos = 20;
            }
            
            addSubSection(`Performance Efficiency - ${wafAssessment.performance.score}%`);
            const perfColor = getScoreColor(wafAssessment.performance.score);
            pdf.setTextColor(...perfColor);
            addBullet(`Status: [${wafAssessment.performance.status.toUpperCase()}]`);
            pdf.setTextColor(0, 0, 0);
            
            addText('Findings:', 10, true);
            wafAssessment.performance.findings.forEach(finding => {
                addBullet(finding, 2);
            });
            yPos += 3;
            
            if (wafAssessment.performance.recommendations.length > 0) {
                addText('Recommendations:', 10, true);
                wafAssessment.performance.recommendations.forEach(rec => {
                    addBullet(rec, 2);
                });
            }
            yPos += 5;
            
            // === ARCHITECTURE DIAGRAM ===
            if (diagramImage) {
                pdf.addPage();
                yPos = 20;
                
                addText('ARCHITECTURE DIAGRAM', 16, true, [0, 120, 212]);
                yPos += 5;
                
                addText('The following diagram shows the topology and relationships between AVD components in your environment:');
                yPos += 10;
                
                // Calculate dimensions to fit the page
                const maxDiagramWidth = pageWidth - (2 * margin);
                const maxDiagramHeight = pageHeight - yPos - 30;
                
                // Add the diagram image
                try {
                    pdf.addImage(diagramImage, 'PNG', margin, yPos, maxDiagramWidth, maxDiagramHeight);
                    yPos += maxDiagramHeight + 10;
                } catch (error) {
                    console.error('Error adding diagram to PDF:', error);
                    addText('Diagram could not be rendered in PDF export.');
                }
                
                yPos += 5;
            }
            
            // === DETAILED INVENTORY ===
            pdf.addPage();
            yPos = 20;
            
            addText('DETAILED RESOURCE INVENTORY', 16, true, [0, 120, 212]);
            yPos += 5;
            
            // Subscriptions
            inventoryData.subscriptions.forEach((sub, subIndex) => {
                if (yPos > pageHeight - 30) {
                    pdf.addPage();
                    yPos = 20;
                }
                
                addSubSection(`Subscription: ${sub.name}`);
                
                // Host Pools - Table Format
                if (sub.hostPools.length > 0) {
                    if (yPos > pageHeight - 30) {
                        pdf.addPage();
                        yPos = 20;
                    }
                    
                    addText('Host Pools:', 11, true);
                    pdf.setFontSize(8);
                    pdf.setFont(undefined, 'normal');
                    pdf.setTextColor(80, 80, 80);
                    pdf.text('Collections of session hosts with the same configuration. Host pools define load balancing and resource allocation.', margin, yPos);
                    pdf.setTextColor(0, 0, 0);
                    yPos += 5;
                    
                    // Main Host Pools Table
                    const hostPoolTableData = sub.hostPools.map(hp => {
                        const type = `${hp.hostPoolType}`;
                        const loadBalancing = hp.loadBalancerType;
                        const hosts = `${hp.sessionHostCount} (${hp.availableHosts}A/${hp.unavailableHosts}U)`;
                        const sessions = hp.totalUserSessions > 0 ? `${hp.totalUserSessions} (${hp.activeUserSessions}A/${hp.disconnectedUserSessions}D)` : '0';
                        const avgSessions = hp.sessionHostCount > 0 && hp.totalUserSessions > 0 ? (hp.totalUserSessions / hp.sessionHostCount).toFixed(1) : '0';
                        const validation = hp.validationEnvironment ? 'Yes' : 'No';
                        const scalingPlan = hp.scalingPlanReference ? 'Yes' : 'No';
                        
                        return [
                            hp.name.length > 35 ? hp.name.substring(0, 32) + '...' : hp.name,
                            type,
                            loadBalancing,
                            hosts,
                            sessions,
                            avgSessions,
                            validation,
                            scalingPlan
                        ];
                    });
                    
                    pdf.autoTable({
                        startY: yPos,
                        head: [['Host Pool', 'Type', 'Load Bal', 'Hosts', 'Sessions', 'Avg/Host', 'Val Env', 'Scaling']],
                        body: hostPoolTableData,
                        theme: 'grid',
                        headStyles: { fillColor: [0, 120, 212], fontSize: 7, fontStyle: 'bold' },
                        bodyStyles: { fontSize: 6.5 },
                        margin: { left: margin, right: margin },
                        columnStyles: {
                            0: { cellWidth: 50 },
                            1: { cellWidth: 20, halign: 'center' },
                            2: { cellWidth: 24, halign: 'center' },
                            3: { cellWidth: 22, halign: 'center' },
                            4: { cellWidth: 22, halign: 'center' },
                            5: { cellWidth: 16, halign: 'center' },
                            6: { cellWidth: 16, halign: 'center' },
                            7: { cellWidth: 18, halign: 'center' }
                        },
                        didParseCell: function(data) {
                            // Highlight validation environment column
                            if (data.column.index === 6 && data.section === 'body') {
                                if (data.cell.raw === 'Yes') {
                                    data.cell.styles.textColor = [16, 124, 16];
                                    data.cell.styles.fontStyle = 'bold';
                                }
                            }
                            // Highlight scaling plan column
                            if (data.column.index === 7 && data.section === 'body') {
                                if (data.cell.raw === 'Yes') {
                                    data.cell.styles.textColor = [16, 124, 16];
                                    data.cell.styles.fontStyle = 'bold';
                                } else {
                                    data.cell.styles.textColor = [220, 53, 69];
                                }
                            }
                        }
                    });
                    yPos = pdf.lastAutoTable.finalY + 5;
                    
                    // Additional Host Pool Details (optional)
                    const poolsWithDetails = sub.hostPools.filter(hp => 
                        hp.friendlyName || hp.maxSessionLimit || hp.registrationToken
                    );
                    
                    if (poolsWithDetails.length > 0) {
                        if (yPos > pageHeight - 30) {
                            pdf.addPage();
                            yPos = 20;
                        }
                        
                        pdf.setFontSize(9);
                        pdf.setFont(undefined, 'bold');
                        pdf.text('Additional Host Pool Details:', margin, yPos);
                        yPos += 5;
                        pdf.setFont(undefined, 'normal');
                        
                        poolsWithDetails.forEach(hp => {
                            if (yPos > pageHeight - 30) {
                                pdf.addPage();
                                yPos = 20;
                            }
                            
                            const detailsData = [];
                            
                            if (hp.friendlyName) {
                                detailsData.push(['Friendly Name', hp.friendlyName]);
                            }
                            if (hp.maxSessionLimit) {
                                detailsData.push(['Max Session Limit', hp.maxSessionLimit.toString()]);
                            }
                            if (hp.preferredAppGroupType) {
                                detailsData.push(['Preferred App Group Type', hp.preferredAppGroupType]);
                            }
                            if (hp.registrationToken) {
                                const tokenStatus = hp.registrationToken.expired ? 'Expired' : 'Valid';
                                detailsData.push(['Registration Token', tokenStatus]);
                                if (hp.registrationToken.expiryTime) {
                                    const expiryDate = new Date(hp.registrationToken.expiryTime);
                                    detailsData.push(['Token Expiry', expiryDate.toLocaleString()]);
                                }
                            }
                            if (hp.scalingPlanReference) {
                                detailsData.push(['Scaling Plan', hp.scalingPlanReference]);
                            }
                            
                            if (detailsData.length > 0) {
                                pdf.setFontSize(8);
                                pdf.setFont(undefined, 'bold');
                                pdf.text(hp.name, margin + 2, yPos);
                                yPos += 4;
                                pdf.setFont(undefined, 'normal');
                                
                                pdf.autoTable({
                                    startY: yPos,
                                    body: detailsData,
                                    theme: 'plain',
                                    bodyStyles: { fontSize: 7 },
                                    margin: { left: margin + 5, right: margin },
                                    columnStyles: {
                                        0: { cellWidth: 45, fontStyle: 'bold' },
                                        1: { cellWidth: 110 }
                                    }
                                });
                                yPos = pdf.lastAutoTable.finalY + 4;
                            }
                        });
                    }
                    
                    yPos += 3;
                }
                
                // Session Hosts Detail - Table Format (Landscape)
                if (sub.hostPools.length > 0) {
                    const allSessionHosts = sub.hostPools.flatMap(hp => 
                        (hp.sessionHosts || []).map(sh => ({...sh, hostPoolName: hp.name, hostPoolType: hp.hostPoolType}))
                    );
                    if (allSessionHosts.length > 0) {
                        // Add a new landscape page for session hosts table
                        pdf.addPage('a4', 'landscape');
                        yPos = 20;
                        
                        addText('Session Hosts:', 11, true);
                        pdf.setFontSize(8);
                        pdf.setFont(undefined, 'normal');
                        pdf.setTextColor(80, 80, 80);
                        pdf.text('Virtual machines that host user sessions and run applications. Each session host is assigned to a host pool.', margin, yPos);
                        pdf.setTextColor(0, 0, 0);
                        yPos += 5;
                        
                        // Prepare session host table data
                        const sessionHostTableData = allSessionHosts.map(sh => {
                            const status = sh.status === 'Available' ? 'Available' : sh.status;
                            const sessions = sh.sessions > 0 ? `${sh.sessions}` : '0';
                            const vmSize = sh.vmSize || 'N/A';
                            const privateIP = sh.network && sh.network.privateIP ? sh.network.privateIP : 'N/A';
                            
                            // Format image source
                            let imageSource = 'N/A';
                            if (sh.image) {
                                if (sh.image.type === 'Gallery') {
                                    imageSource = `${sh.image.imageName || 'Unknown'} (${sh.image.version || '?'})`;
                                } else if (sh.image.type === 'Marketplace') {
                                    imageSource = `${sh.image.publisher || ''}/${sh.image.offer || 'Unknown'}`;
                                }
                            }
                            
                            const osVersion = sh.osVersion || 'N/A';
                            const agentVersion = sh.agentVersion || 'N/A';
                            const lastHB = sh.lastHeartBeat ? new Date(sh.lastHeartBeat).toLocaleDateString('en-US', {month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'}) : 'N/A';
                            
                            return [
                                sh.name.length > 28 ? sh.name.substring(0, 25) + '...' : sh.name,
                                sh.hostPoolName.length > 24 ? sh.hostPoolName.substring(0, 21) + '...' : sh.hostPoolName,
                                status,
                                sessions,
                                vmSize,
                                privateIP,
                                imageSource.length > 32 ? imageSource.substring(0, 29) + '...' : imageSource,
                                osVersion.length > 18 ? osVersion.substring(0, 15) + '...' : osVersion,
                                agentVersion.length > 14 ? agentVersion.substring(0, 11) + '...' : agentVersion,
                                lastHB
                            ];
                        });
                        
                        // Landscape dimensions: width=297mm, so available width is ~267mm
                        pdf.autoTable({
                            startY: yPos,
                            head: [['Session Host', 'Host Pool', 'Status', 'Sessions', 'VM Size', 'Private IP', 'Image Source', 'OS Version', 'Agent Ver', 'Last Heartbeat']],
                            body: sessionHostTableData,
                            theme: 'grid',
                            headStyles: { fillColor: [0, 120, 212], fontSize: 7, fontStyle: 'bold' },
                            bodyStyles: { fontSize: 6.5 },
                            margin: { left: margin, right: margin },
                            columnStyles: {
                                0: { cellWidth: 30 },
                                1: { cellWidth: 28 },
                                2: { cellWidth: 18 },
                                3: { cellWidth: 14, halign: 'center' },
                                4: { cellWidth: 22 },
                                5: { cellWidth: 22 },
                                6: { cellWidth: 38 },
                                7: { cellWidth: 22 },
                                8: { cellWidth: 18 },
                                9: { cellWidth: 28 }
                            },
                            didParseCell: function(data) {
                                // Color code status column
                                if (data.column.index === 2 && data.section === 'body') {
                                    const status = data.cell.raw;
                                    if (status === 'Available') {
                                        data.cell.styles.textColor = [16, 124, 16];
                                        data.cell.styles.fontStyle = 'bold';
                                    } else {
                                        data.cell.styles.textColor = [220, 53, 69];
                                    }
                                }
                                // Highlight N/A values
                                if (data.section === 'body' && (data.cell.raw === 'N/A' || data.cell.raw === '-')) {
                                    data.cell.styles.textColor = [150, 150, 150];
                                }
                            }
                        });
                        
                        // Switch back to portrait for next section
                        pdf.addPage('a4', 'portrait');
                        yPos = 20;
                    }
                }
                
                // Workspaces - Table Format
                if (sub.workspaces.length > 0) {
                    if (yPos > pageHeight - 30) {
                        pdf.addPage();
                        yPos = 20;
                    }
                    
                    addText('Workspaces:', 11, true);
                    pdf.setFontSize(8);
                    pdf.setFont(undefined, 'normal');
                    pdf.setTextColor(80, 80, 80);
                    pdf.text('User-facing entry points for AVD. Workspaces group application groups and provide a unified user experience.', margin, yPos);
                    pdf.setTextColor(0, 0, 0);
                    yPos += 5;
                    
                    // Main Workspaces Table
                    const workspaceTableData = sub.workspaces.map(ws => {
                        const appGroupCount = ws.applicationGroupReferences && ws.applicationGroupReferences.length > 0 
                            ? ws.applicationGroupReferences.length.toString() 
                            : '0';
                        const friendlyName = ws.friendlyName || '-';
                        
                        return [
                            ws.name.length > 45 ? ws.name.substring(0, 42) + '...' : ws.name,
                            friendlyName.length > 40 ? friendlyName.substring(0, 37) + '...' : friendlyName,
                            ws.location,
                            appGroupCount,
                            ws.resourceGroup.length > 30 ? ws.resourceGroup.substring(0, 27) + '...' : ws.resourceGroup
                        ];
                    });
                    
                    pdf.autoTable({
                        startY: yPos,
                        head: [['Workspace Name', 'Friendly Name', 'Location', 'App Groups', 'Resource Group']],
                        body: workspaceTableData,
                        theme: 'grid',
                        headStyles: { fillColor: [0, 120, 212], fontSize: 8, fontStyle: 'bold' },
                        bodyStyles: { fontSize: 7 },
                        margin: { left: margin, right: margin },
                        columnStyles: {
                            0: { cellWidth: 55 },
                            1: { cellWidth: 45 },
                            2: { cellWidth: 26 },
                            3: { cellWidth: 20, halign: 'center' },
                            4: { cellWidth: 42 }
                        },
                        didParseCell: function(data) {
                            // Highlight app group count
                            if (data.column.index === 3 && data.section === 'body') {
                                const count = parseInt(data.cell.raw);
                                if (count === 0) {
                                    data.cell.styles.textColor = [220, 53, 69];
                                } else {
                                    data.cell.styles.textColor = [16, 124, 16];
                                    data.cell.styles.fontStyle = 'bold';
                                }
                            }
                            // Gray out dashes
                            if (data.section === 'body' && data.cell.raw === '-') {
                                data.cell.styles.textColor = [150, 150, 150];
                            }
                        }
                    });
                    yPos = pdf.lastAutoTable.finalY + 5;
                    
                    // Workspace to Application Group Mapping (if any workspace has app groups)
                    const workspacesWithAppGroups = sub.workspaces.filter(ws => 
                        ws.applicationGroupReferences && ws.applicationGroupReferences.length > 0
                    );
                    
                    if (workspacesWithAppGroups.length > 0) {
                        if (yPos > pageHeight - 30) {
                            pdf.addPage();
                            yPos = 20;
                        }
                        
                        pdf.setFontSize(9);
                        pdf.setFont(undefined, 'bold');
                        pdf.text('Workspace Application Group Assignments:', margin, yPos);
                        yPos += 5;
                        pdf.setFont(undefined, 'normal');
                        
                        workspacesWithAppGroups.forEach(ws => {
                            if (yPos > pageHeight - 30) {
                                pdf.addPage();
                                yPos = 20;
                            }
                            
                            pdf.setFontSize(8);
                            pdf.setFont(undefined, 'bold');
                            pdf.text(ws.name, margin + 2, yPos);
                            yPos += 4;
                            pdf.setFont(undefined, 'normal');
                            
                            const agTableData = ws.applicationGroupReferences.map(agRef => {
                                const agName = agRef.split('/').pop();
                                return [agName];
                            });
                            
                            pdf.autoTable({
                                startY: yPos,
                                head: [['Application Group']],
                                body: agTableData,
                                theme: 'striped',
                                headStyles: { fillColor: [41, 128, 185], fontSize: 7 },
                                bodyStyles: { fontSize: 7 },
                                margin: { left: margin + 5, right: margin },
                                columnStyles: {
                                    0: { cellWidth: 160 }
                                }
                            });
                            yPos = pdf.lastAutoTable.finalY + 4;
                        });
                    }
                    
                    yPos += 3;
                }
                
                // Application Groups - Table Format
                if (sub.applicationGroups.length > 0) {
                    if (yPos > pageHeight - 30) {
                        pdf.addPage();
                        yPos = 20;
                    }
                    addText('Application Groups:', 11, true);
                    pdf.setFontSize(8);
                    pdf.setFont(undefined, 'normal');
                    pdf.setTextColor(80, 80, 80);
                    pdf.text('Logical groupings of applications or desktops. Application groups are assigned to workspaces and accessed by users.', margin, yPos);
                    pdf.setTextColor(0, 0, 0);
                    yPos += 5;
                    
                    // Main Application Groups Table
                    const appGroupTableData = sub.applicationGroups.map(ag => {
                        const hpName = ag.hostPoolArmPath ? ag.hostPoolArmPath.split('/').pop() : 'Not assigned';
                        const wsName = ag.workspaceArmPath ? ag.workspaceArmPath.split('/').pop() : 'Not assigned';
                        const appCount = ag.applications && ag.applications.length > 0 ? ag.applications.length : '0';
                        
                        return [
                            ag.name.length > 35 ? ag.name.substring(0, 32) + '...' : ag.name,
                            ag.applicationGroupType,
                            hpName.length > 25 ? hpName.substring(0, 22) + '...' : hpName,
                            wsName.length > 25 ? wsName.substring(0, 22) + '...' : wsName,
                            ag.applicationGroupType === 'RemoteApp' ? appCount : 'N/A',
                            ag.location
                        ];
                    });
                    
                    pdf.autoTable({
                        startY: yPos,
                        head: [['Name', 'Type', 'Host Pool', 'Workspace', 'Apps', 'Location']],
                        body: appGroupTableData,
                        theme: 'grid',
                        headStyles: { fillColor: [0, 120, 212], fontSize: 8, fontStyle: 'bold' },
                        bodyStyles: { fontSize: 7 },
                        margin: { left: margin, right: margin },
                        columnStyles: {
                            0: { cellWidth: 48 },
                            1: { cellWidth: 24, halign: 'center' },
                            2: { cellWidth: 36 },
                            3: { cellWidth: 36 },
                            4: { cellWidth: 16, halign: 'center' },
                            5: { cellWidth: 28 }
                        },
                        didParseCell: function(data) {
                            // Highlight Not assigned values
                            if (data.section === 'body' && typeof data.cell.raw === 'string' && data.cell.raw.includes('Not assigned')) {
                                data.cell.styles.textColor = [220, 53, 69];
                            }
                            // Highlight N/A
                            if (data.section === 'body' && data.cell.raw === 'N/A') {
                                data.cell.styles.textColor = [150, 150, 150];
                            }
                        }
                    });
                    yPos = pdf.lastAutoTable.finalY + 5;
                    
                    // Published Applications Details (for RemoteApp groups with apps)
                    const remoteAppGroups = sub.applicationGroups.filter(ag => 
                        ag.applicationGroupType === 'RemoteApp' && ag.applications && ag.applications.length > 0
                    );
                    
                    if (remoteAppGroups.length > 0) {
                        if (yPos > pageHeight - 30) {
                            pdf.addPage();
                            yPos = 20;
                        }
                        
                        pdf.setFontSize(10);
                        pdf.setFont(undefined, 'bold');
                        pdf.text('Published Applications:', margin, yPos);
                        yPos += 5;
                        pdf.setFont(undefined, 'normal');
                        
                        remoteAppGroups.forEach(ag => {
                            if (yPos > pageHeight - 40) {
                                pdf.addPage();
                                yPos = 20;
                            }
                            
                            pdf.setFontSize(9);
                            pdf.setFont(undefined, 'bold');
                            pdf.text(ag.name, margin + 2, yPos);
                            yPos += 4;
                            pdf.setFont(undefined, 'normal');
                            
                            const appTableData = ag.applications.map(app => {
                                const appName = app.friendlyName || app.name;
                                const filePath = app.filePath || 'Not specified';
                                const showInPortal = app.showInPortal ? 'Yes' : 'No';
                                
                                return [
                                    appName.length > 30 ? appName.substring(0, 27) + '...' : appName,
                                    filePath.length > 60 ? filePath.substring(0, 57) + '...' : filePath,
                                    showInPortal
                                ];
                            });
                            
                            pdf.autoTable({
                                startY: yPos,
                                head: [['Application', 'File Path', 'Portal']],
                                body: appTableData,
                                theme: 'striped',
                                headStyles: { fillColor: [41, 128, 185], fontSize: 7 },
                                bodyStyles: { fontSize: 7 },
                                margin: { left: margin + 5, right: margin },
                                columnStyles: {
                                    0: { cellWidth: 42 },
                                    1: { cellWidth: 90 },
                                    2: { cellWidth: 18, halign: 'center' }
                                }
                            });
                            yPos = pdf.lastAutoTable.finalY + 5;
                        });
                    }
                    
                    yPos += 3;
                }
                
                // Scaling Plans - Table Format
                if (sub.scalingPlans && sub.scalingPlans.length > 0) {
                    if (yPos > pageHeight - 30) {
                        pdf.addPage();
                        yPos = 20;
                    }
                    
                    addText('Scaling Plans:', 11, true);
                    pdf.setFontSize(8);
                    pdf.setFont(undefined, 'normal');
                    pdf.setTextColor(80, 80, 80);
                    pdf.text('Automated scaling configurations that adjust session host availability based on time schedules and usage patterns.', margin, yPos);
                    pdf.setTextColor(0, 0, 0);
                    yPos += 5;
                    
                    sub.scalingPlans.forEach(sp => {
                        if (yPos > pageHeight - 40) {
                            pdf.addPage();
                            yPos = 20;
                        }
                        
                        // Scaling Plan Header
                        pdf.setFont(undefined, 'bold');
                        pdf.setFontSize(10);
                        pdf.text(sp.name, margin, yPos);
                        yPos += 5;
                        pdf.setFont(undefined, 'normal');
                        
                        // Basic Info Table
                        const basicInfoData = [];
                        if (sp.friendlyName) {
                            basicInfoData.push(['Friendly Name', sp.friendlyName]);
                        }
                        if (sp.description) {
                            basicInfoData.push(['Description', sp.description]);
                        }
                        basicInfoData.push(['Location', sp.location]);
                        basicInfoData.push(['Resource Group', sp.resourceGroup]);
                        basicInfoData.push(['Host Pool Type', sp.hostPoolType || 'Not specified']);
                        basicInfoData.push(['Time Zone', sp.timeZone || 'Not specified']);
                        if (sp.exclusionTag) {
                            basicInfoData.push(['Exclusion Tag', sp.exclusionTag]);
                        }
                        
                        pdf.autoTable({
                            startY: yPos,
                            head: [['Property', 'Value']],
                            body: basicInfoData,
                            theme: 'grid',
                            headStyles: { fillColor: [0, 120, 212], fontSize: 9 },
                            bodyStyles: { fontSize: 8 },
                            margin: { left: margin, right: margin },
                            tableWidth: 'auto',
                            columnStyles: {
                                0: { cellWidth: 50 },
                                1: { cellWidth: 120 }
                            }
                        });
                        yPos = pdf.lastAutoTable.finalY + 5;
                        
                        // Host Pool Assignments Table
                        if (sp.hostPoolReferences && sp.hostPoolReferences.length > 0) {
                            if (yPos > pageHeight - 40) {
                                pdf.addPage();
                                yPos = 20;
                            }
                            
                            pdf.setFontSize(9);
                            pdf.setFont(undefined, 'bold');
                            pdf.text('Assigned Host Pools:', margin, yPos);
                            yPos += 4;
                            pdf.setFont(undefined, 'normal');
                            
                            const hostPoolData = sp.hostPoolReferences.map(hpRef => {
                                const hpName = hpRef.hostPoolArmPath.split('/').pop();
                                const status = hpRef.scalingPlanEnabled ? 'Enabled' : 'Disabled';
                                return [hpName, status];
                            });
                            
                            pdf.autoTable({
                                startY: yPos,
                                head: [['Host Pool', 'Status']],
                                body: hostPoolData,
                                theme: 'striped',
                                headStyles: { fillColor: [41, 128, 185], fontSize: 8 },
                                bodyStyles: { fontSize: 8 },
                                margin: { left: margin + 5, right: margin },
                                tableWidth: 'auto',
                                columnStyles: {
                                    0: { cellWidth: 80 },
                                    1: { cellWidth: 40 }
                                }
                            });
                            yPos = pdf.lastAutoTable.finalY + 5;
                        }
                        
                        // Schedules Table
                        if (sp.schedules && sp.schedules.length > 0) {
                            sp.schedules.forEach((schedule, scheduleIdx) => {
                                if (yPos > pageHeight - 60) {
                                    pdf.addPage();
                                    yPos = 20;
                                }
                                
                                pdf.setFontSize(9);
                                pdf.setFont(undefined, 'bold');
                                pdf.text(`Schedule ${scheduleIdx + 1}: ${schedule.name || 'Unnamed'}`, margin, yPos);
                                yPos += 4;
                                pdf.setFont(undefined, 'normal');
                                
                                // Schedule Overview Table
                                const scheduleOverview = [
                                    ['Days', schedule.daysOfWeek || 'Not specified']
                                ];
                                
                                pdf.autoTable({
                                    startY: yPos,
                                    body: scheduleOverview,
                                    theme: 'plain',
                                    bodyStyles: { fontSize: 8 },
                                    margin: { left: margin + 5, right: margin },
                                    columnStyles: {
                                        0: { cellWidth: 30, fontStyle: 'bold' },
                                        1: { cellWidth: 140 }
                                    }
                                });
                                yPos = pdf.lastAutoTable.finalY + 3;
                                
                                // Phases Table
                                const phasesData = [];
                                
                                // Ramp-Up
                                phasesData.push([
                                    'Ramp-Up',
                                    schedule.rampUpStartTime || 'N/A',
                                    schedule.rampUpLoadBalancingAlgorithm || 'N/A',
                                    schedule.rampUpMinimumHostsPct !== undefined ? `${schedule.rampUpMinimumHostsPct}%` : 'N/A',
                                    schedule.rampUpCapacityThresholdPct !== undefined ? `${schedule.rampUpCapacityThresholdPct}%` : 'N/A',
                                    '-'
                                ]);
                                
                                // Peak
                                phasesData.push([
                                    'Peak',
                                    schedule.peakStartTime || 'N/A',
                                    schedule.peakLoadBalancingAlgorithm || 'N/A',
                                    '-',
                                    '-',
                                    '-'
                                ]);
                                
                                // Ramp-Down
                                const rampDownExtra = [];
                                if (schedule.rampDownForceLogoffUser !== undefined) {
                                    rampDownExtra.push(`Force Logoff: ${schedule.rampDownForceLogoffUser ? 'Yes' : 'No'}`);
                                }
                                if (schedule.rampDownWaitTimeMinute !== undefined) {
                                    rampDownExtra.push(`Wait: ${schedule.rampDownWaitTimeMinute}m`);
                                }
                                
                                phasesData.push([
                                    'Ramp-Down',
                                    schedule.rampDownStartTime || 'N/A',
                                    schedule.rampDownLoadBalancingAlgorithm || 'N/A',
                                    schedule.rampDownMinimumHostsPct !== undefined ? `${schedule.rampDownMinimumHostsPct}%` : 'N/A',
                                    schedule.rampDownCapacityThresholdPct !== undefined ? `${schedule.rampDownCapacityThresholdPct}%` : 'N/A',
                                    rampDownExtra.join(', ') || '-'
                                ]);
                                
                                // Off-Peak
                                phasesData.push([
                                    'Off-Peak',
                                    schedule.offPeakStartTime || 'N/A',
                                    schedule.offPeakLoadBalancingAlgorithm || 'N/A',
                                    '-',
                                    '-',
                                    '-'
                                ]);
                                
                                pdf.autoTable({
                                    startY: yPos,
                                    head: [['Phase', 'Start', 'Load Balancing', 'Min %', 'Cap %', 'Extra']],
                                    body: phasesData,
                                    theme: 'grid',
                                    headStyles: { fillColor: [0, 120, 212], fontSize: 7 },
                                    bodyStyles: { fontSize: 7 },
                                    margin: { left: margin + 5, right: margin },
                                    tableWidth: 'wrap',
                                    columnStyles: {
                                        0: { cellWidth: 24, fontStyle: 'bold' },
                                        1: { cellWidth: 18, halign: 'center' },
                                        2: { cellWidth: 32 },
                                        3: { cellWidth: 16, halign: 'center' },
                                        4: { cellWidth: 16, halign: 'center' },
                                        5: { cellWidth: 64 }
                                    }
                                });
                                yPos = pdf.lastAutoTable.finalY + 5;
                            });
                        } else {
                            pdf.setFontSize(8);
                            pdf.text('No schedules configured', margin + 5, yPos);
                            yPos += 5;
                        }
                        
                        yPos += 5;
                    });
                    yPos += 3;
                }
                
                // Virtual Networks
                if (sub.virtualNetworks && sub.virtualNetworks.length > 0) {
                    if (yPos > pageHeight - 20) {
                        pdf.addPage();
                        yPos = 20;
                    }
                    addText('Virtual Networks:', 11, true);
                    sub.virtualNetworks.forEach(vnet => {
                        const hostCount = vnet.connectedSessionHosts ? ` (${vnet.connectedSessionHosts} session hosts)` : '';
                        addBullet(`${vnet.name} - ${vnet.addressSpace}${hostCount}`, 0);
                    });
                    yPos += 3;
                }
                
                // Compute Galleries (Azure Compute Gallery - formerly Shared Image Gallery)
                if (sub.computeGalleries && sub.computeGalleries.length > 0) {
                    if (yPos > pageHeight - 30) {
                        pdf.addPage();
                        yPos = 20;
                    }
                    addText('Azure Compute Galleries:', 11, true);
                    pdf.setFontSize(8);
                    pdf.setFont(undefined, 'normal');
                    pdf.setTextColor(80, 80, 80);
                    pdf.text('Custom image repositories for storing and managing VM images. Galleries enable image versioning and replication.', margin, yPos);
                    pdf.setTextColor(0, 0, 0);
                    yPos += 5;
                    
                    sub.computeGalleries.forEach(gallery => {
                        if (yPos > pageHeight - 40) {
                            pdf.addPage();
                            yPos = 20;
                        }
                        
                        // Gallery Header
                        pdf.setFont(undefined, 'bold');
                        pdf.setFontSize(10);
                        pdf.text(gallery.name, margin, yPos);
                        yPos += 4;
                        pdf.setFont(undefined, 'normal');
                        pdf.setFontSize(8);
                        
                        // Gallery basic info
                        const galleryBasicData = [
                            ['Location', gallery.location],
                            ['Resource Group', gallery.resourceGroup]
                        ];
                        if (gallery.description) {
                            galleryBasicData.push(['Description', gallery.description]);
                        }
                        
                        pdf.autoTable({
                            startY: yPos,
                            body: galleryBasicData,
                            theme: 'plain',
                            bodyStyles: { fontSize: 7 },
                            margin: { left: margin + 3, right: margin },
                            columnStyles: {
                                0: { cellWidth: 40, fontStyle: 'bold' },
                                1: { cellWidth: 140 }
                            }
                        });
                        yPos = pdf.lastAutoTable.finalY + 5;
                        
                        // Image Definitions Table
                        if (gallery.images && gallery.images.length > 0) {
                            if (yPos > pageHeight - 30) {
                                pdf.addPage();
                                yPos = 20;
                            }
                            
                            pdf.setFontSize(9);
                            pdf.setFont(undefined, 'bold');
                            pdf.text('Image Definitions:', margin + 3, yPos);
                            yPos += 4;
                            pdf.setFont(undefined, 'normal');
                            
                            const imageTableData = gallery.images.map(img => {
                                const versionCount = img.versions ? img.versions.length : 0;
                                const usage = img.usedBySessionHosts > 0 ? `${img.usedBySessionHosts}` : '0';
                                const identifier = `${img.publisher}/${img.offer}/${img.sku}`;
                                
                                return [
                                    img.name.length > 30 ? img.name.substring(0, 27) + '...' : img.name,
                                    img.osType,
                                    img.osState,
                                    versionCount.toString(),
                                    usage,
                                    identifier.length > 40 ? identifier.substring(0, 37) + '...' : identifier
                                ];
                            });
                            
                            pdf.autoTable({
                                startY: yPos,
                                head: [['Image Name', 'OS Type', 'OS State', 'Versions', 'In Use', 'Identifier']],
                                body: imageTableData,
                                theme: 'grid',
                                headStyles: { fillColor: [52, 152, 219], fontSize: 7, fontStyle: 'bold' },
                                bodyStyles: { fontSize: 6.5 },
                                margin: { left: margin + 5, right: margin },
                                columnStyles: {
                                    0: { cellWidth: 40 },
                                    1: { cellWidth: 20, halign: 'center' },
                                    2: { cellWidth: 20, halign: 'center' },
                                    3: { cellWidth: 18, halign: 'center' },
                                    4: { cellWidth: 16, halign: 'center' },
                                    5: { cellWidth: 60 }
                                },
                                didParseCell: function(data) {
                                    // Highlight usage column
                                    if (data.column.index === 4 && data.section === 'body') {
                                        const usage = parseInt(data.cell.raw);
                                        if (usage > 0) {
                                            data.cell.styles.textColor = [16, 124, 16];
                                            data.cell.styles.fontStyle = 'bold';
                                        } else {
                                            data.cell.styles.textColor = [150, 150, 150];
                                        }
                                    }
                                }
                            });
                            yPos = pdf.lastAutoTable.finalY + 5;
                            
                            // Image Versions Details (for images with versions)
                            const imagesWithVersions = gallery.images.filter(img => img.versions && img.versions.length > 0);
                            if (imagesWithVersions.length > 0) {
                                if (yPos > pageHeight - 30) {
                                    pdf.addPage();
                                    yPos = 20;
                                }
                                
                                pdf.setFontSize(9);
                                pdf.setFont(undefined, 'bold');
                                pdf.text('Image Versions:', margin + 3, yPos);
                                yPos += 4;
                                pdf.setFont(undefined, 'normal');
                                
                                imagesWithVersions.forEach(img => {
                                    if (yPos > pageHeight - 30) {
                                        pdf.addPage();
                                        yPos = 20;
                                    }
                                    
                                    pdf.setFontSize(8);
                                    pdf.setFont(undefined, 'bold');
                                    pdf.text(`${img.name}:`, margin + 5, yPos);
                                    yPos += 4;
                                    pdf.setFont(undefined, 'normal');
                                    
                                    const versionTableData = img.versions.map(ver => {
                                        const pubDate = ver.publishingDate !== 'N/A' ? new Date(ver.publishingDate).toLocaleDateString() : 'N/A';
                                        const replicas = ver.replicaCount ? ver.replicaCount.toString() : 'Default';
                                        
                                        return [
                                            ver.name,
                                            pubDate,
                                            replicas
                                        ];
                                    });
                                    
                                    pdf.autoTable({
                                        startY: yPos,
                                        head: [['Version', 'Published Date', 'Replica Count']],
                                        body: versionTableData,
                                        theme: 'striped',
                                        headStyles: { fillColor: [149, 165, 166], fontSize: 7 },
                                        bodyStyles: { fontSize: 7 },
                                        margin: { left: margin + 8, right: margin },
                                        columnStyles: {
                                            0: { cellWidth: 30 },
                                            1: { cellWidth: 40 },
                                            2: { cellWidth: 30, halign: 'center' }
                                        }
                                    });
                                    yPos = pdf.lastAutoTable.finalY + 3;
                                });
                            }
                        } else {
                            pdf.setFontSize(8);
                            pdf.setTextColor(150, 150, 150);
                            pdf.text('No images defined in this gallery.', margin + 5, yPos);
                            pdf.setTextColor(0, 0, 0);
                            yPos += 3;
                        }
                        
                        yPos += 3;
                    });
                    yPos += 3;
                }
                
                yPos += 5;
            });
            
            // === REFERENCES ===
            pdf.addPage();
            yPos = 20;
            
            addText('REFERENCES', 14, true, [0, 120, 212]);
            yPos += 5;
            
            addSubSection('Microsoft Documentation');
            addText('This assessment is based on Microsoft Well-Architected Framework guidance for Azure Virtual Desktop:');
            yPos += 3;
            
            addBullet('Azure Virtual Desktop - Well-Architected Framework');
            addText('https://learn.microsoft.com/azure/well-architected/azure-virtual-desktop/', 8);
            yPos += 2;
            
            addBullet('Azure Virtual Desktop Overview');
            addText('https://learn.microsoft.com/azure/virtual-desktop/overview', 8);
            yPos += 2;
            
            addBullet('Azure Virtual Desktop Best Practices');
            addText('https://learn.microsoft.com/azure/well-architected/azure-virtual-desktop/design-principles', 8);
            yPos += 2;
            
            addBullet('Security Best Practices for Azure Virtual Desktop');
            addText('https://learn.microsoft.com/azure/virtual-desktop/security-guide', 8);
            yPos += 2;
            
            addBullet('Cost Optimization for Azure Virtual Desktop');
            addText('https://learn.microsoft.com/azure/well-architected/azure-virtual-desktop/cost-optimization', 8);
        }
        
        // Add page numbers
        const pageCount = pdf.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            pdf.setPage(i);
            pdf.setFontSize(8);
            pdf.setTextColor(150, 150, 150);
            // Page number
            pdf.text(`Page ${i} of ${pageCount}`, margin + maxWidth - 20, 290);
            // Attribution footer
            pdf.setFontSize(7);
            pdf.text('Created by Alex ter Neuzen | www.gettothe.cloud', margin, 290);
        }
        
        // Save PDF
        pdf.save(`AVD-WAF-Assessment-${new Date().toISOString().split('T')[0]}.pdf`);
        
    } catch (error) {
        console.error('Error exporting to PDF:', error);
        alert('Error exporting to PDF: ' + error.message);
    } finally {
        hideLoading();
    }
}

// Show/hide loading overlay
function showLoading(message = 'Loading inventory data...') {
    const overlay = document.getElementById('loadingOverlay');
    const statusText = document.getElementById('loadingStatus');
    const progressBar = document.getElementById('loadingProgress');
    const progressFill = document.getElementById('loadingProgressFill');
    
    if (statusText) statusText.textContent = message;
    if (progressBar) progressBar.style.display = 'block';
    if (progressFill) progressFill.style.width = '0%';
    
    overlay.style.display = 'flex';
}

function updateLoadingProgress(message, percent) {
    const statusText = document.getElementById('loadingStatus');
    const progressFill = document.getElementById('loadingProgressFill');
    
    if (statusText) statusText.textContent = message;
    if (progressFill) progressFill.style.width = percent + '%';
}

function hideLoading() {
    document.getElementById('loadingOverlay').style.display = 'none';
}

// WAF Configuration Management Functions

// Display WAF Configuration
function displayWAFConfig() {
    const contentDiv = document.getElementById('wafConfigContent');
    
    if (!wafConfig) {
        contentDiv.innerHTML = '<p class="text-warning">⚠️ WAF configuration not loaded</p>';
        return;
    }
    
    let html = '<div class="waf-config-display">';
    html += `<div class="config-header">
        <h3>Configuration Version: ${wafConfig.version}</h3>
        <p>${wafConfig.description}</p>
    </div>`;
    
    // Display each pillar
    for (const [pillarKey, pillar] of Object.entries(wafConfig.pillars)) {
        html += `<div class="config-pillar" style="margin-top: 2rem; padding: 1.5rem; background: rgba(255,255,255,0.05); border-radius: 8px;">`;
        html += `<h3 style="color: var(--primary-color); margin-bottom: 0.5rem;">${pillar.name}</h3>`;
        html += `<p class="text-secondary" style="margin-bottom: 1rem;">${pillar.description}</p>`;
        html += `<p><strong>Maximum Checks:</strong> ${pillar.maxChecks}</p>`;
        html += `<p><strong>Total Rules:</strong> ${pillar.rules.length}</p>`;
        
        // Display rules
        html += '<div class="rules-list" style="margin-top: 1rem;">';
        pillar.rules.forEach((rule, idx) => {
            html += `<div class="rule-item" style="margin-top: 1rem; padding: 1rem; background: rgba(0,0,0,0.3); border-left: 3px solid var(--primary-color); border-radius: 4px;">`;
            html += `<div style="display: flex; justify-content: space-between; align-items: start;">`;
            html += `<div>`;
            html += `<h4 style="margin: 0 0 0.5rem 0;">${rule.id}: ${rule.name}</h4>`;
            html += `<p class="text-secondary" style="font-size: 0.9rem; margin-bottom: 0.5rem;">${rule.description}</p>`;
            html += `</div>`;
            html += `<span class="badge" style="background: var(--accent-color); color: white; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.85rem;">${rule.points} pts</span>`;
            html += `</div>`;
            
            // Show condition or calculation
            if (rule.condition) {
                html += `<div style="margin-top: 0.5rem; font-family: monospace; font-size: 0.85rem; color: #a0aec0;">`;
                html += `<strong>Condition:</strong> ${rule.condition.field} ${rule.condition.operator} ${JSON.stringify(rule.condition.value)}`;
                html += `</div>`;
            }
            if (rule.calculation) {
                html += `<div style="margin-top: 0.5rem; font-family: monospace; font-size: 0.85rem; color: #a0aec0;">`;
                html += `<strong>Calculation:</strong> ${rule.calculation}`;
                html += `</div>`;
            }
            
            // Show messages
            if (rule.successMessage) {
                html += `<div style="margin-top: 0.5rem; font-size: 0.85rem; color: #10b981;">✓ ${rule.successMessage}</div>`;
            }
            if (rule.warningMessage) {
                html += `<div style="margin-top: 0.5rem; font-size: 0.85rem; color: #f59e0b;">⚠ ${rule.warningMessage}</div>`;
            }
            if (rule.recommendation) {
                html += `<div style="margin-top: 0.5rem; font-size: 0.85rem; color: #60a5fa;"><strong>Recommendation:</strong> ${rule.recommendation}</div>`;
            }
            
            html += `</div>`;
        });
        html += '</div>';
        
        html += `</div>`;
    }
    
    // Status mapping
    html += `<div class="status-mapping" style="margin-top: 2rem; padding: 1.5rem; background: rgba(255,255,255,0.05); border-radius: 8px;">`;
    html += `<h3 style="color: var(--primary-color); margin-bottom: 1rem;">Status Thresholds</h3>`;
    for (const [status, config] of Object.entries(wafConfig.statusMapping)) {
        html += `<div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 0.5rem;">`;
        html += `<div style="width: 20px; height: 20px; background: ${config.color}; border-radius: 4px;"></div>`;
        html += `<span><strong>${status}:</strong> ${config.threshold}% and above</span>`;
        html += `</div>`;
    }
    html += `</div>`;
    
    html += '</div>';
    
    contentDiv.innerHTML = html;
}

// Download WAF Configuration
function downloadWAFConfig() {
    if (!wafConfig) {
        alert('No configuration loaded to download');
        return;
    }
    
    try {
        const jsonString = JSON.stringify(wafConfig, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `waf-config-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        console.log('✅ WAF configuration downloaded successfully');
    } catch (error) {
        console.error('❌ Error downloading WAF configuration:', error);
        alert('Error downloading configuration: ' + error.message);
    }
}

// Upload WAF Configuration
function uploadWAFConfig(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const config = JSON.parse(e.target.result);
            
            // Basic validation
            if (!config.version || !config.pillars) {
                throw new Error('Invalid configuration format');
            }
            
            wafConfig = config;
            console.log('✅ WAF configuration uploaded and loaded successfully');
            alert('Configuration uploaded successfully! Refresh the page to see changes in assessment.');
            
            // Update display
            if (document.getElementById('wafconfig').classList.contains('active')) {
                displayWAFConfig();
            }
        } catch (error) {
            console.error('❌ Error parsing uploaded config:', error);
            alert('Error parsing configuration file: ' + error.message);
        }
    };
    reader.readAsText(file);
    
    // Reset input
    event.target.value = '';
}

// Reload WAF Configuration
// Reload WAF Configuration from external file (optional override)
async function reloadWAFConfig() {
    try {
        console.log('📋 Reloading WAF configuration from server...');
        const response = await fetch('/api/waf/config?t=' + Date.now()); // Cache bust
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const externalConfig = await response.json();
        
        // Basic validation
        if (!externalConfig.version || !externalConfig.pillars) {
            throw new Error('Invalid configuration format');
        }
        
        wafConfig = externalConfig;
        console.log('✅ WAF configuration reloaded from server');
        
        // Update display if on WAF config page
        if (document.getElementById('wafconfig').classList.contains('active')) {
            displayWAFConfig();
        }
        
        alert('WAF configuration reloaded successfully!');
    } catch (error) {
        console.error('❌ Error reloading WAF configuration:', error);
        alert('Error reloading configuration from server: ' + error.message);
    }
}
