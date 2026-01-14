/**
 * Taiwan Township Population Map - Leaflet Application
 *
 * Features:
 * - Choropleth map showing population density
 * - Single-click to select townships
 * - Double-click to deselect townships
 * - Info panel with statistics
 */

// ============================================================================
// Global State
// ============================================================================

const state = {
    map: null,
    geojsonLayer: null,
    geojsonData: null,
    populationData: null,
    selectedTownships: new Set(),
    townshipLayers: new Map(), // Map fullname -> layer
    lastClickTime: 0,
    lastClickedTownship: null,
    totalTownships: 0
};

// Double-click threshold in milliseconds
const DOUBLE_CLICK_THRESHOLD = 300;

// Color scale for choropleth (White to Reddish-Brown)
// Grades: < 10, 10-500, 500-1000, 1000-2000, 2000-5000, 5000-10000, 10000-20000, 20000-30000, 30000+
const COLOR_GRADES = [0, 10, 500, 1000, 2000, 5000, 10000, 20000, 30000];
// Interpolated from white (#ffffff) to reddish-brown (#AA4C2C)
const COLOR_PALETTE = [
    '#ffffff',  // < 10: white
    '#f9ece8',  // 10-500: very light
    '#f3d9d1',  // 500-1000: light
    '#e8bfb1',  // 1000-2000: lighter
    '#d9a08c',  // 2000-5000: pale
    '#ca8167',  // 5000-10000: medium light
    '#bb6242',  // 10000-20000: medium
    '#aa4c2c',  // 20000-30000: darker
    '#aa4c2c'   // 30000+: target reddish-brown
];

// Border styles
const BORDER_UNSELECTED = {
    weight: 1,
    color: '#cccccc',  // Light gray
    opacity: 0.8
};

const BORDER_SELECTED = {
    weight: 3,
    color: '#000000',  // Black
    opacity: 1
};

// ============================================================================
// Utility Functions
// ============================================================================

function getColor(density) {
    for (let i = COLOR_GRADES.length - 1; i >= 0; i--) {
        if (density >= COLOR_GRADES[i]) {
            return COLOR_PALETTE[i];
        }
    }
    return COLOR_PALETTE[0];
}

function formatNumber(num) {
    if (num === null || num === undefined) return 'N/A';
    return num.toLocaleString('zh-TW');
}

function showToast(message) {
    // Remove existing toast
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
        existingToast.remove();
    }

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 2000);
}

// ============================================================================
// Map Initialization
// ============================================================================

// Map bounds for Taiwan
const TAIWAN_BOUNDS = [[21.6, 119.3], [25.7, 122.3]];
const TAIWAN_CENTER = [23.65, 120.8];

function initMap() {
    // Create map centered on Taiwan main island (16:9 layout)
    state.map = L.map('map', {
        center: TAIWAN_CENTER,
        zoom: 7,
        minZoom: 6,
        maxZoom: 14,
        maxBounds: TAIWAN_BOUNDS,
        maxBoundsViscosity: 1.0
    });

    // Fit map to Taiwan bounds
    state.map.fitBounds(TAIWAN_BOUNDS);

    // Add simple tile layer (CartoDB Positron - clean and minimal)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19
    }).addTo(state.map);
}

// Reset map to default view
function resetMapView() {
    state.map.fitBounds(TAIWAN_BOUNDS);
}

// ============================================================================
// Data Loading
// ============================================================================

async function loadData() {
    try {
        // Load GeoJSON
        const geojsonResponse = await fetch('data/taiwan_townships.geojson');
        state.geojsonData = await geojsonResponse.json();

        // Load population data
        const populationResponse = await fetch('data/population_data.json');
        state.populationData = await populationResponse.json();

        // Merge population data into GeoJSON properties
        state.geojsonData.features.forEach(feature => {
            const fullname = feature.properties.FULLNAME;
            const popData = state.populationData[fullname];
            if (popData) {
                feature.properties.population = popData.population;
                feature.properties.area = popData.area;
                feature.properties.density = popData.density;
            }
        });

        state.totalTownships = state.geojsonData.features.length;
        updateStats();

        return true;
    } catch (error) {
        console.error('Error loading data:', error);
        return false;
    }
}

