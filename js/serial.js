/**
 * ============================================================================
 * CHIRP Web - Web Serial API Handler
 * ============================================================================
 * 
 * OVERVIEW:
 * This module provides serial communication capabilities for programming
 * amateur radios directly from the web browser. It uses the Web Serial API,
 * which is only available in Chromium-based browsers (Chrome, Edge).
 * 
 * KEY CLASSES:
 *   SerialConnection - Low-level serial port management
 *   RadioClone       - High-level radio communication protocol handler
 * 
 * SERIAL COMMUNICATION BASICS:
 * Radios communicate over serial connections (typically USB-to-serial adapters)
 * with parameters:
 *   - Baud Rate  : Speed in bits/second (9600-115200 common)
 *   - Data Bits  : Bits per character (usually 8)
 *   - Stop Bits  : Frame termination (usually 1)
 *   - Parity     : Error checking (usually none)
 *   - Flow Control: Hardware/software flow control (usually none)
 * 
 * RADIO CLONE PROTOCOLS:
 * Each radio family uses a specific communication protocol:
 *   1. HANDSHAKE  : Establish communication (magic bytes, identification)
 *   2. READ       : Download memory in blocks (address, size, data)
 *   3. WRITE      : Upload memory in blocks (address, size, data, ACK)
 *   4. ENCRYPTION : Some radios encrypt memory data (XOR-based)
 * 
 * COMMON USB-SERIAL CHIP VENDORS:
 *   - Prolific (PL2303)        : 0x067B - Older programming cables
 *   - FTDI (FT232)             : 0x0403 - Quality cables
 *   - Silicon Labs (CP210x)    : 0x10C4 - Common in modern cables
 *   - WCH (CH340/CH341)        : 0x1A86 - Budget cables
 *   - Baofeng Direct USB       : 0x28E9 - Integrated USB radios
 * 
 * ============================================================================
 */

/**
 * ============================================================================
 * SerialConnection Class
 * ============================================================================
 * Manages a Web Serial API connection to a USB-serial adapter.
 * Provides low-level read/write operations with timeout support.
 * 
 * USAGE:
 *   const conn = new SerialConnection();
 *   await conn.requestPort();    // User selects port
 *   await conn.open({ baudRate: 9600 });
 *   await conn.write([0x50, 0x52, 0x4F, 0x47]);  // Write bytes
 *   const response = await conn.read(4, 1000);   // Read 4 bytes, 1s timeout
 *   await conn.close();
 * 
 * SERIAL SIGNALS:
 * In addition to data, serial ports have control signals:
 *   - DTR (Data Terminal Ready) : Indicates computer is ready
 *   - RTS (Request To Send)     : Flow control / wake-up signal
 *   - CTS (Clear To Send)       : Device is ready (input)
 *   - DSR (Data Set Ready)      : Device is present (input)
 * 
 * Many programming cables require DTR/RTS to be set to power the radio's
 * programming interface or to wake it from standby.
 */
export class SerialConnection {
    /**
     * Create a new SerialConnection instance.
     * Does not connect - call requestPort() and open() to connect.
     */
    constructor() {
        // Web Serial API port object
        this.port = null;
        
        // Stream reader/writer for async I/O
        this.reader = null;
        this.writer = null;
        
        // Promises for stream closure
        this.readableStreamClosed = null;
        this.writableStreamClosed = null;
        
        // Connection state
        this.connected = false;
        
        // Event callbacks
        this.onReceive = null;     // Called when data received (continuous mode)
        this.onError = null;       // Called on error
        this.onDisconnect = null;  // Called on disconnect
        
        // Default serial parameters (common for amateur radios)
        this.baudRate = 9600;
        this.dataBits = 8;
        this.stopBits = 1;
        this.parity = 'none';
        this.flowControl = 'none';
    }

    /**
     * Check if Web Serial API is supported in this browser.
     * 
     * Web Serial API Requirements:
     *   - Chrome 89+ or Edge 89+ (Chromium-based)
     *   - Secure context (HTTPS or localhost)
     *   - User gesture required for requestPort()
     * 
     * @returns {boolean} True if Web Serial API is available
     */
    static isSupported() {
        return 'serial' in navigator;
    }

