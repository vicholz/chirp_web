/**
 * CHIRP Web - Main Application
 * Handles UI interactions and ties together all modules
 */

import { Memory, RadioImage, TONES, DTCS_CODES, TONE_MODES, CROSS_MODES, MODES, DUPLEX, SKIP_VALUES, TUNING_STEPS, formatFreq, parseFreq, parseRadioMemory, serializeRadioMemory } from './memory.js';
import { SerialConnection, RadioClone, getAvailablePorts, onPortChange } from './serial.js';
import { parseCSV, generateCSV, downloadCSV, readCSVFile, readIMGFile, SUPPORTED_FORMATS } from './csv.js';
import { RepeaterBookClient, ALL_COUNTRIES, getStatesForCountry, BANDS, RB_MODES, STOCK_CONFIGS, loadStockConfig } from './repeaterbook.js';
import { RADIO_MODELS, getRadioProtocol } from './radio-defs.js';

/**
 * Main Application Class
 */
class ChirpApp {
    constructor() {
        this.currentImage = null;
        this.serialConnection = null;
        this.selectedRows = new Set();
        this.clipboard = [];
        this.undoStack = [];
        this.redoStack = [];
        this.sortColumn = null;
        this.sortAscending = true;
        this.modified = false;
        
        // Column widths for resizable columns
        this.columnWidths = {};
        this.resizing = null;
        
        // Track modified cells (unsaved changes) and invalid cells
        this.modifiedCells = new Set();
        this.invalidCells = new Set();

        this.init();
    }

    /**
     * Initialize the application
     */
    init() {
        this.loadColumnWidths();
        this.bindEvents();
        this.checkSerialSupport();
        this.updateUI();
        this.newFile();
    }

    /**
     * Bind all UI event handlers
     */
    bindEvents() {
        // File menu
        document.getElementById('menu-new')?.addEventListener('click', () => this.newFile());
        document.getElementById('menu-open')?.addEventListener('click', () => this.openFile());
        document.getElementById('menu-save')?.addEventListener('click', () => this.saveFile());
        document.getElementById('menu-save-as')?.addEventListener('click', () => this.saveFileAs());
        document.getElementById('menu-import')?.addEventListener('click', () => this.importFile());
        document.getElementById('menu-export')?.addEventListener('click', () => this.exportFile());

        // Radio menu
        document.getElementById('menu-download')?.addEventListener('click', () => this.downloadFromRadio());
        document.getElementById('menu-upload')?.addEventListener('click', () => this.uploadToRadio());
        document.getElementById('menu-query-rb')?.addEventListener('click', () => this.showRepeaterBookDialog());

        // Edit menu
        document.getElementById('menu-cut')?.addEventListener('click', () => this.cut());
        document.getElementById('menu-copy')?.addEventListener('click', () => this.copy());
        document.getElementById('menu-paste')?.addEventListener('click', () => this.paste());
        document.getElementById('menu-delete')?.addEventListener('click', () => this.deleteSelected());
        document.getElementById('menu-insert')?.addEventListener('click', () => this.insertRow());
        document.getElementById('menu-select-all')?.addEventListener('click', () => this.selectAll());

        // Stock configs menu
        this.populateStockConfigMenu();

        // File input for opening files
        document.getElementById('file-input')?.addEventListener('change', (e) => this.handleFileInput(e));

        // Memory grid events
        document.getElementById('memory-grid')?.addEventListener('click', (e) => this.handleGridClick(e));
        document.getElementById('memory-grid')?.addEventListener('dblclick', (e) => this.handleGridDoubleClick(e));

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboard(e));

        // Dialog events
        document.querySelectorAll('.dialog-close, .dialog-cancel').forEach(btn => {
            btn.addEventListener('click', () => this.closeAllDialogs());
        });

        // Edit dialog save
        document.getElementById('edit-save')?.addEventListener('click', () => this.saveEditDialog());
        
        // Set up form input validation
        this.setupFormValidation();

        // RepeaterBook dialog
        document.getElementById('rb-search')?.addEventListener('click', () => this.searchRepeaterBook());
        document.getElementById('rb-country')?.addEventListener('change', (e) => this.updateStateSelect(e.target.value));
        
        // Radio selection dialog
        document.getElementById('radio-connect')?.addEventListener('click', () => this.handleRadioConnect());

        // Prevent form submission
        document.querySelectorAll('form').forEach(form => {
            form.addEventListener('submit', (e) => e.preventDefault());
        });

