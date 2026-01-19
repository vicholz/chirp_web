/**
 * CHIRP Web - CSV Import/Export
 * Handles reading and writing CHIRP CSV format files
 */

import { Memory, RadioImage, parseFreq, formatFreq } from './memory.js';

// CSV column headers matching CHIRP format
export const CSV_HEADERS = [
    'Location', 'Name', 'Frequency', 'Duplex', 'Offset', 'Tone',
    'rToneFreq', 'cToneFreq', 'DtcsCode', 'DtcsPolarity', 'RxDtcsCode',
    'CrossMode', 'Mode', 'TStep', 'Skip', 'Power', 'Comment',
    'URCALL', 'RPT1CALL', 'RPT2CALL', 'DVCODE'
];

/**
 * Parse a CHIRP CSV file
 */
export function parseCSV(csvContent, filename = '') {
    const lines = csvContent.trim().split(/\r?\n/);
    
    if (lines.length < 1) {
        throw new Error('Empty CSV file');
    }

    // Check for header line
    const firstLine = lines[0].toLowerCase();
    const hasHeader = firstLine.includes('location') || firstLine.includes('frequency');
    const dataStart = hasHeader ? 1 : 0;

    const memories = [];
    let maxLocation = 0;

    for (let i = dataStart; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        try {
            const mem = parseCSVLine(line);
            if (mem && mem.number > 0) {
                memories.push(mem);
                maxLocation = Math.max(maxLocation, mem.number);
            }
        } catch (e) {
            console.warn(`Error parsing line ${i + 1}: ${e.message}`);
        }
    }

    if (memories.length === 0) {
        throw new Error('No valid memories found in CSV file');
    }

    // Create RadioImage from memories
    const image = new RadioImage(filename || 'CSV Import', Math.max(maxLocation, 128));
    image.filename = filename;
    
    for (const mem of memories) {
        image.setMemory(mem);
    }
    
    image.modified = false;
    return image;
}

/**
 * Parse a single CSV line into a Memory object
 */
function parseCSVLine(line) {
    // Handle quoted fields properly
    const fields = parseCSVFields(line);
    
    if (fields.length < 3) {
        throw new Error('Not enough fields');
    }

    const location = parseInt(fields[0]);
    if (isNaN(location) || location < 0) {
        throw new Error('Invalid location');
    }

    const mem = new Memory(location, false);
    
    // Name
    mem.name = fields[1] || '';
    
    // Frequency
    const freqStr = fields[2];
    if (freqStr) {
        mem.freq = parseFreq(freqStr);
    }
    
    // Duplex
    mem.duplex = fields[3] || '';
    
    // Offset
    if (fields[4]) {
        mem.offset = parseFreq(fields[4]);
    }
    
    // Tone mode
    mem.tmode = fields[5] || '';
    
    // rTone
    if (fields[6]) {
        mem.rtone = parseFloat(fields[6]) || 88.5;
    }
    
    // cTone
    if (fields[7]) {
        mem.ctone = parseFloat(fields[7]) || 88.5;
    }
    
    // DTCS code
    if (fields[8]) {
        mem.dtcs = parseInt(fields[8]) || 23;
    }
    
    // DTCS polarity
    mem.dtcsPolarity = fields[9] || 'NN';
    
    // RX DTCS code
    if (fields[10]) {
        mem.rxDtcs = parseInt(fields[10]) || 23;
    }
    
    // Cross mode
    mem.crossMode = fields[11] || 'Tone->Tone';
    
    // Mode
    mem.mode = fields[12] || 'FM';
    
    // Tuning step
    if (fields[13]) {
        mem.tuningStep = parseFloat(fields[13]) || 5.0;
    }
    
    // Skip
    mem.skip = fields[14] || '';
    
    // Power
    mem.power = fields[15] || '';
    
    // Comment
    mem.comment = fields[16] || '';
    
    return mem;
}

/**
 * Parse CSV fields handling quoted strings
 */
function parseCSVFields(line) {
    const fields = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                // Escaped quote
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            fields.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    
    fields.push(current);
    return fields;
}

