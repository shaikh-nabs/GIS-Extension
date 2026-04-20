// KML Processor - Converts Python logic to JavaScript
const NS = "http://www.opengis.net/kml/2.2";

// DOM Elements
const fileInput = document.getElementById('fileInput');
const prefixInput = document.getElementById('prefixInput');
const dropZone = document.getElementById('dropZone');
const fileName = document.getElementById('fileName');
const processBtn = document.getElementById('processBtn');
const progressSection = document.getElementById('progressSection');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const results = document.getElementById('results');
const resultDetails = document.getElementById('resultDetails');
const downloadBtn = document.getElementById('downloadBtn');
const errorMessage = document.getElementById('errorMessage');
const errorText = document.getElementById('errorText');

let currentFile = null;
let renamedKML = null;
let fullKML = null;
let csvData = null;

// Event Listeners
dropZone.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleFile(e.target.files[0]);
    }
});

// Drag and Drop
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('active');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('active');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('active');
    
    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].name.endsWith('.kml')) {
        handleFile(files[0]);
    } else {
        showError('Please upload a valid KML file');
    }
});

prefixInput.addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 2);
});

processBtn.addEventListener('click', processKML);

downloadBtn.addEventListener('click', downloadFullKML);

const downloadRenamedBtn = document.getElementById('downloadRenamedBtn');
if (downloadRenamedBtn) {
    downloadRenamedBtn.addEventListener('click', downloadRenamedOnly);
}

const downloadCsvBtn = document.getElementById('downloadCsvBtn');
if (downloadCsvBtn) {
    downloadCsvBtn.addEventListener('click', downloadCSV);
}

function handleFile(file) {
    currentFile = file;
    fileName.textContent = file.name;
    processBtn.disabled = false;
    hideError();
    hideResults();
}

function showProgress(percent, text) {
    progressSection.style.display = 'block';
    progressFill.style.width = percent + '%';
    progressText.textContent = text;
}

function hideProgress() {
    progressSection.style.display = 'none';
}

function showResults(polygonsRenamed, pointsCreated) {
    results.style.display = 'block';
    const renamedOnlyText = document.getElementById('renamedOnlyDetails');
    const fullProcessText = document.getElementById('fullProcessDetails');
    const csvDetailsText = document.getElementById('csvDetails');
    
    if (renamedOnlyText) {
        renamedOnlyText.textContent = `${polygonsRenamed} polygons renamed`;
    }
    if (fullProcessText) {
        fullProcessText.textContent = `${polygonsRenamed} polygons renamed, ${pointsCreated} points generated`;
    }
    if (csvDetailsText) {
        csvDetailsText.textContent = `${pointsCreated} coordinate rows exported`;
    }
}

function hideResults() {
    results.style.display = 'none';
}

function showError(message) {
    errorMessage.style.display = 'flex';
    errorText.textContent = message;
}

function hideError() {
    errorMessage.style.display = 'none';
}

async function processKML() {
    if (!currentFile) return;

    const prefix = prefixInput.value || 'X';
    hideError();
    hideResults();
    processBtn.disabled = true;

    try {
        showProgress(20, 'Reading KML file...');
        
        const fileContent = await readFile(currentFile);
        
        showProgress(40, 'Parsing KML structure...');
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(fileContent, 'text/xml');
        
        // Check for parsing errors
        if (xmlDoc.querySelector('parsererror')) {
            throw new Error('Invalid KML file');
        }

        showProgress(50, 'Renaming polygons...');
        const renamedDoc = renamePolygons(xmlDoc, prefix);
        
        showProgress(60, 'Generating points from vertices...');
        const fullDoc = generatePoints(renamedDoc);
        
        showProgress(80, 'Generating CSV data...');
        csvData = generateCSV(renamedDoc);
        
        showProgress(100, 'Finalizing...');
        
        // Serialize to strings
        const serializer = new XMLSerializer();
        
        // Generate renamed-only KML
        const renamedString = serializer.serializeToString(renamedDoc);
        renamedKML = renamedString.startsWith('<?xml') ? renamedString : '<?xml version="1.0" encoding="UTF-8"?>\n' + renamedString;
        
        // Generate full KML (with points)
        const fullString = serializer.serializeToString(fullDoc);
        fullKML = fullString.startsWith('<?xml') ? fullString : '<?xml version="1.0" encoding="UTF-8"?>\n' + fullString;
        
        // Get stats
        const polygonCount = renamedDoc.querySelectorAll('Placemark Polygon').length;
        const folder = fullDoc.querySelector('Folder name');
        const pointCount = folder ? folder.parentElement.querySelectorAll('Placemark Point').length : 0;
        
        hideProgress();
        showResults(polygonCount, pointCount);
        
    } catch (err) {
        hideProgress();
        showError('Error: ' + err.message);
        processBtn.disabled = false;
    }
}

function readFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsText(file);
    });
}

function renamePolygons(xmlDoc, prefix) {
    // Clone the document to avoid modifying the original
    const newDoc = xmlDoc.cloneNode(true);
    
    const ns = { kml: NS };
    let counter = 1;
    
    // Find all placemarks
    const placemarks = newDoc.querySelectorAll('Placemark');
    
    placemarks.forEach(placemark => {
        // Check if this placemark has a polygon
        const polygon = placemark.querySelector('Polygon');
        if (!polygon) return;
        
        const newName = `${prefix}${counter}`;
        
        // Update main name element
        const nameElem = placemark.querySelector('name');
        if (nameElem) {
            nameElem.textContent = newName;
        }
        
        // Update ExtendedData -> Data name="name"
        const extendedData = placemark.querySelector('ExtendedData');
        if (extendedData) {
            const dataElements = extendedData.querySelectorAll('Data');
            dataElements.forEach(data => {
                if (data.getAttribute('name') === 'name') {
                    const valueElem = data.querySelector('value');
                    if (valueElem) {
                        valueElem.textContent = newName;
                    }
                }
            });
        }
        
        counter++;
    });
    
    return newDoc;
}

