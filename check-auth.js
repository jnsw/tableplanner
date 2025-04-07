// Führe Authentifizierungsprüfung aus, bevor die Anwendung geladen wird
(function() {
    // Cookie auslesen
    function getCookie(name) {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop().split(';').shift();
        return null;
    }
    
    // Workspace aus URL abrufen
    const urlParams = new URLSearchParams(window.location.search);
    const workspaceParam = urlParams.get('workspace');
    
    // Auth-Cookie prüfen
    const authCookie = getCookie('tischplaner_auth');
    
    if (!workspaceParam) {
        // Kein Workspace-Parameter: zur Login-Seite umleiten
        window.location.href = 'login.html';
        return;
    }
    
    if (!authCookie || authCookie !== workspaceParam) {
        // Ungültiger oder fehlender Auth-Cookie: zur Login-Seite umleiten
        window.location.href = `login.html?workspace=${encodeURIComponent(workspaceParam)}`;
        return;
    }
    
    // Prüfen, ob der Workspace existiert
    if (!localStorage.getItem(`tischplaner_${workspaceParam}`)) {
        // Workspace existiert nicht, zur Login-Seite umleiten
        window.location.href = `login.html?workspace=${encodeURIComponent(workspaceParam)}`;
        return;
    }
    
    // Alle Prüfungen bestanden, Anwendung kann geladen werden
    console.log('Authentifizierung erfolgreich für Workspace:', workspaceParam);
    
    // Workspace-Namen in der UI anzeigen (wenn die Seite fertig geladen ist)
    document.addEventListener('DOMContentLoaded', function() {
        // Titel anpassen
        document.title = `Tischplaner - ${workspaceParam}`;

        // Falls ein Element für den Workspace-Namen existiert
        const workspaceElement = document.getElementById('workspace-name');
        if (workspaceElement) {
            workspaceElement.textContent = workspaceParam;
        }

        // Logout-Button hinzufügen
        const actionButtons = document.querySelector('.action-buttons');
        if (actionButtons) {
            const logoutButton = document.createElement('button');
            logoutButton.id = 'logout-btn';
            logoutButton.textContent = 'Abmelden';
            logoutButton.style.backgroundColor = '#e74c3c';
            logoutButton.addEventListener('click', function() {
                // Auth-Cookie löschen
                document.cookie = 'tischplaner_auth=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Strict';
                // Zur Login-Seite umleiten
                window.location.href = 'login.html';
            });
            actionButtons.appendChild(logoutButton);
        }
    });
})();