// ============================================================================
// GeoJSON Layer
// ============================================================================

function createGeoJSONLayer() {
    state.geojsonLayer = L.geoJSON(state.geojsonData, {
        style: styleFeature,
        onEachFeature: onEachFeature
    }).addTo(state.map);
}

function styleFeature(feature) {
    const isSelected = state.selectedTownships.has(feature.properties.FULLNAME);
    const density = feature.properties.density || 0;

    return {
        fillColor: getColor(density),
        weight: isSelected ? BORDER_SELECTED.weight : BORDER_UNSELECTED.weight,
        opacity: isSelected ? BORDER_SELECTED.opacity : BORDER_UNSELECTED.opacity,
        color: isSelected ? BORDER_SELECTED.color : BORDER_UNSELECTED.color,
        fillOpacity: 0.8
    };
}

function onEachFeature(feature, layer) {
    const fullname = feature.properties.FULLNAME;

    // Store layer reference
    state.townshipLayers.set(fullname, layer);

    // Event handlers (no tooltip - use info box instead)
    layer.on({
        click: handleClick,
        dblclick: handleDoubleClick,
        mouseover: handleMouseOver,
        mouseout: handleMouseOut
    });
}

function createPopupContent(props) {
    return `
        <div class="popup-title">${props.FULLNAME}</div>
        <div class="popup-info">
            <span>👥 人口: ${formatNumber(props.population)}</span>
            <span>📐 面積: ${props.area ? props.area.toFixed(2) : 'N/A'} km²</span>
            <span>📊 密度: ${formatNumber(props.density)} 人/km²</span>
        </div>
    `;
}

// ============================================================================
// Event Handlers
// ============================================================================

function handleClick(e) {
    const layer = e.target;
    const fullname = layer.feature.properties.FULLNAME;
    const currentTime = Date.now();

    // Check for double-click
    if (state.lastClickedTownship === fullname &&
        (currentTime - state.lastClickTime) < DOUBLE_CLICK_THRESHOLD) {
        // This is a double-click - handled by dblclick event
        return;
    }

    state.lastClickTime = currentTime;
    state.lastClickedTownship = fullname;

    // Single click - select the township
    if (!state.selectedTownships.has(fullname)) {
        selectTownship(fullname);
    }

    L.DomEvent.stopPropagation(e);
}

function handleDoubleClick(e) {
    const layer = e.target;
    const fullname = layer.feature.properties.FULLNAME;

    // Double-click - deselect the township
    if (state.selectedTownships.has(fullname)) {
        deselectTownship(fullname);
    }

    // Prevent map zoom
    L.DomEvent.stopPropagation(e);
    L.DomEvent.preventDefault(e);
}

function handleMouseOver(e) {
    const layer = e.target;
    const fullname = layer.feature.properties.FULLNAME;
    const props = layer.feature.properties;

    if (!state.selectedTownships.has(fullname)) {
        layer.setStyle({
            weight: 2,
            color: '#666'
        });
    }

    layer.bringToFront();

    // Keep selected layers on top
    bringSelectedToFront();

    // Update info box
    updateInfoBox(props);
}

function handleMouseOut(e) {
    const layer = e.target;
    const fullname = layer.feature.properties.FULLNAME;

    if (!state.selectedTownships.has(fullname)) {
        layer.setStyle({
            weight: BORDER_UNSELECTED.weight,
            color: BORDER_UNSELECTED.color,
            opacity: BORDER_UNSELECTED.opacity
        });
    }

    // Clear info box
    clearInfoBox();
}

function updateInfoBox(props) {
    const infoBox = document.getElementById('map-info-box');
    if (infoBox) {
        infoBox.innerHTML = `
            <h4>${props.FULLNAME}</h4>
            <p>人口: ${formatNumber(props.population)}</p>
            <p>面積: ${props.area ? props.area.toFixed(2) : 'N/A'} km²</p>
            <p>密度: ${formatNumber(props.density)} 人/km²</p>
        `;
        infoBox.style.display = 'block';
    }
}

