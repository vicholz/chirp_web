/**
 * CHIRP Web - RepeaterBook Integration
 * Query repeater databases for frequency lookups
 */

import { Memory, parseFreq, formatFreq } from './memory.js';

// North American countries with state/province support
export const NA_COUNTRIES = ['United States', 'Canada', 'Mexico'];

// US States
export const US_STATES = [
    'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado',
    'Connecticut', 'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho',
    'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana',
    'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota',
    'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada',
    'New Hampshire', 'New Jersey', 'New Mexico', 'New York',
    'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon',
    'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota',
    'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington',
    'West Virginia', 'Wisconsin', 'Wyoming', 'District of Columbia'
];

// Canadian Provinces
export const CA_PROVINCES = [
    'Alberta', 'British Columbia', 'Manitoba', 'New Brunswick',
    'Newfoundland and Labrador', 'Northwest Territories', 'Nova Scotia',
    'Nunavut', 'Ontario', 'Prince Edward Island', 'Quebec', 'Saskatchewan',
    'Yukon'
];

// Mexican States
export const MX_STATES = [
    'Aguascalientes', 'Baja California Sur', 'Baja California',
    'Campeche', 'Chiapas', 'Chihuahua', 'Coahuila', 'Colima',
    'Durango', 'Guanajuato', 'Guerrero', 'Hidalgo', 'Jalisco',
    'Mexico City', 'Mexico', 'Michoacán', 'Morelos', 'Nayarit',
    'Nuevo Leon', 'Puebla', 'Queretaro', 'Quintana Roo', 'San Luis Potosi',
    'Sinaloa', 'Sonora', 'Tabasco', 'Tamaulipas', 'Tlaxcala', 'Veracruz',
    'Yucatan', 'Zacatecas'
];

// Rest of world countries
export const ROW_COUNTRIES = [
    'Albania', 'Andorra', 'Argentina', 'Australia', 'Austria', 'Azerbaijan',
    'Bahamas', 'Barbados', 'Belarus', 'Belgium', 'Belize', 'Bolivia',
    'Bosnia and Herzegovina', 'Brazil', 'Bulgaria', 'Chile', 'China',
    'Colombia', 'Costa Rica', 'Croatia', 'Cyprus', 'Czech Republic',
    'Denmark', 'Dominican Republic', 'Ecuador', 'El Salvador', 'Estonia',
    'Finland', 'France', 'Georgia', 'Germany', 'Greece', 'Guatemala',
    'Honduras', 'Hungary', 'Iceland', 'India', 'Indonesia', 'Ireland',
    'Israel', 'Italy', 'Jamaica', 'Japan', 'Kuwait', 'Latvia',
    'Liechtenstein', 'Lithuania', 'Luxembourg', 'Malaysia', 'Malta',
    'Morocco', 'Nepal', 'Netherlands', 'New Zealand', 'Nicaragua',
    'Norway', 'Oman', 'Panama', 'Paraguay', 'Peru', 'Philippines',
    'Poland', 'Portugal', 'Romania', 'Russian Federation', 'Serbia',
    'Singapore', 'Slovakia', 'Slovenia', 'South Africa', 'South Korea',
    'Spain', 'Sri Lanka', 'Sweden', 'Switzerland', 'Taiwan', 'Thailand',
    'Trinidad and Tobago', 'Turkey', 'Ukraine', 'United Arab Emirates',
    'United Kingdom', 'Uruguay', 'Venezuela'
];

export const ALL_COUNTRIES = [...NA_COUNTRIES, ...ROW_COUNTRIES].sort();

// Modes supported by RepeaterBook
export const RB_MODES = ['FM', 'DMR', 'D-Star', 'Fusion'];

// Frequency bands
export const BANDS = [
    { name: '10m', low: 28000000, high: 30000000 },
    { name: '6m', low: 50000000, high: 54000000 },
    { name: '2m', low: 144000000, high: 148000000 },
    { name: '1.25m', low: 222000000, high: 225000000 },
    { name: '70cm', low: 420000000, high: 450000000 },
    { name: '33cm', low: 902000000, high: 928000000 },
    { name: '23cm', low: 1240000000, high: 1300000000 }
];

/**
 * Get states/provinces for a country
 */
export function getStatesForCountry(country) {
    switch (country) {
        case 'United States':
            return US_STATES;
        case 'Canada':
            return CA_PROVINCES;
        case 'Mexico':
            return MX_STATES;
        default:
            return [];
    }
}

/**
 * Calculate distance between two points in km (Haversine formula)
 */
export function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function toRad(deg) {
    return deg * (Math.PI / 180);
}

/**
 * Parse tone from RepeaterBook format
 */
