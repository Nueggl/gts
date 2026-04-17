// --- EINSTELLUNGEN ---
const clientId = CONFIG.SPOTIFY_CLIENT_ID;
const redirectUri = 'http://127.0.0.1:5500/'; 

// --- VARIABLEN ---
let token;
let deviceId;
let spotifyPlayer;

// --- 1. PKCE HILFSFUNKTIONEN (Kryptografie) ---
function generateRandomString(length) {
    let text = '';
    let possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

async function generateCodeChallenge(codeVerifier) {
    function base64encode(string) {
        return btoa(String.fromCharCode.apply(null, new Uint8Array(string)))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
    }
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    return base64encode(digest);
}

// --- 2. LOGIN STARTEN ---
async function loginWithSpotify() {
    let codeVerifier = generateRandomString(128);
    // Wir speichern den Verifier kurz im Browser, damit wir ihn nach dem Neuladen noch haben
    localStorage.setItem('code_verifier', codeVerifier);

    let codeChallenge = await generateCodeChallenge(codeVerifier);
    let scope = 'streaming user-read-email user-read-private';
    
    let args = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        scope: scope,
        redirect_uri: redirectUri,
        code_challenge_method: 'S256',
        code_challenge: codeChallenge
    });

    window.location = 'https://accounts.spotify.com/authorize?' + args;
}

// --- 3. TOKEN ABRUFEN (Nach dem Redirect) ---
const urlParams = new URLSearchParams(window.location.search);
let code = urlParams.get('code');

if (code) {
    // Wir haben den Code aus der URL! Jetzt tauschen wir ihn gegen den Token.
    let codeVerifier = localStorage.getItem('code_verifier');

    let body = new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri,
        client_id: clientId,
        code_verifier: codeVerifier
    });

    fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: body
    })
    .then(response => {
        if (!response.ok) throw new Error('HTTP status ' + response.status);
        return response.json();
    })
    .then(data => {
        token = data.access_token;
        console.log("✅ Spotify Token erfolgreich über PKCE erhalten!");
        
        // URL wieder sauber machen, damit wir bei F5 nicht nochmal versuchen den Code zu tauschen
        window.history.replaceState({}, document.title, window.location.pathname);
        
        // Wenn wir den Token haben, bauen wir den Player auf (sofern das SDK schon geladen ist)
        if (window.Spotify) {
            initSpotifyPlayer();
        }
    })
    .catch(error => {
        console.error('Fehler beim Token-Abruf:', error);
    });
} else if (!token) {
    // Wenn wir weder Token noch Code haben, zeigen wir den Login Button
    const loginBtn = document.createElement('button');
    loginBtn.innerText = "🎧 Mit Spotify verbinden";
    loginBtn.style.padding = "15px 30px";
    loginBtn.style.fontSize = "18px";
    loginBtn.style.backgroundColor = "#1DB954";
    loginBtn.style.color = "white";
    loginBtn.style.border = "none";
    loginBtn.style.borderRadius = "50px";
    loginBtn.style.cursor = "pointer";
    loginBtn.style.margin = "20px";
    loginBtn.style.fontWeight = "bold";
    
    loginBtn.onclick = loginWithSpotify; // Ruft unsere neue PKCE Funktion auf
    document.body.prepend(loginBtn);
}

// --- 4. SPOTIFY PLAYER BAUEN ---
function initSpotifyPlayer() {
    if (!token) return;

    spotifyPlayer = new Spotify.Player({
        name: 'Guess The Song Web Player',
        getOAuthToken: cb => { cb(token); },
        volume: 0.5
    });

    spotifyPlayer.addListener('ready', ({ device_id }) => {
        console.log('✅ Spotify Player ist bereit! Device ID:', device_id);
        deviceId = device_id;
    });

    spotifyPlayer.addListener('not_ready', ({ device_id }) => {
        console.log('❌ Gerät offline', device_id);
    });

    spotifyPlayer.connect();
}

// Diese Funktion ruft Spotify auf, wenn das Skript von deren Server geladen ist
window.onSpotifyWebPlaybackSDKReady = () => {
    // Falls der Token schon da ist, direkt starten
    if (token) {
        initSpotifyPlayer();
    }
};

// --- 5. FUNKTIONEN FÜRS SPIEL ---
function spieleSong(spotifyUri, startSekunde) {
    if (!deviceId || !token) {
        console.error("⚠️ Spotify Player nicht bereit oder nicht eingeloggt!");
        return;
    }

    // Umrechnung in Millisekunden für Spotify
    const startPunktMs = startSekunde * 1000; 

    console.log("Spiele Song:", spotifyUri, "ab Sekunde:", startSekunde);

    fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
        method: 'PUT',
        body: JSON.stringify({ 
            uris: [spotifyUri], 
            position_ms: startPunktMs 
        }),
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
    }).then(response => {
        if (!response.ok) {
            console.error("Spotify Play Fehler:", response.status);
        }
    });
}

// Stopp-Funktion bleibt gleich
function stoppeSpotify() {
    if (spotifyPlayer) {
        spotifyPlayer.pause();
    }
}

function stoppeSpotify() {
    if(spotifyPlayer) {
        spotifyPlayer.pause().then(() => {
            console.log('⏸️ Spotify pausiert!');
        });
    }
}