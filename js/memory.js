/**
 * CHIRP Web - Memory Data Model
 * Core data structures for radio memory management
 */

// Standard CTCSS/PL Tones (50 tones)
export const TONES = [
    67.0, 69.3, 71.9, 74.4, 77.0, 79.7, 82.5,
    85.4, 88.5, 91.5, 94.8, 97.4, 100.0, 103.5,
    107.2, 110.9, 114.8, 118.8, 123.0, 127.3,
    131.8, 136.5, 141.3, 146.2, 151.4, 156.7,
    159.8, 162.2, 165.5, 167.9, 171.3, 173.8,
    177.3, 179.9, 183.5, 186.2, 189.9, 192.8,
    196.6, 199.5, 203.5, 206.5, 210.7, 218.1,
    225.7, 229.1, 233.6, 241.8, 250.3, 254.1
];

// Standard DCS/DTCS codes (104 codes)
export const DTCS_CODES = [
    23, 25, 26, 31, 32, 36, 43, 47, 51, 53, 54,
    65, 71, 72, 73, 74, 114, 115, 116, 122, 125, 131,
    132, 134, 143, 145, 152, 155, 156, 162, 165, 172, 174,
    205, 212, 223, 225, 226, 243, 244, 245, 246, 251, 252,
    255, 261, 263, 265, 266, 271, 274, 306, 311, 315, 325,
    331, 332, 343, 346, 351, 356, 364, 365, 371, 411, 412,
    413, 423, 431, 432, 445, 446, 452, 454, 455, 462, 464,
    465, 466, 503, 506, 516, 523, 526, 532, 546, 565, 606,
    612, 624, 627, 631, 632, 654, 662, 664, 703, 712, 723,
    731, 732, 734, 743, 754
];

// Tone modes
export const TONE_MODES = ['', 'Tone', 'TSQL', 'DTCS', 'DTCS-R', 'TSQL-R', 'Cross'];

// Cross tone modes
export const CROSS_MODES = [
    'Tone->Tone', 'DTCS->', '->DTCS', 'Tone->DTCS',
    'DTCS->Tone', '->Tone', 'DTCS->DTCS', 'Tone->'
];

// Radio modes
export const MODES = ['FM', 'NFM', 'WFM', 'AM', 'NAM', 'DV', 'USB', 'LSB', 'CW', 'RTTY', 'DIG', 'PKT', 'DMR'];

// Duplex modes
export const DUPLEX = ['', '+', '-', 'split', 'off'];

// Skip values for scanning
export const SKIP_VALUES = ['', 'S', 'P'];

// DTCS polarity options
export const DTCS_POLARITY = ['NN', 'NR', 'RN', 'RR'];

// Common tuning steps in kHz
export const TUNING_STEPS = [5.0, 6.25, 10.0, 12.5, 15.0, 20.0, 25.0, 30.0, 50.0, 100.0];

// Power level presets
export const POWER_LEVELS = ['Low', 'Medium', 'High', 'Max'];

/**
 * Memory class - represents a single radio memory channel
 */
export class Memory {
    constructor(number = 0, empty = true) {
        this.number = number;
        this.extdNumber = '';
        this.name = '';
        this.freq = 0;           // Frequency in Hz
        this.offset = 0;         // Offset in Hz (0 = none)
        this.duplex = '';        // Empty = (none)
        this.tmode = '';         // Empty = (none)
        this.rtone = 0;          // 0 = (none)
        this.ctone = 0;          // 0 = (none)
        this.dtcs = 0;           // 0 = (none)
        this.rxDtcs = 0;         // 0 = (none)
        this.dtcsPolarity = '';
        this.crossMode = '';
        this.mode = '';          // Empty = (none)
        this.tuningStep = 0;
        this.skip = '';          // Empty = (none)
        this.power = '';
        this.comment = '';
        this.empty = empty;
    }

    /**
     * Create a deep copy of this memory
     */
    clone() {
        const mem = new Memory(this.number, this.empty);
        Object.assign(mem, this);
        return mem;
    }

    /**
     * Format frequency as MHz string
     */
    formatFreq() {
        if (!this.freq) return '';
        const mhz = Math.floor(this.freq / 1000000);
        const khz = this.freq % 1000000;
        return `${mhz}.${khz.toString().padStart(6, '0')}`;
    }

    /**
     * Parse frequency string and set freq in Hz
     */
    parseFreq(freqStr) {
        freqStr = freqStr.trim();
        if (!freqStr) {
            this.freq = 0;
            return 0;
        }
        
        if (freqStr.includes('.')) {
            const [mhzPart, khzPart] = freqStr.split('.');
            const mhz = parseInt(mhzPart || '0') * 1000000;
            const khz = parseInt((khzPart + '000000').substring(0, 6));
            this.freq = mhz + khz;
        } else {
            this.freq = parseInt(freqStr) * 1000000;
        }
        return this.freq;
    }