    /**
     * Get USB vendor ID filters for known radio programming cables.
     * 
     * When requesting a serial port, these filters help the browser
     * show only relevant devices in the port picker dialog.
     * 
     * Common USB-to-Serial Chip Vendors:
     *   0x067B - Prolific PL2303 (older cables, sometimes problematic drivers)
     *   0x0403 - FTDI FT232 (high quality, reliable)
     *   0x10C4 - Silicon Labs CP210x (common in modern cables)
     *   0x1A86 - WCH CH340/CH341 (budget cables, may need drivers)
     *   0x28E9 - Baofeng/QYT direct USB (built-in USB in some radios)
     *   0x1D6B - QYT/Radtel (some newer radios)
     * 
     * @returns {Array} Array of USB vendor ID filter objects
     */
    static getRadioFilters() {
        return [
            { usbVendorId: 0x067B },  // Prolific PL2303
            { usbVendorId: 0x0403 },  // FTDI FT232
            { usbVendorId: 0x10C4 },  // Silicon Labs CP210x
            { usbVendorId: 0x1A86 },  // WCH CH340/CH341
            { usbVendorId: 0x28E9 },  // Baofeng direct USB
            { usbVendorId: 0x1D6B }   // QYT/Radtel
        ];
    }

    /**
     * Request user to select a serial port.
     * 
     * This triggers the browser's port picker dialog.
     * The user must grant permission to access the selected port.
     * 
     * SECURITY:
     * Web Serial API requires:
     *   1. Secure context (HTTPS or localhost)
     *   2. User gesture (button click, etc.)
     *   3. Explicit user permission via port picker
     * 
     * @returns {Promise<boolean>} True if port selected, false if cancelled
     * @throws {Error} If Web Serial API not supported or permission denied
     */
    async requestPort() {
        if (!SerialConnection.isSupported()) {
            throw new Error('Web Serial API is not supported in this browser. Please use Chrome or Edge.');
        }

        try {
            // First attempt: Show only known radio cable vendors
            this.port = await navigator.serial.requestPort({
                filters: SerialConnection.getRadioFilters()
            });
            return true;
        } catch (e) {
            if (e.name === 'NotFoundError') {
                // User cancelled, or no matching devices found
                // Try again without filters to show all serial ports
                try {
                    this.port = await navigator.serial.requestPort();
                    return true;
                } catch (e2) {
                    if (e2.name === 'NotFoundError') {
                        return false; // User cancelled port picker
                    }
                    throw e2;
                }
            }
            throw e;
        }
    }

    /**
     * Open the serial connection with specified parameters.
     * 
     * SERIAL PARAMETERS:
     *   baudRate    : Bits per second (9600, 19200, 38400, 57600, 115200)
     *   dataBits    : Bits per character (7, 8)
     *   stopBits    : Stop bits (1, 2)
     *   parity      : Error checking ('none', 'even', 'odd')
     *   flowControl : Flow control ('none', 'hardware')
     *   dtr         : Data Terminal Ready signal (true/false)
     *   rts         : Request To Send signal (true/false)
     * 
     * Most amateur radios use: 9600 baud, 8 data bits, 1 stop bit, no parity
     * Some newer radios (UV-17Pro) use 115200 baud.
     * 
     * @param {Object} options - Serial port options
     * @returns {Promise<boolean>} True on success
     * @throws {Error} If port not selected or open fails
     */
    async open(options = {}) {
        if (!this.port) {
            throw new Error('No port selected');
        }

        // Merge options with defaults
        const settings = {
            baudRate: options.baudRate || this.baudRate,
            dataBits: options.dataBits || this.dataBits,
            stopBits: options.stopBits || this.stopBits,
            parity: options.parity || this.parity,
            flowControl: options.flowControl || this.flowControl
        };

        // Open the port with specified settings
        await this.port.open(settings);
        this.connected = true;

        // Set DTR/RTS signals if requested
        // Many programming cables require these to be set
        // DTR often provides power to the programming interface
        // RTS may be used to wake the radio or enter programming mode
        if (options.dtr !== undefined || options.rts !== undefined) {
            await this.port.setSignals({
                dataTerminalReady: options.dtr !== false,
                requestToSend: options.rts !== false
            });
        }

        return true;
    }

    /**
     * Close the serial connection.
     * 
     * This gracefully shuts down:
     *   1. Cancel any pending read operations
     *   2. Close the write stream
     *   3. Close the port itself
     * 
     * Always call this when done to release the port for other applications.
     */
    async close() {
        // Cancel any pending read
        if (this.reader) {
            await this.reader.cancel();
            await this.readableStreamClosed?.catch(() => {});
            this.reader = null;
        }

        // Close writer
        if (this.writer) {
            await this.writer.close();
            await this.writableStreamClosed?.catch(() => {});
            this.writer = null;
        }

        // Close port
        if (this.port) {
            await this.port.close();
            this.port = null;
        }

        this.connected = false;
    }

