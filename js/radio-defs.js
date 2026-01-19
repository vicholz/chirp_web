/**
 * Radio Definitions
 * Defines communication protocols for various amateur radio models
 * Based on CHIRP's radio drivers
 */

export const RADIO_PROTOCOLS = {
    // Baofeng UV-5R family protocol
    'baofeng-uv5r': {
        name: 'Baofeng UV-5R Protocol',
        baudRate: 9600,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        handshake: {
            type: 'magic',
            // UV5R_MODEL_291 magic bytes
            magic: [0x50, 0xBB, 0xFF, 0x20, 0x12, 0x07, 0x25],
            magicDelay: 10,  // ms between bytes
            expectAck: 0x06,
            identCmd: [0x02],
            identLength: 8,
            identEndByte: 0xDD
        },
        read: {
            cmd: 0x53,  // 'S'
            responseCmd: 0x58,  // 'X'
            blockSize: 0x40,
            addressBytes: 2,
            bigEndian: true,
            ackAfterBlock: true,
            ackByte: 0x06,
            delayAfterAck: 50
        },
        write: {
            cmd: 0x58,  // 'X'
            blockSize: 0x10,
            addressBytes: 2,
            bigEndian: true,
            expectAck: 0x06,
            delayAfterAck: 50
        },
        memoryLayout: {
            headerSize: 8,
            mainStart: 0x0000,
            mainEnd: 0x1800,
            auxStart: 0x1EC0,
            auxEnd: 0x2000
        },
        // UV-5R memory format (16 bytes per channel, names stored separately)
        memoryFormat: {
            channelSize: 16,
            numChannels: 128,
            startOffset: 8,  // Skip 8-byte header
            nameOffset: 0x1000,  // Names stored at separate location
            nameSize: 7,
            fields: {
                rxFreq: { offset: 0, size: 4, type: 'bcd', unit: 10 },
                txFreq: { offset: 4, size: 4, type: 'bcd', unit: 10 },
                rxTone: { offset: 10, size: 2, type: 'tone_u16le' },
                txTone: { offset: 8, size: 2, type: 'tone_u16le' },
                flags: { offset: 12, size: 1, type: 'byte' }
            },
            flagMappings: {
                highPower: { field: 'flags', mask: 0x04, shift: 2, invert: true },
                wide: { field: 'flags', mask: 0x02, shift: 1, values: ['NFM', 'FM'] }
            },
            emptyCheck: { field: 'rxFreq', emptyValues: [0, 0xFFFFFFFF] }
        }
    },
    
    // Baofeng UV-B5/B6 protocol
    'baofeng-uvb5': {
        name: 'Baofeng UV-B5 Protocol',
        baudRate: 9600,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        handshake: {
            type: 'program',
            programCmd: [0x05, 0x50, 0x52, 0x4F, 0x47, 0x52, 0x41, 0x4D],  // \x05PROGRAM
            expectAck: 0x06,
            maxAckRetries: 10,
            identCmd: [0x02],
            identLength: 8,
            identPrefix: [0x48, 0x4B, 0x54, 0x35, 0x31, 0x31],  // HKT511
            ackAfterIdent: true
        },
        read: {
            cmd: 0x52,  // 'R'
            responseCmd: 0x57,  // 'W' (echo of address)
            blockSize: 16,
            addressBytes: 2,
            bigEndian: true,
            ackAfterBlock: true,
            ackByte: 0x06
        },
        write: {
            cmd: 0x57,  // 'W'
            blockSize: 16,
            addressBytes: 2,
            bigEndian: true,
            expectAck: 0x06
        },
        memoryLayout: {
            headerSize: 48,
            mainStart: 0x0000,
            mainEnd: 0x1000
        }
    },
    
    // H777/BF-888S protocol
    'h777': {
        name: 'H777/BF-888S Protocol',
        baudRate: 9600,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        handshake: {
            type: 'program',
            preCmd: [0x02],
            preDelay: 100,
            programCmd: [0x50, 0x52, 0x4F, 0x47, 0x52, 0x41, 0x4D],  // PROGRAM
            expectAck: 0x06,
            identCmd: [0x02],
            identLength: 8
        },
        read: {
            cmd: 0x52,  // 'R'
            blockSize: 8,
            addressBytes: 2,
            bigEndian: true,
            ackAfterBlock: true,
            ackByte: 0x06
        },
        write: {
            cmd: 0x57,  // 'W'
            blockSize: 8,
            addressBytes: 2,
            bigEndian: true,
            expectAck: 0x06
        },
        memoryLayout: {
            mainStart: 0x0000,
            mainEnd: 0x03E0
        },
        // H777/BF-888S memory format
        memoryFormat: {
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
            defaults: {
                mode: 'NFM',
                power: 'High'
            }
        }
    },
    
    // BTECH protocol
    'btech': {
        name: 'BTECH Protocol',
        baudRate: 9600,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        handshake: {
            type: 'magic',
            magic: [0x55, 0x20, 0x15, 0x09, 0x20, 0x45, 0x4D, 0x02],
            expectAck: 0x06,
            identLength: 50
        },
        read: {
            cmd: 0x53,  // 'S'
            blockSize: 0x40,
            addressBytes: 2,
            bigEndian: true
        },
        write: {
            cmd: 0x58,  // 'X'
            blockSize: 0x10,
            addressBytes: 2,
            bigEndian: true,
            expectAck: 0x06
        },
        memoryLayout: {
            mainStart: 0x0000,
            mainEnd: 0x8000
        }
    },
    
    // Baofeng UV17Pro / BF-F8HP Pro protocol
    'baofeng-uv17pro': {
        name: 'Baofeng UV17Pro Protocol',
        baudRate: 115200,  // UV17Pro uses 115200!
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        handshake: {
            type: 'uv17pro',
            // Ident magic strings - sent as full string, expect fingerprint back
            idents: [
                // MSTRING_BFF8HPPRO
                [0x50, 0x52, 0x4F, 0x47, 0x52, 0x41, 0x4D, 0x42, 0x46, 0x35, 0x52, 0x54, 0x45, 0x43, 0x48, 0x55],  // PROGRAMBF5RTECHU
            ],
            fingerprint: [0x06],
            // Additional magic commands after ident
            magics: [
                { cmd: [0x46], responseLen: 16 },  // 'F' command
                { cmd: [0x4D], responseLen: 6 },   // 'M' command
                // SEND sequence
                { cmd: [0x53, 0x45, 0x4E, 0x44, 0x12, 0x0D, 0x0A, 0x0A, 0x10, 0x03, 0x0D, 0x02, 0x11, 0x0C,
                        0x12, 0x0A, 0x11, 0x06, 0x04, 0x0E, 0x02, 0x09, 0x0D, 0x00, 0x00], responseLen: 1 }
            ]
        },
        encryption: {
            enabled: true,
            symbolIndex: 1  // Default for UV17Pro, BF-F8HP Pro uses 3
        },
        // Memory format definition for parsing downloaded data
        memoryFormat: {
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
            // How to extract values from flag bytes
            flagMappings: {
                lowPower: { field: 'flags1', mask: 0x03, shift: 0, values: ['High', 'Med', 'Low'] },
                wide: { field: 'flags2', mask: 0x40, shift: 6, values: ['NFM', 'FM'] },
                scan: { field: 'flags2', mask: 0x04, shift: 2 }
            },
            // How to check if a channel is empty
            emptyCheck: { field: 'rxFreq', emptyValues: [0, 0xFFFFFFFF] }
        },
        read: {
            cmd: 0x52,  // 'R'
            responseCmd: 0x52,  // Response echoes 'R' back
            blockSize: 0x40,
            addressBytes: 2,
            bigEndian: true,
            ackAfterBlock: false,  // UV17Pro doesn't need ACK after each block during read
            skipHeaderValidation: true  // UV17Pro doesn't validate header, just strips 4 bytes
        },
        write: {
            cmd: 0x57,  // 'W'
            blockSize: 0x40,
            addressBytes: 2,
            bigEndian: true,
            expectAck: 0x06
        },
        memoryLayout: {
            // UV17Pro has multiple non-contiguous regions
            // MEM_STARTS = [0x0000, 0x9000, 0xA000, 0xD000]
            // MEM_SIZES = [0x8040, 0x0040, 0x02C0, 0x0040]
            regions: [
                { start: 0x0000, size: 0x8040 },
                { start: 0x9000, size: 0x0040 },
                { start: 0xA000, size: 0x02C0 },
                { start: 0xD000, size: 0x0040 }
            ],
            totalSize: 0x8380
        }
    },
    
    // Wouxun KGUV protocol (KGUV8D, KGUV8E, etc.)
    'wouxun-kguv': {
        name: 'Wouxun KGUV Protocol',
        baudRate: 19200,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        handshake: {
            type: 'wouxun',
            recordStart: 0x7D,  // For KGUV8D
            identCmd: 0x80,
            identLength: 32
        },
        encryption: {
            type: 'wouxun',
            valxor: 0x57
        },
        checksum: {
            type: 'sum',
            offset: 0
        },
        read: {
            cmd: 0x82,
            blockSize: 0x40,
            addressBytes: 2,
            bigEndian: true,
            hasChecksum: true
        },
        write: {
            cmd: 0x81,
            blockSize: 0x10,
            addressBytes: 2,
            bigEndian: true,
            hasChecksum: true,
            expectAck: 0x06
        },
        memoryLayout: {
            mainStart: 0x0000,
            mainEnd: 0x2000
        }
    },
    
    // Retevis RT98 protocol (TH9000 compatible)
    'retevis-rt98': {
        name: 'Retevis RT98 Protocol',
        baudRate: 9600,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        handshake: {
            type: 'program',
            programCmd: [0x50, 0x52, 0x4F, 0x47, 0x52, 0x41, 0x4D],  // PROGRAM
            expectAck: 0x06,
            identCmd: [0x02],
            identLength: 8
        },
        checksum: {
            type: 'sum',
            offset: 0
        },
        read: {
            cmd: 0x52,  // 'R'
            blockSize: 0x10,
            addressBytes: 2,
            bigEndian: true,
            hasChecksum: true,
            ackAfterBlock: true,
            ackByte: 0x06
        },
        write: {
            cmd: 0x57,  // 'W'
            blockSize: 0x10,
            addressBytes: 2,
            bigEndian: true,
            hasChecksum: true,
            expectAck: 0x06
        },
        memoryLayout: {
            mainStart: 0x0000,
            mainEnd: 0x1000
        }
    },
    
    // Leixen protocol (VV-898, etc.)
    'leixen': {
        name: 'Leixen Protocol',
        baudRate: 9600,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        handshake: {
            type: 'leixen',
            magic: [0x06, 0x01],
            expectResponse: [0x06, 0x01]
        },
        checksum: {
            type: 'xor'
        },
        read: {
            cmd: 0x52,  // 'R'
            blockSize: 0x10,
            addressBytes: 2,
            bigEndian: true,
            hasChecksum: true
        },
        write: {
            cmd: 0x57,  // 'W'
            blockSize: 0x10,
            addressBytes: 2,
            bigEndian: true,
            hasChecksum: true,
            expectAck: 0x06
        },
        memoryLayout: {
            mainStart: 0x0000,
            mainEnd: 0x2000
        }
    },
    
    // Generic fallback protocol
    'generic': {
        name: 'Generic Protocol',
        baudRate: 9600,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        handshake: null,
        read: {
            cmd: 0x52,  // 'R'
            blockSize: 64,
            addressBytes: 2,
            bigEndian: true
        },
        write: {
            cmd: 0x57,  // 'W'
            blockSize: 64,
            addressBytes: 2,
            bigEndian: true,
            expectAck: 0x06
        },
        memoryLayout: {
            mainStart: 0x0000,
            mainEnd: 0x2000
        }
    }
};