function clearInfoBox() {
    const infoBox = document.getElementById('map-info-box');
    if (infoBox) {
        infoBox.style.display = 'none';
    }
}

// ============================================================================
// Selection Management
// ============================================================================

function selectTownship(fullname, updateUIFlag = true) {
    state.selectedTownships.add(fullname);

    const layer = state.townshipLayers.get(fullname);
    if (layer) {
        // Apply selected border style (bold black)
        layer.setStyle({
            weight: BORDER_SELECTED.weight,
            color: BORDER_SELECTED.color,
            opacity: BORDER_SELECTED.opacity
        });
        layer.bringToFront();
    }

    if (updateUIFlag) {
        updateUI();
    }
}

function deselectTownship(fullname, updateUIFlag = true) {
    state.selectedTownships.delete(fullname);

    const layer = state.townshipLayers.get(fullname);
    if (layer) {
        // Apply unselected border style (light gray)
        layer.setStyle({
            weight: BORDER_UNSELECTED.weight,
            color: BORDER_UNSELECTED.color,
            opacity: BORDER_UNSELECTED.opacity
        });
    }

    // Bring remaining selected layers to front
    bringSelectedToFront();

    if (updateUIFlag) {
        updateUI();
    }
}

function bringSelectedToFront() {
    // Bring all selected layers to front
    state.selectedTownships.forEach(fullname => {
        const layer = state.townshipLayers.get(fullname);
        if (layer) {
            layer.bringToFront();
        }
    });
}

function clearAllSelections() {
    state.selectedTownships.forEach(fullname => {
        const layer = state.townshipLayers.get(fullname);
        if (layer) {
            layer.setStyle({
                weight: BORDER_UNSELECTED.weight,
                color: BORDER_UNSELECTED.color,
                opacity: BORDER_UNSELECTED.opacity
            });
        }
    });

    state.selectedTownships.clear();
    updateUI();
}

function selectAllTownships() {
    state.geojsonData.features.forEach(feature => {
        const fullname = feature.properties.FULLNAME;
        selectTownship(fullname, false);
    });

    updateUI();
}

function selectCounty(countyName) {
    const countyTownships = [];

    state.geojsonData.features.forEach(feature => {
        if (feature.properties.COUNTYNAME === countyName) {
            countyTownships.push(feature.properties.FULLNAME);
        }
    });

    // Check if all are already selected
    const allSelected = countyTownships.every(name => state.selectedTownships.has(name));

    if (allSelected) {
        // Deselect all
        countyTownships.forEach(name => {
            deselectTownship(name, false);
        });
    } else {
        // Select all
        countyTownships.forEach(name => {
            if (!state.selectedTownships.has(name)) {
                selectTownship(name, false);
            }
        });
    }

    // Bring all selected to front after batch operation
    bringSelectedToFront();

    updateUI();
}

// ============================================================================
// UI Updates
// ============================================================================

function updateUI() {
    updateStats();
    updateSelectedList();
    updateCountyButtons();
    updateExportButton();
    updateBarPlots();
}

function updateBarPlots() {
    // Check if BarPlots module is available
    if (typeof BarPlots === 'undefined') {
        console.warn('BarPlots module not found');
        return;
    }

    // Prepare data for bar plots
    const selectedData = [];
    state.selectedTownships.forEach(fullname => {
        const data = state.populationData[fullname];
        if (data) {
            selectedData.push({
                name: fullname,
                population: data.population,
                density: data.density,
                area: data.area
            });
        }
    });

    console.log('Updating bar plots with', selectedData.length, 'items');

    try {
        BarPlots.update(selectedData);
    } catch (e) {
        console.error('Error updating bar plots:', e);
    }
}