    /**
     * Format offset as MHz string
     */
    formatOffset() {
        if (!this.offset) return '';
        if (this.duplex === 'split') {
            return this.formatFreqValue(this.offset);
        }
        const mhz = Math.floor(this.offset / 1000000);
        const khz = (this.offset % 1000000) / 1000;
        if (khz === 0) {
            return `${mhz}.000000`;
        }
        return `${mhz}.${(this.offset % 1000000).toString().padStart(6, '0')}`;
    }

    /**
     * Format a frequency value (in Hz) as MHz string
     */
    formatFreqValue(hz) {
        if (!hz) return '';
        const mhz = Math.floor(hz / 1000000);
        const khz = hz % 1000000;
        return `${mhz}.${khz.toString().padStart(6, '0')}`;
    }

    /**
     * Get transmit frequency based on duplex settings
     */
    getTxFreq() {
        if (this.duplex === 'split') {
            return this.offset;
        } else if (this.duplex === '+') {
            return this.freq + this.offset;
        } else if (this.duplex === '-') {
            return this.freq - this.offset;
        } else if (this.duplex === 'off') {
            return 0;
        }
        return this.freq;
    }

    /**
     * Convert memory to CSV row
     */
    toCSV() {
        return [
            this.number,
            this.name,
            this.formatFreq(),
            this.duplex,
            this.formatOffset(),
            this.tmode,
            this.rtone.toFixed(1),
            this.ctone.toFixed(1),
            this.dtcs.toString().padStart(3, '0'),
            this.dtcsPolarity,
            this.rxDtcs.toString().padStart(3, '0'),
            this.crossMode,
            this.mode,
            this.tuningStep.toFixed(2),
            this.skip,
            this.power,
            this.comment
        ].join(',');
    }

    /**
     * Create memory from CSV row
     */
    static fromCSV(row) {
        const fields = row.split(',');
        if (fields.length < 13) {
            throw new Error('Invalid CSV row: not enough fields');
        }

        const mem = new Memory(parseInt(fields[0]), false);
        mem.name = fields[1] || '';
        mem.parseFreq(fields[2]);
        mem.duplex = fields[3] || '';
        
        // Parse offset
        const offsetStr = fields[4];
        if (offsetStr && offsetStr.includes('.')) {
            const [mhzPart, khzPart] = offsetStr.split('.');
            const mhz = parseInt(mhzPart || '0') * 1000000;
            const khz = parseInt((khzPart + '000000').substring(0, 6));
            mem.offset = mhz + khz;
        } else if (offsetStr) {
            mem.offset = parseInt(offsetStr) * 1000000;
        }

        mem.tmode = fields[5] || '';
        mem.rtone = parseFloat(fields[6]) || 88.5;
        mem.ctone = parseFloat(fields[7]) || 88.5;
        mem.dtcs = parseInt(fields[8]) || 23;
        mem.dtcsPolarity = fields[9] || 'NN';
        mem.rxDtcs = parseInt(fields[10]) || 23;
        mem.crossMode = fields[11] || 'Tone->Tone';
        mem.mode = fields[12] || 'FM';
        mem.tuningStep = parseFloat(fields[13]) || 5.0;
        mem.skip = fields[14] || '';
        mem.power = fields[15] || '';
        mem.comment = fields[16] || '';

        return mem;
    }

    /**
     * Validate the memory settings
     */
    validate() {
        const errors = [];
        
        if (this.freq <= 0) {
            errors.push('Invalid frequency');
        }
        
        if (this.tmode && !TONE_MODES.includes(this.tmode)) {
            errors.push(`Invalid tone mode: ${this.tmode}`);
        }
        
        if (this.mode && !MODES.includes(this.mode)) {
            errors.push(`Invalid mode: ${this.mode}`);
        }
        
        if (this.duplex && !DUPLEX.includes(this.duplex)) {
            errors.push(`Invalid duplex: ${this.duplex}`);
        }
        
        return errors;
    }
}

/**
 * RadioImage class - holds a collection of memories for a radio
 */
export class RadioImage {
    constructor(name = 'Untitled', numMemories = 128) {
        this.name = name;
        this.filename = '';
        this.modified = false;
        this.memories = new Map();
        this.vendor = 'Generic';
        this.model = 'CSV';
        this.features = {
            memoryBounds: [1, numMemories],
            hasDtcs: true,
            hasRxDtcs: true,
            hasCross: true,
            hasMode: true,
            hasOffset: true,
            hasName: true,
            hasTuningStep: true,
            hasComment: true,
            validModes: [...MODES],
            validTmodes: [...TONE_MODES],
            validDuplexes: [...DUPLEX],
            validSkips: [...SKIP_VALUES],
            validTones: [...TONES],
            validDtcsCodes: [...DTCS_CODES],
            validNameLength: 8,
            validTuningSteps: [...TUNING_STEPS]
        };

        // Initialize empty memories
        for (let i = 1; i <= numMemories; i++) {
            this.memories.set(i, new Memory(i, true));
        }
    }