/**
 * Radio model definitions
 * Maps vendor/model to protocol and specific settings
 */
export const RADIO_MODELS = {
    // Baofeng
    'baofeng': {
        'uv5r': { protocol: 'baofeng-uv5r', memSize: 0x1808, name: 'UV-5R' },
        'uv5rplus': { protocol: 'baofeng-uv5r', memSize: 0x1808, name: 'UV-5R+' },
        'uv5rv2': { protocol: 'baofeng-uv5r', memSize: 0x1808, name: 'UV-5R V2+' },
        'uv5x': { protocol: 'baofeng-uv5r', memSize: 0x1808, name: 'UV-5X' },
        'uv5xp': { protocol: 'baofeng-uv5r', memSize: 0x1808, name: 'UV-5XP' },
        'bff8hp': { protocol: 'baofeng-uv5r', memSize: 0x1808, name: 'BF-F8HP',
            handshakeOverride: { 
                // Try multiple magic sequences - UV5R_MODEL_291 and UV5R_MODEL_A58
                magicSequences: [
                    [0x50, 0xBB, 0xFF, 0x20, 0x12, 0x07, 0x25],  // UV5R_MODEL_291
                    [0x50, 0xBB, 0xFF, 0x20, 0x14, 0x04, 0x13],  // UV5R_MODEL_A58
                ]
            }
        },
        'bff8hppro': { protocol: 'baofeng-uv17pro', memSize: 0x8380, name: 'BF-F8HP Pro',
            encryptionOverride: { symbolIndex: 3 }  // BF-F8HP Pro uses symbol index 3 ("J PK")
        },
        'uv82': { protocol: 'baofeng-uv5r', memSize: 0x1808, name: 'UV-82',
            handshakeOverride: { magic: [0x50, 0xBB, 0xFF, 0x20, 0x13, 0x01, 0x05] }
        },
        'uv82hp': { protocol: 'baofeng-uv5r', memSize: 0x1808, name: 'UV-82HP' },
        'uv82x3': { protocol: 'baofeng-uv5r', memSize: 0x1808, name: 'UV-82X3' },
        'bf888s': { protocol: 'h777', memSize: 0x0400, name: 'BF-888S' },
        'gt5r': { protocol: 'baofeng-uv5r', memSize: 0x1808, name: 'GT-5R' },
        'gt3tp': { protocol: 'baofeng-uv5r', memSize: 0x1808, name: 'GT-3TP' },
        'uv6': { protocol: 'baofeng-uv5r', memSize: 0x1808, name: 'UV-6',
            handshakeOverride: { magic: [0x50, 0xBB, 0xFF, 0x20, 0x12, 0x08, 0x23] }
        },
        'uvb5': { protocol: 'baofeng-uvb5', memSize: 0x1000, name: 'UV-B5' },
        'uvb6': { protocol: 'baofeng-uvb5', memSize: 0x1000, name: 'UV-B6' },
        'uv5g': { protocol: 'baofeng-uv5r', memSize: 0x1808, name: 'UV-5G' },
        'uv5gpro': { protocol: 'baofeng-uv5r', memSize: 0x1808, name: 'UV-5G Pro' },
        'uv17': { protocol: 'baofeng-uv17pro', memSize: 0x8380, name: 'UV-17',
            handshakeOverride: {
                idents: [
                    // MSTRING_UV17L
                    [0x50, 0x52, 0x4F, 0x47, 0x52, 0x41, 0x4D, 0x42, 0x46, 0x4E, 0x4F, 0x52, 0x4D, 0x41, 0x4C, 0x55]  // PROGRAMBFNORMALU
                ],
                magics: [
                    { cmd: [0x46], responseLen: 16 },
                    { cmd: [0x4D], responseLen: 15 },
                    { cmd: [0x53, 0x45, 0x4E, 0x44, 0x21, 0x05, 0x0D, 0x01, 0x01, 0x01, 0x04, 0x11, 0x08, 0x05,
                            0x0D, 0x0D, 0x01, 0x11, 0x0F, 0x09, 0x12, 0x09, 0x10, 0x04, 0x00], responseLen: 1 }
                ]
            }
        },
        'uv17pro': { protocol: 'baofeng-uv17pro', memSize: 0x8380, name: 'UV-17 Pro',
            handshakeOverride: {
                idents: [
                    // MSTRING_UV17PROGPS
                    [0x50, 0x52, 0x4F, 0x47, 0x52, 0x41, 0x4D, 0x43, 0x4F, 0x4C, 0x4F, 0x52, 0x50, 0x52, 0x4F, 0x55]  // PROGRAMCOLORPROU
                ],
                magics: [
                    { cmd: [0x46], responseLen: 16 },
                    { cmd: [0x4D], responseLen: 7 },
                    { cmd: [0x53, 0x45, 0x4E, 0x44, 0x21, 0x05, 0x0D, 0x01, 0x01, 0x01, 0x04, 0x11, 0x08, 0x05,
                            0x0D, 0x0D, 0x01, 0x11, 0x0F, 0x09, 0x12, 0x09, 0x10, 0x04, 0x00], responseLen: 1 }
                ]
            }
        },
        'f11': { protocol: 'baofeng-uv5r', memSize: 0x1808, name: 'F-11' },
        'bft1': { protocol: 'h777', memSize: 0x0400, name: 'BF-T1' },
        'bft8': { protocol: 'h777', memSize: 0x0400, name: 'BF-T8' },
        'uv3r': { protocol: 'baofeng-uv5r', memSize: 0x0800, name: 'UV-3R' }
    },
    
    // BTECH
    'btech': {
        'uv2501': { protocol: 'btech', memSize: 0x2000, name: 'UV-2501' },
        'uv5001': { protocol: 'btech', memSize: 0x2000, name: 'UV-5001' },
        'uv25x2': { protocol: 'btech', memSize: 0x4000, name: 'UV-25X2',
            handshakeOverride: { magic: [0x55, 0x20, 0x16, 0x12, 0x28, 0xFF, 0xDC, 0x02] }
        },
        'uv25x4': { protocol: 'btech', memSize: 0x4000, name: 'UV-25X4',
            handshakeOverride: { magic: [0x55, 0x20, 0x16, 0x11, 0x18, 0xFF, 0xDC, 0x02] }
        },
        'uv50x2': { protocol: 'btech', memSize: 0x4000, name: 'UV-50X2' },
        'gmrs50x1': { protocol: 'btech', memSize: 0x4000, name: 'GMRS-50X1',
            handshakeOverride: { magic: [0x55, 0x20, 0x18, 0x10, 0x18, 0xFF, 0xDC, 0x02] }
        },
        'gmrs20v2': { protocol: 'btech', memSize: 0x4000, name: 'GMRS-20V2',
            handshakeOverride: { magic: [0x55, 0x20, 0x21, 0x03, 0x27, 0xFF, 0xDC, 0x02] }
        },
        'gmrs50v2': { protocol: 'btech', memSize: 0x4000, name: 'GMRS-50V2' }
    },
    
    // Retevis (mostly use Baofeng protocols)
    'retevis': {
        'rt21': { protocol: 'h777', memSize: 0x0400, name: 'RT21' },
        'rt22': { protocol: 'h777', memSize: 0x0400, name: 'RT22' },
        'rt24': { protocol: 'h777', memSize: 0x0400, name: 'RT24' },
        'rt5r': { protocol: 'baofeng-uv5r', memSize: 0x1808, name: 'RT5R' },
        'rt5rv': { protocol: 'baofeng-uv5r', memSize: 0x1808, name: 'RT5RV' },
        'rt6': { protocol: 'baofeng-uv5r', memSize: 0x1808, name: 'RT6' },
        'rt1': { protocol: 'baofeng-uv5r', memSize: 0x1808, name: 'RT1' },
        'rt23': { protocol: 'baofeng-uv5r', memSize: 0x1808, name: 'RT23' },
        'rt26': { protocol: 'baofeng-uv5r', memSize: 0x1808, name: 'RT26' },
        'rt76p': { protocol: 'baofeng-uv5r', memSize: 0x1808, name: 'RT76P' },
        'rt87': { protocol: 'baofeng-uv5r', memSize: 0x1808, name: 'RT87' },
        'rt98': { protocol: 'retevis-rt98', memSize: 0x1000, name: 'RT98' },
        'h777': { protocol: 'h777', memSize: 0x0400, name: 'H-777' }
    },
    
    // Radioddity
    'radioddity': {
        'uv5rex': { protocol: 'baofeng-uv5r', memSize: 0x1808, name: 'UV-5R EX' },
        'uv5rx3': { protocol: 'baofeng-uv5r', memSize: 0x1808, name: 'UV-5RX3' },
        'ga5s': { protocol: 'baofeng-uv5r', memSize: 0x1808, name: 'GA-5S' },
        'gm30': { protocol: 'baofeng-uv5r', memSize: 0x1808, name: 'GM30' },
        'r2': { protocol: 'h777', memSize: 0x0400, name: 'R2' }
    },
    
    // TYT
    'tyt': {
        'md380': { protocol: 'generic', memSize: 0x40000, name: 'MD-380' },
        'md390': { protocol: 'generic', memSize: 0x40000, name: 'MD-390' },
        'md9600': { protocol: 'generic', memSize: 0x40000, name: 'MD-9600' },
        'thuvf8d': { protocol: 'baofeng-uv5r', memSize: 0x2000, name: 'TH-UVF8D' },
        'thuv88': { protocol: 'baofeng-uv5r', memSize: 0x2000, name: 'TH-UV88' },
        'thuv8000': { protocol: 'baofeng-uv5r', memSize: 0x2000, name: 'TH-UV8000' },
        'th9800': { protocol: 'btech', memSize: 0x4000, name: 'TH-9800' },
        'th7800': { protocol: 'btech', memSize: 0x4000, name: 'TH-7800' }
    },
    
    // Wouxun
    'wouxun': {
        'kguv8d': { protocol: 'wouxun-kguv', memSize: 0x8000, name: 'KG-UV8D',
            handshakeOverride: { recordStart: 0x7D }
        },
        'kguv8dplus': { protocol: 'wouxun-kguv', memSize: 0x8000, name: 'KG-UV8D Plus',
            handshakeOverride: { recordStart: 0x7A }
        },
        'kguv8e': { protocol: 'wouxun-kguv', memSize: 0x8000, name: 'KG-UV8E',
            handshakeOverride: { recordStart: 0x7B }
        },
        'kguv9dplus': { protocol: 'wouxun-kguv', memSize: 0x8000, name: 'KG-UV9D Plus',
            handshakeOverride: { recordStart: 0x7B }
        },
        'kguv920pa': { protocol: 'wouxun-kguv', memSize: 0x8000, name: 'KG-UV920P-A' },
        'kg935g': { protocol: 'wouxun-kguv', memSize: 0x8000, name: 'KG-935G',
            handshakeOverride: { recordStart: 0x7B }
        }
    },
    
    // Anytone
    'anytone': {
        'at778uv': { protocol: 'generic', memSize: 0x2000, name: 'AT-778UV' },
        'at5888uv': { protocol: 'generic', memSize: 0x4000, name: 'AT-5888UV' }
    },
    
    // Kenwood
    'kenwood': {
        'thd74': { protocol: 'generic', memSize: 0x8000, name: 'TH-D74' },
        'thd72': { protocol: 'generic', memSize: 0x4000, name: 'TH-D72' },
        'tmv71': { protocol: 'generic', memSize: 0x4000, name: 'TM-V71' },
        'tmd710': { protocol: 'generic', memSize: 0x8000, name: 'TM-D710', baudRate: 57600 },
        'tk270': { protocol: 'generic', memSize: 0x2000, name: 'TK-270' },
        'tk280': { protocol: 'generic', memSize: 0x2000, name: 'TK-280' },
        'tk760': { protocol: 'generic', memSize: 0x2000, name: 'TK-760' },
        'tk8180': { protocol: 'generic', memSize: 0x4000, name: 'TK-8180' }
    },
    
    // Yaesu
    'yaesu': {
        'ft60': { protocol: 'generic', memSize: 0x2000, name: 'FT-60R' },
        'ft70': { protocol: 'generic', memSize: 0x8000, name: 'FT-70D' },
        'ft817': { protocol: 'generic', memSize: 0x4000, name: 'FT-817' },
        'ft818': { protocol: 'generic', memSize: 0x4000, name: 'FT-818' },
        'ft857': { protocol: 'generic', memSize: 0x4000, name: 'FT-857D' },
        'ft1d': { protocol: 'generic', memSize: 0x10000, name: 'FT1D', baudRate: 38400 },
        'ft2d': { protocol: 'generic', memSize: 0x10000, name: 'FT2D', baudRate: 38400 },
        'ft4': { protocol: 'generic', memSize: 0x2000, name: 'FT-4XR' },
        'vx1': { protocol: 'generic', memSize: 0x2000, name: 'VX-1' },
        'vx2': { protocol: 'generic', memSize: 0x2000, name: 'VX-2' },
        'vx3': { protocol: 'generic', memSize: 0x2000, name: 'VX-3' },
        'vx5': { protocol: 'generic', memSize: 0x2000, name: 'VX-5' },
        'vx6': { protocol: 'generic', memSize: 0x2000, name: 'VX-6' },
        'vx7': { protocol: 'generic', memSize: 0x2000, name: 'VX-7' },
        'vx8': { protocol: 'generic', memSize: 0x10000, name: 'VX-8R/VX-8DR', baudRate: 19200 }
    },
    
    // Icom
    'icom': {
        'ic2730': { protocol: 'generic', memSize: 0x4000, name: 'IC-2730' },
        'ic2300': { protocol: 'generic', memSize: 0x2000, name: 'IC-2300H' },
        'ic2200': { protocol: 'generic', memSize: 0x2000, name: 'IC-2200H' },
        'id51': { protocol: 'generic', memSize: 0x8000, name: 'ID-51' },
        'id51plus': { protocol: 'generic', memSize: 0x8000, name: 'ID-51 Plus' },
        'id31': { protocol: 'generic', memSize: 0x4000, name: 'ID-31' },
        'id5100': { protocol: 'generic', memSize: 0x10000, name: 'ID-5100' },
        'icv80': { protocol: 'generic', memSize: 0x2000, name: 'IC-V80' },
        'icv86': { protocol: 'generic', memSize: 0x2000, name: 'IC-V86' }
    },
    
    // Generic
    'generic': {
        'generic': { protocol: 'generic', memSize: 0x2000, name: 'Generic Radio' }
    }
};