function updateStats() {
    const count = state.selectedTownships.size;
    document.getElementById('stat-count').textContent = `${count} / ${state.totalTownships}`;

    const summaryStats = document.getElementById('summary-stats');

    if (count > 0) {
        summaryStats.style.display = 'block';

        let totalPopulation = 0;
        let totalArea = 0;

        state.selectedTownships.forEach(fullname => {
            const data = state.populationData[fullname];
            if (data) {
                totalPopulation += data.population;
                totalArea += data.area;
            }
        });

        const avgDensity = totalArea > 0 ? Math.round(totalPopulation / totalArea) : 0;

        document.getElementById('stat-population').textContent = formatNumber(totalPopulation);
        document.getElementById('stat-area').textContent = `${formatNumber(Math.round(totalArea))} km²`;
        document.getElementById('stat-density').textContent = `${formatNumber(avgDensity)} 人/km²`;
    } else {
        summaryStats.style.display = 'none';
    }
}

function updateSelectedList() {
    const container = document.getElementById('selected-townships');

    if (state.selectedTownships.size === 0) {
        container.innerHTML = '<p class="empty-message">點擊地圖選擇鄉鎮市區</p>';
        return;
    }

    // Save expanded state of county groups before rebuilding
    const expandedCounties = new Set();
    container.querySelectorAll('.county-group-content.expanded').forEach(el => {
        const header = el.previousElementSibling;
        if (header) {
            const countyText = header.querySelector('span:first-child')?.textContent;
            if (countyText) {
                // Extract county name (remove count suffix)
                const match = countyText.match(/(.+?)\s*\(\d+\)/);
                if (match) {
                    expandedCounties.add(match[1].trim());
                }
            }
        }
    });

    // Group by county
    const byCounty = new Map();

    state.selectedTownships.forEach(fullname => {
        // Find county name
        const feature = state.geojsonData.features.find(f => f.properties.FULLNAME === fullname);
        if (feature) {
            const countyName = feature.properties.COUNTYNAME;
            if (!byCounty.has(countyName)) {
                byCounty.set(countyName, []);
            }
            byCounty.get(countyName).push({
                fullname,
                townname: feature.properties.TOWNNAME,
                ...state.populationData[fullname]
            });
        }
    });

    let html = '';

    // Sort counties by selection count
    const sortedCounties = [...byCounty.entries()].sort((a, b) => b[1].length - a[1].length);

    sortedCounties.forEach(([countyName, townships]) => {
        const isExpanded = expandedCounties.has(countyName);
        html += `
            <div class="county-group">
                <div class="county-group-header" onclick="toggleCountyGroup(this)">
                    <span>${countyName} (${townships.length})</span>
                    <span>${isExpanded ? '▲' : '▼'}</span>
                </div>
                <div class="county-group-content${isExpanded ? ' expanded' : ''}">
        `;

        townships.forEach(t => {
            html += `
                <div class="township-item">
                    <button class="remove-btn" onclick="removeTownshipFromList('${t.fullname}'); event.stopPropagation();">&times;</button>
                    <div class="name">${t.townname}</div>
                    <div class="details">
                        人口 ${formatNumber(t.population)} | 密度 ${formatNumber(t.density)}/km²
                    </div>
                </div>
            `;
        });

        html += '</div></div>';
    });

    container.innerHTML = html;
}

// Remove township from list without collapsing the drop-down
function removeTownshipFromList(fullname) {
    deselectTownship(fullname);
}

function toggleCountyGroup(header) {
    const content = header.nextElementSibling;
    content.classList.toggle('expanded');
    const arrow = header.querySelector('span:last-child');
    arrow.textContent = content.classList.contains('expanded') ? '▲' : '▼';
}