    /**
     * Get a memory by location number
     */
    getMemory(number) {
        return this.memories.get(number) || new Memory(number, true);
    }

    /**
     * Set a memory at a location
     */
    setMemory(memory) {
        this.memories.set(memory.number, memory);
        this.modified = true;
    }

    /**
     * Delete a memory (mark as empty)
     */
    deleteMemory(number) {
        const mem = new Memory(number, true);
        this.memories.set(number, mem);
        this.modified = true;
    }

    /**
     * Get all non-empty memories
     */
    getUsedMemories() {
        return Array.from(this.memories.values()).filter(m => !m.empty);
    }

    /**
     * Get all memories in order
     */
    getAllMemories() {
        const [lo, hi] = this.features.memoryBounds;
        const result = [];
        for (let i = lo; i <= hi; i++) {
            result.push(this.getMemory(i));
        }
        return result;
    }

    /**
     * Export to CSV string
     */
    toCSV() {
        const header = 'Location,Name,Frequency,Duplex,Offset,Tone,rToneFreq,cToneFreq,DtcsCode,DtcsPolarity,RxDtcsCode,CrossMode,Mode,TStep,Skip,Power,Comment';
        const rows = [header];
        
        for (const mem of this.getUsedMemories()) {
            rows.push(mem.toCSV());
        }
        
        return rows.join('\n');
    }

    /**
     * Import from CSV string
     */
    static fromCSV(csvString, filename = '') {
        const lines = csvString.trim().split('\n');
        if (lines.length < 2) {
            throw new Error('CSV file is empty or has no data rows');
        }

        // Find the max location to determine memory count
        let maxLoc = 128;
        const image = new RadioImage('CSV Import', maxLoc);
        image.filename = filename;

        // Skip header line
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            try {
                const mem = Memory.fromCSV(line);
                if (mem.number > maxLoc) {
                    // Expand memory bounds
                    maxLoc = mem.number;
                    image.features.memoryBounds[1] = maxLoc;
                }
                image.memories.set(mem.number, mem);
            } catch (e) {
                console.warn(`Error parsing CSV line ${i + 1}: ${e.message}`);
            }
        }

        image.modified = false;
        return image;
    }

    /**
     * Move a memory from one location to another
     */
    moveMemory(fromNumber, toNumber) {
        const fromMem = this.getMemory(fromNumber);
        const toMem = this.getMemory(toNumber);

        if (fromMem.empty) {
            throw new Error('Source memory is empty');
        }

        // Clone the source memory to the destination
        const newMem = fromMem.clone();
        newMem.number = toNumber;
        this.setMemory(newMem);

        // Clear the source
        this.deleteMemory(fromNumber);
    }

    /**
     * Insert a memory and shift others down
     */
    insertMemory(memory, atNumber) {
        const [lo, hi] = this.features.memoryBounds;
        
        // Shift memories down
        for (let i = hi - 1; i >= atNumber; i--) {
            const mem = this.getMemory(i);
            if (!mem.empty) {
                const newMem = mem.clone();
                newMem.number = i + 1;
                this.setMemory(newMem);
            }
        }

        memory.number = atNumber;
        this.setMemory(memory);
    }
}

/**
 * Parse a frequency string and return Hz
 */
export function parseFreq(freqStr) {
    freqStr = String(freqStr).trim();
    if (!freqStr) return 0;
    
    // Handle "XXX.XXXXXX MHz" format
    if (freqStr.toLowerCase().endsWith(' mhz')) {
        freqStr = freqStr.slice(0, -4).trim();
    }
    
    if (freqStr.includes('.')) {
        const [mhzPart, khzPart] = freqStr.split('.');
        const mhz = parseInt(mhzPart || '0') * 1000000;
        const khz = parseInt((khzPart + '000000').substring(0, 6));
        return mhz + khz;
    }
    return parseInt(freqStr) * 1000000;
}

/**
 * Format Hz to MHz string
 */
export function formatFreq(hz) {
    if (!hz) return '';
    const mhz = Math.floor(hz / 1000000);
    const khz = hz % 1000000;
    return `${mhz}.${khz.toString().padStart(6, '0')}`;
}

// ============================================
// Generic Radio Memory Parser
// ============================================

/**
 * Field type parsers
 */