/**
 * Get radio definition by vendor and model
 */
export function getRadioDefinition(vendor, model) {
    const vendorModels = RADIO_MODELS[vendor];
    if (!vendorModels) {
        return { protocol: 'generic', memSize: 0x2000, name: 'Unknown' };
    }
    
    const modelDef = vendorModels[model];
    if (!modelDef) {
        return { protocol: 'generic', memSize: 0x2000, name: 'Unknown' };
    }
    
    return modelDef;
}

/**
 * Get protocol definition
 */
export function getProtocol(protocolName) {
    return RADIO_PROTOCOLS[protocolName] || RADIO_PROTOCOLS['generic'];
}

/**
 * Get merged protocol with model-specific overrides
 */
export function getRadioProtocol(vendor, model) {
    const modelDef = getRadioDefinition(vendor, model);
    const protocol = JSON.parse(JSON.stringify(getProtocol(modelDef.protocol)));
    
    // Apply model-specific overrides
    if (modelDef.handshakeOverride && protocol.handshake) {
        Object.assign(protocol.handshake, modelDef.handshakeOverride);
    }
    
    // Apply encryption override
    if (modelDef.encryptionOverride && protocol.encryption) {
        Object.assign(protocol.encryption, modelDef.encryptionOverride);
    }
    
    // Apply baud rate override
    if (modelDef.baudRate) {
        protocol.baudRate = modelDef.baudRate;
    }
    
    // Store model info
    protocol.modelDef = modelDef;
    
    return protocol;
}
