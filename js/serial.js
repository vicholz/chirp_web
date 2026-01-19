/**
 * CHIRP Web - Web Serial API Handler
 * Handles serial communication with radios
 */

/**
 * SerialConnection class - manages a Web Serial API connection
 */
export class SerialConnection {
    constructor() {
        this.port = null;
        this.reader = null;
        this.writer = null;
        this.readableStreamClosed = null;
        this.writableStreamClosed = null;
        this.connected = false;
        this.onReceive = null;
        this.onError = null;
        this.onDisconnect = null;
        this.baudRate = 9600;
        this.dataBits = 8;
        this.stopBits = 1;
        this.parity = 'none';
        this.flowControl = 'none';
    }

    /**
     * Check if Web Serial API is supported
     */
    static isSupported() {
        return 'serial' in navigator;
    }

    /**
     * Get list of known radio filters for the serial port picker
     */
    static getRadioFilters() {
        // Common USB-to-Serial adapters used by radios
        return [
            // Prolific
            { usbVendorId: 0x067B },
            // FTDI
            { usbVendorId: 0x0403 },
            // Silicon Labs CP210x
            { usbVendorId: 0x10C4 },
            // WCH CH340/CH341
            { usbVendorId: 0x1A86 },
            // Baofeng/etc direct USB
            { usbVendorId: 0x28E9 },
            // QYT/Radtel
            { usbVendorId: 0x1D6B }
        ];
    }

    /**
     * Request a serial port from the user
     */
    async requestPort() {
        if (!SerialConnection.isSupported()) {
            throw new Error('Web Serial API is not supported in this browser. Please use Chrome or Edge.');
        }

        try {
            // Request port with common radio USB vendor IDs
            this.port = await navigator.serial.requestPort({
                filters: SerialConnection.getRadioFilters()
            });
            return true;
        } catch (e) {
            if (e.name === 'NotFoundError') {
                // User cancelled the picker - try without filters
                try {
                    this.port = await navigator.serial.requestPort();
                    return true;
                } catch (e2) {
                    if (e2.name === 'NotFoundError') {
                        return false; // User cancelled
                    }
                    throw e2;
                }
            }
            throw e;
        }
    }

    /**
     * Open the serial connection
     */
    async open(options = {}) {
        if (!this.port) {
            throw new Error('No port selected');
        }

        const settings = {
            baudRate: options.baudRate || this.baudRate,
            dataBits: options.dataBits || this.dataBits,
            stopBits: options.stopBits || this.stopBits,
            parity: options.parity || this.parity,
            flowControl: options.flowControl || this.flowControl
        };

        await this.port.open(settings);
        this.connected = true;

        // Set up signal lines if requested
        if (options.dtr !== undefined || options.rts !== undefined) {
            await this.port.setSignals({
                dataTerminalReady: options.dtr !== false,
                requestToSend: options.rts !== false
            });
        }

        return true;
    }

    /**
     * Close the serial connection
     */
    async close() {
        if (this.reader) {
            await this.reader.cancel();
            await this.readableStreamClosed?.catch(() => {});
            this.reader = null;
        }

        if (this.writer) {
            await this.writer.close();
            await this.writableStreamClosed?.catch(() => {});
            this.writer = null;
        }

        if (this.port) {
            await this.port.close();
            this.port = null;
        }

        this.connected = false;
    }

    /**
     * Write data to the serial port
     */
    async write(data) {
        if (!this.connected || !this.port) {
            throw new Error('Not connected');
        }

        const writer = this.port.writable.getWriter();
        try {
            let dataToSend;
            if (data instanceof Uint8Array) {
                dataToSend = data;
            } else if (typeof data === 'string') {
                dataToSend = new TextEncoder().encode(data);
            } else if (Array.isArray(data)) {
                dataToSend = new Uint8Array(data);
            } else {
                throw new Error('Invalid data type');
            }
            await writer.write(dataToSend);
        } finally {
            writer.releaseLock();
        }
    }