        // Window close warning
        window.addEventListener('beforeunload', (e) => {
            if (this.modified) {
                e.preventDefault();
                e.returnValue = '';
            }
        });
    }

    /**
     * Set up validation for form inputs in dialogs
     */
    setupFormValidation() {
        // Define validation configs for each form field
        const formValidations = {
            'edit-freq': { allowedChars: /^[0-9.]$/, singleDecimal: true },
            'edit-offset': { allowedChars: /^[0-9.]$/, singleDecimal: true },
            'edit-name': { allowedChars: /^[A-Za-z0-9 \-_/]$/, singleDecimal: false },
            'edit-power': { allowedChars: /^[A-Za-z0-9.]$/, singleDecimal: true },
            'edit-comment': { allowedChars: /^[\x20-\x7E]$/, singleDecimal: false }
        };
        
        for (const [inputId, config] of Object.entries(formValidations)) {
            const input = document.getElementById(inputId);
            if (!input) continue;
            
            // Filter keystrokes
            input.addEventListener('keydown', (e) => {
                // Allow control keys
                if (e.ctrlKey || e.metaKey || e.altKey) return;
                if (['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter', 'Escape', 'Home', 'End'].includes(e.key)) return;
                
                // Check if key is allowed
                if (!config.allowedChars.test(e.key)) {
                    e.preventDefault();
                    return;
                }
                
                // Special validation for decimal point (only one allowed)
                if (config.singleDecimal && e.key === '.') {
                    if (input.value.includes('.')) {
                        e.preventDefault();
                        return;
                    }
                }
            });
            
            // Filter on paste
            input.addEventListener('paste', (e) => {
                e.preventDefault();
                const text = e.clipboardData.getData('text');
                let filtered = '';
                let hasDecimal = input.value.includes('.');
                
                for (const char of text) {
                    if (config.allowedChars.test(char)) {
                        if (char === '.' && config.singleDecimal) {
                            if (hasDecimal) continue;
                            hasDecimal = true;
                        }
                        filtered += char;
                    }
                }
                
                // Insert filtered text at cursor position
                const start = input.selectionStart;
                const end = input.selectionEnd;
                const before = input.value.substring(0, start);
                const after = input.value.substring(end);
                input.value = before + filtered + after;
                input.selectionStart = input.selectionEnd = start + filtered.length;
            });
            
            // Validate on blur to provide visual feedback
            input.addEventListener('blur', () => {
                this.validateFormInput(input, inputId);
            });
        }
    }
    
    /**
     * Validate a form input and apply error styling if invalid
     */
    validateFormInput(input, inputId) {
        let isValid = true;
        const value = input.value.trim();
        
        if (inputId === 'edit-freq' || inputId === 'edit-offset') {
            // Frequency validation: must be a valid number format
            if (value && !/^\d+\.?\d*$/.test(value)) {
                isValid = false;
            }
        }
        
        input.classList.toggle('input-invalid', !isValid);
        return isValid;
    }

    /**
     * Check if Web Serial API is supported
     */
    checkSerialSupport() {
        if (!SerialConnection.isSupported()) {
            // Disable serial-related menu items
            document.getElementById('menu-download')?.classList.add('disabled');
            document.getElementById('menu-upload')?.classList.add('disabled');
            this.showStatus('Web Serial API not supported - radio connection disabled');
        }
    }

    /**
     * Update UI state based on current state
     */
    updateUI() {
        const hasImage = this.currentImage !== null;
        const hasSelection = this.selectedRows.size > 0;
        const hasClipboard = this.clipboard.length > 0;

        // Enable/disable menu items
        document.getElementById('menu-save')?.classList.toggle('disabled', !hasImage || !this.modified);
        document.getElementById('menu-save-as')?.classList.toggle('disabled', !hasImage);
        document.getElementById('menu-export')?.classList.toggle('disabled', !hasImage);
        document.getElementById('menu-upload')?.classList.toggle('disabled', !hasImage);
        document.getElementById('menu-cut')?.classList.toggle('disabled', !hasSelection);
        document.getElementById('menu-copy')?.classList.toggle('disabled', !hasSelection);
        document.getElementById('menu-paste')?.classList.toggle('disabled', !hasClipboard);
        document.getElementById('menu-delete')?.classList.toggle('disabled', !hasSelection);

        // Update title
        let title = 'CHIRP Web';
        if (this.currentImage) {
            title = `${this.currentImage.filename || 'Untitled'} - CHIRP Web`;
            if (this.modified) {
                title = `* ${title}`;
            }
        }
        document.title = title;
        document.getElementById('header-title').textContent = title;

        // Update radio info
        if (this.currentImage) {
            document.getElementById('radio-info').textContent = 
                `${this.currentImage.vendor} ${this.currentImage.model}`;
        } else {
            document.getElementById('radio-info').textContent = '';
        }
    }

    /**
     * Show status message
     */
    showStatus(message, timeout = 3000) {
        const statusEl = document.getElementById('status-message');
        if (statusEl) {
            statusEl.textContent = message;
            if (timeout > 0) {
                setTimeout(() => {
                    if (statusEl.textContent === message) {
                        statusEl.textContent = '';
                    }
                }, timeout);
            }
        }
    }

    /**
     * Show error message
     */
    showError(message) {
        console.error('CHIRP Error:', message);
        alert(message);
        this.showStatus(`Error: ${message}`, 5000);
    }

    /**
     * Create new file
     */
    newFile() {
        if (this.modified && !confirm('Discard unsaved changes?')) {
            return;
        }

        this.currentImage = new RadioImage('Untitled.csv', 128);
        this.modified = false;
        this.selectedRows.clear();
        this.modifiedCells.clear();
        this.invalidCells.clear();
        this.undoStack = [];
        this.redoStack = [];
        this.renderMemoryGrid();
        this.updateUI();
        this.showStatus('Created new file');
    }

    /**
     * Open file dialog
     */
    openFile() {
        if (this.modified && !confirm('Discard unsaved changes?')) {
            return;
        }

        const input = document.getElementById('file-input');
        if (input) {
            input.value = '';
            input.click();
        }
    }

    /**
     * Handle file input change
     */
    async handleFileInput(event) {
        const file = event.target.files[0];
        if (!file) return;

        try {
            this.showStatus(`Loading ${file.name}...`, 0);
            
            if (file.name.toLowerCase().endsWith('.csv')) {
                this.currentImage = await readCSVFile(file);
            } else if (file.name.toLowerCase().endsWith('.img')) {
                this.currentImage = await readIMGFile(file);
            } else {
                // Try CSV format
                this.currentImage = await readCSVFile(file);
            }

            this.currentImage.filename = file.name;
            this.modified = false;
            this.selectedRows.clear();
            this.modifiedCells.clear();
            this.invalidCells.clear();
            this.undoStack = [];
            this.redoStack = [];
            this.renderMemoryGrid();
            this.updateUI();
            this.showStatus(`Opened ${file.name}`);

        } catch (error) {
            this.showError(`Failed to open file: ${error.message}`);
        }
    }

    /**
     * Save file
     */
    saveFile() {
        if (!this.currentImage) return;

        if (!this.currentImage.filename || this.currentImage.filename === 'Untitled.csv') {
            this.saveFileAs();
            return;
        }

        this.doSave(this.currentImage.filename);
    }

    /**
     * Save file as
     */
    saveFileAs() {
        if (!this.currentImage) return;

        const filename = prompt('Save as:', this.currentImage.filename || 'chirp_export.csv');
        if (filename) {
            this.doSave(filename);
        }
    }

    /**
     * Do the actual save
     */
    doSave(filename) {
        try {
            downloadCSV(this.currentImage, filename);
            this.currentImage.filename = filename;
            this.modified = false;
            this.modifiedCells.clear();
            this.renderMemoryGrid();
            this.updateUI();
            this.showStatus(`Saved ${filename}`);
        } catch (error) {
            this.showError(`Failed to save: ${error.message}`);
        }
    }

    /**
     * Import file (merge into current)
     */
    async importFile() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.csv,.img';

        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                this.showStatus(`Importing ${file.name}...`, 0);
                
                let imported;
                if (file.name.toLowerCase().endsWith('.csv')) {
                    imported = await readCSVFile(file);
                } else {
                    imported = await readIMGFile(file);
                }

                // Find next available slot
                let nextSlot = 1;
                for (const mem of this.currentImage.getAllMemories()) {
                    if (!mem.empty) {
                        nextSlot = mem.number + 1;
                    }
                }

                // Import memories
                let count = 0;
                for (const mem of imported.getUsedMemories()) {
                    const newMem = mem.clone();
                    newMem.number = nextSlot++;
                    this.currentImage.setMemory(newMem);
                    count++;
                }

                this.modified = true;
                this.renderMemoryGrid();
                this.updateUI();
                this.showStatus(`Imported ${count} memories from ${file.name}`);

            } catch (error) {
                this.showError(`Failed to import: ${error.message}`);
            }
        };

        input.click();
    }

    /**
     * Export file
     */
    exportFile() {
        if (!this.currentImage) return;

        const filename = this.currentImage.filename?.replace(/\.[^.]+$/, '.csv') || 'export.csv';
        downloadCSV(this.currentImage, filename);
        this.showStatus(`Exported to ${filename}`);
    }

    /**
     * Populate stock config menu
     */
    populateStockConfigMenu() {
        const menu = document.getElementById('stock-config-menu');
        if (!menu) return;

        for (const [key, config] of Object.entries(STOCK_CONFIGS)) {
            const item = document.createElement('div');
            item.className = 'menu-item';
            item.textContent = config.name;
            item.addEventListener('click', () => this.loadStockConfig(key));
            menu.appendChild(item);
        }
    }

    /**
     * Load a stock configuration
     */
    loadStockConfig(configName) {
        try {
            const memories = loadStockConfig(configName);
            
            // Create new image or add to current
            if (!this.currentImage || this.currentImage.getUsedMemories().length === 0) {
                this.currentImage = new RadioImage(configName, 128);
            }

            for (const mem of memories) {
                this.currentImage.setMemory(mem);
            }

            this.modified = true;
            this.renderMemoryGrid();
            this.updateUI();
            this.showStatus(`Loaded ${STOCK_CONFIGS[configName].name}`);

        } catch (error) {
            this.showError(`Failed to load stock config: ${error.message}`);
        }
    }

    /**
     * Render the memory grid
     */
    renderMemoryGrid() {
        const grid = document.getElementById('memory-grid');
        if (!grid || !this.currentImage) return;

        // Clear existing content
        grid.innerHTML = '';

        // Create table
        const table = document.createElement('table');
        table.className = 'memory-table';

        // Header
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        
        const columns = [
            { key: 'number', label: 'Loc' },
            { key: 'name', label: 'Name' },
            { key: 'freq', label: 'Frequency' },
            { key: 'duplex', label: 'Duplex' },
            { key: 'offset', label: 'Offset' },
            { key: 'tmode', label: 'Tone' },
            { key: 'rtone', label: 'rTone' },
            { key: 'ctone', label: 'cTone' },
            { key: 'dtcs', label: 'DTCS' },
            { key: 'mode', label: 'Mode' },
            { key: 'skip', label: 'Skip' },
            { key: 'comment', label: 'Comment' }
        ];

        for (const col of columns) {
            const th = document.createElement('th');
            th.textContent = col.label;
            th.dataset.column = col.key;
            
            // Apply stored width if available
            if (this.columnWidths[col.key]) {
                th.style.width = this.columnWidths[col.key] + 'px';
                th.style.minWidth = this.columnWidths[col.key] + 'px';
            }
            
            th.addEventListener('click', (e) => {
                // Don't sort if clicking on resize handle
                if (!e.target.classList.contains('resize-handle')) {
                    this.sortByColumn(col.key);
                }
            });
            if (this.sortColumn === col.key) {
                th.classList.add(this.sortAscending ? 'sort-asc' : 'sort-desc');
            }
            
            // Add resize handle
            const resizeHandle = document.createElement('div');
            resizeHandle.className = 'resize-handle';
            resizeHandle.addEventListener('mousedown', (e) => this.startColumnResize(e, th, col.key));
            th.appendChild(resizeHandle);
            
            headerRow.appendChild(th);
        }
        thead.appendChild(headerRow);
        table.appendChild(thead);

        // Body
        const tbody = document.createElement('tbody');
        
        let memories = this.currentImage.getAllMemories();
        
        // Sort if needed
        if (this.sortColumn) {
            memories = [...memories].sort((a, b) => {
                let aVal = a[this.sortColumn];
                let bVal = b[this.sortColumn];
                
                // Handle empty values
                if (a.empty && !b.empty) return 1;
                if (!a.empty && b.empty) return -1;
                if (a.empty && b.empty) return a.number - b.number;
                
                // Compare values
                if (typeof aVal === 'number' && typeof bVal === 'number') {
                    return this.sortAscending ? aVal - bVal : bVal - aVal;
                }
                
                aVal = String(aVal || '');
                bVal = String(bVal || '');
                const cmp = aVal.localeCompare(bVal);
                return this.sortAscending ? cmp : -cmp;
            });
        }

        for (const mem of memories) {
            const row = document.createElement('tr');
            row.dataset.location = mem.number;
            row.classList.toggle('empty', mem.empty);
            row.classList.toggle('selected', this.selectedRows.has(mem.number));

            for (const col of columns) {
                const td = document.createElement('td');
                td.dataset.column = col.key;
                td.dataset.location = mem.number;
                
                // Make cells editable (except location number)
                if (col.key !== 'number') {
                    td.classList.add('editable');
                    td.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.startCellEdit(td, mem.number, col.key);
                    });
                }
                
                // Always display cell values - only empty flag affects row styling, not content
                switch (col.key) {
                    case 'freq':
                        td.textContent = mem.freq ? formatFreq(mem.freq) : '';
                        break;
                    case 'offset':
                        if (mem.duplex === 'split' || mem.duplex === '+' || mem.duplex === '-') {
                            td.textContent = mem.offset ? formatFreq(mem.offset) : '';
                        } else {
                            td.textContent = '';
                        }
                        break;
                    case 'duplex':
                        td.textContent = mem.duplex || '';
                        break;
                    case 'tmode':
                        td.textContent = mem.tmode || '';
                        break;
                    case 'mode':
                        td.textContent = mem.mode || '';
                        break;
                    case 'skip':
                        td.textContent = mem.skip || '';
                        break;
                    case 'rtone':
                        td.textContent = mem.rtone ? mem.rtone.toFixed(1) : '';
                        break;
                    case 'ctone':
                        td.textContent = mem.ctone ? mem.ctone.toFixed(1) : '';
                        break;
                    case 'dtcs':
                        td.textContent = mem.dtcs ? mem.dtcs.toString().padStart(3, '0') : '';
                        break;
                    case 'name':
                        td.textContent = mem.name || '';
                        break;
                    case 'comment':
                        td.textContent = mem.comment || '';
                        break;
                    default:
                        td.textContent = mem[col.key] ?? '';
                }
                
                // Mark modified cells
                if (this.modifiedCells.has(`${mem.number}:${col.key}`)) {
                    td.classList.add('modified');
                }
                
                // Mark invalid cells
                if (this.invalidCells.has(`${mem.number}:${col.key}`)) {
                    td.classList.add('invalid');
                }
                row.appendChild(td);
            }
            
            tbody.appendChild(row);
        }

        table.appendChild(tbody);
        grid.appendChild(table);
    }

    /**
     * Sort grid by column
     */
    sortByColumn(column) {
        if (this.sortColumn === column) {
            this.sortAscending = !this.sortAscending;
        } else {
            this.sortColumn = column;
            this.sortAscending = true;
        }
        this.renderMemoryGrid();
    }

    /**
     * Start column resize operation
     */
    startColumnResize(e, th, columnKey) {
        e.preventDefault();
        e.stopPropagation();
        
        this.resizing = {
            th: th,
            columnKey: columnKey,
            startX: e.pageX,
            startWidth: th.offsetWidth
        };
        
        th.classList.add('resizing');
        document.body.classList.add('resizing-column');
        
        // Add mouse move and up handlers
        document.addEventListener('mousemove', this.handleColumnResize);
        document.addEventListener('mouseup', this.endColumnResize);
    }

    /**
     * Handle column resize drag
     */
    handleColumnResize = (e) => {
        if (!this.resizing) return;
        
        const diff = e.pageX - this.resizing.startX;
        const newWidth = Math.max(50, this.resizing.startWidth + diff);
        
        this.resizing.th.style.width = newWidth + 'px';
        this.resizing.th.style.minWidth = newWidth + 'px';
        
        // Also update the corresponding column cells
        const table = this.resizing.th.closest('table');
        const columnIndex = Array.from(this.resizing.th.parentNode.children).indexOf(this.resizing.th);
        const cells = table.querySelectorAll(`tbody td:nth-child(${columnIndex + 1})`);
        cells.forEach(cell => {
            cell.style.width = newWidth + 'px';
            cell.style.minWidth = newWidth + 'px';
        });
    }

    /**
     * End column resize operation
     */
    endColumnResize = (e) => {
        if (!this.resizing) return;
        
        // Store the final width
        const finalWidth = this.resizing.th.offsetWidth;
        this.columnWidths[this.resizing.columnKey] = finalWidth;
        
        // Save to localStorage for persistence
        try {
            localStorage.setItem('chirp-column-widths', JSON.stringify(this.columnWidths));
        } catch (e) {
            // Ignore localStorage errors
        }
        
        this.resizing.th.classList.remove('resizing');
        document.body.classList.remove('resizing-column');
        
        document.removeEventListener('mousemove', this.handleColumnResize);
        document.removeEventListener('mouseup', this.endColumnResize);
        
        this.resizing = null;
    }

    /**
     * Load saved column widths from localStorage
     */
    loadColumnWidths() {
        try {
            const saved = localStorage.getItem('chirp-column-widths');
            if (saved) {
                this.columnWidths = JSON.parse(saved);
            }
        } catch (e) {
            // Ignore localStorage errors
        }
    }

    /**
     * Start inline cell editing
     */
    startCellEdit(td, location, columnKey) {
        // Don't start if already editing
        if (td.querySelector('input, select')) return;
        
        const mem = this.currentImage.getMemory(location);
        const originalValue = td.textContent;
        
        // Determine editor type and options based on column
        const editorConfig = this.getCellEditorConfig(columnKey, mem);
        
        let editor;
        if (editorConfig.type === 'select') {
            editor = document.createElement('select');
            editor.className = 'cell-editor cell-select';
            
            for (const opt of editorConfig.options) {
                const option = document.createElement('option');
                option.value = opt.value;
                option.textContent = opt.label;
                if (opt.value === editorConfig.currentValue) {
                    option.selected = true;
                }
                editor.appendChild(option);
            }
        } else {
            editor = document.createElement('input');
            editor.type = 'text';
            editor.className = 'cell-editor cell-input';
            editor.value = editorConfig.currentValue;
            if (editorConfig.placeholder) {
                editor.placeholder = editorConfig.placeholder;
            }
            
            // Add input validation based on column type
            const validationConfig = this.getInputValidation(columnKey);
            if (validationConfig) {
                editor.addEventListener('keydown', (e) => {
                    // Allow control keys
                    if (e.ctrlKey || e.metaKey || e.altKey) return;
                    if (['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter', 'Escape', 'Home', 'End'].includes(e.key)) return;
                    
                    // Check if key is allowed
                    if (!validationConfig.allowedChars.test(e.key)) {
                        e.preventDefault();
                        return;
                    }
                    
                    // Special validation for decimal point (only one allowed)
                    if (validationConfig.singleDecimal && e.key === '.') {
                        if (editor.value.includes('.')) {
                            e.preventDefault();
                            return;
                        }
                    }
                });
                
                // Also filter on paste
                editor.addEventListener('paste', (e) => {
                    e.preventDefault();
                    const text = e.clipboardData.getData('text');
                    let filtered = '';
                    let hasDecimal = editor.value.includes('.');
                    
                    for (const char of text) {
                        if (validationConfig.allowedChars.test(char)) {
                            if (char === '.' && validationConfig.singleDecimal) {
                                if (hasDecimal) continue;
                                hasDecimal = true;
                            }
                            filtered += char;
                        }
                    }
                    
                    // Insert filtered text at cursor position
                    const start = editor.selectionStart;
                    const end = editor.selectionEnd;
                    const before = editor.value.substring(0, start);
                    const after = editor.value.substring(end);
                    editor.value = before + filtered + after;
                    editor.selectionStart = editor.selectionEnd = start + filtered.length;
                });
            }
        }
        
        // Clear cell and add editor
        td.textContent = '';
        td.classList.add('editing');
        td.appendChild(editor);
        editor.focus();
        
        if (editor.tagName === 'INPUT') {
            editor.select();
        }
        
        // Handle blur (save)
        editor.addEventListener('blur', () => {
            this.finishCellEdit(td, location, columnKey, editor.value, originalValue);
        });
        
        // Handle keyboard
        editor.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                editor.blur();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                // Restore original value
                td.classList.remove('editing');
                td.textContent = originalValue;
            } else if (e.key === 'Tab') {
                // Allow tab to move to next cell
                e.preventDefault();
                editor.blur();
                this.moveToNextCell(td, e.shiftKey);
            }
        });
        
        // For select, also save on change
        if (editor.tagName === 'SELECT') {
            editor.addEventListener('change', () => {
                editor.blur();
            });
        }
    }

    /**
     * Get input validation rules for a column
     */
    getInputValidation(columnKey) {
        switch (columnKey) {
            case 'freq':
            case 'offset':
                // Frequencies: only digits and one decimal point
                return {
                    allowedChars: /^[0-9.]$/,
                    singleDecimal: true
                };
            case 'name':
                // Names: alphanumeric, spaces, and common symbols (radio-safe characters)
                return {
                    allowedChars: /^[A-Za-z0-9 \-_/]$/,
                    singleDecimal: false
                };
            case 'comment':
                // Comments: most printable characters
                return {
                    allowedChars: /^[\x20-\x7E]$/,
                    singleDecimal: false
                };
            case 'power':
                // Power: alphanumeric (e.g., "Low", "5W", "High")
                return {
                    allowedChars: /^[A-Za-z0-9.]$/,
                    singleDecimal: true
                };
            default:
                // No validation for other columns (usually dropdowns)
                return null;
        }
    }

    /**
     * Get editor configuration for a column
     */
    getCellEditorConfig(columnKey, mem) {
        switch (columnKey) {
            case 'freq':
                return {
                    type: 'input',
                    currentValue: mem.freq ? formatFreq(mem.freq) : '',
                    placeholder: '146.520000'
                };
            case 'offset':
                return {
                    type: 'input',
                    currentValue: mem.offset ? formatFreq(mem.offset) : '',
                    placeholder: '0.600000'
                };
            case 'name':
                return {
                    type: 'input',
                    currentValue: mem.name || '',
                    placeholder: ''
                };
            case 'comment':
                return {
                    type: 'input',
                    currentValue: mem.comment || '',
                    placeholder: ''
                };
            case 'power':
                return {
                    type: 'input',
                    currentValue: mem.power || '',
                    placeholder: 'Low/Med/High'
                };
            case 'duplex':
                return {
                    type: 'select',
                    currentValue: mem.duplex || '',
                    options: DUPLEX.map(d => ({ value: d, label: d || '(none)' }))
                };
            case 'tmode':
                return {
                    type: 'select',
                    currentValue: mem.tmode || '',
                    options: TONE_MODES.map(t => ({ value: t, label: t || '(none)' }))
                };
            case 'mode':
                return {
                    type: 'select',
                    currentValue: mem.mode || '',
                    options: [
                        { value: '', label: '(none)' },
                        ...MODES.map(m => ({ value: m, label: m }))
                    ]
                };
            case 'skip':
                return {
                    type: 'select',
                    currentValue: mem.skip || '',
                    options: SKIP_VALUES.map(s => ({ value: s, label: s || '(none)' }))
                };
            case 'rtone':
            case 'ctone':
                return {
                    type: 'select',
                    currentValue: mem[columnKey] ? String(mem[columnKey]) : '',
                    options: [
                        { value: '', label: '(none)' },
                        ...TONES.map(t => ({ value: String(t), label: t.toFixed(1) }))
                    ]
                };
            case 'dtcs':
                return {
                    type: 'select',
                    currentValue: mem.dtcs ? String(mem.dtcs) : '',
                    options: [
                        { value: '', label: '(none)' },
                        ...DTCS_CODES.map(d => ({ 
                            value: String(d), 
                            label: d.toString().padStart(3, '0') 
                        }))
                    ]
                };
            default:
                return {
                    type: 'input',
                    currentValue: mem[columnKey] ?? '',
                    placeholder: ''
                };
        }
    }

    /**
     * Finish cell editing and save value
     */
    finishCellEdit(td, location, columnKey, newValue, originalValue) {
        td.classList.remove('editing');
        
        // Get current memory
        const mem = this.currentImage.getMemory(location).clone();
        const cellKey = `${location}:${columnKey}`;
        
        // Parse and set the new value
        let changed = false;
        let isValid = true;
        
        try {
            switch (columnKey) {
                case 'freq':
                    // Validate frequency format (only digits and at most one decimal)
                    if (newValue && !/^\d+\.?\d*$/.test(newValue.trim())) {
                        isValid = false;
                    } else {
                        const newFreq = parseFreq(newValue);
                        // Check if input was provided but parsing failed
                        if (newValue.trim() && newFreq === 0) {
                            isValid = false;
                        } else if (newFreq !== mem.freq) {
                            mem.freq = newFreq;
                            mem.empty = newFreq === 0;
                            changed = true;
                        }
                    }
                    break;
                case 'offset':
                    // Validate offset format (only digits and at most one decimal)
                    if (newValue && newValue.trim() && !/^\d+\.?\d*$/.test(newValue.trim())) {
                        isValid = false;
                    } else {
                        const newOffset = parseFreq(newValue);
                        if (newOffset !== mem.offset) {
                            mem.offset = newOffset;
                            changed = true;
                        }
                    }
                    break;
                case 'name':
                    if (newValue !== mem.name) {
                        mem.name = newValue;
                        changed = true;
                    }
                    break;
                case 'comment':
                    if (newValue !== mem.comment) {
                        mem.comment = newValue;
                        changed = true;
                    }
                    break;
                case 'power':
                    if (newValue !== mem.power) {
                        mem.power = newValue;
                        changed = true;
                    }
                    break;
                case 'duplex':
                    if (newValue !== mem.duplex) {
                        mem.duplex = newValue;
                        changed = true;
                    }
                    break;
                case 'tmode':
                    if (newValue !== mem.tmode) {
                        mem.tmode = newValue;
                        changed = true;
                    }
                    break;
                case 'mode':
                    if (newValue !== mem.mode) {
                        mem.mode = newValue;
                        changed = true;
                    }
                    break;
                case 'skip':
                    if (newValue !== mem.skip) {
                        mem.skip = newValue;
                        changed = true;
                    }
                    break;
                case 'rtone':
                    const newRtone = newValue ? parseFloat(newValue) : 0;
                    if (newRtone !== mem.rtone) {
                        mem.rtone = newRtone;
                        changed = true;
                    }
                    break;
                case 'ctone':
                    const newCtone = newValue ? parseFloat(newValue) : 0;
                    if (newCtone !== mem.ctone) {
                        mem.ctone = newCtone;
                        changed = true;
                    }
                    break;
                case 'dtcs':
                    const newDtcs = newValue ? parseInt(newValue) : 0;
                    if (newDtcs !== mem.dtcs) {
                        mem.dtcs = newDtcs;
                        changed = true;
                    }
                    break;
            }
            
            // Handle validity
            if (!isValid) {
                this.invalidCells.add(cellKey);
                this.modifiedCells.delete(cellKey);
            } else {
                this.invalidCells.delete(cellKey);
                if (changed) {
                    this.modifiedCells.add(cellKey);
                }
            }
            
            if (changed && isValid) {
                this.pushUndo();
                this.currentImage.setMemory(mem);
                this.modified = true;
                this.renderMemoryGrid();
                this.updateUI();
            } else {
                // Just restore the display and apply classes
                this.updateCellDisplay(td, mem, columnKey);
                td.classList.toggle('modified', this.modifiedCells.has(cellKey));
                td.classList.toggle('invalid', this.invalidCells.has(cellKey));
            }
        } catch (e) {
            console.error('Error saving cell:', e);
            td.textContent = originalValue;
        }
    }

    /**
     * Update cell display value
     */
    updateCellDisplay(td, mem, columnKey) {
        switch (columnKey) {
            case 'freq':
                td.textContent = mem.freq ? formatFreq(mem.freq) : '';
                break;
            case 'offset':
                if (mem.duplex === 'split' || mem.duplex === '+' || mem.duplex === '-') {
                    td.textContent = formatFreq(mem.offset);
                } else {
                    td.textContent = '';
                }
                break;
            case 'duplex':
                td.textContent = mem.duplex || '';
                break;
            case 'tmode':
                td.textContent = mem.tmode || '';
                break;
            case 'mode':
                td.textContent = mem.mode || '';
                break;
            case 'skip':
                td.textContent = mem.skip || '';
                break;
            case 'rtone':
                td.textContent = mem.rtone ? mem.rtone.toFixed(1) : '';
                break;
            case 'ctone':
                td.textContent = mem.ctone ? mem.ctone.toFixed(1) : '';
                break;
            case 'dtcs':
                td.textContent = mem.dtcs ? mem.dtcs.toString().padStart(3, '0') : '';
                break;
            default:
                td.textContent = mem[columnKey] ?? '';
        }
    }

    /**
     * Move to the next/previous editable cell
     */
    moveToNextCell(currentTd, reverse = false) {
        const row = currentTd.closest('tr');
        const cells = Array.from(row.querySelectorAll('td.editable'));
        const currentIndex = cells.indexOf(currentTd);
        
        let nextCell = null;
        
        if (reverse) {
            // Move to previous cell
            if (currentIndex > 0) {
                nextCell = cells[currentIndex - 1];
            } else {
                // Move to previous row, last cell
                const prevRow = row.previousElementSibling;
                if (prevRow) {
                    const prevCells = prevRow.querySelectorAll('td.editable');
                    nextCell = prevCells[prevCells.length - 1];
                }
            }
        } else {
            // Move to next cell
            if (currentIndex < cells.length - 1) {
                nextCell = cells[currentIndex + 1];
            } else {
                // Move to next row, first cell
                const nextRow = row.nextElementSibling;
                if (nextRow) {
                    nextCell = nextRow.querySelector('td.editable');
                }
            }
        }
        
        if (nextCell) {
            nextCell.click();
        }
    }

    /**
     * Handle grid click (selection)
     */
    handleGridClick(event) {
        const row = event.target.closest('tr');
        if (!row || !row.dataset.location) return;
        
        // Don't handle if clicking on editable cell (handled separately)
        const cell = event.target.closest('td');
        if (cell && cell.classList.contains('editable')) {
            return;
        }

        const location = parseInt(row.dataset.location);

        if (event.ctrlKey || event.metaKey) {
            // Toggle selection
            if (this.selectedRows.has(location)) {
                this.selectedRows.delete(location);
            } else {
                this.selectedRows.add(location);
            }
        } else if (event.shiftKey && this.selectedRows.size > 0) {
            // Range selection
            const existing = Array.from(this.selectedRows).sort((a, b) => a - b);
            const start = Math.min(existing[0], location);
            const end = Math.max(existing[existing.length - 1], location);
            for (let i = start; i <= end; i++) {
                this.selectedRows.add(i);
            }
        } else {
            // Single selection
            this.selectedRows.clear();
            this.selectedRows.add(location);
        }

        this.renderMemoryGrid();
        this.updateUI();
    }

    /**
     * Handle grid double-click (edit)
     */
    handleGridDoubleClick(event) {
        const row = event.target.closest('tr');
        if (!row || !row.dataset.location) return;

        const location = parseInt(row.dataset.location);
        this.editMemory(location);
    }

    /**
     * Edit a memory
     */
    editMemory(location) {
        const mem = this.currentImage.getMemory(location);
        
        // Clear any previous invalid styling
        document.querySelectorAll('#edit-form .input-invalid').forEach(el => {
            el.classList.remove('input-invalid');
        });
        
        // Populate edit dialog
        document.getElementById('edit-location').value = location;
        document.getElementById('edit-name').value = mem.name || '';
        document.getElementById('edit-freq').value = mem.freq ? formatFreq(mem.freq) : '';
        document.getElementById('edit-duplex').value = mem.duplex || '';
        document.getElementById('edit-offset').value = mem.offset ? formatFreq(mem.offset) : '';
        document.getElementById('edit-tmode').value = mem.tmode || '';
        document.getElementById('edit-rtone').value = mem.rtone ? mem.rtone : '';
        document.getElementById('edit-ctone').value = mem.ctone ? mem.ctone : '';
        document.getElementById('edit-dtcs').value = mem.dtcs ? mem.dtcs : '';
        document.getElementById('edit-mode').value = mem.mode || '';
        document.getElementById('edit-skip').value = mem.skip || '';
        document.getElementById('edit-power').value = mem.power || '';
        document.getElementById('edit-comment').value = mem.comment || '';

        // Populate select options
        this.populateSelect('edit-tmode', TONE_MODES);
        this.populateSelect('edit-rtone', TONES.map(t => t.toFixed(1)));
        this.populateSelect('edit-ctone', TONES.map(t => t.toFixed(1)));
        this.populateSelect('edit-dtcs', DTCS_CODES.map(d => d.toString().padStart(3, '0')));
        this.populateSelect('edit-mode', MODES);
        this.populateSelect('edit-duplex', DUPLEX);
        this.populateSelect('edit-skip', SKIP_VALUES);

        this.showDialog('edit-dialog');
    }

    /**
     * Populate a select element with options
     * Always adds "(none)" as the first/default option
     */
    populateSelect(id, options, currentValue) {
        const select = document.getElementById(id);
        if (!select) return;

        const current = select.value;
        select.innerHTML = '';
        
        // Always add "(none)" as the first option
        const noneOption = document.createElement('option');
        noneOption.value = '';
        noneOption.textContent = '(none)';
        select.appendChild(noneOption);

        for (const opt of options) {
            // Skip empty values since we already added (none)
            if (opt === '' || opt === null || opt === undefined) continue;
            
            const option = document.createElement('option');
            option.value = opt;
            option.textContent = opt;
            select.appendChild(option);
        }

        select.value = current;
    }

    /**
     * Save edit dialog
     */
    saveEditDialog() {
        // Validate inputs before saving
        const freqInput = document.getElementById('edit-freq');
        const offsetInput = document.getElementById('edit-offset');
        
        let isValid = true;
        
        // Validate frequency
        if (!this.validateFormInput(freqInput, 'edit-freq')) {
            isValid = false;
        }
        
        // Validate offset
        if (!this.validateFormInput(offsetInput, 'edit-offset')) {
            isValid = false;
        }
        
        if (!isValid) {
            this.showStatus('Please correct invalid fields', 3000);
            return;
        }
        
        const location = parseInt(document.getElementById('edit-location').value);
        const mem = this.currentImage.getMemory(location).clone();

        mem.name = document.getElementById('edit-name').value;
        mem.freq = parseFreq(document.getElementById('edit-freq').value);
        mem.duplex = document.getElementById('edit-duplex').value;
        mem.offset = parseFreq(document.getElementById('edit-offset').value);
        mem.tmode = document.getElementById('edit-tmode').value;
        mem.rtone = parseFloat(document.getElementById('edit-rtone').value) || 0;
        mem.ctone = parseFloat(document.getElementById('edit-ctone').value) || 0;
        mem.dtcs = parseInt(document.getElementById('edit-dtcs').value) || 0;
        mem.mode = document.getElementById('edit-mode').value;
        mem.skip = document.getElementById('edit-skip').value;
        mem.power = document.getElementById('edit-power').value;
        mem.comment = document.getElementById('edit-comment').value;
        mem.empty = !mem.freq;

        this.pushUndo();
        this.currentImage.setMemory(mem);
        this.modified = true;
        
        // Track modified cells for these fields
        const modifiedFields = ['name', 'freq', 'duplex', 'offset', 'tmode', 'rtone', 'ctone', 'dtcs', 'mode', 'skip', 'power', 'comment'];
        for (const field of modifiedFields) {
            this.modifiedCells.add(`${location}:${field}`);
        }
        
        this.closeAllDialogs();
        this.renderMemoryGrid();
        this.updateUI();
        this.showStatus(`Updated memory ${location}`);
    }

    /**
     * Show a dialog
     */
    showDialog(id) {
        const dialog = document.getElementById(id);
        if (dialog) {
            dialog.classList.add('visible');
            document.getElementById('dialog-overlay').classList.add('visible');
        }
    }

    /**
     * Close all dialogs
     */
    closeAllDialogs() {
        document.querySelectorAll('.dialog').forEach(d => d.classList.remove('visible'));
        document.getElementById('dialog-overlay')?.classList.remove('visible');
    }

    /**
     * Handle keyboard shortcuts
     */
    handleKeyboard(event) {
        // Don't handle if in input field
        if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
            if (event.key === 'Escape') {
                this.closeAllDialogs();
            }
            return;
        }

        const ctrl = event.ctrlKey || event.metaKey;

        switch (event.key) {
            case 'n':
                if (ctrl) {
                    event.preventDefault();
                    this.newFile();
                }
                break;
            case 'o':
                if (ctrl) {
                    event.preventDefault();
                    this.openFile();
                }
                break;
            case 's':
                if (ctrl) {
                    event.preventDefault();
                    if (event.shiftKey) {
                        this.saveFileAs();
                    } else {
                        this.saveFile();
                    }
                }
                break;
            case 'c':
                if (ctrl) {
                    event.preventDefault();
                    this.copy();
                }
                break;
            case 'x':
                if (ctrl) {
                    event.preventDefault();
                    this.cut();
                }
                break;
            case 'v':
                if (ctrl) {
                    event.preventDefault();
                    this.paste();
                }
                break;
            case 'a':
                if (ctrl) {
                    event.preventDefault();
                    this.selectAll();
                }
                break;
            case 'z':
                if (ctrl) {
                    event.preventDefault();
                    if (event.shiftKey) {
                        this.redo();
                    } else {
                        this.undo();
                    }
                }
                break;
            case 'Delete':
            case 'Backspace':
                if (this.selectedRows.size > 0) {
                    event.preventDefault();
                    this.deleteSelected();
                }
                break;
            case 'Escape':
                this.closeAllDialogs();
                break;
            case 'Enter':
                if (this.selectedRows.size === 1) {
                    this.editMemory(Array.from(this.selectedRows)[0]);
                }
                break;
        }
    }

    /**
     * Push current state to undo stack
     */
    pushUndo() {
        // Save current state
        const state = {
            memories: new Map()
        };
        for (const [num, mem] of this.currentImage.memories) {
            state.memories.set(num, mem.clone());
        }
        this.undoStack.push(state);
        this.redoStack = []; // Clear redo stack
        
        // Limit stack size
        if (this.undoStack.length > 50) {
            this.undoStack.shift();
        }
    }

    /**
     * Undo last action
     */
    undo() {
        if (this.undoStack.length === 0) return;

        // Save current state to redo
        const currentState = {
            memories: new Map()
        };
        for (const [num, mem] of this.currentImage.memories) {
            currentState.memories.set(num, mem.clone());
        }
        this.redoStack.push(currentState);

        // Restore previous state
        const state = this.undoStack.pop();
        this.currentImage.memories = state.memories;
        this.modified = true;
        this.renderMemoryGrid();
        this.updateUI();
        this.showStatus('Undo');
    }

    /**
     * Redo last undone action
     */
    redo() {
        if (this.redoStack.length === 0) return;

        // Save current state to undo
        const currentState = {
            memories: new Map()
        };
        for (const [num, mem] of this.currentImage.memories) {
            currentState.memories.set(num, mem.clone());
        }
        this.undoStack.push(currentState);

        // Restore redo state
        const state = this.redoStack.pop();
        this.currentImage.memories = state.memories;
        this.modified = true;
        this.renderMemoryGrid();
        this.updateUI();
        this.showStatus('Redo');
    }

    /**
     * Copy selected memories
     */
    copy() {
        if (this.selectedRows.size === 0) return;

        this.clipboard = [];
        for (const num of this.selectedRows) {
            const mem = this.currentImage.getMemory(num);
            if (!mem.empty) {
                this.clipboard.push(mem.clone());
            }
        }
        this.updateUI();
        this.showStatus(`Copied ${this.clipboard.length} memories`);
    }

    /**
     * Cut selected memories
     */
    cut() {
        this.copy();
        if (this.clipboard.length > 0) {
            this.deleteSelected();
            this.showStatus(`Cut ${this.clipboard.length} memories`);
        }
    }

    /**
     * Paste memories from clipboard
     */
    paste() {
        if (this.clipboard.length === 0) return;

        this.pushUndo();

        // Find paste location
        let startLoc = 1;
        if (this.selectedRows.size > 0) {
            startLoc = Math.min(...this.selectedRows);
        }

        // Paste memories
        for (let i = 0; i < this.clipboard.length; i++) {
            const mem = this.clipboard[i].clone();
            mem.number = startLoc + i;
            this.currentImage.setMemory(mem);
        }

        this.modified = true;
        this.renderMemoryGrid();
        this.updateUI();
        this.showStatus(`Pasted ${this.clipboard.length} memories`);
    }

    /**
     * Delete selected memories
     */
    deleteSelected() {
        if (this.selectedRows.size === 0) return;

        this.pushUndo();

        for (const num of this.selectedRows) {
            this.currentImage.deleteMemory(num);
        }

        const count = this.selectedRows.size;
        this.selectedRows.clear();
        this.modified = true;
        this.renderMemoryGrid();
        this.updateUI();
        this.showStatus(`Deleted ${count} memories`);
    }

    /**
     * Insert a new row
     */
    insertRow() {
        if (!this.currentImage) return;

        // Find location
        let location = 1;
        if (this.selectedRows.size > 0) {
            location = Math.min(...this.selectedRows);
        }

        this.editMemory(location);
    }

    /**
     * Select all memories
     */
    selectAll() {
        if (!this.currentImage) return;

        this.selectedRows.clear();
        for (const mem of this.currentImage.getAllMemories()) {
            if (!mem.empty) {
                this.selectedRows.add(mem.number);
            }
        }
        this.renderMemoryGrid();
        this.updateUI();
    }

    /**
     * Download from radio
     */
    async downloadFromRadio() {
        if (!SerialConnection.isSupported()) {
            this.showError('Web Serial API is not supported in this browser. Use Chrome or Edge.');
            return;
        }

        // Show radio selection dialog
        this.showRadioDialog('download');
    }
    
    /**
     * Show radio selection dialog
     */
    showRadioDialog(mode) {
        this.radioDialogMode = mode;
        
        // Set up vendor change handler
        const vendorSelect = document.getElementById('radio-vendor');
        const modelSelect = document.getElementById('radio-model');
        const baudSelect = document.getElementById('radio-baud');
        const memsizeSelect = document.getElementById('radio-memsize');
        
        vendorSelect.onchange = () => {
            this.updateRadioModels(vendorSelect.value);
        };
        
        // Restore saved selections from localStorage
        const savedVendor = localStorage.getItem('chirp_radio_vendor');
        const savedModel = localStorage.getItem('chirp_radio_model');
        const savedBaud = localStorage.getItem('chirp_radio_baud');
        const savedMemsize = localStorage.getItem('chirp_radio_memsize');
        
        if (savedVendor) {
            vendorSelect.value = savedVendor;
            this.updateRadioModels(savedVendor);
            
            if (savedModel) {
                modelSelect.value = savedModel;
            }
        } else {
            vendorSelect.value = '';
            modelSelect.innerHTML = '<option value="">-- Select Model --</option>';
        }
        
        if (savedBaud) {
            baudSelect.value = savedBaud;
        } else {
            baudSelect.value = '9600';
        }
        
        if (savedMemsize) {
            memsizeSelect.value = savedMemsize;
        } else {
            memsizeSelect.value = '8192';
        }
        
        this.showDialog('radio-dialog');
    }
    
    /**
     * Get the comprehensive list of supported radio models
     * Uses definitions from radio-defs.js
     */
    getRadioModels() {
        const result = {};
        
        for (const [vendor, models] of Object.entries(RADIO_MODELS)) {
            result[vendor] = [];
            
            for (const [modelId, modelDef] of Object.entries(models)) {
                // Get protocol to determine baud rate
                const protocol = getRadioProtocol(vendor, modelId);
                
                result[vendor].push({
                    value: modelId,
                    label: modelDef.name,
                    baud: modelDef.baudRate || protocol.baudRate || 9600,
                    memsize: modelDef.memSize
                });
            }
            
            // Sort by label
            result[vendor].sort((a, b) => a.label.localeCompare(b.label));
        }
        
        return result;
    }
    
    /**
     * Update radio model dropdown based on vendor
     */
    updateRadioModels(vendor) {
        const modelSelect = document.getElementById('radio-model');
        modelSelect.innerHTML = '<option value="">-- Select Model --</option>';
        
        const models = this.getRadioModels();
        const vendorModels = models[vendor] || [];
        
        for (const model of vendorModels) {
            const option = document.createElement('option');
            option.value = model.value;
            option.textContent = model.label;
            option.dataset.baud = model.baud;
            option.dataset.memsize = model.memsize;
            modelSelect.appendChild(option);
        }
        
        // Restore saved model selection if matching vendor
        const savedVendor = localStorage.getItem('chirp_radio_vendor');
        const savedModel = localStorage.getItem('chirp_radio_model');
        if (savedVendor === vendor && savedModel) {
            modelSelect.value = savedModel;
            // Trigger change to update baud/memsize
            const selected = modelSelect.selectedOptions[0];
            if (selected && selected.dataset.baud) {
                document.getElementById('radio-baud').value = selected.dataset.baud;
            }
            if (selected && selected.dataset.memsize) {
                document.getElementById('radio-memsize').value = selected.dataset.memsize;
            }
        }
        
        // Auto-select settings when model changes
        modelSelect.onchange = () => {
            const selected = modelSelect.selectedOptions[0];
            if (selected && selected.dataset.baud) {
                document.getElementById('radio-baud').value = selected.dataset.baud;
            }
            if (selected && selected.dataset.memsize) {
                document.getElementById('radio-memsize').value = selected.dataset.memsize;
            }
        };
    }
    
    /**
     * Handle radio connect button
     */
    async handleRadioConnect() {
        const vendor = document.getElementById('radio-vendor').value;
        const model = document.getElementById('radio-model').value;
        let baudRate = parseInt(document.getElementById('radio-baud').value);
        const memSize = parseInt(document.getElementById('radio-memsize').value);
        
        // Get the protocol's recommended baud rate and use it if different
        const protocol = getRadioProtocol(vendor, model);
        if (protocol.baudRate && protocol.baudRate !== baudRate) {
            console.log(`Overriding baud rate ${baudRate} with protocol baud rate ${protocol.baudRate}`);
            baudRate = protocol.baudRate;
        }
        
        if (!vendor) {
            this.showError('Please select a vendor');
            return;
        }
        
        // Save selections to localStorage for next time
        localStorage.setItem('chirp_radio_vendor', vendor);
        localStorage.setItem('chirp_radio_model', model);
        localStorage.setItem('chirp_radio_baud', baudRate.toString());
        localStorage.setItem('chirp_radio_memsize', memSize.toString());
        
        this.closeAllDialogs();
        
        if (this.radioDialogMode === 'download') {
            await this.doRadioDownload(vendor, model, baudRate, memSize);
        } else {
            await this.doRadioUpload(vendor, model, baudRate);
        }
    }
    
    /**
     * Perform the actual radio download
     */
    async doRadioDownload(vendor, model, baudRate, memSize) {
        try {
            this.serialConnection = new SerialConnection();
            
            if (!await this.serialConnection.requestPort()) {
                return; // User cancelled
            }

            this.showStatus('Connecting to radio...', 0);

            console.log('Opening serial port with baud rate:', baudRate);
            await this.serialConnection.open({
                baudRate: baudRate,
                dataBits: 8,
                stopBits: 1,
                parity: 'none',
                flowControl: 'none'
            });
            
            // Set DTR and RTS signals - required for some programming cables
            try {
                await this.serialConnection.setSignals({ dataTerminalReady: true, requestToSend: true });
                console.log('DTR/RTS signals set');
            } catch (e) {
                console.log('Could not set DTR/RTS signals:', e.message);
            }
            
            // Small delay after opening connection
            await new Promise(r => setTimeout(r, 100));

            this.showStatus(`Downloading from ${vendor} radio...`, 0);

            const clone = new RadioClone(this.serialConnection);
            clone.setRadio(vendor, model);
            clone.onProgress = (progress) => {
                this.showStatus(progress.message, 0);
            };

            // Download memory
            const data = await clone.download(memSize);
            
            // Get the protocol used for parsing (includes memory format)
            const protocol = getRadioProtocol(vendor, model);
            const protocolName = protocol.modelDef?.protocol || 'generic';
            
            console.log('Parsing downloaded data with protocol:', protocolName);
            console.log('Memory format:', protocol.memoryFormat ? 'defined' : 'using fallback');
            
            // Parse the downloaded data into Memory objects using generic parser
            const memories = parseRadioMemory(data, protocolName, vendor, model, protocol);
            
            // Count non-empty memories
            const nonEmptyCount = memories.filter(m => !m.empty).length;
            console.log(`Parsed ${memories.length} channels, ${nonEmptyCount} with data`);
            
            // Create image from parsed data
            this.currentImage = new RadioImage(`${vendor}_${model || 'radio'}.img`, memories.length);
            this.currentImage._rawData = data;  // Keep raw data for export
            this.currentImage._protocol = protocolName;
            this.currentImage._vendor = vendor;
            this.currentImage._model = model;
            
            // Set parsed memories
            for (const mem of memories) {
                this.currentImage.setMemory(mem);
            }
            
            this.modified = false;  // Just downloaded, not modified yet
            this.modifiedCells.clear();
            this.invalidCells.clear();
            this.renderMemoryGrid();
            this.updateUI();
            this.showStatus(`Download complete - ${nonEmptyCount} channels found`);

        } catch (error) {
            this.showError(`Download failed: ${error.message}`);
        } finally {
            if (this.serialConnection) {
                try {
                    await this.serialConnection.close();
                } catch (e) {
                    console.log('Error closing connection:', e);
                }
                this.serialConnection = null;
            }
        }
    }

    /**
     * Upload to radio
     */
    async uploadToRadio() {
        if (!this.currentImage) {
            this.showError('No file open');
            return;
        }

        if (!SerialConnection.isSupported()) {
            this.showError('Web Serial API is not supported in this browser');
            return;
        }

        // Show radio selection dialog
        this.showRadioDialog('upload');
    }
    
    /**
     * Perform the actual radio upload
     */
    async doRadioUpload(vendor, model, baudRate) {
        if (!confirm('Upload to radio? This will overwrite the radio memory.')) {
            return;
        }
        
        // Check if we have data to upload
        if (!this.currentImage || !this.currentImage._rawData) {
            this.showError('No data to upload. Please download from radio first or load a file.');
            return;
        }

        try {
            this.serialConnection = new SerialConnection();
            
            if (!await this.serialConnection.requestPort()) {
                return;
            }
            
            // Get the protocol's recommended baud rate
            const protocol = getRadioProtocol(vendor, model);
            if (protocol.baudRate && protocol.baudRate !== baudRate) {
                console.log(`Overriding baud rate ${baudRate} with protocol baud rate ${protocol.baudRate}`);
                baudRate = protocol.baudRate;
            }

            this.showStatus('Connecting to radio...', 0);
            
            console.log('Opening serial port with baud rate:', baudRate);
            await this.serialConnection.open({
                baudRate: baudRate,
                dataBits: 8,
                stopBits: 1,
                parity: 'none',
                flowControl: 'none'
            });
            
            // Set DTR and RTS signals
            try {
                await this.serialConnection.setSignals({ dataTerminalReady: true, requestToSend: true });
                console.log('DTR/RTS signals set');
            } catch (e) {
                console.log('Could not set DTR/RTS signals:', e.message);
            }
            
            await new Promise(r => setTimeout(r, 100));

            this.showStatus(`Uploading to ${vendor} ${model}...`, 0);

            const clone = new RadioClone(this.serialConnection);
            clone.setRadio(vendor, model);
            clone.onProgress = (progress) => {
                this.showStatus(progress.message, 0);
            };

            // Serialize memories back to binary format before uploading
            const protocolName = this.currentImage._protocol || protocol.modelDef?.protocol || 'generic';
            
            // Get all memories from the current image
            const memories = [];
            const [lo, hi] = this.currentImage.features.memoryBounds;
            for (let i = lo; i <= hi; i++) {
                memories.push(this.currentImage.getMemory(i));
            }
            
            console.log(`Serializing ${memories.length} memories for upload`);
            
            // Serialize memories to binary format
            const originalData = this.currentImage._rawData;
            const data = serializeRadioMemory(memories, originalData, protocolName, protocol);
            
            console.log(`Uploading ${data.length} bytes to radio`);
            
            await clone.upload(data);

            this.modified = false;
            this.modifiedCells.clear();
            this.renderMemoryGrid();
            this.showStatus('Upload complete');

        } catch (error) {
            this.showError(`Upload failed: ${error.message}`);
        } finally {
            if (this.serialConnection) {
                try {
                    await this.serialConnection.close();
                } catch (e) {
                    console.log('Error closing connection:', e);
                }
                this.serialConnection = null;
            }
        }
    }

    /**
     * Show RepeaterBook dialog
     */
    showRepeaterBookDialog() {
        // Populate country select
        const countrySelect = document.getElementById('rb-country');
        if (countrySelect) {
            countrySelect.innerHTML = '';
            for (const country of ALL_COUNTRIES) {
                const option = document.createElement('option');
                option.value = country;
                option.textContent = country;
                countrySelect.appendChild(option);
            }
            countrySelect.value = 'United States';
            this.updateStateSelect('United States');
        }

        // Populate band select
        const bandSelect = document.getElementById('rb-band');
        if (bandSelect) {
            bandSelect.innerHTML = '<option value="">All Bands</option>';
            for (const band of BANDS) {
                const option = document.createElement('option');
                option.value = band.name;
                option.textContent = band.name;
                bandSelect.appendChild(option);
            }
        }

        // Populate mode select
        const modeSelect = document.getElementById('rb-mode');
        if (modeSelect) {
            modeSelect.innerHTML = '<option value="">All Modes</option>';
            for (const mode of RB_MODES) {
                const option = document.createElement('option');
                option.value = mode;
                option.textContent = mode;
                modeSelect.appendChild(option);
            }
        }

        // Clear results
        document.getElementById('rb-results').innerHTML = '';

        this.showDialog('repeaterbook-dialog');
    }

    /**
     * Update state select based on country
     */
    updateStateSelect(country) {
        const stateSelect = document.getElementById('rb-state');
        if (!stateSelect) return;

        const states = getStatesForCountry(country);
        stateSelect.innerHTML = '<option value="">All States</option>';
        
        for (const state of states) {
            const option = document.createElement('option');
            option.value = state;
            option.textContent = state;
            stateSelect.appendChild(option);
        }
    }

    /**
     * Search RepeaterBook
     */
    async searchRepeaterBook() {
        const country = document.getElementById('rb-country').value;
        const state = document.getElementById('rb-state').value;
        const band = document.getElementById('rb-band').value;
        const mode = document.getElementById('rb-mode').value;
        const openOnly = document.getElementById('rb-open-only')?.checked ?? true;

        const resultsDiv = document.getElementById('rb-results');
        resultsDiv.innerHTML = '<p>Searching...</p>';

        try {
            const client = new RepeaterBookClient();
            
            const memories = await client.query({
                country,
                state,
                band,
                mode,
                use: openOnly ? 'open' : '',
                onProgress: (p) => {
                    resultsDiv.innerHTML = `<p>${p.message}</p>`;
                }
            });

            if (memories.length === 0) {
                resultsDiv.innerHTML = '<p>No results found</p>';
                return;
            }

            // Display results
            let html = `<p>Found ${memories.length} repeaters</p>`;
            html += '<table class="rb-results-table"><thead><tr>';
            html += '<th><input type="checkbox" id="rb-select-all"></th>';
            html += '<th>Freq</th><th>Offset</th><th>Tone</th><th>Call</th><th>Location</th>';
            html += '</tr></thead><tbody>';

            for (const mem of memories.slice(0, 100)) { // Limit to 100
                html += `<tr data-index="${mem.number}">`;
                html += `<td><input type="checkbox" class="rb-select" value="${mem.number}"></td>`;
                html += `<td>${formatFreq(mem.freq)}</td>`;
                html += `<td>${mem.duplex}${mem.duplex ? formatFreq(mem.offset) : ''}</td>`;
                html += `<td>${mem.tmode} ${mem.rtone || ''}</td>`;
                html += `<td>${mem.name}</td>`;
                html += `<td>${mem.comment.substring(0, 50)}</td>`;
                html += '</tr>';
            }

            html += '</tbody></table>';
            html += '<button id="rb-import-selected" class="btn btn-primary">Import Selected</button>';
            
            resultsDiv.innerHTML = html;

            // Store results for import
            this._rbResults = memories;

            // Bind import button
            document.getElementById('rb-import-selected')?.addEventListener('click', () => {
                this.importRepeaterBookResults();
            });

            // Bind select all
            document.getElementById('rb-select-all')?.addEventListener('change', (e) => {
                document.querySelectorAll('.rb-select').forEach(cb => {
                    cb.checked = e.target.checked;
                });
            });

        } catch (error) {
            resultsDiv.innerHTML = `<p class="error">Error: ${error.message}</p>`;
        }
    }

    /**
     * Import selected RepeaterBook results
     */
    importRepeaterBookResults() {
        const selected = Array.from(document.querySelectorAll('.rb-select:checked'))
            .map(cb => parseInt(cb.value));

        if (selected.length === 0) {
            this.showError('No repeaters selected');
            return;
        }

        this.pushUndo();

        // Find next available slot
        let nextSlot = 1;
        for (const mem of this.currentImage.getAllMemories()) {
            if (!mem.empty) {
                nextSlot = mem.number + 1;
            }
        }

        // Import selected
        let count = 0;
        for (const index of selected) {
            const mem = this._rbResults.find(m => m.number === index);
            if (mem) {
                const newMem = mem.clone();
                newMem.number = nextSlot++;
                this.currentImage.setMemory(newMem);
                count++;
            }
        }

        this.modified = true;
        this.closeAllDialogs();
        this.renderMemoryGrid();
        this.updateUI();
        this.showStatus(`Imported ${count} repeaters`);
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.chirpApp = new ChirpApp();
});

export { ChirpApp };