const FieldParsers = {
    /**
     * Parse little-endian BCD-encoded frequency to Hz (lbcd format used by CHIRP)
     * In lbcd, bytes are stored in little-endian order (least significant byte first)
     * @param {Uint8Array} data - Raw data
     * @param {number} offset - Offset in data
     * @param {number} size - Number of bytes (usually 4)
     * @param {number} unit - Unit multiplier (usually 10 for 10 Hz units)
     */
    bcd: (data, offset, size, unit = 10) => {
        let value = 0;
        // Read bytes in reverse order for little-endian BCD
        for (let i = size - 1; i >= 0; i--) {
            const byte = data[offset + i];
            const highNibble = (byte >> 4) & 0x0F;
            const lowNibble = byte & 0x0F;
            value = value * 100 + highNibble * 10 + lowNibble;
        }
        return value * unit;
    },
    
    /**
     * Parse unsigned 16-bit little-endian value
     */
    u16le: (data, offset) => {
        return data[offset] | (data[offset + 1] << 8);
    },
    
    /**
     * Parse unsigned 16-bit big-endian value
     */
    u16be: (data, offset) => {
        return (data[offset] << 8) | data[offset + 1];
    },
    
    /**
     * Parse unsigned 32-bit little-endian value
     */
    u32le: (data, offset) => {
        return data[offset] | (data[offset + 1] << 8) | 
               (data[offset + 2] << 16) | (data[offset + 3] << 24);
    },
    
    /**
     * Parse single byte
     */
    byte: (data, offset) => {
        return data[offset];
    },
    
    /**
     * Parse tone value (u16le with special encoding)
     * Returns { mode, value, polarity }
     */
    tone_u16le: (data, offset) => {
        const raw = data[offset] | (data[offset + 1] << 8);
        
        if (raw === 0 || raw === 0xFFFF) {
            return { mode: '', value: 0 };
        }
        
        // Check if it's DCS (has 0x8000 bit set)
        if (raw & 0x8000) {
            const code = raw & 0x0FFF;
            const polarity = (raw & 0x4000) ? 'R' : 'N';
            return { mode: 'DCS', value: code, polarity };
        } else {
            // CTCSS tone - value is in 0.1 Hz units
            return { mode: 'CTCSS', value: raw / 10.0 };
        }
    },
    
    /**
     * Parse null/0xFF terminated string
     */
    string: (data, offset, size) => {
        let str = '';
        for (let i = 0; i < size; i++) {
            const c = data[offset + i];
            if (c === 0 || c === 0xFF) break;
            if (c >= 32 && c < 127) {
                str += String.fromCharCode(c);
            }
        }
        return str.trim();
    }
};

/**
 * Parse a single field based on its definition
 */
function parseField(data, baseOffset, fieldDef) {
    const offset = baseOffset + fieldDef.offset;
    
    if (offset + (fieldDef.size || 1) > data.length) {
        return null;
    }
    
    const parser = FieldParsers[fieldDef.type];
    if (!parser) {
        console.warn(`Unknown field type: ${fieldDef.type}`);
        return null;
    }
    
    return parser(data, offset, fieldDef.size, fieldDef.unit);
}

/**
 * Extract flag value from a parsed flags byte
 */
function extractFlag(flagValue, mapping) {
    let value = (flagValue >> (mapping.shift || 0)) & mapping.mask;
    
    if (mapping.invert) {
        value = value ? 0 : 1;
    }
    
    if (mapping.values && Array.isArray(mapping.values)) {
        return mapping.values[value] || mapping.values[0];
    }
    
    return value;
}

/**
 * Check if a channel is empty based on the emptyCheck definition
 */
/**
 * Check if a channel is empty based on raw data
 * For BCD fields, we check the raw bytes since 0xFF bytes are invalid BCD
 */
function isChannelEmpty(data, offset, fields, emptyCheck) {
    if (!emptyCheck) return false;
    
    const fieldDef = fields[emptyCheck.field];
    if (!fieldDef) return false;
    
    // For BCD fields, check raw bytes
    if (fieldDef.type === 'bcd') {
        const fieldOffset = offset + fieldDef.offset;
        let allFF = true;
        let allZero = true;
        
        for (let i = 0; i < fieldDef.size; i++) {
            const byte = data[fieldOffset + i];
            if (byte !== 0xFF) allFF = false;
            if (byte !== 0x00) allZero = false;
        }
        
        // Empty if all bytes are 0xFF or all bytes are 0x00
        return allFF || allZero;
    }
    
    // For other fields, parse and compare
    const value = parseField(data, offset, fieldDef);
    
    if (emptyCheck.emptyValues) {
        return emptyCheck.emptyValues.includes(value);
    }
    
    if (emptyCheck.value !== undefined) {
        return value === emptyCheck.value;
    }
    
    return value === 0 || value === 0xFFFFFFFF;
}

/**
 * Generic memory parser using format definition from protocol
 * @param {Uint8Array} data - Raw memory data
 * @param {Object} format - Memory format definition from protocol
 * @returns {Memory[]} Array of parsed Memory objects
 */