    /**
     * Read data from the serial port
     */
    async read(length = 0, timeout = 5000) {
        if (!this.connected || !this.port) {
            throw new Error('Not connected');
        }

        const reader = this.port.readable.getReader();
        const buffer = [];
        let totalRead = 0;

        try {
            const startTime = Date.now();

            while (length === 0 || totalRead < length) {
                // Check timeout
                if (Date.now() - startTime > timeout) {
                    break;
                }

                const { value, done } = await Promise.race([
                    reader.read(),
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Timeout')), timeout - (Date.now() - startTime))
                    )
                ]).catch(e => {
                    if (e.message === 'Timeout') {
                        return { done: true };
                    }
                    throw e;
                });

                if (done) {
                    break;
                }

                if (value) {
                    buffer.push(...value);
                    totalRead += value.length;
                    
                    // If we have enough data, break
                    if (length > 0 && totalRead >= length) {
                        break;
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }

        return new Uint8Array(buffer.slice(0, length || buffer.length));
    }

    /**
     * Read until a specific byte sequence is found
     */
    async readUntil(terminator, timeout = 5000) {
        if (!this.connected || !this.port) {
            throw new Error('Not connected');
        }

        const termBytes = typeof terminator === 'string' 
            ? new TextEncoder().encode(terminator)
            : new Uint8Array(terminator);

        const reader = this.port.readable.getReader();
        const buffer = [];

        try {
            const startTime = Date.now();

            while (true) {
                if (Date.now() - startTime > timeout) {
                    throw new Error('Timeout waiting for response');
                }

                const { value, done } = await Promise.race([
                    reader.read(),
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Timeout')), timeout - (Date.now() - startTime))
                    )
                ]).catch(e => {
                    if (e.message === 'Timeout') {
                        return { done: true };
                    }
                    throw e;
                });

                if (done) {
                    break;
                }

                if (value) {
                    buffer.push(...value);
                    
                    // Check if buffer ends with terminator
                    if (buffer.length >= termBytes.length) {
                        const tail = buffer.slice(-termBytes.length);
                        if (tail.every((b, i) => b === termBytes[i])) {
                            break;
                        }
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }

        return new Uint8Array(buffer);
    }

    /**
     * Start continuous reading with a callback
     */
    async startReading(callback) {
        if (!this.connected || !this.port) {
            throw new Error('Not connected');
        }

        this.onReceive = callback;

        while (this.port.readable && this.connected) {
            this.reader = this.port.readable.getReader();
            try {
                while (true) {
                    const { value, done } = await this.reader.read();
                    if (done) {
                        break;
                    }
                    if (value && this.onReceive) {
                        this.onReceive(value);
                    }
                }
            } catch (e) {
                if (this.onError) {
                    this.onError(e);
                }
            } finally {
                this.reader.releaseLock();
                this.reader = null;
            }
        }
    }

    /**
     * Get port info
     */
    getInfo() {
        if (!this.port) {
            return null;
        }
        return this.port.getInfo();
    }

    /**
     * Set serial signals (DTR, RTS)
     */
    async setSignals(signals) {
        if (!this.connected || !this.port) {
            throw new Error('Not connected');
        }
        await this.port.setSignals(signals);
    }

    /**
     * Get serial signals (CTS, DCD, DSR, RI)
     */
    async getSignals() {
        if (!this.connected || !this.port) {
            throw new Error('Not connected');
        }
        return await this.port.getSignals();
    }
}

import { getRadioProtocol, RADIO_PROTOCOLS } from './radio-defs.js';

/**
 * RadioClone class - handles clone mode communication with radios
 * Uses protocol definitions from radio-defs.js
 */
export class RadioClone {
    constructor(connection) {
        this.connection = connection;
        this.onProgress = null;
        this.aborted = false;
        this.vendor = '';
        this.model = '';
        this.protocol = null;
    }

    /**
     * Send progress update
     */
    progress(message, percent) {
        if (this.onProgress) {
            this.onProgress({ message, percent });
        }
    }

    /**
     * Abort the current operation
     */
    abort() {
        this.aborted = true;
    }
    
    /**
     * Set the radio protocol based on vendor/model
     */
    setRadio(vendor, model) {
        this.vendor = vendor;
        this.model = model;
        this.protocol = getRadioProtocol(vendor, model);
        console.log('Using protocol:', this.protocol.name, 'for', vendor, model);
        console.log('Protocol baud rate:', this.protocol.baudRate);
        console.log('Protocol handshake type:', this.protocol.handshake?.type);
        if (this.protocol.handshake?.idents) {
            console.log('Protocol idents:', this.protocol.handshake.idents.length);
        }
    }
    
    // ==========================================
    // Encryption/Decryption Methods
    // ==========================================
    
    /**
     * UV17Pro encryption table - XOR-based decryption/encryption
     */
    static ENCRYPT_SYMBOLS = [
        [0x42, 0x48, 0x54, 0x20], // "BHT "
        [0x43, 0x4F, 0x20, 0x37], // "CO 7"
        [0x41, 0x20, 0x45, 0x53], // "A ES"
        [0x20, 0x45, 0x49, 0x59], // " EIY"
        [0x4D, 0x20, 0x50, 0x51], // "M PQ"
        [0x58, 0x4E, 0x20, 0x59], // "XN Y"
        [0x52, 0x56, 0x42, 0x20], // "RVB "
        [0x20, 0x48, 0x51, 0x50], // " HQP"
        [0x57, 0x20, 0x52, 0x43], // "W RC"
        [0x4D, 0x53, 0x20, 0x4E], // "MS N"
        [0x20, 0x53, 0x41, 0x54], // " SAT"
        [0x4B, 0x20, 0x44, 0x48], // "K DH"
        [0x5A, 0x4F, 0x20, 0x52], // "ZO R"
        [0x43, 0x20, 0x53, 0x4C], // "C SL"
        [0x36, 0x52, 0x42, 0x20], // "6RB "
        [0x20, 0x4A, 0x43, 0x47], // " JCG"
        [0x50, 0x4E, 0x20, 0x56], // "PN V"
        [0x4A, 0x20, 0x50, 0x4B], // "J PK"
        [0x45, 0x4B, 0x20, 0x4C], // "EK L"
        [0x49, 0x20, 0x4C, 0x5A]  // "I LZ"
    ];
    
    /**
     * Decrypt/encrypt data for UV17Pro-style radios
     * Used by: UV-17Pro, BF-F8HP Pro, UV-17ProGPS, etc.
     * Note: The algorithm is symmetric (XOR), so encrypt and decrypt are the same
     */
    decryptUV17Pro(buffer, symbolIndex) {
        const symbols = RadioClone.ENCRYPT_SYMBOLS[symbolIndex];
        const result = new Uint8Array(buffer.length);
        
        for (let i = 0; i < buffer.length; i++) {
            const keyByte = symbols[i % 4];
            const dataByte = buffer[i];
            
            // Only XOR if certain conditions are met (matching original CHIRP logic)
            const shouldEncrypt = (
                keyByte !== 0x20 &&           // Key byte is not space
                dataByte !== 0 &&              // Data is not 0x00
                dataByte !== 255 &&            // Data is not 0xFF
                dataByte !== keyByte &&        // Data is not same as key
                dataByte !== (keyByte ^ 255)   // Data is not inverse of key
            );
            
            if (shouldEncrypt) {
                result[i] = dataByte ^ keyByte;
            } else {
                result[i] = dataByte;
            }
        }
        
        return result;
    }
    
    /**
     * Encrypt data for UV17Pro-style radios (same as decrypt since XOR is symmetric)
     */
    encryptUV17Pro(buffer, symbolIndex) {
        return this.decryptUV17Pro(buffer, symbolIndex);
    }
    
    /**
     * Wouxun XOR chain encryption/decryption
     * Used by: KGUV8D, KGUV8E, KGUV8D Plus, KG-935G, etc.
     * @param {Uint8Array} data - Data to encrypt/decrypt
     * @param {number} valxor - Initial XOR value (0x57 for most Wouxun radios)
     * @param {boolean} decrypt - True to decrypt, false to encrypt
     */
    wouxunCrypt(data, valxor = 0x57, decrypt = true) {
        const result = new Uint8Array(data.length);
        
        if (decrypt) {
            // Decrypt: work backwards
            for (let i = data.length - 1; i > 0; i--) {
                result[i] = data[i] ^ data[i - 1];
            }
            result[0] = data[0] ^ valxor;
        } else {
            // Encrypt: work forwards
            result[0] = valxor ^ data[0];
            for (let i = 1; i < data.length; i++) {
                result[i] = result[i - 1] ^ data[i];
            }
        }
        
        return result;
    }
    
    // ==========================================
    // Checksum Methods
    // ==========================================
    
    /**
     * Simple sum checksum (mod 256)
     * Used by: Retevis RT98/RB15, Kenwood TK series, TH9000, iRadio, etc.
     */
    static checksumSum(data, startOffset = 0) {
        let cs = startOffset;
        for (const byte of data) {
            cs = (cs + byte) & 0xFF;
        }
        return cs;
    }
    
    /**
     * XOR checksum
     * Used by: Leixen radios
     */
    static checksumXor(data) {
        let cs = 0;
        for (const byte of data) {
            cs ^= byte;
        }
        return cs & 0xFF;
    }
    
    /**
     * Yaesu checksum - sum of bytes in a range stored at specific address
     * Used by: Yaesu VX, FT series
     */
    static yaesuChecksum(data, start, stop) {
        let cs = 0;
        for (let i = start; i <= stop; i++) {
            cs = (cs + data[i]) & 0xFF;
        }
        return cs;
    }
    
    /**
     * Verify checksum in received data
     * @returns {boolean} True if checksum is valid
     */
    verifyChecksum(data, checksumType, options = {}) {
        switch (checksumType) {
            case 'sum':
                const sumCs = RadioClone.checksumSum(data.slice(0, -1), options.offset || 0);
                return data[data.length - 1] === sumCs;
            
            case 'xor':
                const xorCs = RadioClone.checksumXor(data.slice(0, -1));
                return data[data.length - 1] === xorCs;
            
            case 'yaesu':
                const yaesuCs = RadioClone.yaesuChecksum(data, options.start, options.stop);
                return data[options.address] === yaesuCs;
            
            default:
                return true; // No checksum verification
        }
    }
    
    /**
     * Add checksum to data for transmission
     */
    addChecksum(data, checksumType, options = {}) {
        switch (checksumType) {
            case 'sum':
                const sumCs = RadioClone.checksumSum(data, options.offset || 0);
                return new Uint8Array([...data, sumCs]);
            
            case 'xor':
                const xorCs = RadioClone.checksumXor(data);
                return new Uint8Array([...data, xorCs]);
            
            default:
                return data;
        }
    }

    /**
     * Download from radio using configured protocol
     */
    async download(memorySize) {
        this.aborted = false;
        
        if (!this.protocol) {
            this.protocol = RADIO_PROTOCOLS['generic'];
        }
        
        const actualMemSize = this.protocol.modelDef?.memSize || memorySize;
        
        this.progress(`Starting download using ${this.protocol.name}...`, 0);
        
        // Step 1: Perform handshake if defined
        if (this.protocol.handshake) {
            await this.performHandshake();
        }
        
        // Step 2: Download memory blocks
        console.log('Starting memory block download...');
        const buffer = await this.downloadBlocks(actualMemSize);
        
        console.log(`Download complete! Total bytes: ${buffer.length}`);
        this.progress('Download complete', 100);
        return new Uint8Array(buffer);
    }
    
    /**
     * Perform handshake based on protocol definition
     */
    async performHandshake() {
        const hs = this.protocol.handshake;
        
        this.progress('Sending handshake...', 5);
        
        if (hs.type === 'magic') {
            // Get magic sequences to try
            const magicSequences = hs.magicSequences || [hs.magic];
            let handshakeSuccess = false;
            let lastError = null;
            
            for (let seqIndex = 0; seqIndex < magicSequences.length; seqIndex++) {
                const magic = magicSequences[seqIndex];
                console.log(`Trying magic sequence ${seqIndex + 1}/${magicSequences.length}:`, 
                    magic.map(b => b.toString(16).padStart(2, '0')).join(' '));
                
                try {
                    // Clear any pending data
                    try {
                        await this.connection.read(100, 100);
                    } catch (e) {
                        // Ignore timeout
                    }
                    
                    // Send magic bytes one at a time with delay
                    for (const byte of magic) {
                        await this.connection.write(new Uint8Array([byte]));
                        await this.delay(hs.magicDelay || 10);
                    }
                    
                    // Wait for ACK with longer timeout
                    console.log('Waiting for ACK...');
                    const ack = await this.connection.read(1, 3000);
                    console.log('Received:', ack.length > 0 ? `0x${ack[0].toString(16)}` : 'nothing');
                    
                    if (ack.length > 0 && ack[0] === hs.expectAck) {
                        console.log('Handshake successful with sequence', seqIndex + 1);
                        handshakeSuccess = true;
                        break;
                    } else {
                        lastError = `Unexpected response: ${ack.length > 0 ? '0x' + ack[0].toString(16) : 'no data'}`;
                    }
                } catch (e) {
                    console.log('Handshake attempt failed:', e.message);
                    lastError = e.message;
                    
                    // Wait before trying next sequence
                    await this.delay(500);
                }
            }
            
            if (!handshakeSuccess) {
                throw new Error('Radio did not acknowledge handshake. Make sure the radio is:\n' +
                    '1. Connected with a proper programming cable (not a charging cable)\n' +
                    '2. Powered ON\n' +
                    '3. On the frequency display (not in menu)\n' +
                    '4. Try turning the radio off and on, then try again immediately\n' +
                    '5. Some radios need you to hold a key while powering on\n\n' +
                    `Last error: ${lastError || 'No response'}`);
            }
            
            this.progress('Handshake acknowledged...', 8);
            
            // Send identification request if defined
            if (hs.identCmd) {
                await this.connection.write(new Uint8Array(hs.identCmd));
                
                // Read identification byte by byte until we get 0xDD or enough bytes
                const identResponse = [];
                const maxIdent = hs.identLength || 12;
                
                for (let i = 0; i < maxIdent; i++) {
                    try {
                        const byte = await this.connection.read(1, 1000);
                        if (byte.length > 0) {
                            identResponse.push(byte[0]);
                            // Stop at 0xDD (end marker for UV-5R family)
                            if (byte[0] === 0xDD) {
                                break;
                            }
                        }
                    } catch (e) {
                        break;
                    }
                }
                
                if (identResponse.length < 8) {
                    throw new Error('Failed to get radio identification (got ' + identResponse.length + ' bytes)');
                }
                
                console.log('Radio identification:', 
                    identResponse.map(b => b.toString(16).padStart(2, '0')).join(' '));
                
                // Store identification for later use
                this.identification = new Uint8Array(identResponse);
                
                // Send ACK after identification (required for UV-5R)
                if (hs.ackAfterIdent !== false) {
                    await this.connection.write(new Uint8Array([0x06]));
                    const ackResponse = await this.connection.read(1, 1000);
                    console.log('Ident ACK response:', ackResponse.length > 0 ? `0x${ackResponse[0].toString(16)}` : 'none');
                }
            }
            
        } else if (hs.type === 'program') {
            // Send pre-command if defined
            if (hs.preCmd) {
                await this.connection.write(new Uint8Array(hs.preCmd));
                await this.delay(hs.preDelay || 100);
            }
            
            // Send program command
            await this.connection.write(new Uint8Array(hs.programCmd));
            
            // Wait for ACK (with retries if specified)
            let ackReceived = false;
            const maxRetries = hs.maxAckRetries || 1;
            
            for (let i = 0; i < maxRetries && !ackReceived; i++) {
                const ack = await this.connection.read(1, 500);
                if (ack.length > 0 && ack[0] === hs.expectAck) {
                    ackReceived = true;
                }
            }
            
            if (!ackReceived) {
                throw new Error('Radio did not acknowledge program mode command');
            }
            
            this.progress('Program mode entered...', 8);
            
            // Send identification request
            if (hs.identCmd) {
                await this.connection.write(new Uint8Array(hs.identCmd));
                
                const identResponse = await this.connection.read(hs.identLength || 8, 2000);
                console.log('Radio identification:', 
                    Array.from(identResponse).map(b => b.toString(16).padStart(2, '0')).join(' '));
                
                // Verify identification prefix if specified
                if (hs.identPrefix) {
                    const prefix = identResponse.slice(0, hs.identPrefix.length);
                    const matches = hs.identPrefix.every((b, i) => prefix[i] === b);
                    if (!matches) {
                        console.warn('Identification prefix mismatch');
                    }
                }
                
                // Send ACK after ident if required
                if (hs.ackAfterIdent) {
                    await this.connection.write(new Uint8Array([0x06]));
                    await this.connection.read(1, 500); // Read response ACK
                }
                
                this.identification = identResponse;
            }
            
        } else if (hs.type === 'uv17pro') {
            // UV17Pro / BF-F8HP Pro style handshake
            // Send ident magic string and check for fingerprint response
            let identSuccess = false;
            let lastError = null;
            
            for (const ident of hs.idents) {
                const identStr = ident.map(b => String.fromCharCode(b)).join('');
                console.log('Sending UV17Pro ident:', identStr);
                console.log('Ident bytes:', ident.map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
                
                try {
                    // Clear buffer - read any junk with short timeout
                    try {
                        const junk = await this.connection.read(256, 50);
                        if (junk.length > 0) {
                            console.log('Cleared junk:', junk.length, 'bytes');
                        }
                    } catch (e) { /* ignore timeout */ }
                    
                    // Send ident string all at once
                    await this.connection.write(new Uint8Array(ident));
                    console.log('Ident sent, waiting for response...');
                    
                    // Wait a bit for radio to process
                    await this.delay(200);
                    
                    // Try to read response - attempt multiple times with short timeouts
                    let response = new Uint8Array(0);
                    for (let attempt = 0; attempt < 10 && response.length === 0; attempt++) {
                        try {
                            const data = await this.connection.read(1, 500);
                            if (data.length > 0) {
                                response = data;
                                console.log(`Response received on attempt ${attempt + 1}`);
                            }
                        } catch (e) {
                            // Timeout, try again
                        }
                    }
                    
                    console.log('Fingerprint response (hex):', 
                        Array.from(response).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ') || 'empty');
                    console.log('Fingerprint response (ascii):', 
                        Array.from(response).map(b => b >= 32 && b < 127 ? String.fromCharCode(b) : '.').join('') || 'empty');
                    console.log('Expected fingerprint:', 
                        hs.fingerprint.map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
                    
                    if (response.length === 0) {
                        lastError = 'No response from radio after sending ident';
                        continue;
                    }
                    
                    // Check if response starts with fingerprint (startswith check like original CHIRP)
                    if (response.length >= hs.fingerprint.length &&
                        hs.fingerprint.every((b, i) => response[i] === b)) {
                        console.log('Ident successful');
                        identSuccess = true;
                        break;
                    } else {
                        lastError = `Fingerprint mismatch - got ${Array.from(response).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ')}, expected ${hs.fingerprint.map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ')}`;
                    }
                } catch (e) {
                    console.log('Ident attempt failed:', e.message);
                    lastError = e.message;
                    await this.delay(500);
                }
            }
            
            if (!identSuccess) {
                throw new Error('Radio did not respond to identification. Make sure:\n' +
                    '1. You selected the correct radio model (BF-F8HP Pro uses different protocol)\n' +
                    '2. Radio is connected with proper programming cable\n' +
                    '3. Radio is powered ON\n' +
                    '4. Try turning radio off and on, then connect immediately\n\n' +
                    `Last error: ${lastError || 'No response'}`);
            }
            
            this.progress('Ident acknowledged, sending magic commands...', 7);
            
            // Send additional magic commands
            if (hs.magics) {
                for (let i = 0; i < hs.magics.length; i++) {
                    const magic = hs.magics[i];
                    console.log(`Sending magic command ${i + 1}/${hs.magics.length}:`,
                        magic.cmd.map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
                    
                    await this.connection.write(new Uint8Array(magic.cmd));
                    
                    if (magic.responseLen > 0) {
                        const response = await this.connection.read(magic.responseLen, 2000);
                        console.log('Magic response:', 
                            Array.from(response).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
                    }
                    
                    await this.delay(50);
                }
            }
            
            this.progress('Magic commands complete...', 9);
        }
        
        this.progress('Handshake complete...', 10);
    }
    
    /**
     * Download memory blocks based on protocol definition
     */
    async downloadBlocks(memorySize) {
        const buffer = [];
        const read = this.protocol.read;
        const blockSize = read.blockSize || 64;
        const layout = this.protocol.memoryLayout || { mainStart: 0, mainEnd: memorySize };
        
        // Add header/identification if present
        if (this.identification && layout.headerSize) {
            buffer.push(...this.identification.slice(0, layout.headerSize));
        } else if (this.identification) {
            buffer.push(...this.identification);
        }
        
        // Check if we have multiple regions (UV17Pro style)
        if (layout.regions && Array.isArray(layout.regions)) {
            const totalSize = layout.totalSize || memorySize;
            let bytesRead = 0;
            let isFirst = true;
            
            console.log('Multi-region download mode');
            console.log('Block size:', blockSize);
            console.log('Total regions:', layout.regions.length);
            console.log('Total expected size:', totalSize);
            
            for (const region of layout.regions) {
                if (this.aborted) {
                    console.log('Download aborted');
                    break;
                }
                
                console.log(`\nStarting region 0x${region.start.toString(16)} - 0x${(region.start + region.size).toString(16)} (${region.size} bytes)`);
                
                let blocksInRegion = 0;
                for (let offset = region.start; offset < region.start + region.size && !this.aborted; offset += blockSize) {
                    const readSize = Math.min(blockSize, region.start + region.size - offset);
                    
                    if (blocksInRegion === 0) {
                        console.log(`  Reading first block at 0x${offset.toString(16)}, size ${readSize}...`);
                    }
                    
                    try {
                        const chunk = await this.readBlock(offset, readSize, isFirst);
                        buffer.push(...chunk);
                        bytesRead += readSize;
                        blocksInRegion++;
                        isFirst = false;
                    } catch (e) {
                        console.error(`  Block read failed at 0x${offset.toString(16)}:`, e.message);
                        throw e;
                    }
                    
                    // Log progress every 1KB
                    if (bytesRead % 1024 === 0) {
                        console.log(`  Progress: ${bytesRead} bytes (${blocksInRegion} blocks in this region)`);
                    }
                    
                    const percent = 10 + Math.floor((bytesRead / totalSize) * 85);
                    this.progress(`Downloading... ${Math.floor((bytesRead / totalSize) * 100)}%`, percent);
                }
                
                console.log(`  Region complete: ${blocksInRegion} blocks, total ${bytesRead} bytes`);
            }
            
            return buffer;
        }
        
        // Standard single-region layout
        // Read main memory region
        const mainStart = layout.mainStart || 0;
        const mainEnd = Math.min(layout.mainEnd || memorySize, memorySize);
        
        let isFirst = true;
        for (let offset = mainStart; offset < mainEnd && !this.aborted; offset += blockSize) {
            const chunk = await this.readBlock(offset, blockSize, isFirst);
            buffer.push(...chunk);
            isFirst = false;
            
            const percent = 10 + Math.floor(((offset - mainStart) / (mainEnd - mainStart)) * 80);
            this.progress(`Downloading... ${Math.floor(((offset - mainStart) / (mainEnd - mainStart)) * 100)}%`, percent);
        }
        
        // Read auxiliary region if defined
        if (layout.auxStart && layout.auxEnd && !this.aborted) {
            for (let offset = layout.auxStart; offset < layout.auxEnd && !this.aborted; offset += blockSize) {
                try {
                    const chunk = await this.readBlock(offset, blockSize, false);
                    buffer.push(...chunk);
                } catch (e) {
                    console.log('Auxiliary block read failed at', offset.toString(16));
                    break;
                }
            }
        }
        
        return buffer;
    }
    
    /**
     * Read a single block using protocol definition
     */
    async readBlock(address, size, isFirst) {
        const read = this.protocol.read;
        
        // Build read command: cmd + address (2 bytes) + size (1 byte)
        const cmd = new Uint8Array([
            read.cmd,
            (address >> 8) & 0xFF,
            address & 0xFF,
            size
        ]);
        await this.connection.write(cmd);
        
        // For UV17Pro-style protocols, read header + data together
        if (read.skipHeaderValidation) {
            // Read 4-byte header + data in one go
            let response;
            try {
                response = await this.connection.read(size + 4, 3000);
            } catch (e) {
                console.error(`Read error at address 0x${address.toString(16)}:`, e.message);
                throw e;
            }
            
            if (response.length !== size + 4) {
                console.error(`Short read at 0x${address.toString(16)}: got ${response.length}, expected ${size + 4}`);
                throw new Error(`Short read at address 0x${address.toString(16)}: got ${response.length}, expected ${size + 4}`);
            }
            
            // Strip the 4-byte header
            let chunk = response.slice(4);
            
            // Decrypt if encryption is enabled
            if (this.protocol.encryption) {
                chunk = this.decryptUV17Pro(chunk, this.protocol.encryption.symbolIndex);
            }
            
            // Send ACK if required
            if (read.ackAfterBlock) {
                await this.connection.write(new Uint8Array([read.ackByte || 0x06]));
                await this.delay(read.delayAfterAck || 50);
            }
            
            return chunk;
        }
        
        // Standard protocol: Read response header if response command is defined
        if (read.responseCmd !== undefined) {
            const header = await this.connection.read(4, 2000);
            if (header.length !== 4) {
                throw new Error(`Invalid response header at address 0x${address.toString(16)}`);
            }
            
            if (header[0] !== read.responseCmd) {
                throw new Error(`Unexpected response command 0x${header[0].toString(16)} at address 0x${address.toString(16)}`);
            }
            
            const respAddr = (header[1] << 8) | header[2];
            const respSize = header[3];
            
            if (respAddr !== address || respSize !== size) {
                throw new Error(`Address/size mismatch at 0x${address.toString(16)}`);
            }
        }
        
        // Read data chunk
        const chunk = await this.connection.read(size, 2000);
        if (chunk.length !== size) {
            throw new Error(`Short read at address 0x${address.toString(16)}: got ${chunk.length}, expected ${size}`);
        }
        
        // Send ACK if required
        if (read.ackAfterBlock) {
            await this.connection.write(new Uint8Array([read.ackByte || 0x06]));
            await this.delay(read.delayAfterAck || 50);
        }
        
        return chunk;
    }
    
    /**
     * Simple delay helper
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Generic upload - writes raw memory to radio
     * This is a placeholder - real implementations would be radio-specific
     */
    /**
     * Upload to radio using configured protocol
     */
    async upload(data) {
        this.aborted = false;
        
        if (!this.protocol) {
            this.protocol = RADIO_PROTOCOLS['generic'];
        }
        
        this.progress(`Starting upload using ${this.protocol.name}...`, 0);
        
        // Step 1: Perform handshake if defined
        if (this.protocol.handshake) {
            await this.performHandshake();
        }
        
        // Step 2: Upload memory blocks
        await this.uploadBlocks(data);
        
        this.progress('Upload complete', 100);
    }
    
    /**
     * Upload memory blocks based on protocol definition
     */
    async uploadBlocks(data) {
        const write = this.protocol.write;
        const blockSize = write.blockSize || 16;
        const layout = this.protocol.memoryLayout || { mainStart: 0, mainEnd: data.length };
        
        // Check if we have multiple regions (UV17Pro style)
        if (layout.regions && Array.isArray(layout.regions)) {
            const totalSize = layout.totalSize || data.length;
            let bytesWritten = 0;
            let dataOffset = 0;  // Offset in our data buffer
            
            console.log('Multi-region upload mode');
            console.log('Block size:', blockSize);
            console.log('Total regions:', layout.regions.length);
            
            for (const region of layout.regions) {
                if (this.aborted) break;
                
                console.log(`\nUploading region 0x${region.start.toString(16)} - 0x${(region.start + region.size).toString(16)}`);
                
                for (let memAddr = region.start; memAddr < region.start + region.size && !this.aborted; memAddr += blockSize) {
                    const writeSize = Math.min(blockSize, region.start + region.size - memAddr);
                    
                    // Get data from our buffer at the current data offset
                    let chunk = data.slice(dataOffset, dataOffset + writeSize);
                    
                    // Encrypt if needed
                    if (this.protocol.encryption) {
                        chunk = this.encryptUV17Pro(chunk, this.protocol.encryption.symbolIndex);
                    }
                    
                    try {
                        await this.writeBlock(memAddr, chunk);
                        bytesWritten += writeSize;
                        dataOffset += writeSize;
                    } catch (e) {
                        console.error(`Write failed at 0x${memAddr.toString(16)}:`, e.message);
                        throw e;
                    }
                    
                    // Log progress every 1KB
                    if (bytesWritten % 1024 === 0) {
                        console.log(`  Progress: ${bytesWritten} bytes written`);
                    }
                    
                    const percent = 10 + Math.floor((bytesWritten / totalSize) * 85);
                    this.progress(`Uploading... ${Math.floor((bytesWritten / totalSize) * 100)}%`, percent);
                }
            }
            
            console.log(`Upload complete: ${bytesWritten} bytes written`);
            return;
        }
        
        // Standard single-region layout
        const headerSize = layout.headerSize || 8;
        const mainStart = Math.max(layout.mainStart || 0, headerSize);
        const mainEnd = Math.min(layout.mainEnd || data.length, data.length);
        
        for (let offset = mainStart; offset < mainEnd && !this.aborted; offset += blockSize) {
            const chunk = data.slice(offset, offset + blockSize);
            
            if (chunk.length === 0) break;
            
            await this.writeBlock(offset, chunk);
            
            const percent = 10 + Math.floor(((offset - mainStart) / (mainEnd - mainStart)) * 85);
            this.progress(`Uploading... ${Math.floor(((offset - mainStart) / (mainEnd - mainStart)) * 100)}%`, percent);
        }
    }
    
    /**
     * Write a single block using protocol definition
     */
    async writeBlock(address, data) {
        const write = this.protocol.write;
        
        // Build write command: cmd + address (2 bytes) + size (1 byte) + data
        const cmd = new Uint8Array([
            write.cmd,
            (address >> 8) & 0xFF,
            address & 0xFF,
            data.length,
            ...data
        ]);
        
        await this.connection.write(cmd);
        
        // Wait for ACK if expected
        if (write.expectAck !== undefined) {
            let ack;
            try {
                ack = await this.connection.read(1, 2000);
            } catch (e) {
                console.error(`Timeout waiting for ACK at address 0x${address.toString(16)}`);
                throw new Error(`Write timeout at address 0x${address.toString(16)}`);
            }
            
            if (ack.length === 0) {
                console.error(`No ACK received at address 0x${address.toString(16)}`);
                throw new Error(`No ACK at address 0x${address.toString(16)}`);
            }
            
            if (ack[0] !== write.expectAck) {
                console.error(`Bad ACK at address 0x${address.toString(16)}: got 0x${ack[0].toString(16)}, expected 0x${write.expectAck.toString(16)}`);
                throw new Error(`Write failed at address 0x${address.toString(16)} (bad ACK: 0x${ack[0].toString(16)})`);
            }
        }
        
        await this.delay(write.delayAfterAck || 50);
    }
}

/**
 * Get list of available serial ports (if previously granted)
 */
export async function getAvailablePorts() {
    if (!SerialConnection.isSupported()) {
        return [];
    }
    return await navigator.serial.getPorts();
}

/**
 * Listen for serial port connect/disconnect events
 */
export function onPortChange(callback) {
    if (!SerialConnection.isSupported()) {
        return;
    }
    
    navigator.serial.addEventListener('connect', (e) => {
        callback('connect', e.target);
    });
    
    navigator.serial.addEventListener('disconnect', (e) => {
        callback('disconnect', e.target);
    });
}