    /**
     * Write data to the serial port.
     * 
     * Accepts multiple data formats:
     *   - Uint8Array : Binary data (preferred)
     *   - Array      : Array of byte values [0x50, 0x52, 0x4F, 0x47]
     *   - String     : ASCII text (converted to bytes)
     * 
     * Data is sent immediately without buffering.
     * 
     * @param {Uint8Array|Array|string} data - Data to write
     * @throws {Error} If not connected or invalid data type
     */
    async write(data) {
        if (!this.connected || !this.port) {
            throw new Error('Not connected');
        }

        // Get a writer for this write operation
        const writer = this.port.writable.getWriter();
        try {
            // Convert input to Uint8Array
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
            
            // Write data to the port
            await writer.write(dataToSend);
        } finally {
            // Always release the writer lock
            writer.releaseLock();
        }
    }

    /**
     * Read a specific number of bytes from the serial port.
     * 
     * TIMEOUT BEHAVIOR:
     * The read will return when either:
     *   1. The requested number of bytes have been received
     *   2. The timeout expires
     *   3. The port is closed
     * 
     * If timeout expires before all bytes are received, returns
     * whatever bytes were received (may be less than requested).
     * 
     * @param {number} length - Number of bytes to read (0 = read until timeout)
     * @param {number} timeout - Timeout in milliseconds (default 5000)
     * @returns {Promise<Uint8Array>} Received data
     * @throws {Error} If not connected
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

            // Read loop - continue until we have enough data or timeout
            while (length === 0 || totalRead < length) {
                // Check if we've exceeded the timeout
                if (Date.now() - startTime > timeout) {
                    break;
                }

                // Race between reading data and timeout
                const { value, done } = await Promise.race([
                    reader.read(),
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Timeout')), timeout - (Date.now() - startTime))
                    )
                ]).catch(e => {
                    if (e.message === 'Timeout') {
                        return { done: true };  // Timeout - stop reading
                    }
                    throw e;
                });

                if (done) {
                    break;  // Stream ended or timeout
                }

                if (value) {
                    // Append received bytes to buffer
                    buffer.push(...value);
                    totalRead += value.length;
                    
                    // If we have enough data, stop reading
                    if (length > 0 && totalRead >= length) {
                        break;
                    }
                }
            }
        } finally {
            // Always release the reader lock
            reader.releaseLock();
        }

        // Return only the requested number of bytes
        return new Uint8Array(buffer.slice(0, length || buffer.length));
    }

    /**
     * Read until a specific byte sequence is found.
     * 
     * Useful for protocols where responses end with a known terminator
     * (e.g., 0xDD for UV-5R identification response).
     * 
     * @param {Uint8Array|Array|string} terminator - Byte sequence to find
     * @param {number} timeout - Timeout in milliseconds
     * @returns {Promise<Uint8Array>} All data including terminator
     * @throws {Error} If timeout expires before terminator found
     */
    async readUntil(terminator, timeout = 5000) {
        if (!this.connected || !this.port) {
            throw new Error('Not connected');
        }

        // Convert terminator to Uint8Array
        const termBytes = typeof terminator === 'string' 
            ? new TextEncoder().encode(terminator)
            : new Uint8Array(terminator);

        const reader = this.port.readable.getReader();
        const buffer = [];

        try {
            const startTime = Date.now();

            while (true) {
                // Check timeout
                if (Date.now() - startTime > timeout) {
                    throw new Error('Timeout waiting for response');
                }

                // Read next chunk with remaining timeout
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
                    
                    // Check if buffer ends with terminator sequence
                    if (buffer.length >= termBytes.length) {
                        const tail = buffer.slice(-termBytes.length);
                        const match = tail.every((b, i) => b === termBytes[i]);
                        if (match) {
                            break;  // Found terminator
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
     * Start continuous reading with a callback.
     * 
     * Used for real-time data monitoring or protocols that
     * require asynchronous data handling.
     * 
     * The callback is invoked for each chunk of data received.
     * Reading continues until the port is closed.
     * 
     * @param {Function} callback - Called with (Uint8Array) for each chunk
     */
    async startReading(callback) {
        if (!this.connected || !this.port) {
            throw new Error('Not connected');
        }

        this.onReceive = callback;

        // Continuous read loop
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
     * Get information about the connected port.
     * 
     * Returns an object with USB vendor and product IDs if available.
     * 
     * @returns {Object|null} Port info or null if not connected
     */
    getInfo() {
        if (!this.port) {
            return null;
        }
        return this.port.getInfo();
    }

    /**
     * Set serial control signals (DTR, RTS).
     * 
     * DTR (Data Terminal Ready):
     *   - Indicates the computer is ready to communicate
     *   - Often provides power to programming interface circuits
     *   - May trigger radio to enter programming mode
     * 
     * RTS (Request To Send):
     *   - Traditional flow control signal
     *   - May wake radio from standby
     *   - Sometimes used as secondary power line
     * 
     * @param {Object} signals - { dataTerminalReady: bool, requestToSend: bool }
     */
    async setSignals(signals) {
        if (!this.connected || !this.port) {
            throw new Error('Not connected');
        }
        await this.port.setSignals(signals);
    }

    /**
     * Get serial input signals (CTS, DCD, DSR, RI).
     * 
     * CTS (Clear To Send)  : Device is ready to receive
     * DCD (Data Carrier Detect): Carrier signal detected
     * DSR (Data Set Ready) : Device is powered and ready
     * RI  (Ring Indicator) : Incoming call (modem legacy)
     * 
     * @returns {Object} Signal states
     */
    async getSignals() {
        if (!this.connected || !this.port) {
            throw new Error('Not connected');
        }
        return await this.port.getSignals();
    }
}

// Import radio protocol definitions
import { getRadioProtocol, RADIO_PROTOCOLS } from './radio-defs.js';

/**
 * ============================================================================
 * RadioClone Class
 * ============================================================================
 * High-level radio communication handler.
 * 
 * OVERVIEW:
 * This class implements the "clone" protocols used by amateur radios to
 * upload and download memory contents. It handles:
 *   - Protocol selection based on radio vendor/model
 *   - Handshake/identification sequences
 *   - Memory block reading and writing
 *   - Data encryption/decryption (for radios that use it)
 *   - Checksum calculation and verification
 * 
 * CLONE PROTOCOL PHASES:
 * 
 * 1. HANDSHAKE PHASE
 *    Establishes communication with the radio:
 *    a) Send "magic bytes" - vendor-specific identification sequence
 *    b) Wait for ACK (0x06 typically)
 *    c) Send identification request
 *    d) Receive radio model/version info
 * 
 * 2. DOWNLOAD PHASE (Radio -> Computer)
 *    Read memory in blocks:
 *    a) Send read command with address and size
 *    b) Receive data block from radio
 *    c) Send ACK after each block
 *    d) Decrypt data if necessary
 *    e) Repeat until all memory read
 * 
 * 3. UPLOAD PHASE (Computer -> Radio)
 *    Write memory in blocks:
 *    a) Encrypt data if necessary
 *    b) Send write command with address, size, and data
 *    c) Wait for ACK from radio
 *    d) Repeat until all memory written
 * 
 * COMMON PROTOCOL COMMANDS:
 *   0x02 : Identification request
 *   0x06 : ACK (acknowledgment)
 *   0x52 : Read ('R')
 *   0x53 : Read for some radios ('S')
 *   0x57 : Write ('W')
 *   0x58 : Read response / Write for some radios ('X')
 * 
 * MEMORY BLOCK FORMAT:
 * Most radios use this block format for read/write:
 *   [CMD][ADDR_HI][ADDR_LO][SIZE][DATA...][CHECKSUM?]
 * 
 * USAGE:
 *   const clone = new RadioClone(serialConnection);
 *   clone.setRadio('baofeng', 'uv5r');
 *   clone.onProgress = (p) => console.log(p.message, p.percent);
 *   const data = await clone.download(8192);
 *   // ... modify data ...
 *   await clone.upload(data);
 */
export class RadioClone {
    /**
     * Create a RadioClone handler for a serial connection.
     * 
     * @param {SerialConnection} connection - Open serial connection
     */
    constructor(connection) {
        this.connection = connection;
        this.onProgress = null;    // Progress callback: ({ message, percent })
        this.aborted = false;      // Set true to abort current operation
        this.vendor = '';          // Radio vendor name
        this.model = '';           // Radio model name
        this.protocol = null;      // Protocol definition from radio-defs.js
    }

    /**
     * Send progress update to callback.
     * 
     * @param {string} message - Status message
     * @param {number} percent - Progress percentage (0-100)
     */
    progress(message, percent) {
        if (this.onProgress) {
            this.onProgress({ message, percent });
        }
    }

    /**
     * Abort the current operation.
     * Sets a flag that is checked during download/upload loops.
     */
    abort() {
        this.aborted = true;
    }
    
    /**
     * Set the radio type and load its protocol definition.
     * 
     * The protocol defines:
     *   - Handshake sequence (magic bytes, identification)
     *   - Memory layout (regions, block sizes)
     *   - Read/write command formats
     *   - Encryption requirements
     * 
     * @param {string} vendor - Vendor name (e.g., 'baofeng')
     * @param {string} model - Model name (e.g., 'uv5r')
     */
    setRadio(vendor, model) {
        this.vendor = vendor;
        this.model = model;
        this.protocol = getRadioProtocol(vendor, model);
        
        // Debug logging
        console.log('Using protocol:', this.protocol.name, 'for', vendor, model);
        console.log('Protocol baud rate:', this.protocol.baudRate);
        console.log('Protocol handshake type:', this.protocol.handshake?.type);
        if (this.protocol.handshake?.idents) {
            console.log('Protocol idents:', this.protocol.handshake.idents.length);
        }
    }
    
    /*
     * =========================================================================
     * ENCRYPTION/DECRYPTION METHODS
     * =========================================================================
     * Some radios encrypt their memory data to prevent unauthorized
     * modification. The encryption is typically simple XOR-based schemes
     * that are easily reversible.
     */
    
    /**
     * XOR encryption key table for UV-17Pro family radios.
     * 
     * Each sub-array contains 4 bytes that are XORed cyclically
     * with the memory data. Different radio models use different
     * indices into this table.
     * 
     * The algorithm:
     *   1. For each byte at position i
     *   2. Get key byte from symbols[i % 4]
     *   3. XOR data byte with key byte (with some conditions)
     * 
     * Radios using this encryption:
     *   - UV-17Pro, UV-17ProGPS (index 1)
     *   - BF-F8HP Pro (index 3)
     *   - UV-K5 variants
     */
    static ENCRYPT_SYMBOLS = [
        [0x42, 0x48, 0x54, 0x20], // "BHT " - Index 0
        [0x43, 0x4F, 0x20, 0x37], // "CO 7" - Index 1 (UV-17Pro)
        [0x41, 0x20, 0x45, 0x53], // "A ES" - Index 2
        [0x20, 0x45, 0x49, 0x59], // " EIY" - Index 3 (BF-F8HP Pro)
        [0x4D, 0x20, 0x50, 0x51], // "M PQ" - Index 4
        [0x58, 0x4E, 0x20, 0x59], // "XN Y" - Index 5
        [0x52, 0x56, 0x42, 0x20], // "RVB " - Index 6
        [0x20, 0x48, 0x51, 0x50], // " HQP" - Index 7
        [0x57, 0x20, 0x52, 0x43], // "W RC" - Index 8
        [0x4D, 0x53, 0x20, 0x4E], // "MS N" - Index 9
        [0x20, 0x53, 0x41, 0x54], // " SAT" - Index 10
        [0x4B, 0x20, 0x44, 0x48], // "K DH" - Index 11
        [0x5A, 0x4F, 0x20, 0x52], // "ZO R" - Index 12
        [0x43, 0x20, 0x53, 0x4C], // "C SL" - Index 13
        [0x36, 0x52, 0x42, 0x20], // "6RB " - Index 14
        [0x20, 0x4A, 0x43, 0x47], // " JCG" - Index 15
        [0x50, 0x4E, 0x20, 0x56], // "PN V" - Index 16
        [0x4A, 0x20, 0x50, 0x4B], // "J PK" - Index 17
        [0x45, 0x4B, 0x20, 0x4C], // "EK L" - Index 18
        [0x49, 0x20, 0x4C, 0x5A]  // "I LZ" - Index 19
    ];
    
    /**
     * Decrypt data from UV-17Pro-style radios.
     * 
     * ALGORITHM:
     * For each byte in the buffer:
     *   1. Get the key byte (symbols[position % 4])
     *   2. If conditions are met, XOR data with key
     *   3. Otherwise, keep data unchanged
     * 
     * CONDITIONS FOR XOR:
     *   - Key byte is not 0x20 (space)
     *   - Data byte is not 0x00 (null)
     *   - Data byte is not 0xFF (empty)
     *   - Data byte is not equal to key byte
     *   - Data byte is not inverse of key byte
     * 
     * NOTE: Since XOR is symmetric, this function also encrypts.
     * 
     * @param {Uint8Array} buffer - Data to decrypt
     * @param {number} symbolIndex - Index into ENCRYPT_SYMBOLS table
     * @returns {Uint8Array} Decrypted data
     */
    decryptUV17Pro(buffer, symbolIndex) {
        const symbols = RadioClone.ENCRYPT_SYMBOLS[symbolIndex];
        const result = new Uint8Array(buffer.length);
        
        for (let i = 0; i < buffer.length; i++) {
            const keyByte = symbols[i % 4];
            const dataByte = buffer[i];
            
            // Determine if this byte should be XORed
            // Based on reverse-engineering of the original CHIRP code
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
     * Encrypt data for UV-17Pro-style radios.
     * Since XOR is symmetric, encryption = decryption.
     * 
     * @param {Uint8Array} buffer - Data to encrypt
     * @param {number} symbolIndex - Index into ENCRYPT_SYMBOLS table
     * @returns {Uint8Array} Encrypted data
     */
    encryptUV17Pro(buffer, symbolIndex) {
        return this.decryptUV17Pro(buffer, symbolIndex);
    }
    
    /**
     * Wouxun XOR chain encryption/decryption.
     * 
     * ALGORITHM:
     * This uses a chained XOR where each byte's decryption depends
     * on the previous byte.
     * 
     * Decrypt (backwards):
     *   result[n] = data[n] XOR data[n-1]
     *   result[0] = data[0] XOR initial_value
     * 
     * Encrypt (forwards):
     *   result[0] = initial_value XOR data[0]
     *   result[n] = result[n-1] XOR data[n]
     * 
     * Used by: KG-UV8D, KG-UV8E, KG-UV9D Plus, KG-935G, etc.
     * 
     * @param {Uint8Array} data - Data to encrypt/decrypt
     * @param {number} valxor - Initial XOR value (0x57 for most Wouxun)
     * @param {boolean} decrypt - True to decrypt, false to encrypt
     * @returns {Uint8Array} Processed data
     */
    wouxunCrypt(data, valxor = 0x57, decrypt = true) {
        const result = new Uint8Array(data.length);
        
        if (decrypt) {
            // Decrypt: work backwards through the data
            for (let i = data.length - 1; i > 0; i--) {
                result[i] = data[i] ^ data[i - 1];
            }
            result[0] = data[0] ^ valxor;
        } else {
            // Encrypt: work forwards through the data
            result[0] = valxor ^ data[0];
            for (let i = 1; i < data.length; i++) {
                result[i] = result[i - 1] ^ data[i];
            }
        }
        
        return result;
    }
    
    /*
     * =========================================================================
     * CHECKSUM METHODS
     * =========================================================================
     * Some protocols include checksums in data blocks to verify integrity.
     */
    
    /**
     * Calculate simple sum checksum (mod 256).
     * 
     * ALGORITHM: Sum all bytes, take result mod 256
     * Used by: Retevis RT98/RB15, Kenwood TK series, TH9000, etc.
     * 
     * @param {Uint8Array} data - Data to checksum
     * @param {number} startOffset - Initial value to add
     * @returns {number} Checksum value (0-255)
     */
    static checksumSum(data, startOffset = 0) {
        let cs = startOffset;
        for (const byte of data) {
            cs = (cs + byte) & 0xFF;  // Keep to 8 bits
        }
        return cs;
    }
    
    /**
     * Calculate XOR checksum.
     * 
     * ALGORITHM: XOR all bytes together
     * Used by: Leixen radios
     * 
     * @param {Uint8Array} data - Data to checksum
     * @returns {number} Checksum value (0-255)
     */
    static checksumXor(data) {
        let cs = 0;
        for (const byte of data) {
            cs ^= byte;
        }
        return cs & 0xFF;
    }
    
    /**
     * Calculate Yaesu-style range checksum.
     * 
     * ALGORITHM: Sum bytes in a specific range
     * Used by: Yaesu VX, FT series
     * 
     * @param {Uint8Array} data - Full data buffer
     * @param {number} start - Start index
     * @param {number} stop - End index (inclusive)
     * @returns {number} Checksum value (0-255)
     */
    static yaesuChecksum(data, start, stop) {
        let cs = 0;
        for (let i = start; i <= stop; i++) {
            cs = (cs + data[i]) & 0xFF;
        }
        return cs;
    }
    
    /**
     * Verify checksum in received data.
     * 
     * @param {Uint8Array} data - Data with checksum
     * @param {string} checksumType - 'sum', 'xor', or 'yaesu'
     * @param {Object} options - Additional options for checksum
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
     * Add checksum to data for transmission.
     * 
     * @param {Uint8Array} data - Data to add checksum to
     * @param {string} checksumType - 'sum', 'xor', or 'yaesu'
     * @param {Object} options - Additional options
     * @returns {Uint8Array} Data with checksum appended
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
     * Download memory from radio.
     * 
     * PROCESS:
     * 1. Perform handshake (establish communication)
     * 2. Download memory blocks sequentially
     * 3. Decrypt if radio uses encryption
     * 4. Return complete memory image
     * 
     * @param {number} memorySize - Size of memory to download
     * @returns {Promise<Uint8Array>} Complete memory contents
     */
    async download(memorySize) {
        this.aborted = false;
        
        // Use generic protocol if none set
        if (!this.protocol) {
            this.protocol = RADIO_PROTOCOLS['generic'];
        }
        
        // Get actual memory size from model definition
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
     * Perform protocol-specific handshake.
     * 
     * HANDSHAKE TYPES:
     * 
     * 'magic' (UV-5R family):
     *   1. Send magic bytes one at a time with delays
     *   2. Wait for ACK (0x06)
     *   3. Send identification request (0x02)
     *   4. Read identification response (ends with 0xDD)
     *   5. Send ACK
     * 
     * 'program' (H777, BF-888S, older radios):
     *   1. Send pre-command if defined
     *   2. Send "PROGRAM" string
     *   3. Wait for ACK
     *   4. Send identification request
     *   5. Read identification response
     * 
     * 'uv17pro' (UV-17Pro, BF-F8HP Pro):
     *   1. Send 16-byte identification string
     *   2. Wait for fingerprint response
     *   3. Send additional magic commands (F, M, SEND)
     *   4. Receive responses to each
     * 
     * @throws {Error} If handshake fails
     */
    async performHandshake() {
        const hs = this.protocol.handshake;
        
        this.progress('Sending handshake...', 5);
        
        if (hs.type === 'magic') {
            // =====================================================
            // UV-5R FAMILY MAGIC BYTE HANDSHAKE
            // =====================================================
            // The UV-5R and related radios use a "magic" sequence
            // to enter programming mode. The sequence is model-specific
            // and must be sent byte-by-byte with precise timing.
            
            // Get magic sequences to try (some radios accept multiple)
            const magicSequences = hs.magicSequences || [hs.magic];
            let handshakeSuccess = false;
            let lastError = null;
            
            // Try each magic sequence
            for (let seqIndex = 0; seqIndex < magicSequences.length; seqIndex++) {
                const magic = magicSequences[seqIndex];
                console.log(`Trying magic sequence ${seqIndex + 1}/${magicSequences.length}:`, 
                    magic.map(b => b.toString(16).padStart(2, '0')).join(' '));
                
                try {
                    // Clear any pending data in the buffer
                    try {
                        await this.connection.read(100, 100);
                    } catch (e) {
                        // Ignore timeout - expected if buffer is empty
                    }
                    
                    // Send magic bytes one at a time with delay
                    // This timing is critical - too fast and radio may miss bytes
                    for (const byte of magic) {
                        await this.connection.write(new Uint8Array([byte]));
                        await this.delay(hs.magicDelay || 10);
                    }
                    
                    // Wait for ACK response
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
                // UV-5R identification format: [model bytes...][0xDD]
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
            // =====================================================
            // PROGRAM STRING HANDSHAKE
            // =====================================================
            // Simpler radios (H777, BF-888S) use a "PROGRAM" string
            // to enter programming mode.
            
            // Send pre-command if defined
            if (hs.preCmd) {
                await this.connection.write(new Uint8Array(hs.preCmd));
                await this.delay(hs.preDelay || 100);
            }
            
            // Send program command (typically "PROGRAM" ASCII)
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
            // =====================================================
            // UV-17PRO FAMILY HANDSHAKE
            // =====================================================
            // The UV-17Pro uses a more complex handshake with:
            // - 16-byte identification string
            // - Fingerprint response verification
            // - Additional magic commands
            
            let identSuccess = false;
            let lastError = null;
            
            // Try each identification string
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
                    
                    // Check if response starts with fingerprint
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
            
            // Send additional magic commands (F, M, SEND sequences)
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
     * Download memory blocks based on protocol definition.
     * 
     * MEMORY LAYOUTS:
     * 
     * Single Region (most radios):
     *   - mainStart: First address to read
     *   - mainEnd: Last address to read
     *   - Optionally auxStart/auxEnd for additional regions
     * 
     * Multi-Region (UV-17Pro):
     *   - regions: Array of { start, size } objects
     *   - Non-contiguous memory areas
     * 
     * @param {number} memorySize - Total size to download
     * @returns {Promise<Array>} Downloaded data as byte array
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
            
            // Download each memory region
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
     * Read a single memory block from the radio.
     * 
     * BLOCK READ PROTOCOL:
     * 
     * Request Format:
     *   [CMD][ADDR_HI][ADDR_LO][SIZE]
     *   CMD: Read command (0x52 'R' or 0x53 'S')
     *   ADDR: 16-bit big-endian address
     *   SIZE: Number of bytes to read
     * 
     * Response Format (standard):
     *   [CMD][ADDR_HI][ADDR_LO][SIZE][DATA...][ACK?]
     * 
     * Response Format (UV17Pro):
     *   [HEADER 4 bytes][DATA...] (encrypted)
     * 
     * @param {number} address - Memory address to read
     * @param {number} size - Number of bytes to read
     * @param {boolean} isFirst - True if first block (some protocols differ)
     * @returns {Promise<Uint8Array>} Block data
     */
    async readBlock(address, size, isFirst) {
        const read = this.protocol.read;
        
        // Build read command: cmd + address (2 bytes) + size (1 byte)
        const cmd = new Uint8Array([
            read.cmd,
            (address >> 8) & 0xFF,   // Address high byte
            address & 0xFF,          // Address low byte
            size                     // Block size
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
            
            // Strip the 4-byte header, keep just data
            let chunk = response.slice(4);
            
            // Decrypt if encryption is enabled for this protocol
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
        
        // Standard protocol: Read and validate response header
        if (read.responseCmd !== undefined) {
            const header = await this.connection.read(4, 2000);
            if (header.length !== 4) {
                throw new Error(`Invalid response header at address 0x${address.toString(16)}`);
            }
            
            // Validate response command byte
            if (header[0] !== read.responseCmd) {
                throw new Error(`Unexpected response command 0x${header[0].toString(16)} at address 0x${address.toString(16)}`);
            }
            
            // Validate address echo
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
     * Simple delay helper.
     * 
     * @param {number} ms - Milliseconds to delay
     * @returns {Promise} Resolves after delay
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Upload memory to radio.
     * 
     * PROCESS:
     * 1. Perform handshake (establish communication)
     * 2. Encrypt data if required
     * 3. Upload memory blocks sequentially
     * 4. Wait for ACK after each block
     * 
     * WARNING: This overwrites the radio's memory!
     * 
     * @param {Uint8Array} data - Complete memory image to upload
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
     * Upload memory blocks based on protocol definition.
     * 
     * @param {Uint8Array} data - Memory data to upload
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
     * Write a single memory block to the radio.
     * 
     * BLOCK WRITE PROTOCOL:
     * 
     * Request Format:
     *   [CMD][ADDR_HI][ADDR_LO][SIZE][DATA...]
     *   CMD: Write command (0x57 'W' or 0x58 'X')
     *   ADDR: 16-bit big-endian address
     *   SIZE: Number of bytes in data
     *   DATA: Block data
     * 
     * Response:
     *   [ACK] (0x06 for success)
     * 
     * @param {number} address - Memory address to write
     * @param {Uint8Array} data - Data to write
     * @throws {Error} If write fails or no ACK received
     */
    async writeBlock(address, data) {
        const write = this.protocol.write;
        
        // Build write command: cmd + address (2 bytes) + size (1 byte) + data
        const cmd = new Uint8Array([
            write.cmd,
            (address >> 8) & 0xFF,   // Address high byte
            address & 0xFF,          // Address low byte
            data.length,             // Block size
            ...data                  // Block data
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
 * Get list of previously granted serial ports.
 * 
 * The Web Serial API remembers ports the user has granted access to.
 * This allows reconnecting without showing the port picker again.
 * 
 * @returns {Promise<Array>} Array of previously granted ports
 */
export async function getAvailablePorts() {
    if (!SerialConnection.isSupported()) {
        return [];
    }
    return await navigator.serial.getPorts();
}

/**
 * Listen for serial port connect/disconnect events.
 * 
 * Useful for detecting when programming cables are plugged in/out.
 * 
 * @param {Function} callback - Called with ('connect' or 'disconnect', port)
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