export function parseMemoryGeneric(data, format) {
    const memories = [];
    
    const channelSize = format.channelSize || 32;
    const numChannels = format.numChannels || 128;
    const startOffset = format.startOffset || 0;
    const fields = format.fields || {};
    const flagMappings = format.flagMappings || {};
    const defaults = format.defaults || {};
    const emptyCheck = format.emptyCheck;
    
    console.log(`Generic parser: ${numChannels} channels, ${channelSize} bytes each, start at ${startOffset}`);
    
    for (let i = 0; i < numChannels; i++) {
        const offset = startOffset + (i * channelSize);
        
        // Check if we have enough data
        if (offset + channelSize > data.length) {
            console.log(`Stopping at channel ${i}: insufficient data`);
            break;
        }
        
        // Check if channel is empty (check raw data for BCD fields)
        if (isChannelEmpty(data, offset, fields, emptyCheck)) {
            const mem = new Memory(i + 1);
            mem.empty = true;
            memories.push(mem);
            continue;
        }
        
        // Parse all defined fields for non-empty channels
        const parsedFields = {};
        for (const [fieldName, fieldDef] of Object.entries(fields)) {
            parsedFields[fieldName] = parseField(data, offset, fieldDef);
        }
        
        // Create Memory object
        const mem = new Memory(i + 1);
        mem.empty = false;
        
        // Set frequency
        const rxFreq = parsedFields.rxFreq || 0;
        const txFreq = parsedFields.txFreq || rxFreq;
        
        mem.freq = rxFreq;
        
        // Debug: Log first few channels with frequencies
        if (i < 5 && rxFreq > 0) {
            const rawBytes = Array.from(data.slice(offset, offset + 8)).map(b => b.toString(16).padStart(2, '0')).join(' ');
            console.log(`Channel ${i + 1}: RX=${rxFreq / 1000000} MHz, TX=${txFreq / 1000000} MHz, raw: ${rawBytes}`);
        }
        
        // Calculate duplex/offset
        if (txFreq === rxFreq || txFreq === 0) {
            mem.duplex = '';
            mem.offset = 0;
        } else if (txFreq > rxFreq) {
            mem.duplex = '+';
            mem.offset = txFreq - rxFreq;
        } else {
            mem.duplex = '-';
            mem.offset = rxFreq - txFreq;
        }
        
        // Set name if available
        if (parsedFields.name) {
            mem.name = parsedFields.name;
        }
        
        // Process tones
        const rxTone = parsedFields.rxTone;
        const txTone = parsedFields.txTone;
        
        if (txTone && txTone.mode === 'CTCSS') {
            if (rxTone && rxTone.mode === 'CTCSS') {
                mem.tmode = 'TSQL';
                mem.rtone = txTone.value;
                mem.ctone = rxTone.value;
            } else {
                mem.tmode = 'Tone';
                mem.rtone = txTone.value;
            }
        } else if (txTone && txTone.mode === 'DCS') {
            mem.tmode = 'DTCS';
            mem.dtcs = txTone.value;
            mem.dtcsPolarity = (txTone.polarity || 'N') + ((rxTone && rxTone.polarity) || 'N');
        }
        
        // Process flag mappings
        for (const [mappingName, mapping] of Object.entries(flagMappings)) {
            const flagValue = parsedFields[mapping.field];
            if (flagValue !== undefined) {
                const extractedValue = extractFlag(flagValue, mapping);
                
                // Map to Memory properties
                switch (mappingName) {
                    case 'wide':
                        mem.mode = extractedValue;
                        break;
                    case 'lowPower':
                    case 'highPower':
                        mem.power = extractedValue;
                        break;
                    case 'scan':
                        mem.skip = extractedValue ? '' : 'S';
                        break;
                }
            }
        }
        
        // Apply defaults
        for (const [key, value] of Object.entries(defaults)) {
            if (!mem[key]) {
                mem[key] = value;
            }
        }
        
        memories.push(mem);
    }
    
    // Parse names from separate location if defined
    if (format.nameOffset !== undefined && format.nameSize) {
        for (let i = 0; i < memories.length; i++) {
            if (memories[i].empty) continue;
            
            const nameOffset = format.nameOffset + (i * format.nameSize);
            if (nameOffset + format.nameSize <= data.length) {
                const name = FieldParsers.string(data, nameOffset, format.nameSize);
                if (name) {
                    memories[i].name = name;
                }
            }
        }
    }
    
    return memories;
}

/**
 * Main entry point for parsing radio memory
 * Uses generic parser with format from protocol definition
 * @param {Uint8Array} data - Raw memory data
 * @param {string} protocolName - Protocol name (e.g., 'baofeng-uv5r')
 * @param {string} vendor - Vendor name
 * @param {string} model - Model name
 * @param {Object} protocol - Full protocol object (optional, for format override)
 */
export function parseRadioMemory(data, protocolName, vendor, model, protocol = null) {
    console.log(`Parsing ${vendor} ${model} memory (${data.length} bytes, protocol: ${protocolName})`);
    
    // Get memory format from protocol if provided
    let format = protocol?.memoryFormat;
    
    if (!format) {
        // Use default formats based on protocol name
        console.log('Using fallback format for protocol:', protocolName);
        format = getDefaultMemoryFormat(protocolName);
    }
    
    if (!format) {
        console.warn('No memory format defined, using UV17Pro default');
        format = getDefaultMemoryFormat('baofeng-uv17pro');
    }
    
    return parseMemoryGeneric(data, format);
}