function updateCountyButtons() {
    const container = document.getElementById('county-buttons');

    // Get unique counties with their average latitude
    const countyData = new Map();
    state.geojsonData.features.forEach(feature => {
        const countyName = feature.properties.COUNTYNAME;
        if (!countyData.has(countyName)) {
            countyData.set(countyName, { latitudes: [], townships: [] });
        }
        // Get centroid latitude from geometry
        const coords = feature.geometry.coordinates;
        const lat = getAverageLatitude(coords);
        countyData.get(countyName).latitudes.push(lat);
        countyData.get(countyName).townships.push(feature.properties.FULLNAME);
    });

    // Calculate average latitude for each county and sort by latitude (north to south)
    const sortedCounties = [...countyData.entries()]
        .map(([name, data]) => ({
            name,
            avgLat: data.latitudes.reduce((a, b) => a + b, 0) / data.latitudes.length,
            townships: data.townships
        }))
        .sort((a, b) => b.avgLat - a.avgLat); // Higher latitude first

    let html = '';
    sortedCounties.forEach(county => {
        const allSelected = county.townships.every(name => state.selectedTownships.has(name));

        let className = 'county-btn';
        if (allSelected) className += ' selected';

        html += `<button class="${className}" onclick="selectCounty('${county.name}')">${allSelected ? '✓ ' : ''}${county.name}</button>`;
    });

    container.innerHTML = html;
}

// Helper function to get average latitude from GeoJSON coordinates
function getAverageLatitude(coords) {
    let totalLat = 0;
    let count = 0;

    function processCoords(c) {
        if (typeof c[0] === 'number') {
            // This is a coordinate pair [lng, lat]
            totalLat += c[1];
            count++;
        } else {
            // This is an array of coordinates
            c.forEach(processCoords);
        }
    }

    processCoords(coords);
    return count > 0 ? totalLat / count : 0;
}

function updateExportButton() {
    const btn = document.getElementById('btn-export');
    btn.disabled = state.selectedTownships.size === 0;
}

function createLegend() {
    const container = document.getElementById('legend-items');
    let html = '';

    // Custom labels for the legend
    const labels = [
        '< 10',
        '10 - 500',
        '500 - 1,000',
        '1,000 - 2,000',
        '2,000 - 5,000',
        '5,000 - 10,000',
        '10,000 - 20,000',
        '20,000 - 30,000',
        '30,000+'
    ];

    for (let i = 0; i < labels.length; i++) {
        html += `
            <div class="legend-item">
                <div class="legend-color" style="background: ${COLOR_PALETTE[i]}"></div>
                <span>${labels[i]}</span>
            </div>
        `;
    }

    container.innerHTML = html;
}

// ============================================================================
// Export Function
// ============================================================================

function exportData() {
    if (state.selectedTownships.size === 0) {
        showToast('請先選擇鄉鎮市區');
        return;
    }

    const data = [];

    state.selectedTownships.forEach(fullname => {
        const feature = state.geojsonData.features.find(f => f.properties.FULLNAME === fullname);
        const popData = state.populationData[fullname];

        if (feature && popData) {
            data.push({
                Township: fullname,
                County: feature.properties.COUNTYNAME,
                District: feature.properties.TOWNNAME,
                Population: popData.population,
                'Area_km2': popData.area,
                Density: popData.density
            });
        }
    });

    // Convert to CSV
    const headers = Object.keys(data[0]);
    const csv = [
        headers.join(','),
        ...data.map(row => headers.map(h => row[h]).join(','))
    ].join('\n');

    // Download
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'taiwan_townships_selected.csv';
    link.click();
    URL.revokeObjectURL(url);

}

// ============================================================================
// Event Listeners
// ============================================================================

function setupEventListeners() {
    document.getElementById('btn-clear').addEventListener('click', clearAllSelections);
    document.getElementById('btn-select-all').addEventListener('click', selectAllTownships);
    document.getElementById('btn-export').addEventListener('click', exportData);
    document.getElementById('btn-reset-map').addEventListener('click', resetMapView);

    // Disable double-click zoom on map
    state.map.doubleClickZoom.disable();
}

// ============================================================================
// Initialization
// ============================================================================

async function init() {
    initMap();

    const dataLoaded = await loadData();

    if (dataLoaded) {
        createGeoJSONLayer();
        createLegend();
        setupEventListeners();
        updateUI();
    }
}

// Start application
document.addEventListener('DOMContentLoaded', init);

// Make functions available globally for onclick handlers
window.deselectTownship = deselectTownship;
window.selectCounty = selectCounty;
window.toggleCountyGroup = toggleCountyGroup;
window.removeTownshipFromList = removeTownshipFromList;
