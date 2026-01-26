let songs = [];
let player;
let currentSong;
let timer;

// Load songs from JSON
async function loadSongs() {
    try {
        const response = await fetch('songs.json');
        songs = await response.json();
        console.log('Songs loaded:', songs);
    } catch (error) {
        console.error('Error loading songs:', error);
        document.getElementById('status').innerHTML = "Fehler beim Laden der Songs.<br><small>Falls du die Datei lokal öffnest, nutze einen Webserver (z.B. Live Server).</small>";
    }
}

// 2. YouTube IFrame API laden
var tag = document.createElement('script');
tag.src = "https://www.youtube.com/iframe_api";
var firstScriptTag = document.getElementsByTagName('script')[0];
// Ensure firstScriptTag exists, otherwise append to head/body (though normally there's always one script tag if we insert this file)
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
    document.getElementById('status').innerText = "⚠️ " + errorMsg;
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
    document.getElementById('curtain').classList.remove('hidden');
    document.getElementById('curtain').innerText = "🔊 Hör gut zu...";

    // UI anpassen
    document.getElementById('start-btn').classList.add('hidden');
    document.getElementById('guess-area').classList.remove('hidden');
    document.getElementById('status').innerText = "Song läuft...";
    document.getElementById('guess-input').value = "";

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
    let userGuess = document.getElementById('guess-input').value.toLowerCase();
    // Einfache Prüfung (enthält den Titel?)
    if (userGuess.includes(currentSong.title.toLowerCase())) {
        document.getElementById('status').innerText = "✅ Richtig! Es ist " + currentSong.title;
        reveal();
    } else {
        document.getElementById('status').innerText = "❌ Leider falsch. Probier es nochmal!";
    }
}

function reveal() {
    // Vorhang ÖFFNEN (Video zeigen)
    document.getElementById('curtain').classList.add('hidden');
    document.getElementById('status').innerText = "Lösung: " + currentSong.artist + " - " + currentSong.title;
    // Video nochmal abspielen (optional)
    // player.seekTo(currentSong.start);
    // player.playVideo();

    // UI Reset vorbereiten
    document.getElementById('start-btn').classList.remove('hidden');
    document.getElementById('start-btn').innerText = "Nächster Song";
    document.getElementById('guess-area').classList.add('hidden');
}

// Initialize
loadSongs();
