let songs = [];
let audioPlayer;
let currentSong;

// Load songs from JSON
async function loadSongs() {
    try {
        const response = await fetch('songs.json');
        songs = await response.json();
        console.log('Songs loaded:', songs);
        document.getElementById('curtain').innerText = "Bereit zum Starten";
    } catch (error) {
        console.error('Error loading songs:', error);
        document.getElementById('status').innerHTML = "Fehler beim Laden der Songs.<br><small>Falls du die Datei lokal öffnest, nutze einen Webserver (z.B. Live Server).</small>";
    }
}

// 3. Spiel-Logik
function startGame() {
    if (songs.length === 0) {
        alert("Songs werden noch geladen oder konnten nicht geladen werden.");
        return;
    }

    // Stop previous audio if playing
    if (audioPlayer) {
        audioPlayer.pause();
    }

    // Zufälligen Song wählen
    currentSong = songs[Math.floor(Math.random() * songs.length)];

    // Vorhang ZIEHEN (Verstecken)
    document.getElementById('curtain').classList.remove('hidden');
    document.getElementById('curtain').innerText = "🔊 Hör gut zu...";
    document.getElementById('cover-art').classList.add('hidden');
    document.getElementById('cover-art').src = currentSong.coverUrl; // Preload cover

    // UI anpassen
    document.getElementById('start-btn').classList.add('hidden');
    document.getElementById('guess-area').classList.remove('hidden');
    document.getElementById('status').innerText = "Song läuft...";
    document.getElementById('guess-input').value = "";

    // Audio abspielen
    audioPlayer = new Audio(currentSong.audioUrl);
    audioPlayer.play().catch(e => {
        console.error("Audio playback error:", e);
        document.getElementById('status').innerText = "⚠️ Fehler beim Abspielen: " + e.message;
    });

    // Optional: Stop after 30s (preview length is usually 30s anyway)
    audioPlayer.onended = () => {
        document.getElementById('status').innerText = "Musik zu Ende. Weißt du es?";
    };
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
    // Vorhang ÖFFNEN (Cover zeigen)
    document.getElementById('curtain').classList.add('hidden');
    document.getElementById('cover-art').classList.remove('hidden');

    document.getElementById('status').innerText = "Lösung: " + currentSong.artist + " - " + currentSong.title;

    // UI Reset vorbereiten
    document.getElementById('start-btn').classList.remove('hidden');
    document.getElementById('start-btn').innerText = "Nächster Song";
    document.getElementById('guess-area').classList.add('hidden');
}

// Initialize
loadSongs();