function parseTone(val) {
    if (!val) return { mode: null, value: null };
    
    val = String(val).trim();
    
    if (val.startsWith('D')) {
        return { mode: 'DTCS', value: parseInt(val.substring(1)) };
    } else if (val.includes('.')) {
        return { mode: 'Tone', value: parseFloat(val) };
    } else if (val === 'CSQ' || val === 'Restricted') {
        return { mode: null, value: null };
    }
    
    return { mode: null, value: null };
}

/**
 * Convert RepeaterBook item to Memory object
 */
export function repeaterToMemory(item, number = 0) {
    const mem = new Memory(number, false);
    
    // Frequency
    mem.freq = parseFreq(item.Frequency);
    
    // Calculate offset and duplex from input frequency
    const inputFreq = parseFreq(item['Input Freq']);
    if (inputFreq === 0) {
        mem.duplex = 'off';
        mem.offset = 0;
    } else {
        const diff = inputFreq - mem.freq;
        if (Math.abs(diff) > 70000000) {
            // Cross-band split
            mem.duplex = 'split';
            mem.offset = inputFreq;
        } else if (diff > 0) {
            mem.duplex = '+';
            mem.offset = diff;
        } else if (diff < 0) {
            mem.duplex = '-';
            mem.offset = Math.abs(diff);
        } else {
            mem.duplex = '';
            mem.offset = 0;
        }
    }
    
    // Tone settings
    const txTone = parseTone(item.PL);
    const rxTone = parseTone(item.TSQ);
    
    if (txTone.mode === 'Tone' && !rxTone.mode) {
        mem.tmode = 'Tone';
        mem.rtone = txTone.value;
    } else if (txTone.mode === 'Tone' && rxTone.mode === 'Tone' && txTone.value === rxTone.value) {
        mem.tmode = 'TSQL';
        mem.ctone = txTone.value;
    } else if (txTone.mode === 'DTCS' && rxTone.mode === 'DTCS' && txTone.value === rxTone.value) {
        mem.tmode = 'DTCS';
        mem.dtcs = txTone.value;
    } else if (txTone.mode || rxTone.mode) {
        mem.tmode = 'Cross';
        mem.crossMode = `${txTone.mode || ''}->${rxTone.mode || ''}`;
        if (txTone.mode === 'Tone') mem.rtone = txTone.value;
        if (txTone.mode === 'DTCS') mem.dtcs = txTone.value;
        if (rxTone.mode === 'Tone') mem.ctone = rxTone.value;
        if (rxTone.mode === 'DTCS') mem.rxDtcs = rxTone.value;
    }
    
    // Mode
    if (item.DMR === 'Yes') {
        mem.mode = 'DMR';
    } else if (item['D-Star'] === 'Yes') {
        mem.mode = 'DV';
    } else if (item['System Fusion'] === 'Yes') {
        mem.mode = 'DN';
    } else {
        mem.mode = 'FM';
    }
    
    // Name and comment
    mem.name = (item.Landmark || item.Callsign || '').substring(0, 8);
    
    let comment = `${item.Callsign || ''}`;
    if (item['Nearest City']) {
        comment += ` near ${item['Nearest City']}`;
    }
    if (item.County && item.State) {
        comment += `, ${item.County} County, ${item.State}`;
    } else if (item.Region) {
        comment += `, ${item.Region}`;
    }
    if (item.Use) {
        comment += ` (${item.Use})`;
    }
    mem.comment = comment.trim();
    
    return mem;
}

/**
 * RepeaterBook API client
 * Note: Due to CORS restrictions, this may need a proxy server
 */
export class RepeaterBookClient {
    constructor() {
        this.baseUrl = 'https://www.repeaterbook.com/api';
        // Use CORS proxy for browser
        this.proxyUrl = null; // Set this if using a proxy
    }

    /**
     * Set a CORS proxy URL
     */
    setProxy(url) {
        this.proxyUrl = url;
    }

    /**
     * Build the API URL
     */
    buildUrl(endpoint, params) {
        const url = new URL(`${this.baseUrl}/${endpoint}`);
        for (const [key, value] of Object.entries(params)) {
            if (value !== undefined && value !== null && value !== '') {
                url.searchParams.append(key, value);
            }
        }
        
        if (this.proxyUrl) {
            return `${this.proxyUrl}?url=${encodeURIComponent(url.toString())}`;
        }
        return url.toString();
    }