// ============================================
// Generic Radio Memory Serializer (Memory -> Binary)
// ============================================

/**
 * Field type serializers (inverse of parsers)
 */
const FieldSerializers = {
    /**
     * Serialize frequency to little-endian BCD format (lbcd)
     * In lbcd, bytes are stored in little-endian order (least significant byte first)
     */
    bcd: (value, size, unit = 10) => {
        const result = new Uint8Array(size);
        let freq = Math.round(value / unit);  // Convert from Hz to BCD units
        
        // Write BCD in little-endian order (least significant byte first)
        for (let i = 0; i < size; i++) {
            const lowNibble = freq % 10;
            freq = Math.floor(freq / 10);
            const highNibble = freq % 10;
            freq = Math.floor(freq / 10);
            result[i] = (highNibble << 4) | lowNibble;
        }
        
        return result;
    },
    
    /**
     * Serialize to unsigned 16-bit little-endian
     */
    u16le: (value) => {
        return new Uint8Array([value & 0xFF, (value >> 8) & 0xFF]);
    },
    
    /**
     * Serialize to unsigned 16-bit big-endian
     */
    u16be: (value) => {
        return new Uint8Array([(value >> 8) & 0xFF, value & 0xFF]);
    },
    
    /**
     * Serialize single byte
     */
    byte: (value) => {
        return new Uint8Array([value & 0xFF]);
    },
    
    /**
     * Serialize tone value to u16le format
     */
    tone_u16le: (toneInfo) => {
        let value = 0;
        
        if (!toneInfo || !toneInfo.mode) {
            value = 0;
        } else if (toneInfo.mode === 'CTCSS') {
            // CTCSS tone in 0.1 Hz units
            value = Math.round(toneInfo.value * 10);
        } else if (toneInfo.mode === 'DCS') {
            // DCS code with 0x8000 flag, optional 0x4000 for reverse polarity
            value = 0x8000 | (toneInfo.value & 0x0FFF);
            if (toneInfo.polarity === 'R') {
                value |= 0x4000;
            }
        }
        
        return new Uint8Array([value & 0xFF, (value >> 8) & 0xFF]);
    },
    
    /**
     * Serialize string (pad with 0xFF or 0x00)
     */
    string: (value, size, padChar = 0xFF) => {
        const result = new Uint8Array(size).fill(padChar);
        const str = String(value || '').substring(0, size);
        
        for (let i = 0; i < str.length; i++) {
            result[i] = str.charCodeAt(i);
        }
        
        return result;
    }
};

/**
 * Serialize a single field to binary
 */
function serializeField(value, fieldDef) {
    const serializer = FieldSerializers[fieldDef.type];
    if (!serializer) {
        console.warn(`Unknown field type for serialization: ${fieldDef.type}`);
        return new Uint8Array(fieldDef.size || 1).fill(0xFF);
    }
    
    return serializer(value, fieldDef.size, fieldDef.unit);
}

/**
 * Build flag byte from individual flag values
 */
function buildFlagByte(originalByte, flagMappings, flagValues) {
    let result = originalByte;
    
    for (const [mappingName, mapping] of Object.entries(flagMappings)) {
        if (flagValues[mappingName] !== undefined) {
            let value = flagValues[mappingName];
            
            // If values array is provided, find the index
            if (mapping.values && Array.isArray(mapping.values)) {
                const idx = mapping.values.indexOf(value);
                value = idx >= 0 ? idx : 0;
            }
            
            if (mapping.invert) {
                value = value ? 0 : 1;
            }
            
            // Clear the bits and set new value
            const clearMask = ~(mapping.mask << (mapping.shift || 0));
            const setBits = (value & (mapping.mask >> (mapping.shift || 0))) << (mapping.shift || 0);
            result = (result & clearMask) | setBits;
        }
    }
    
    return result;
}

/**
 * Serialize Memory objects back to binary format
 * @param {Memory[]} memories - Array of Memory objects
 * @param {Uint8Array} originalData - Original binary data (for preserving unknown fields)
 * @param {Object} format - Memory format definition
 * @returns {Uint8Array} Serialized binary data
 */
