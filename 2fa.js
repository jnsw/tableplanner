// Base32 encoding & decoding functions
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

function base32Decode(base32) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = 0;
    let value = 0;
    let bytes = [];

    for (let i = 0; i < base32.length; i++) {
        const char = base32.charAt(i).toUpperCase();
        const index = alphabet.indexOf(char);
        if (index === -1) continue; // Skip non-alphabet chars

        value = (value << 5) | index;
        bits += 5;

        if (bits >= 8) {
            bytes.push((value >>> (bits - 8)) & 0xFF);
            bits -= 8;
        }
    }

    return new Uint8Array(bytes);
}

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
        validateToken(token, secret).then(isValid => {
            if (isValid) {
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
        }).catch(error => {
            console.error('Fehler bei der Token-Validierung:', error);
            showMessage('Fehler bei der Validierung. Bitte versuche es erneut.', true);
        });
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
        validateToken(token, secret).then(isValid => {
            if (isValid) {
                // Erfolg melden und zur Hauptseite weiterleiten
                showMessage('Login erfolgreich! Du wirst weitergeleitet...', false);

                // Nach 1 Sekunde weiterleiten
                setTimeout(() => {
                    redirectToMainApp(workspace);
                }, 1000);
            } else {
                showMessage('Ungültiger Code. Bitte überprüfe, ob der Code noch gültig ist.', true);
            }
        }).catch(error => {
            console.error('Fehler bei der Token-Validierung:', error);
            showMessage('Fehler bei der Validierung. Bitte versuche es erneut.', true);
        });
    }

    async function validateToken(token, secret) {
        try {
            // Aktuelle Zeit in 30-Sekunden-Schritten
            const timeStep = 30;
            const timeCounter = Math.floor(Date.now() / 1000 / timeStep);

            // Prüfen für aktuellen Counter und vorherigen (für Zeitversatz)
            const results = await Promise.all([
                generateTOTP(secret, timeCounter),
                generateTOTP(secret, timeCounter - 1),
                generateTOTP(secret, timeCounter + 1)
            ]);

            return results.includes(token);
        } catch (error) {
            console.error('Fehler bei der Token-Validierung:', error);
            throw error;
        }
    }

    async function generateTOTP(secret, counter) {
        try {
            // Secret in Bytes umwandeln (Base32-Decoding)
            const secretBytes = base32Decode(secret);
            
            // Counter als 8-Byte-Array
            const counterBytes = new Uint8Array(8);
            for (let i = 7; i >= 0; i--) {
                counterBytes[i] = counter & 0xff;
                counter = counter >>> 8;
            }

            // HMAC-SHA1 mit Web Crypto API
            const key = await window.crypto.subtle.importKey(
                'raw',
                secretBytes,
                { name: 'HMAC', hash: 'SHA-1' },
                false,
                ['sign']
            );

            const signature = await window.crypto.subtle.sign(
                'HMAC',
                key,
                counterBytes
            );

            // Dynamisches Abschneiden (RFC 4226)
            const hmacResult = new Uint8Array(signature);
            const offset = hmacResult[hmacResult.length - 1] & 0xf;
            
            // 4-Byte Binary Code (siehe RFC 4226 Section 5.4)
            let code = (hmacResult[offset] & 0x7f) << 24 |
                      (hmacResult[offset + 1] & 0xff) << 16 |
                      (hmacResult[offset + 2] & 0xff) << 8 |
                      (hmacResult[offset + 3] & 0xff);

            // 6-stelliger Code
            code = code % 1000000;
            return code.toString().padStart(6, '0');
        } catch (error) {
            console.error('Fehler bei TOTP-Generierung:', error);
            throw error;
        }
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
        window.location.href = `index.html?workspace=${encodeURIComponent(workspace)}`;
    }
});