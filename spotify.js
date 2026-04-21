// --- EINSTELLUNGEN ---
const clientId = CONFIG.SPOTIFY_CLIENT_ID;
const redirectUri = 'http://127.0.0.1:5500/'; 

// --- VARIABLEN ---
let token;
let deviceId;
let spotifyPlayer;

// --- 1. PKCE & LOKALER SPEICHER HILFSFUNKTIONEN ---
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

// Speichert den Token mit einem Zeitstempel (Ablauf in 60 Min)
function setTokenWithExpiry(accessToken) {
    const now = new Date();
    const item = {
        token: accessToken,
        expiry: now.getTime() + 3600000, // 3.600.000 ms = 1 Stunde
    };
    localStorage.setItem("spotify_access_token", JSON.stringify(item));
}

// Prüft, ob ein gültiger (nicht abgelaufener) Token existiert
function getValidToken() {
    const itemStr = localStorage.getItem("spotify_access_token");
    if (!itemStr) return null;
    
    const item = JSON.parse(itemStr);
    const now = new Date();
    
    if (now.getTime() > item.expiry) {
        localStorage.removeItem("spotify_access_token");
        return null;
    }
    return item.token;
}

// --- 2. LOGIN STARTEN ---
async function loginWithSpotify() {
    let codeVerifier = generateRandomString(128);
    // Wir speichern den Verifier kurz im Browser
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

// --- 3. TOKEN ABRUFEN ODER AUS DEM CACHE LADEN ---
const urlParams = new URLSearchParams(window.location.search);
let code = urlParams.get('code');
let cachedToken = getValidToken();

if (cachedToken) {
    // FALL 1: Wir haben einen gültigen Token gespeichert!
    token = cachedToken;
    console.log("♻️ Nutze gespeicherten Token aus dem Browser (gültig für < 60 Min)");
    
    // Falls das SDK schon da ist, direkt starten
    if (window.Spotify) {
        initSpotifyPlayer();
    }
} else if (code) {
    // FALL 2: Wir haben den Code aus der URL! Jetzt tauschen wir ihn gegen den Token.
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
        
        // --- NEU: Den frischen Token abspeichern ---
        setTokenWithExpiry(token);

        // URL wieder sauber machen
        window.history.replaceState({}, document.title, window.location.pathname);
        
        // Wenn wir den Token haben, bauen wir den Player auf
        if (window.Spotify) {
            initSpotifyPlayer();
        }
    })
    .catch(error => {
        console.error('Fehler beim Token-Abruf:', error);
    });
} else if (!token) {
    // FALL 3: Weder Token noch Code da -> Login Button zeigen
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
    
    loginBtn.onclick = loginWithSpotify; 
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

window.onSpotifyWebPlaybackSDKReady = () => {
    // Falls der Token schon da ist, direkt starten
    if (token) {
        initSpotifyPlayer();
    }
};

// --- 5. FUNKTIONEN FÜRS SPIEL ---
// --- 5. FUNKTIONEN FÜRS SPIEL ---
// --- 5. FUNKTIONEN FÜRS SPIEL ---
function spieleSong(spotifyUri, startSekunde) {
    if (!deviceId || !token || !spotifyPlayer) {
        console.error("⚠️ Spotify Player nicht bereit oder nicht eingeloggt!");
        return;
    }

    const startPunktMs = startSekunde * 1000; 
    console.log("Lade Song:", spotifyUri, "ab Sekunde:", startSekunde);

    // 1. Schauen, wie laut der Player gerade ist
    spotifyPlayer.getVolume().then(volume => {
        let aktuelleLautstaerke = volume;
        
        // Wenn er sowieso schon (fast) stumm ist, direkt loslegen
        if (aktuelleLautstaerke <= 0.05) {
            starteNeuenSong(spotifyUri, startPunktMs);
            return;
        }

        // 2. FADE-OUT EFFEKT (0,25 Sekunden)
        const outSchritte = 10;
        const outZeitProSchritt = 25; // 10 * 25ms = 250ms (0,25 Sekunden)
        const verringerung = aktuelleLautstaerke / outSchritte;

        const fadeOutInterval = setInterval(() => {
            aktuelleLautstaerke -= verringerung;
            
            if (aktuelleLautstaerke <= 0) {
                aktuelleLautstaerke = 0;
                clearInterval(fadeOutInterval); // Fade-Out stoppen
                
                // Jetzt ist es stumm -> Neuen Song laden!
                spotifyPlayer.setVolume(0).then(() => {
                    starteNeuenSong(spotifyUri, startPunktMs);
                });
            } else {
                spotifyPlayer.setVolume(aktuelleLautstaerke);
            }
        }, outZeitProSchritt);
    });
}

// Hilfsfunktion: Übernimmt das Laden und Einblenden
function starteNeuenSong(spotifyUri, startPunktMs) {
    // WICHTIG: Die echte Spotify URL mit ${deviceId}
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
            return;
        }
        
        // 3. FADE-IN EFFEKT (1 Sekunde)
        let aktuelleLautstaerke = 0;
        const zielLautstaerke = 0.5; // Standard-Lautstärke (50%)
        const schritte = 20;
        const zeitProSchritt = 50; // 20 * 50ms = 1000ms (1 Sekunde)
        const erhoehung = zielLautstaerke / schritte;

        const fadeInInterval = setInterval(() => {
            aktuelleLautstaerke += erhoehung;
            
            if (aktuelleLautstaerke >= zielLautstaerke) {
                aktuelleLautstaerke = zielLautstaerke;
                clearInterval(fadeInInterval);
            }
            spotifyPlayer.setVolume(aktuelleLautstaerke);
        }, zeitProSchritt);
    });
}

function stoppeSpotify() {
    if(spotifyPlayer) {
        spotifyPlayer.pause().then(() => {
            console.log('⏸️ Spotify pausiert!');
        });
    }
}