export function serializeMemoryGeneric(memories, originalData, format) {
    // Start with a copy of the original data to preserve unknown fields
    const result = new Uint8Array(originalData);
    
    const channelSize = format.channelSize || 32;
    const numChannels = format.numChannels || memories.length;
    const startOffset = format.startOffset || 0;
    const fields = format.fields || {};
    const flagMappings = format.flagMappings || {};
    
    console.log(`Serializing ${memories.length} memories to binary format`);
    console.log(`Channel size: ${channelSize}, Start offset: ${startOffset}`);
    
    let serializedCount = 0;
    let emptyCount = 0;
    let skippedCount = 0;
    
    for (let i = 0; i < Math.min(memories.length, numChannels); i++) {
        const mem = memories[i];
        const offset = startOffset + (i * channelSize);
        
        if (offset + channelSize > result.length) {
            skippedCount++;
            break;
        }
        
        // For empty channels, we DON'T modify the data - keep original
        // This preserves any radio-specific flags or settings
        if (mem.empty) {
            emptyCount++;
            continue;
        }
        
        serializedCount++;
        
        // Serialize RX frequency
        if (fields.rxFreq && mem.freq) {
            const rxFreqData = serializeField(mem.freq, fields.rxFreq);
            
            // Debug: Log first few serialized frequencies and check if they match original
            if (i < 5) {
                const originalRxBytes = Array.from(originalData.slice(offset + fields.rxFreq.offset, offset + fields.rxFreq.offset + fields.rxFreq.size));
                const newRxBytes = Array.from(rxFreqData);
                const rxMatch = originalRxBytes.every((b, idx) => b === newRxBytes[idx]);
                
                console.log(`Serialize ch${mem.number}:`);
                console.log(`  freq=${mem.freq} Hz (${mem.freq / 1000000} MHz)`);
                console.log(`  original RX: ${originalRxBytes.map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
                console.log(`  new RX:      ${newRxBytes.map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
                console.log(`  RX match: ${rxMatch}`);
                
                if (!rxMatch) {
                    console.warn(`  WARNING: RX frequency bytes don't match!`);
                }
            }
            
            result.set(rxFreqData, offset + fields.rxFreq.offset);
        }
        
        // Serialize TX frequency (calculate from RX + offset/duplex)
        if (fields.txFreq) {
            let txFreq = mem.freq || 0;
            if (mem.duplex === '+') {
                txFreq = mem.freq + (mem.offset || 0);
            } else if (mem.duplex === '-') {
                txFreq = mem.freq - (mem.offset || 0);
            }
            const txFreqData = serializeField(txFreq, fields.txFreq);
            result.set(txFreqData, offset + fields.txFreq.offset);
        }
        
        // Serialize tones
        if (fields.txTone) {
            let txToneInfo = { mode: '', value: 0 };
            if (mem.tmode === 'Tone' || mem.tmode === 'TSQL') {
                txToneInfo = { mode: 'CTCSS', value: mem.rtone || 88.5 };
            } else if (mem.tmode === 'DTCS') {
                const pol = (mem.dtcsPolarity || 'NN')[0];
                txToneInfo = { mode: 'DCS', value: mem.dtcs || 23, polarity: pol };
            }
            const txToneData = serializeField(txToneInfo, fields.txTone);
            result.set(txToneData, offset + fields.txTone.offset);
        }
        
        if (fields.rxTone) {
            let rxToneInfo = { mode: '', value: 0 };
            if (mem.tmode === 'TSQL') {
                rxToneInfo = { mode: 'CTCSS', value: mem.ctone || mem.rtone || 88.5 };
            } else if (mem.tmode === 'DTCS') {
                const pol = (mem.dtcsPolarity || 'NN')[1];
                rxToneInfo = { mode: 'DCS', value: mem.dtcs || 23, polarity: pol };
            }
            const rxToneData = serializeField(rxToneInfo, fields.rxTone);
            result.set(rxToneData, offset + fields.rxTone.offset);
        }
        
        // Serialize name
        if (fields.name && mem.name !== undefined) {
            const nameData = serializeField(mem.name, fields.name);
            result.set(nameData, offset + fields.name.offset);
        }
        
        // Build and serialize flag bytes
        // Group flag mappings by their source field
        const flagsByField = {};
        for (const [mappingName, mapping] of Object.entries(flagMappings)) {
            if (!flagsByField[mapping.field]) {
                flagsByField[mapping.field] = {};
            }
            
            // Get the value from memory
            let value;
            switch (mappingName) {
                case 'wide':
                    value = mem.mode;
                    break;
                case 'lowPower':
                case 'highPower':
                    value = mem.power;
                    break;
                case 'scan':
                    value = mem.skip !== 'S';
                    break;
                default:
                    continue;
            }
            
            flagsByField[mapping.field][mappingName] = value;
        }
        
        // Update each flag field
        for (const [fieldName, flagValues] of Object.entries(flagsByField)) {
            if (fields[fieldName]) {
                const fieldOffset = offset + fields[fieldName].offset;
                const originalByte = result[fieldOffset];
                const fieldFlagMappings = {};
                
                for (const [name, mapping] of Object.entries(flagMappings)) {
                    if (mapping.field === fieldName) {
                        fieldFlagMappings[name] = mapping;
                    }
                }
                
                const newByte = buildFlagByte(originalByte, fieldFlagMappings, flagValues);
                result[fieldOffset] = newByte;
            }
        }
    }
    
    // Serialize names from separate location if defined
    if (format.nameOffset !== undefined && format.nameSize) {
        for (let i = 0; i < Math.min(memories.length, numChannels); i++) {
            const mem = memories[i];
            if (mem.empty) continue;
            
            const nameOffset = format.nameOffset + (i * format.nameSize);
            if (nameOffset + format.nameSize <= result.length && mem.name) {
                const nameData = FieldSerializers.string(mem.name, format.nameSize);
                result.set(nameData, nameOffset);
            }
        }
    }
    
    console.log(`Serialization complete: ${serializedCount} channels serialized, ${emptyCount} empty, ${skippedCount} skipped (beyond data)`);
    
    // Compare result with original to see what changed
    let changedBytes = 0;
    let firstChangeAt = -1;
    for (let i = 0; i < Math.min(result.length, originalData.length); i++) {
        if (result[i] !== originalData[i]) {
            changedBytes++;
            if (firstChangeAt === -1) firstChangeAt = i;
        }
    }
    console.log(`Total bytes changed: ${changedBytes} out of ${result.length}`);
    if (firstChangeAt >= 0) {
        console.log(`First change at offset 0x${firstChangeAt.toString(16)} (channel ${Math.floor(firstChangeAt / channelSize) + 1})`);
    }
    
    return result;
}

/**
 * Main entry point for serializing radio memory
 */
export function serializeRadioMemory(memories, originalData, protocolName, protocol = null) {
    console.log(`Serializing ${memories.length} memories for protocol: ${protocolName}`);
    console.log('Protocol object provided:', protocol ? 'yes' : 'no');
    
    let format = protocol?.memoryFormat;
    
    if (format) {
        console.log('Using protocol memoryFormat');
        console.log('Format channel size:', format.channelSize);
        console.log('Format num channels:', format.numChannels);
        console.log('Format fields:', Object.keys(format.fields || {}));
    } else {
        console.log('Using fallback format for protocol:', protocolName);
        format = getDefaultMemoryFormat(protocolName);
    }
    
    if (!format) {
        console.warn('No memory format defined, cannot serialize');
        return originalData;
    }
    
    return serializeMemoryGeneric(memories, originalData, format);
}

/**
 * Get default memory format for known protocols
 */
function getDefaultMemoryFormat(protocolName) {
    const defaultFormats = {
        'baofeng-uv17pro': {
            channelSize: 32,
            numChannels: 1000,
            startOffset: 0,
            fields: {
                rxFreq: { offset: 0, size: 4, type: 'bcd', unit: 10 },
                txFreq: { offset: 4, size: 4, type: 'bcd', unit: 10 },
                rxTone: { offset: 8, size: 2, type: 'tone_u16le' },
                txTone: { offset: 10, size: 2, type: 'tone_u16le' },
                flags1: { offset: 14, size: 1, type: 'byte' },
                flags2: { offset: 15, size: 1, type: 'byte' },
                name: { offset: 20, size: 12, type: 'string' }
            },
            flagMappings: {
                lowPower: { field: 'flags1', mask: 0x03, shift: 0, values: ['High', 'Med', 'Low'] },
                wide: { field: 'flags2', mask: 0x40, shift: 6, values: ['NFM', 'FM'] },
                scan: { field: 'flags2', mask: 0x04, shift: 2 }
            },
            emptyCheck: { field: 'rxFreq', emptyValues: [0, 0xFFFFFFFF] }
        },
        'baofeng-uv5r': {
            channelSize: 16,
            numChannels: 128,
            startOffset: 8,
            nameOffset: 0x1000,
            nameSize: 7,
            fields: {
                rxFreq: { offset: 0, size: 4, type: 'bcd', unit: 10 },
                txFreq: { offset: 4, size: 4, type: 'bcd', unit: 10 },
                rxTone: { offset: 10, size: 2, type: 'tone_u16le' },
                txTone: { offset: 8, size: 2, type: 'tone_u16le' },
                flags: { offset: 12, size: 1, type: 'byte' }
            },
            flagMappings: {
                highPower: { field: 'flags', mask: 0x04, shift: 2, invert: true, values: ['Low', 'High'] },
                wide: { field: 'flags', mask: 0x02, shift: 1, values: ['NFM', 'FM'] }
            },
            emptyCheck: { field: 'rxFreq', emptyValues: [0, 0xFFFFFFFF] }
        },
        'h777': {
            channelSize: 16,
            numChannels: 16,
            startOffset: 0,
            fields: {
                rxFreq: { offset: 0, size: 4, type: 'bcd', unit: 10 },
                txFreq: { offset: 4, size: 4, type: 'bcd', unit: 10 },
                rxTone: { offset: 8, size: 2, type: 'tone_u16le' },
                txTone: { offset: 10, size: 2, type: 'tone_u16le' }
            },
            emptyCheck: { field: 'rxFreq', emptyValues: [0, 0xFFFFFFFF] },
            defaults: { mode: 'NFM', power: 'High' }
        }
    };
    
    return defaultFormats[protocolName] || null;
}