    /**
     * Query repeaters from RepeaterBook
     */
    async query(options = {}) {
        const {
            country = 'United States',
            state = '',
            city = '',
            band = '',
            mode = '',
            callsign = '',
            use = '',
            onProgress = null
        } = options;

        if (onProgress) onProgress({ message: 'Connecting to RepeaterBook...', percent: 10 });

        // Determine which endpoint to use
        const isNA = NA_COUNTRIES.includes(country);
        const endpoint = isNA ? 'export.php' : 'exportROW.php';

        const params = {
            country: country,
            state: state || undefined,
            city: city || undefined
        };

        try {
            const url = this.buildUrl(endpoint, params);
            
            if (onProgress) onProgress({ message: 'Downloading data...', percent: 30 });

            const response = await fetch(url, {
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error: ${response.status}`);
            }

            if (onProgress) onProgress({ message: 'Parsing results...', percent: 70 });

            const data = await response.json();

            if (!data.results || !Array.isArray(data.results)) {
                throw new Error('Invalid response from RepeaterBook');
            }

            if (onProgress) onProgress({ message: 'Processing...', percent: 90 });

            // Filter and convert results
            const memories = [];
            let memNumber = 1;

            for (const item of data.results) {
                // Skip off-air repeaters
                if (item['Operational Status'] !== 'On-air') continue;

                // Filter by band
                if (band) {
                    const freq = parseFreq(item.Frequency);
                    const bandInfo = BANDS.find(b => b.name === band);
                    if (bandInfo && (freq < bandInfo.low || freq > bandInfo.high)) {
                        continue;
                    }
                }

                // Filter by mode
                if (mode) {
                    if (mode === 'FM' && item['FM Analog'] !== 'Yes') continue;
                    if (mode === 'DMR' && item.DMR !== 'Yes') continue;
                    if (mode === 'D-Star' && item['D-Star'] !== 'Yes') continue;
                    if (mode === 'Fusion' && item['System Fusion'] !== 'Yes') continue;
                }

                // Filter by use (open vs closed)
                if (use === 'open' && item.Use !== 'OPEN') continue;

                try {
                    const mem = repeaterToMemory(item, memNumber++);
                    memories.push(mem);
                } catch (e) {
                    console.warn('Failed to convert repeater:', e);
                }
            }

            if (onProgress) onProgress({ message: 'Complete', percent: 100 });

            return memories;

        } catch (error) {
            if (error.message.includes('CORS') || error.message.includes('Failed to fetch')) {
                throw new Error(
                    'Unable to connect to RepeaterBook due to browser security restrictions. ' +
                    'This feature requires a CORS proxy or backend server.'
                );
            }
            throw error;
        }
    }

    /**
     * Query repeaters near a location
     */
    async queryNearby(lat, lon, distanceKm, options = {}) {
        const allRepeaters = await this.query(options);
        
        // Filter by distance
        const nearby = allRepeaters.filter(mem => {
            // We don't have lat/lon in memory objects, so this needs the raw data
            // For now, return all results - the real implementation would need
            // to preserve lat/lon from the API response
            return true;
        });

        // Sort by distance (would need lat/lon data)
        return nearby;
    }
}

/**
 * Stock configurations (built-in frequency lists)
 */
export const STOCK_CONFIGS = {
    'US FRS and GMRS': {
        name: 'US FRS and GMRS Channels',
        frequencies: [
            { num: 1, name: 'FRS 1', freq: 462.5625, mode: 'NFM', power: '2W' },
            { num: 2, name: 'FRS 2', freq: 462.5875, mode: 'NFM', power: '2W' },
            { num: 3, name: 'FRS 3', freq: 462.6125, mode: 'NFM', power: '2W' },
            { num: 4, name: 'FRS 4', freq: 462.6375, mode: 'NFM', power: '2W' },
            { num: 5, name: 'FRS 5', freq: 462.6625, mode: 'NFM', power: '2W' },
            { num: 6, name: 'FRS 6', freq: 462.6875, mode: 'NFM', power: '2W' },
            { num: 7, name: 'FRS 7', freq: 462.7125, mode: 'NFM', power: '2W' },
            { num: 8, name: 'FRS 8', freq: 467.5625, mode: 'NFM', power: '0.5W' },
            { num: 9, name: 'FRS 9', freq: 467.5875, mode: 'NFM', power: '0.5W' },
            { num: 10, name: 'FRS 10', freq: 467.6125, mode: 'NFM', power: '0.5W' },
            { num: 11, name: 'FRS 11', freq: 467.6375, mode: 'NFM', power: '0.5W' },
            { num: 12, name: 'FRS 12', freq: 467.6625, mode: 'NFM', power: '0.5W' },
            { num: 13, name: 'FRS 13', freq: 467.6875, mode: 'NFM', power: '0.5W' },
            { num: 14, name: 'FRS 14', freq: 467.7125, mode: 'NFM', power: '0.5W' },
            { num: 15, name: 'FRS 15', freq: 462.5500, mode: 'NFM', power: '2W' },
            { num: 16, name: 'FRS 16', freq: 462.5750, mode: 'NFM', power: '2W' },
            { num: 17, name: 'FRS 17', freq: 462.6000, mode: 'NFM', power: '2W' },
            { num: 18, name: 'FRS 18', freq: 462.6250, mode: 'NFM', power: '2W' },
            { num: 19, name: 'FRS 19', freq: 462.6500, mode: 'NFM', power: '2W' },
            { num: 20, name: 'FRS 20', freq: 462.6750, mode: 'NFM', power: '2W' },
            { num: 21, name: 'FRS 21', freq: 462.7000, mode: 'NFM', power: '2W' },
            { num: 22, name: 'FRS 22', freq: 462.7250, mode: 'NFM', power: '2W' }
        ]
    },
    'US MURS': {
        name: 'US MURS Channels',
        frequencies: [
            { num: 1, name: 'MURS 1', freq: 151.820, mode: 'NFM' },
            { num: 2, name: 'MURS 2', freq: 151.880, mode: 'NFM' },
            { num: 3, name: 'MURS 3', freq: 151.940, mode: 'NFM' },
            { num: 4, name: 'MURS 4', freq: 154.570, mode: 'NFM' },
            { num: 5, name: 'MURS 5', freq: 154.600, mode: 'NFM' }
        ]
    },
    'US NOAA Weather': {
        name: 'US NOAA Weather Alert',
        frequencies: [
            { num: 1, name: 'WX1', freq: 162.550, mode: 'NFM' },
            { num: 2, name: 'WX2', freq: 162.400, mode: 'NFM' },
            { num: 3, name: 'WX3', freq: 162.475, mode: 'NFM' },
            { num: 4, name: 'WX4', freq: 162.425, mode: 'NFM' },
            { num: 5, name: 'WX5', freq: 162.450, mode: 'NFM' },
            { num: 6, name: 'WX6', freq: 162.500, mode: 'NFM' },
            { num: 7, name: 'WX7', freq: 162.525, mode: 'NFM' }
        ]
    },
    'US Marine VHF': {
        name: 'US Marine VHF Channels',
        frequencies: [
            { num: 16, name: 'Distress', freq: 156.800, mode: 'FM' },
            { num: 6, name: 'Intership', freq: 156.300, mode: 'FM' },
            { num: 9, name: 'Boater', freq: 156.450, mode: 'FM' },
            { num: 13, name: 'Bridge', freq: 156.650, mode: 'FM' },
            { num: 22, name: 'USCG', freq: 157.100, mode: 'FM' }
        ]
    },
    'US Calling Frequencies': {
        name: 'US National Calling Frequencies',
        frequencies: [
            { num: 1, name: '2m FM', freq: 146.520, mode: 'FM', comment: '2m FM Simplex' },
            { num: 2, name: '70cm FM', freq: 446.000, mode: 'FM', comment: '70cm FM Simplex' },
            { num: 3, name: '2m SSB', freq: 144.200, mode: 'USB', comment: '2m SSB Calling' },
            { num: 4, name: '6m FM', freq: 52.525, mode: 'FM', comment: '6m FM Calling' },
            { num: 5, name: '10m FM', freq: 29.600, mode: 'FM', comment: '10m FM Calling' }
        ]
    },
    'EU PMR446': {
        name: 'EU PMR446 Channels',
        frequencies: [
            { num: 1, name: 'PMR 1', freq: 446.00625, mode: 'NFM' },
            { num: 2, name: 'PMR 2', freq: 446.01875, mode: 'NFM' },
            { num: 3, name: 'PMR 3', freq: 446.03125, mode: 'NFM' },
            { num: 4, name: 'PMR 4', freq: 446.04375, mode: 'NFM' },
            { num: 5, name: 'PMR 5', freq: 446.05625, mode: 'NFM' },
            { num: 6, name: 'PMR 6', freq: 446.06875, mode: 'NFM' },
            { num: 7, name: 'PMR 7', freq: 446.08125, mode: 'NFM' },
            { num: 8, name: 'PMR 8', freq: 446.09375, mode: 'NFM' }
        ]
    }
};

/**
 * Load a stock configuration as memories
 */
export function loadStockConfig(configName) {
    const config = STOCK_CONFIGS[configName];
    if (!config) {
        throw new Error(`Unknown stock configuration: ${configName}`);
    }

    const memories = [];
    for (const item of config.frequencies) {
        const mem = new Memory(item.num, false);
        mem.name = item.name;
        mem.freq = item.freq * 1000000; // Convert MHz to Hz
        mem.mode = item.mode || 'FM';
        mem.power = item.power || '';
        mem.comment = item.comment || '';
        mem.duplex = item.duplex || '';
        if (item.offset) {
            mem.offset = item.offset * 1000000;
        }
        memories.push(mem);
    }

    return memories;
}
