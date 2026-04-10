let songs = [];
let player;
let currentSong;

// DOM Element caching
let statusEl;
let curtainEl;
let startBtnEl;
let guessAreaEl;
let guessTitleEl;
let guessArtistEl;

document.addEventListener('DOMContentLoaded', () => {
    statusEl = document.getElementById('status');
    curtainEl = document.getElementById('curtain');
    startBtnEl = document.getElementById('start-btn');
    guessAreaEl = document.getElementById('guess-area');
    guessTitleEl = document.getElementById('guess-title');
    guessArtistEl = document.getElementById('guess-artist');

    loadSongs();
});

// Load songs from JSON
async function loadSongs() {
    try {
        const response = await fetch('songs.json');
        songs = await response.json();
        console.log('Songs loaded:', songs);
        if (curtainEl) curtainEl.innerText = "Bereit zum Starten";
    } catch (error) {
        console.error('Error loading songs:', error);
        if (statusEl) statusEl.innerHTML = "Fehler beim Laden der Songs.<br><small>Falls du die Datei lokal öffnest, nutze einen Webserver (z.B. Live Server).</small>";
    }
}

// 2. YouTube IFrame API laden
var tag = document.createElement('script');
tag.src = "https://www.youtube.com/iframe_api";
var firstScriptTag = document.getElementsByTagName('script')[0];
if (firstScriptTag) {
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
} else {
    document.body.appendChild(tag);
}

function onYouTubeIframeAPIReady() {
    player = new YT.Player('player', {
        height: '360',
        width: '640',
        videoId: '', // Wird später gesetzt
        playerVars: {
            'controls': 0, // Keine Youtube-Controls anzeigen
            'showinfo': 0,
            'rel': 0,
            'origin': window.location.origin // Wichtig für CORS / Embedding
        },
        events: {
            'onStateChange': onPlayerStateChange,
            'onError': onPlayerError
        }
    });
}

function onPlayerError(event) {
    console.error("YouTube Player Error:", event.data);
    let errorMsg = "Ein Fehler ist aufgetreten.";
    if (event.data === 150 || event.data === 101) {
        errorMsg = "Dieses Video darf nicht eingebettet werden.";
    }
    if (statusEl) statusEl.innerText = "⚠️ " + errorMsg;
}

function onPlayerStateChange(event) {
    // Wenn das Video läuft und das Ende des Ausschnitts erreicht ist -> Stoppen
    if (event.data == YT.PlayerState.PLAYING && currentSong) {
        player.unMute(); // Sicherstellen, dass der Ton an ist
        player.setVolume(100);
        checkTime();
    }
}

function checkTime() {
    // Prüfen ob wir das Ende des Snippets erreicht haben
    if(player && currentSong && player.getCurrentTime() > currentSong.end) {
        player.pauseVideo();
    } else {
        // Weiter prüfen alle 100ms
        if(player && player.getPlayerState() == 1) { // 1 = playing
            setTimeout(checkTime, 100);
        }
    }
}

// 3. Spiel-Logik
function startGame() {
    if (songs.length === 0) {
        alert("Songs werden noch geladen oder konnten nicht geladen werden.");
        return;
    }

    // Zufälligen Song wählen
    currentSong = songs[Math.floor(Math.random() * songs.length)];

    // Vorhang ZIEHEN (Verstecken)
    if (curtainEl) {
        curtainEl.classList.remove('hidden');
        curtainEl.innerText = "🔊 Hör gut zu...";
    }

    // UI anpassen
    if (startBtnEl) startBtnEl.classList.add('hidden');
    if (guessAreaEl) guessAreaEl.classList.remove('hidden');
    if (statusEl) statusEl.innerText = "Song läuft...";
    if (guessTitleEl) guessTitleEl.value = "";
    if (guessArtistEl) guessArtistEl.value = "";

    // Video laden und springen
    if (player && typeof player.loadVideoById === 'function') {
        player.loadVideoById({
            videoId: currentSong.videoId,
            startSeconds: currentSong.start,
            endSeconds: currentSong.end // Optionaler Parameter für Autostop
        });
    } else {
        console.error("Player noch nicht bereit.");
    }
}

function checkAnswer() {
    let guessTitle = guessTitleEl ? guessTitleEl.value : "";
    let guessArtist = guessArtistEl ? guessArtistEl.value : "";

    let titleCorrect = checkSimilarity(guessTitle, currentSong.title);
    let artistCorrect = checkSimilarity(guessArtist, currentSong.artist);

    if (titleCorrect && artistCorrect) {
        if (statusEl) statusEl.innerText = "✅ Richtig! Es ist " + currentSong.title + " von " + currentSong.artist;
        reveal(false);
    } else {
        if (statusEl) statusEl.innerText = "❌ Leider falsch. Probier es nochmal!";
    }
}

function checkSimilarity(s1, s2) {
    s1 = s1.toLowerCase().trim();
    s2 = s2.toLowerCase().trim();

    if (s1 === s2) return true; // Exact match

    const len = Math.max(s1.length, s2.length);
    if (len === 0) return false;

    const dist = levenshtein(s1, s2);

    // Allow up to 3 typos or 30% difference
    return dist <= 3 && (dist / len) <= 0.3;
}

function levenshtein(a, b) {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substitution
                    Math.min(
                        matrix[i][j - 1] + 1, // insertion
                        matrix[i - 1][j] + 1  // deletion
                    )
                );
            }
        }
    }
    return matrix[b.length][a.length];
}

function reveal(updateStatus = true) {
    // Vorhang ÖFFNEN (Video zeigen)
    if (curtainEl) curtainEl.classList.add('hidden');

    if (updateStatus && statusEl) {
        statusEl.innerText = "Lösung: " + currentSong.artist + " - " + currentSong.title;
    }

    // UI Reset vorbereiten
    if (startBtnEl) {
        startBtnEl.classList.remove('hidden');
        startBtnEl.innerText = "Nächster Song";
    }
    if (guessAreaEl) guessAreaEl.classList.add('hidden');
}
