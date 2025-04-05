document.addEventListener('DOMContentLoaded', function() {
    // DOM-Elemente
    const roomElement = document.getElementById('room');
    const roomWidthInput = document.getElementById('roomWidth');
    const roomHeightInput = document.getElementById('roomHeight');
    const tableCountInput = document.getElementById('tableCount');
    const tableSizeInput = document.getElementById('tableSize');
    const guestListInput = document.getElementById('guestList');
    const createRoomButton = document.getElementById('createRoom');
    const autoArrangeButton = document.getElementById('autoArrange');
    const addGuestsButton = document.getElementById('addGuests');
    const clearGuestsButton = document.getElementById('clearGuests');
    const saveLayoutButton = document.getElementById('saveLayout');
    const loadLayoutButton = document.getElementById('loadLayout');
    const unassignedGuestsList = document.getElementById('unassignedGuestsList');
    const seatingList = document.getElementById('seatingList');
    const lastSyncElement = document.querySelector('.last-sync');
    
    // Zustandsvariablen
    let tables = [];
    let guests = [];
    let unassignedGuests = [];
    let selectedGuest = null;
    let draggingTable = null;
    let offsetX = 0;
    let offsetY = 0;
    let roomWidth = 10; // Standardgröße in Metern
    let roomHeight = 10; // Standardgröße in Metern
    let pixelsPerMeter = 60; // Skalierungsfaktor (Pixel pro Meter)
    let tableSize = 1.2; // Tischgröße in Metern
    const repulsionForce = 0.5; // Stärke der Abstoßung
    let autoSaveTimeout = null; // Timeout für Autosave
    
    // Tooltip Element
    const tooltip = document.createElement('div');
    tooltip.className = 'tooltip';
    tooltip.style.display = 'none';
    document.body.appendChild(tooltip);
    
    // DOM-Elemente für neue Buttons
    const exportJSONButton = document.getElementById('exportJSON');
    const importJSONButton = document.getElementById('importJSON');

    // Event-Listener
    createRoomButton.addEventListener('click', setupRoom);
    autoArrangeButton.addEventListener('click', autoArrangeTables);
    addGuestsButton.addEventListener('click', addGuestsFromInput);
    clearGuestsButton.addEventListener('click', resetGuests);
    saveLayoutButton.addEventListener('click', saveLayout);
    loadLayoutButton.addEventListener('click', loadLayout);
    exportJSONButton.addEventListener('click', exportToJSON);
    importJSONButton.addEventListener('click', importFromJSON);
    
    // Live updates for room dimensions
    roomWidthInput.addEventListener('input', updateRoomDimensions);
    roomHeightInput.addEventListener('input', updateRoomDimensions);
    tableSizeInput.addEventListener('input', updateTableSize);
    
    // Hilfsfunktionen
    function setupRoom() {
        // Raumgrößen-Einstellungen lesen
        roomWidth = parseFloat(roomWidthInput.value) || 10;
        roomHeight = parseFloat(roomHeightInput.value) || 10;
        const tableCount = parseInt(tableCountInput.value) || 10;
        tableSize = parseFloat(tableSizeInput.value) || 1.2;
        
        // Raum konfigurieren
        const roomPixelWidth = roomWidth * pixelsPerMeter;
        const roomPixelHeight = roomHeight * pixelsPerMeter;
        roomElement.style.width = roomPixelWidth + 'px';
        roomElement.style.height = roomPixelHeight + 'px';
        
        // Alte Tische und Gäste entfernen
        clearRoom();
        
        // Neue Tische erstellen
        createTables(tableCount);
        
        // Sitzplan aktualisieren
        updateSeatingList();
    }
    
    function clearRoom() {
        roomElement.innerHTML = '';
        tables = [];
        resetGuests();
    }
    
    function addGuestsFromInput() {
        const guestListText = guestListInput.value.trim();
        
        if (guestListText) {
            const newGuests = guestListText.split(',')
                .map(name => name.trim())
                .filter(name => name.length > 0 && !guests.some(g => g.name === name))
                .map(name => ({
                    name: name,
                    tableId: null,
                    position: null
                }));
            
            // Vorhandene Gäste behalten
            guests = [...guests, ...newGuests];
            unassignedGuests = [...unassignedGuests, ...newGuests];
            
            // Gästeliste-Textfeld leeren
            guestListInput.value = '';
            
            // GUI aktualisieren
            renderUnassignedGuests();
            updateSeatingList();
        }
    }
    
    function createTables(count) {
        const tableSizePixels = tableSize * pixelsPerMeter;
        const roomPixelWidth = roomWidth * pixelsPerMeter;
        const roomPixelHeight = roomHeight * pixelsPerMeter;
        
        for (let i = 0; i < count; i++) {
            const table = document.createElement('div');
            table.className = 'table';
            table.textContent = (i + 1);
            table.dataset.id = i;
            
            // Tischgröße setzen
            table.style.width = tableSizePixels + 'px';
            table.style.height = tableSizePixels + 'px';
            
            // Zufällige Position innerhalb des Raums (mit 20px padding)
            const maxX = roomPixelWidth - tableSizePixels - 40;
            const maxY = roomPixelHeight - tableSizePixels - 40;
            const x = Math.floor(Math.random() * maxX) + 20;
            const y = Math.floor(Math.random() * maxY) + 20;
            
            table.style.left = x + 'px';
            table.style.top = y + 'px';
            
            // Lock button
            const lockBtn = document.createElement('div');
            lockBtn.className = 'lock-btn';
            lockBtn.innerHTML = '🔓';
            lockBtn.dataset.locked = 'false';
            table.appendChild(lockBtn);
            table.dataset.locked = 'false'; // Add locked state to table element

            // Event-Listener für Drag & Drop
            table.addEventListener('mousedown', (e) => {
                if (table.dataset.locked === 'true') {
                    e.preventDefault();
                    return false;
                }
                startDraggingTable(e);
            });
            table.addEventListener('click', handleTableClick);
            lockBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const isLocked = lockBtn.dataset.locked === 'true';
                lockBtn.dataset.locked = !isLocked;
                table.dataset.locked = !isLocked;
                lockBtn.innerHTML = isLocked ? '🔓' : '🔒';
                
                // Update table appearance
                if (isLocked) {
                    table.style.backgroundColor = '#3498db';
                } else {
                    table.style.backgroundColor = '#2ecc71';
                }
            });
            
            // Tisch zum Raum hinzufügen
            roomElement.appendChild(table);
            
            // Tischobjekt speichern
            tables.push({
                id: i,
                element: table,
                x: x,
                y: y,
                size: tableSizePixels,
                guests: []
            });
        }
    }
    
    function startDraggingTable(event) {
        if (selectedGuest) return; // Wenn ein Gast ausgewählt ist, kein Dragging erlauben
        
        draggingTable = event.currentTarget;
        const tableRect = draggingTable.getBoundingClientRect();
        offsetX = event.clientX - tableRect.left;
        offsetY = event.clientY - tableRect.top;
        
        // Event-Listeners für Dragging
        document.addEventListener('mousemove', dragTable);
        document.addEventListener('mouseup', stopDraggingTable);
        
        // Style anpassen um anzuzeigen, dass der Tisch bewegt wird
        draggingTable.style.zIndex = '100';
        draggingTable.style.opacity = '0.8';
        
        event.preventDefault();
    }
    
    function dragTable(event) {
        if (!draggingTable) return;
        
        const roomRect = roomElement.getBoundingClientRect();
        const tableSize = parseFloat(draggingTable.style.width);
        const tableId = parseInt(draggingTable.dataset.id);
        const isLocked = draggingTable.dataset.locked === 'true';
        
        // Skip if table is locked
        if (isLocked) {
            stopDraggingTable();
            return;
        }

        let newX = event.clientX - roomRect.left - offsetX;
        let newY = event.clientY - roomRect.top - offsetY;
        
        // Check boundaries (accounting for 20px padding)
        newX = Math.max(20, Math.min(newX, roomRect.width - tableSize - 20));
        newY = Math.max(20, Math.min(newY, roomRect.height - tableSize - 20));
        
        // Apply repulsion from all other tables
        const currentTable = tables.find(t => t.id === tableId);
        let totalRepulsionX = 0;
        let totalRepulsionY = 0;
        
        tables.forEach(otherTable => {
            if (otherTable.id !== tableId) {
                const repulsion = calculateRepulsion(currentTable, otherTable);
                totalRepulsionX += repulsion.x;
                totalRepulsionY += repulsion.y;
                
                // If other table isn't locked, apply opposite repulsion to it
                if (otherTable.element.dataset.locked === 'false') {
                    otherTable.x -= repulsion.x;
                    otherTable.y -= repulsion.y;
                    otherTable.element.style.left = otherTable.x + 'px';
                    otherTable.element.style.top = otherTable.y + 'px';
                    updateGuestsPositions(otherTable.id);
                }
            }
        });
        
        // Apply repulsion to current table
        newX += totalRepulsionX;
        newY += totalRepulsionY;
        
        // Update current table position
        draggingTable.style.left = newX + 'px';
        draggingTable.style.top = newY + 'px';
        
        draggingTable.style.left = newX + 'px';
        draggingTable.style.top = newY + 'px';
        
        // Gäste mit dem Tisch bewegen
        updateTablePosition(tableId, newX, newY);
        updateGuestsPositions(tableId);
    }
    
    function checkCollision(table1, table2) {
        const dx = table1.x + table1.size/2 - (table2.x + table2.size/2);
        const dy = table1.y + table1.size/2 - (table2.y + table2.size/2);
        const distance = Math.sqrt(dx * dx + dy * dy);
        return distance < table1.size;
    }
    
    function calculateRepulsion(table1, table2) {
        const center1 = {
            x: table1.x + table1.size/2,
            y: table1.y + table1.size/2
        };
        const center2 = {
            x: table2.x + table2.size/2,
            y: table2.y + table2.size/2
        };
        
        const dx = center1.x - center2.x;
        const dy = center1.y - center2.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Minimum distance to avoid overlap (110% of table size)
        const minDistance = table1.size * 1.1;
        
        if (distance < minDistance) {
            // Calculate repulsion force based on overlap
            const overlap = minDistance - distance;
            const angle = Math.atan2(dy, dx);
            
            return {
                x: Math.cos(angle) * overlap * repulsionForce,
                y: Math.sin(angle) * overlap * repulsionForce
            };
        }
        
        return { x: 0, y: 0 }; // No repulsion needed
    }
    
    function stopDraggingTable() {
        if (!draggingTable) return;
        
        // Style zurücksetzen
        draggingTable.style.zIndex = '';
        draggingTable.style.opacity = '';
        
        // Event-Listeners entfernen
        document.removeEventListener('mousemove', dragTable);
        document.removeEventListener('mouseup', stopDraggingTable);
        
        // Auto-save nach Bewegung
        scheduleAutoSave();
        
        draggingTable = null;
    }
    
    // Automatisches Speichern planen
    function scheduleAutoSave() {
        // Clear any existing timeout
        if (autoSaveTimeout) {
            clearTimeout(autoSaveTimeout);
        }
        
        // Set new timeout to save after 2 seconds of inactivity
        autoSaveTimeout = setTimeout(() => {
            autoSaveLayout();
        }, 2000);
    }
    
    // Automatisch Layout speichern
    function autoSaveLayout() {
        const layout = getLayoutData();
        const layoutJSON = JSON.stringify(layout);
        
        // Speichern im localStorage
        localStorage.setItem('tableLayout', layoutJSON);
        
        // Timestamp aktualisieren
        updateSyncTimestamp();
        
        // Console Log
        console.log('Layout auto-saved:', layout);
    }
    
    // Timestamp aktualisieren
    function updateSyncTimestamp() {
        const now = new Date();
        const timeString = now.toLocaleTimeString();
        lastSyncElement.textContent = `Last synced: ${timeString}`;
    }
    
    // Layout-Daten extrahieren
    function getLayoutData() {
        return {
            roomWidth,
            roomHeight,
            tableSize,
            tables: tables.map(table => ({
                id: table.id,
                x: table.x,
                y: table.y,
                locked: table.element.dataset.locked === 'true',
                guests: table.guests.map(guest => ({
                    name: guest.name,
                    position: guest.position
                }))
            })),
            allGuests: guests.map(guest => guest.name)
        };
    }
    
    function updateTablePosition(tableId, x, y) {
        const table = tables.find(t => t.id === tableId);
        if (table) {
            table.x = x;
            table.y = y;
        }
    }
    
    // Live update der Raumdimensionen
    function updateRoomDimensions() {
        roomWidth = parseFloat(roomWidthInput.value) || 10;
        roomHeight = parseFloat(roomHeightInput.value) || 10;
        
        // Raum-Element aktualisieren
        const roomPixelWidth = roomWidth * pixelsPerMeter;
        const roomPixelHeight = roomHeight * pixelsPerMeter;
        roomElement.style.width = roomPixelWidth + 'px';
        roomElement.style.height = roomPixelHeight + 'px';
        
        // Tische anpassen, damit sie innerhalb der neuen Grenzen bleiben
        adjustTablesToFitRoom();
        
        // Auto-save nach Änderung
        scheduleAutoSave();
    }
    
    // Live update der Tischgröße
    function updateTableSize() {
        tableSize = parseFloat(tableSizeInput.value) || 1.2;
        const tableSizePixels = tableSize * pixelsPerMeter;
        
        // Größe aller Tische aktualisieren
        tables.forEach(table => {
            table.size = tableSizePixels;
            table.element.style.width = tableSizePixels + 'px';
            table.element.style.height = tableSizePixels + 'px';
            updateGuestsPositions(table.id);
        });
        
        // Auto-save nach Änderung
        scheduleAutoSave();
    }
    
    // Tische innerhalb der neuen Raumgrenzen anpassen
    function adjustTablesToFitRoom() {
        const roomPixelWidth = roomWidth * pixelsPerMeter;
        const roomPixelHeight = roomHeight * pixelsPerMeter;
        
        tables.forEach(table => {
            const maxX = roomPixelWidth - table.size - 40;
            const maxY = roomPixelHeight - table.size - 40;
            
            // Tischposition anpassen
            let newX = Math.min(table.x, maxX);
            let newY = Math.min(table.y, maxY);
            
            // Positionen aktualisieren, aber nur wenn nötig
            if (newX !== table.x || newY !== table.y) {
                table.x = newX;
                table.y = newY;
                table.element.style.left = newX + 'px';
                table.element.style.top = newY + 'px';
                updateGuestsPositions(table.id);
            }
        });
    }

    function autoArrangeTables() {
        const roomPixelWidth = roomWidth * pixelsPerMeter;
        const roomPixelHeight = roomHeight * pixelsPerMeter;
        const tableSizePixels = tableSize * pixelsPerMeter;
        const padding = tableSizePixels * 0.5; // Abstand zwischen Tischen
        
        // Bestimme, wie viele Tische in eine Reihe passen
        const availableWidth = roomPixelWidth - padding * 2;
        const tablesPerRow = Math.floor(Math.sqrt(tables.length));
        
        if (tablesPerRow === 0) return;
        
        const spaceBetween = (availableWidth - tablesPerRow * tableSizePixels) / (tablesPerRow - 1 || 1);
        
        // Tische anordnen, nur nicht-gesperrte Tische verschieben
        tables.forEach((table, index) => {
            // Wenn der Tisch gesperrt ist, nicht verschieben
            if (table.element.dataset.locked === 'true') {
                return;
            }
            
            const row = Math.floor(index / tablesPerRow);
            const col = index % tablesPerRow;
            
            const x = padding + col * (tableSizePixels + spaceBetween);
            const y = padding + row * (tableSizePixels + spaceBetween);
            
            table.x = x;
            table.y = y;
            table.element.style.left = x + 'px';
            table.element.style.top = y + 'px';
            
            // Gäste ebenfalls aktualisieren
            updateGuestsPositions(table.id);
        });
        
        // Auto-save nach Arrangieren
        scheduleAutoSave();
    }
    
    function handleTableClick(event) {
        const tableId = parseInt(event.currentTarget.dataset.id);
        
        if (selectedGuest) {
            // Wenn ein Gast ausgewählt ist, ihn diesem Tisch zuweisen
            assignGuestToTable(selectedGuest, tableId);
            selectedGuest = null;
            
            // Auswahl zurücksetzen
            const selectedElement = document.querySelector('.guest-item.selected');
            if (selectedElement) {
                selectedElement.classList.remove('selected');
                selectedElement.style.border = '';
            }
            
            // Sitzplan aktualisieren
            updateSeatingList();
        }
    }
    
    function assignGuestToTable(guest, tableId) {
        const table = tables.find(t => t.id === tableId);
        if (!table) return;
        
        // Gast-Objekt aktualisieren
        guest.tableId = tableId;
        
        // Aus der unzugewiesenen Liste entfernen
        unassignedGuests = unassignedGuests.filter(g => g.name !== guest.name);
        
        // Zum Tisch hinzufügen
        table.guests.push(guest);
        
        // GUI aktualisieren
        renderUnassignedGuests();
        renderGuestsAtTable(table);
        
        // Nach Zuweisung speichern
        scheduleAutoSave();
    }
    
    function renderGuestsAtTable(table) {
        // Zuerst alle Gäste von diesem Tisch entfernen
        const existingGuests = roomElement.querySelectorAll(`.guest[data-table="${table.id}"]`);
        existingGuests.forEach(element => element.remove());
        
        // Dann alle neu rendern
        const guestCount = table.guests.length;
        const tableSizePixels = table.size;
        const roomPixelWidth = roomWidth * pixelsPerMeter;
        const roomPixelHeight = roomHeight * pixelsPerMeter;
        const tableCenter = {
            x: table.x + tableSizePixels / 2,
            y: table.y + tableSizePixels / 2
        };
        
        const guestSize = Math.min(tableSizePixels * 0.25, 30); // Gästegröße
        const guestRadius = tableSizePixels / 2 + guestSize / 2 + 5; // Radius, auf dem die Gäste platziert werden
        
        table.guests.forEach((guest, idx) => {
            // Position um den Tisch herum berechnen
            const angle = (idx / guestCount) * 2 * Math.PI;
            let x = tableCenter.x + Math.cos(angle) * guestRadius - guestSize / 2;
            let y = tableCenter.y + Math.sin(angle) * guestRadius - guestSize / 2;
            
            // Sicherstellen, dass Gäste innerhalb des Raums bleiben
            const padding = 5;
            x = Math.max(padding, Math.min(x, roomPixelWidth - guestSize - padding));
            y = Math.max(padding, Math.min(y, roomPixelHeight - guestSize - padding));
            
            // Position speichern
            guest.position = { x, y };
            
            // Gast-Element erstellen
            const guestElement = document.createElement('div');
            guestElement.className = 'guest';
            guestElement.dataset.name = guest.name;
            guestElement.dataset.table = table.id;
            guestElement.textContent = getInitials(guest.name, 2); // 2 Buchstaben anzeigen
            guestElement.style.width = guestSize + 'px';
            guestElement.style.height = guestSize + 'px';
            guestElement.style.left = x + 'px';
            guestElement.style.top = y + 'px';
            
            // Tooltip für den Namen bei Hover
            guestElement.addEventListener('mouseover', (e) => {
                tooltip.textContent = guest.name;
                tooltip.style.display = 'block';
                updateTooltipPosition(e);
            });
            
            guestElement.addEventListener('mousemove', updateTooltipPosition);
            
            guestElement.addEventListener('mouseout', () => {
                tooltip.style.display = 'none';
            });
            
            // Klick-Event zum Entfernen des Gastes vom Tisch
            guestElement.addEventListener('click', (e) => {
                e.stopPropagation(); // Verhindert, dass das Tisch-Click-Event ausgelöst wird
                removeGuestFromTable(guest);
                updateSeatingList(); // Sitzplan aktualisieren
            });
            
            roomElement.appendChild(guestElement);
        });
    }
    
    function updateTooltipPosition(e) {
        tooltip.style.left = (e.pageX + 10) + 'px';
        tooltip.style.top = (e.pageY + 10) + 'px';
    }
    
    function updateGuestsPositions(tableId) {
        const table = tables.find(t => t.id === tableId);
        if (table) {
            renderGuestsAtTable(table);
        }
    }
    
    function removeGuestFromTable(guest) {
        // Gast vom Tisch entfernen
        const tableId = guest.tableId;
        const table = tables.find(t => t.id === tableId);
        
        if (table) {
            table.guests = table.guests.filter(g => g.name !== guest.name);
            renderGuestsAtTable(table);
        }
        
        // Gast zu unzugewiesenen hinzufügen
        guest.tableId = null;
        guest.position = null;
        unassignedGuests.push(guest);
        
        // GUI aktualisieren
        renderUnassignedGuests();
        
        // Nach Entfernung speichern
        scheduleAutoSave();
    }
    
    function renderUnassignedGuests() {
        unassignedGuestsList.innerHTML = '';
        
        unassignedGuests.forEach(guest => {
            const guestElement = document.createElement('div');
            guestElement.className = 'guest-item';
            guestElement.textContent = guest.name;
            
            guestElement.addEventListener('click', () => {
                // Auswahl umschalten
                if (selectedGuest === guest) {
                    selectedGuest = null;
                    guestElement.classList.remove('selected');
                    guestElement.style.border = '';
                } else {
                    // Vorherige Auswahl zurücksetzen
                    const prevSelected = document.querySelector('.guest-item.selected');
                    if (prevSelected) {
                        prevSelected.classList.remove('selected');
                        prevSelected.style.border = '';
                    }
                    
                    selectedGuest = guest;
                    guestElement.classList.add('selected');
                    guestElement.style.border = '2px solid #2ecc71';
                }
            });
            
            unassignedGuestsList.appendChild(guestElement);
        });
    }
    
    function resetGuests() {
        // Alle Gäste von Tischen entfernen
        const guestElements = roomElement.querySelectorAll('.guest');
        guestElements.forEach(el => el.remove());
        
        // Gästeliste zurücksetzen
        tables.forEach(table => {
            table.guests = [];
        });
        
        // Alle Gäste sind nun unzugewiesen
        unassignedGuests = [...guests];
        selectedGuest = null;
        
        // GUI aktualisieren
        renderUnassignedGuests();
        updateSeatingList();
    }
    
    function getInitials(name, maxLength = 2) {
        if (!name) return '';
        
        // Variante 1: Nur die ersten Buchstaben jedes Wortes
        const initials = name.split(' ')
            .map(part => part.charAt(0))
            .join('')
            .toUpperCase();
            
        if (maxLength <= 2) {
            return initials.substring(0, maxLength);
        }
        
        // Variante 2: Erste drei Buchstaben des ersten Namens
        const firstNamePart = name.split(' ')[0];
        return firstNamePart.substring(0, maxLength).toUpperCase();
    }
    
    function updateSeatingList() {
        seatingList.innerHTML = '';
        
        // Nach Tischnummer sortieren
        const sortedTables = [...tables].sort((a, b) => a.id - b.id);
        
        // Für jeden Tisch die Gästeliste erstellen
        sortedTables.forEach(table => {
            if (table.guests.length === 0) return; // Leere Tische überspringen
            
            const tableGroup = document.createElement('div');
            tableGroup.className = 'table-group';
            
            const tableTitle = document.createElement('h4');
            tableTitle.textContent = `Tisch ${table.id + 1}`;
            tableGroup.appendChild(tableTitle);
            
            const tableGuestList = document.createElement('div');
            tableGuestList.className = 'table-guest-list';
            
            // Sortierte Gästeliste
            const sortedGuests = [...table.guests].sort((a, b) => a.name.localeCompare(b.name));
            
            sortedGuests.forEach(guest => {
                const guestItem = document.createElement('p');
                guestItem.textContent = guest.name;
                tableGuestList.appendChild(guestItem);
            });
            
            tableGroup.appendChild(tableGuestList);
            seatingList.appendChild(tableGroup);
        });
    }
    
    function saveLayout() {
        const layout = getLayoutData();
        const layoutJSON = JSON.stringify(layout);
        localStorage.setItem('tableLayout', layoutJSON);
        
        // Timestamp aktualisieren
        updateSyncTimestamp();
        
        // Console Log
        console.log('Layout manually saved:', layout);
        
        alert('Layout gespeichert!');
    }
    
    function loadLayout() {
        const layoutJSON = localStorage.getItem('tableLayout');
        if (!layoutJSON) {
            alert('Kein gespeichertes Layout gefunden!');
            return;
        }
        
        try {
            const layout = JSON.parse(layoutJSON);
            applyLayoutFromData(layout);
            
            // Timestamp aktualisieren
            updateSyncTimestamp();
            
            // Console Log
            console.log('Layout manually loaded:', layout);
            
            alert('Layout geladen!');
        } catch (error) {
            console.error('Fehler beim Laden des Layouts:', error);
            alert('Fehler beim Laden des Layouts!');
        }
    }
    
    // Layout-Daten anwenden
    function applyLayoutFromData(layout) {
        // Einstellungen laden
        roomWidthInput.value = layout.roomWidth || 10;
        roomHeightInput.value = layout.roomHeight || 10;
        tableSizeInput.value = layout.tableSize || 1.2;
        tableCountInput.value = layout.tables.length;
        
        // Gästeliste laden
        guests = layout.allGuests.map(name => ({
            name: name,
            tableId: null,
            position: null
        }));
        
        // Raum erstellen
        setupRoom();
        
        // Tische positionieren
        layout.tables.forEach(savedTable => {
            const table = tables.find(t => t.id === savedTable.id);
            if (table) {
                table.x = savedTable.x;
                table.y = savedTable.y;
                table.element.style.left = savedTable.x + 'px';
                table.element.style.top = savedTable.y + 'px';
                
                // Lock-Status wiederherstellen
                if (savedTable.locked) {
                    table.element.dataset.locked = 'true';
                    table.element.style.backgroundColor = '#2ecc71';
                    const lockBtn = table.element.querySelector('.lock-btn');
                    if (lockBtn) {
                        lockBtn.dataset.locked = 'true';
                        lockBtn.innerHTML = '🔒';
                    }
                }
                
                // Gäste zuweisen
                savedTable.guests.forEach(savedGuest => {
                    const guest = guests.find(g => g.name === savedGuest.name);
                    if (guest) {
                        assignGuestToTable(guest, table.id);
                    }
                });
            }
        });
        
        // Sitzplan aktualisieren
        updateSeatingList();
    }
    
    // Lokalen Speicher beim ersten Laden prüfen und automatisch laden
    function checkLocalStorage() {
        const layoutJSON = localStorage.getItem('tableLayout');
        if (layoutJSON) {
            try {
                const layout = JSON.parse(layoutJSON);
                
                // Automatisch laden
                applyLayoutFromData(layout);
                
                // Timestamp aktualisieren
                updateSyncTimestamp();
                
                // Console Log
                console.log('Layout automatically loaded from cache:', layout);
            } catch (error) {
                console.error('Fehler beim Laden des gespeicherten Layouts:', error);
                console.log('Kein gültiges Layout im Cache gefunden');
                lastSyncElement.textContent = 'Last synced: Never (no valid cache found)';
            }
        } else {
            console.log('Kein Layout im Cache gefunden');
            lastSyncElement.textContent = 'Last synced: Never (no cache found)';
        }
    }
    
    // JSON Export/Import Funktionen
    function exportToJSON() {
        const layout = getLayoutData();
        
        const now = new Date();
        const timestamp = now.toISOString().replace(/[:.]/g, '-');
        const filename = `tischplaner_layout_${timestamp}.json`;
        const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(layout, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute('href', dataStr);
        downloadAnchorNode.setAttribute('download', filename);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
        
        console.log('Layout exported to JSON:', layout);
    }

    function importFromJSON() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';

        input.onchange = e => {
            const file = e.target.files[0];
            const reader = new FileReader();
            
            reader.onload = event => {
                try {
                    const layout = JSON.parse(event.target.result);
                    
                    // Layout anwenden
                    applyLayoutFromData(layout);
                    
                    // Automatisch in den Cache speichern
                    localStorage.setItem('tableLayout', JSON.stringify(layout));
                    
                    // Timestamp aktualisieren
                    updateSyncTimestamp();
                    
                    // Console Log
                    console.log('Layout imported from JSON and saved to cache:', layout);
                    
                    alert('Layout erfolgreich importiert!');
                } catch (error) {
                    console.error('Fehler beim Importieren des Layouts:', error);
                    alert('Fehler beim Importieren des Layouts!');
                }
            };
            
            reader.readAsText(file);
        };
        
        input.click();
    }

    // Initialisierung
    checkLocalStorage();
    // Nur setupRoom aufrufen, wenn kein Layout aus dem Cache geladen wurde
    if (!localStorage.getItem('tableLayout')) {
        setupRoom();
    }
});
