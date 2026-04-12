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
    document.getElementById('guess-title').value = "";
    document.getElementById('guess-artist').value = "";

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
    let guessTitle = document.getElementById('guess-title').value;
    let guessArtist = document.getElementById('guess-artist').value;

    let titleCorrect = checkSimilarity(guessTitle, currentSong.title);
    let artistCorrect = checkSimilarity(guessArtist, currentSong.artist);

    if (titleCorrect && artistCorrect) {
        document.getElementById('status').innerText = "✅ Richtig! Es ist " + currentSong.title + " von " + currentSong.artist + " (" + currentSong.year + ", " + currentSong.album + ")";
        reveal(false);
    } else if (titleCorrect) {
        document.getElementById('status').innerText = "✅ Titel stimmt! Aber der Interpret ist leider falsch.";
    } else if (artistCorrect) {
        document.getElementById('status').innerText = "✅ Interpret stimmt! Aber der Titel ist leider falsch.";
    } else {
        document.getElementById('status').innerText = "❌ Leider falsch. Probier es nochmal!";
    }
}

function checkSimilarity(s1, s2) {
    s1 = s1.toLowerCase().trim();
    s2 = s2.toLowerCase().trim();

    // Remove text in parentheses
    s1 = s1.replace(/\([^)]*\)/g, '').trim();
    s2 = s2.replace(/\([^)]*\)/g, '').trim();

    // Remove punctuation
    s1 = s1.replace(/[^\w\s\u00C0-\u017F]/g, '').replace(/\s+/g, ' ');
    s2 = s2.replace(/[^\w\s\u00C0-\u017F]/g, '').replace(/\s+/g, ' ');

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
    // Vorhang ÖFFNEN (Cover zeigen)
    document.getElementById('curtain').classList.add('hidden');
    document.getElementById('cover-art').classList.remove('hidden');

    if (updateStatus) {
        document.getElementById('status').innerText = "Lösung: " + currentSong.artist + " - " + currentSong.title + " (" + currentSong.year + ", " + currentSong.album + ")";
    }

    // UI Reset vorbereiten
    document.getElementById('start-btn').classList.remove('hidden');
    document.getElementById('start-btn').innerText = "Nächster Song";
    document.getElementById('guess-area').classList.add('hidden');
}

//Admin
function adminReveal() {
    if (!currentSong) {
        document.getElementById('admin-debug').innerText = "Noch kein Song geladen.";
        return;
    }

    document.getElementById('admin-debug').innerText = "Lösung: " + currentSong.artist + " - " + currentSong.title + " (" + currentSong.year + ", " + currentSong.album + ")";
}

// Initialize
loadSongs();