function generatePoints(xmlDoc) {
    const newDoc = xmlDoc.cloneNode(true);
    
    // Find Document element
    let document = newDoc.querySelector('Document');
    
    // If no Document, create one around the root
    if (!document) {
        const root = newDoc.documentElement;
        if (root.tagName === 'kml') {
            // Find the first child that's not Document
            const firstNonDocument = Array.from(root.children).find(child => child.tagName !== 'Document');
            if (firstNonDocument) {
                // Wrap children in a Document
                document = newDoc.createElementNS(NS, 'Document');
                while (root.firstChild) {
                    document.appendChild(root.firstChild);
                }
                root.appendChild(document);
            }
        }
    }
    
    if (!document) {
        throw new Error('Invalid KML: No Document tag found');
    }
    
    // Create new folder for generated points
    const folder = newDoc.createElementNS(NS, 'Folder');
    const folderName = newDoc.createElementNS(NS, 'name');
    folderName.textContent = 'Generated Points';
    folder.appendChild(folderName);
    
    let totalPoints = 0;
    
    // Process all placemarks
    const placemarks = newDoc.querySelectorAll('Placemark');
    
    placemarks.forEach(placemark => {
        // Only process polygons
        const polygon = placemark.querySelector('Polygon');
        if (!polygon) return;
        
        const nameElem = placemark.querySelector('name');
        if (!nameElem || !nameElem.textContent) return;
        
        const polyName = nameElem.textContent.trim();
        
        // Extract coordinates
        const coordsList = extractPolygonCoordinates(placemark);
        if (coordsList.length === 0) return;
        
        // Create points for each vertex
        coordsList.forEach(([lat, lng]) => {
            const pointPm = newDoc.createElementNS(NS, 'Placemark');
            
            const nameTag = newDoc.createElementNS(NS, 'name');
            nameTag.textContent = polyName;
            pointPm.appendChild(nameTag);
            
            const point = newDoc.createElementNS(NS, 'Point');
            const coordTag = newDoc.createElementNS(NS, 'coordinates');
            coordTag.textContent = `${lng},${lat},0`;
            point.appendChild(coordTag);
            pointPm.appendChild(point);
            
            folder.appendChild(pointPm);
            totalPoints++;
        });
    });
    
    if (totalPoints > 0) {
        document.appendChild(folder);
    }
    
    return newDoc;
}

function extractPolygonCoordinates(placemark) {
    const coordElem = placemark.querySelector('Polygon outerBoundaryIs LinearRing coordinates');
    
    if (!coordElem || !coordElem.textContent) {
        return [];
    }
    
    const coords = coordElem.textContent
        .trim()
        .replace(/\n/g, ' ')
        .split(/\s+/);
    
    const points = [];
    
    coords.forEach(coord => {
        const parts = coord.split(',');
        if (parts.length < 2) return;
        
        const lng = parts[0].trim();
        const lat = parts[1].trim();
        
        points.push([lat, lng]);
    });
    
    // Remove duplicate closing point
    if (points.length > 1 && 
        points[0][0] === points[points.length - 1][0] && 
        points[0][1] === points[points.length - 1][1]) {
        points.pop();
    }
    
    return points;
}

function downloadRenamedOnly() {
    if (!renamedKML) return;
    
    const prefix = prefixInput.value || 'X';
    const originalName = currentFile.name.replace('.kml', '');
    const outputName = `${originalName}_${prefix}_renamed.kml`;
    
    const blob = new Blob([renamedKML], { type: 'application/vnd.google-earth.kml+xml' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = outputName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function downloadFullKML() {
    if (!fullKML) return;
    
    const prefix = prefixInput.value || 'X';
    const originalName = currentFile.name.replace('.kml', '');
    const outputName = `${originalName}_${prefix}_with_points.kml`;
    
    const blob = new Blob([fullKML], { type: 'application/vnd.google-earth.kml+xml' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = outputName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Keep for backward compatibility if needed
function downloadKML() {
    downloadFullKML();
}

function generateCSV(xmlDoc) {
    const rows = [];
    rows.push('Name,Latitude,Longitude');
    
    // Process all placemarks with polygons
    const placemarks = xmlDoc.querySelectorAll('Placemark');
    
    placemarks.forEach(placemark => {
        // Only process polygons
        const polygon = placemark.querySelector('Polygon');
        if (!polygon) return;
        
        const nameElem = placemark.querySelector('name');
        if (!nameElem || !nameElem.textContent) return;
        
        const polyName = nameElem.textContent.trim();
        
        // Extract coordinates
        const coordsList = extractPolygonCoordinates(placemark);
        if (coordsList.length === 0) return;
        
        // Add each coordinate as a row (Name, Latitude, Longitude)
        coordsList.forEach(([lat, lng]) => {
            rows.push(`${polyName},${lat},${lng}`);
        });
    });
    
    return rows.join('\n');
}

function downloadCSV() {
    if (!csvData) return;
    
    const prefix = prefixInput.value || 'X';
    const originalName = currentFile.name.replace('.kml', '');
    const outputName = `${originalName}_${prefix}_coordinates.csv`;
    
    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = outputName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