/**
 * Generate CSV content from a RadioImage
 */
export function generateCSV(image, includeEmpty = false) {
    const lines = [CSV_HEADERS.join(',')];
    
    const memories = includeEmpty ? image.getAllMemories() : image.getUsedMemories();
    
    for (const mem of memories) {
        if (mem.empty && !includeEmpty) continue;
        lines.push(memoryToCSVLine(mem));
    }
    
    return lines.join('\n');
}

/**
 * Convert a Memory to a CSV line
 */
function memoryToCSVLine(mem) {
    const fields = [
        mem.number.toString(),
        escapeCSV(mem.name),
        formatFreq(mem.freq),
        mem.duplex,
        formatFreq(mem.offset),
        mem.tmode,
        mem.rtone.toFixed(1),
        mem.ctone.toFixed(1),
        mem.dtcs.toString().padStart(3, '0'),
        mem.dtcsPolarity,
        mem.rxDtcs.toString().padStart(3, '0'),
        mem.crossMode,
        mem.mode,
        mem.tuningStep.toFixed(2),
        mem.skip,
        mem.power,
        escapeCSV(mem.comment),
        '', '', '', '' // D-STAR fields
    ];
    
    return fields.join(',');
}

/**
 * Escape a field for CSV if needed
 */
function escapeCSV(value) {
    if (!value) return '';
    value = String(value);
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        return '"' + value.replace(/"/g, '""') + '"';
    }
    return value;
}

/**
 * Download CSV file to user's computer
 */
export function downloadCSV(image, filename) {
    const content = generateCSV(image);
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'chirp_export.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Read a CSV file from a File object
 */
export function readCSVFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = (e) => {
            try {
                const content = e.target.result;
                const image = parseCSV(content, file.name);
                resolve(image);
            } catch (err) {
                reject(err);
            }
        };
        
        reader.onerror = () => {
            reject(new Error('Failed to read file'));
        };
        
        reader.readAsText(file);
    });
}

/**
 * Read a CHIRP .img file (binary format with metadata)
 */
export function readIMGFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const image = parseIMGFile(data, file.name);
                resolve(image);
            } catch (err) {
                reject(err);
            }
        };
        
        reader.onerror = () => {
            reject(new Error('Failed to read file'));
        };
        
        reader.readAsArrayBuffer(file);
    });
}

/**
 * Parse CHIRP .img file format
 */
function parseIMGFile(data, filename) {
    // Look for CHIRP metadata magic
    const magic = new Uint8Array([0x00, 0xFF, 0x63, 0x68, 0x69, 0x72, 0x70, 0xEE, 0x69, 0x6D, 0x67, 0x00, 0x01]);
    let metadataStart = -1;
    
    for (let i = 0; i < data.length - magic.length; i++) {
        let found = true;
        for (let j = 0; j < magic.length; j++) {
            if (data[i + j] !== magic[j]) {
                found = false;
                break;
            }
        }
        if (found) {
            metadataStart = i;
            break;
        }
    }
    
    let metadata = {};
    let rawData = data;
    
    if (metadataStart >= 0) {
        rawData = data.slice(0, metadataStart);
        const metadataBytes = data.slice(metadataStart + magic.length);
        try {
            const base64Str = new TextDecoder().decode(metadataBytes);
            const jsonStr = atob(base64Str);
            metadata = JSON.parse(jsonStr);
        } catch (e) {
            console.warn('Failed to parse IMG metadata:', e);
        }
    }
    
    // Create a generic image - real implementation would detect radio type
    const image = new RadioImage(filename, 128);
    image.filename = filename;
    image.vendor = metadata.vendor || 'Unknown';
    image.model = metadata.model || 'Unknown';
    image._rawData = rawData;
    
    return image;
}

/**
 * Export supported file formats
 */
export const SUPPORTED_FORMATS = [
    { name: 'CHIRP CSV', extension: '.csv', mime: 'text/csv' },
    { name: 'CHIRP Image', extension: '.img', mime: 'application/octet-stream' }
];
