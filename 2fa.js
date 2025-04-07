document.addEventListener('DOMContentLoaded', function() {
    // DOM-Elemente
    const workspaceInput = document.getElementById('workspace');
    const continueBtn = document.getElementById('continue-btn');
    const tokenInput = document.getElementById('token');
    const loginBtn = document.getElementById('login-btn');
    const setupTokenInput = document.getElementById('setup-token');
    const verifyBtn = document.getElementById('verify-btn');
    const messageElement = document.getElementById('message');

    // Sections
    const loginSection = document.getElementById('login-section');
    const tokenSection = document.getElementById('token-section');
    const setupSection = document.getElementById('setup-section');

    // Event-Listener
    continueBtn.addEventListener('click', checkWorkspace);
    loginBtn.addEventListener('click', verifyToken);
    verifyBtn.addEventListener('click', verifySetupToken);

    // Bei Seiten-Load den Workspace aus der URL auslesen
    const urlParams = new URLSearchParams(window.location.search);
    const workspaceParam = urlParams.get('workspace');
    if (workspaceParam) {
        workspaceInput.value = workspaceParam;
        checkWorkspace(); // Automatisch weiter, wenn Workspace in URL
    }

    // Funktionen
    function checkWorkspace() {
        const workspace = workspaceInput.value.trim();

        if (!workspace) {
            showMessage('Bitte gib einen Workspace-Namen ein.', true);
            return;
        }

        // Prüfen, ob der Workspace bereits existiert
        const secret = localStorage.getItem(`tischplaner_${workspace}`);

        if (secret) {
            // Workspace existiert, Token-Eingabe anzeigen
            loginSection.classList.add('hidden');
            tokenSection.classList.remove('hidden');
            tokenInput.focus();

            // URL aktualisieren
            updateUrl(workspace);
        } else {
            // Neuen Workspace erstellen
            setupNewWorkspace(workspace);
        }
    }

    function setupNewWorkspace(workspace) {
        // Neuen geheimen Schlüssel generieren
        const secret = generateSecret();

        // QR-Code generieren
        generateQrCode(workspace, secret);

        // UI aktualisieren
        loginSection.classList.add('hidden');
        setupSection.classList.remove('hidden');

        // URL aktualisieren
        updateUrl(workspace);
    }

    function generateSecret() {
        // Zufällige Bytes generieren (16 Bytes)
        const randomBytes = new Uint8Array(16);
        window.crypto.getRandomValues(randomBytes);

        // In Base32 kodieren
        const base32Secret = base32Encode(randomBytes);

        return base32Secret;
    }

    function base32Encode(buffer) {
        const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
        let result = '';
        let bits = 0;
        let value = 0;

        for (let i = 0; i < buffer.length; i++) {
            value = (value << 8) | buffer[i];
            bits += 8;

            while (bits >= 5) {
                result += alphabet[(value >>> (bits - 5)) & 31];
                bits -= 5;
            }
        }

        if (bits > 0) {
            result += alphabet[(value << (5 - bits)) & 31];
        }

        return result;
    }

    function generateQrCode(workspace, secret) {
        // QR-Code-Container leeren
        const qrcodeContainer = document.getElementById('qrcode');
        qrcodeContainer.innerHTML = '';

        // TOTP-URI nach RFC 6238 erstellen (otpauth://totp/LABEL?secret=SECRET&issuer=ISSUER)
        const issuer = 'Tischplaner';
        const label = encodeURIComponent(`${issuer}:${workspace}`);
        const otpauthUrl = `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

        // QR-Code erstellen
        new QRCode(qrcodeContainer, {
            text: otpauthUrl,
            width: 200,
            height: 200,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H
        });

        // Secret temporär speichern (wird erst nach Verifizierung dauerhaft gespeichert)
        sessionStorage.setItem(`temp_secret_${workspace}`, secret);
    }

    function verifySetupToken() {
        const workspace = workspaceInput.value.trim();
        const token = setupTokenInput.value.trim();

        if (!token || token.length !== 6 || !/^\d+$/.test(token)) {
            showMessage('Bitte gib einen gültigen 6-stelligen Code ein.', true);
            return;
        }

        // Temporäres Secret laden
        const secret = sessionStorage.getItem(`temp_secret_${workspace}`);
        if (!secret) {
            showMessage('Fehler: Secret nicht gefunden. Bitte Seite neu laden.', true);
            return;
        }

        // Prüfen, ob der Token gültig ist
        if (validateToken(token, secret)) {
            // Secret dauerhaft speichern
            localStorage.setItem(`tischplaner_${workspace}`, secret);
            sessionStorage.removeItem(`temp_secret_${workspace}`);

            // Erfolg melden und zur Hauptseite weiterleiten
            showMessage('Workspace erfolgreich eingerichtet! Du wirst weitergeleitet...', false);

            // Nach 2 Sekunden weiterleiten
            setTimeout(() => {
                redirectToMainApp(workspace);
            }, 2000);
        } else {
            showMessage('Ungültiger Code. Bitte überprüfe, ob der Code noch gültig ist.', true);
        }
    }

    function verifyToken() {
        const workspace = workspaceInput.value.trim();
        const token = tokenInput.value.trim();

        if (!token || token.length !== 6 || !/^\d+$/.test(token)) {
            showMessage('Bitte gib einen gültigen 6-stelligen Code ein.', true);
            return;
        }

        // Secret laden
        const secret = localStorage.getItem(`tischplaner_${workspace}`);
        if (!secret) {
            showMessage('Fehler: Workspace nicht gefunden.', true);
            return;
        }

        // Prüfen, ob der Token gültig ist
        if (validateToken(token, secret)) {
            // Erfolg melden und zur Hauptseite weiterleiten
            showMessage('Login erfolgreich! Du wirst weitergeleitet...', false);

            // Nach 1 Sekunde weiterleiten
            setTimeout(() => {
                redirectToMainApp(workspace);
            }, 1000);
        } else {
            showMessage('Ungültiger Code. Bitte überprüfe, ob der Code noch gültig ist.', true);
        }
    }

    function validateToken(token, secret) {
        try {
            // Aktuelle Zeit in 30-Sekunden-Schritten
            const timeStep = 30;
            const timeCounter = Math.floor(Date.now() / 1000 / timeStep);

            // Prüfen für aktuellen Counter und vorherigen (für Zeitversatz)
            return (
                checkTotp(secret, timeCounter, token) ||
                checkTotp(secret, timeCounter - 1, token) ||
                checkTotp(secret, timeCounter + 1, token)
            );
        } catch (error) {
            console.error('Fehler bei der Token-Validierung:', error);
            return false;
        }
    }

    function checkTotp(secret, counter, token) {
        // HMAC-basierte Einmalkennwort-Berechnung (RFC 6238)
        const shaObj = new jsSHA("SHA-1", "HEX");

        // Counter als 8-Byte-Hex-String
        const counterHex = leftPad(counter.toString(16), 16, '0');

        shaObj.setHMACKey(secret, "HEX");
        shaObj.update(counterHex);
        const hmac = shaObj.getHMAC("HEX");

        // Dynamisch Abschneiden (RFC 4226)
        const offset = parseInt(hmac.charAt(hmac.length - 1), 16);
        const truncatedHash = hmac.substr(offset * 2, 8);
        const truncatedHashInt = parseInt(truncatedHash, 16) & 0x7fffffff;

        // 6-stelligen Code erzeugen
        const code = (truncatedHashInt % 1000000).toString().padStart(6, '0');

        return code === token;
    }

    // Hilfsfunktion für Padding
    function leftPad(str, len, char) {
        while (str.length < len) {
            str = char + str;
        }
        return str;
    }

    function showMessage(text, isError) {
        messageElement.textContent = text;
        messageElement.classList.remove('hidden', 'error', 'success');
        messageElement.classList.add(isError ? 'error' : 'success');

        // Nach 5 Sekunden wieder ausblenden
        setTimeout(() => {
            messageElement.classList.add('hidden');
        }, 5000);
    }

    function updateUrl(workspace) {
        const url = new URL(window.location.href);
        url.searchParams.set('workspace', workspace);
        window.history.replaceState({}, '', url);
    }

    function redirectToMainApp(workspace) {
        // Token als Session-Cookie setzen
        const expirationTime = new Date();
        expirationTime.setTime(expirationTime.getTime() + (4 * 60 * 60 * 1000)); // 4 Stunden
        document.cookie = `tischplaner_auth=${workspace}; expires=${expirationTime.toUTCString()}; path=/; SameSite=Strict`;

        // Zur Hauptseite weiterleiten
        window.location.href = `tischplaner.html?workspace=${encodeURIComponent(workspace)}`;
    }
});
