let songs = [];
let filteredSongs = [];
let currentSong;

// --- YOUTUBE PLAYER VARIABLEN ---
let player;
let isPlayerReady = false;

// 1. ZUERST das "Ohr" (die Funktion) definieren, BEVOR wir YouTube rufen
window.onYouTubeIframeAPIReady = function() {
    console.log("YouTube API Skript ist da! Baue Player...");
    player = new YT.Player('yt-player', {
        height: '200', 
        width: '300',
        playerVars: {
            'playsinline': 1,
            'controls': 0,    
            'disablekb': 1,   
            'fs': 0,          
            'rel': 0,
            'origin': window.location.origin
        },
        events: {
            'onReady': onPlayerReady,
            'onError': onPlayerError
        }
    });
};

function onPlayerReady(event) {
    console.log("✅ YouTube Player ist fertig zusammengebaut und bereit!");
    isPlayerReady = true;
}

function onPlayerError(event) {
    console.error("❌ Fehler vom YouTube Player. Code:", event.data);
    if (event.data === 150 || event.data === 101) {
        console.log("Video blockiert. Überspringe automatisch...");
        document.getElementById('status').innerText = "Song blockiert (Copyright). Lade Alternative...";
        setTimeout(() => { startGame(); }, 1000);
    } else {
        document.getElementById('status').innerText = "Fehler beim Laden des Videos (Code " + event.data + ").";
    }
}

// 2. DANN ERST das Skript von YouTube laden
// Sicherheits-Check: Falls YouTube durch den Cache schon heimlich da ist, direkt starten!
if (typeof YT !== 'undefined' && YT && YT.Player) {
    window.onYouTubeIframeAPIReady();
} else {
    const tag = document.createElement('script');
    tag.src = "https://www.youtube.com/iframe_api";
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
}

// Load songs from JSON
async function loadSongs() {
    try {
        const response = await fetch('songs_lyrics.json');
        songs = await response.json();
        console.log('Songs loaded:', songs);
        setupFilters();

        const btn = document.getElementById('apply-filters-btn');
        btn.innerText = "Spiel starten";
        btn.disabled = false;

    } catch (error) {
        console.error('Error loading songs:', error);
        document.getElementById('status').innerHTML = "Fehler beim Laden der Songs.<br><small>Falls du die Datei lokal öffnest, nutze einen Webserver (z.B. Live Server).</small>";
    }
}

// Filter logic
function setupFilters() {
    // Determine min and max year
    const years = songs.map(s => s.year).filter(y => y);
    const minYear = Math.min(...years);
    const maxYear = Math.max(...years);

    const yearMinInput = document.getElementById('year-min');
    const yearMaxInput = document.getElementById('year-max');
    const yearMinVal = document.getElementById('year-min-val');
    const yearMaxVal = document.getElementById('year-max-val');
    const sliderRange = document.getElementById('slider-range');

    yearMinInput.min = minYear;
    yearMinInput.max = maxYear;
    yearMinInput.value = minYear;

    yearMaxInput.min = minYear;
    yearMaxInput.max = maxYear;
    yearMaxInput.value = maxYear;

    function updateSlider() {
        let min = parseInt(yearMinInput.value);
        let max = parseInt(yearMaxInput.value);

        if (min > max) {
            let tmp = min;
            min = max;
            max = tmp;
        }

        yearMinVal.innerText = min;
        yearMaxVal.innerText = max;

        const range = maxYear - minYear;
        const leftPercent = ((min - minYear) / range) * 100;
        const rightPercent = ((maxYear - max) / range) * 100;

        sliderRange.style.left = leftPercent + '%';
        sliderRange.style.right = rightPercent + '%';
    }

    yearMinInput.addEventListener('input', updateSlider);
    yearMaxInput.addEventListener('input', updateSlider);
    updateSlider();

    // Populate genres
    const genres = [...new Set(songs.map(s => s.genre).filter(g => g))].sort();
    const genreContainer = document.getElementById('genre-filters');
    genreContainer.innerHTML = '';
    genres.forEach(genre => {
        const label = document.createElement('label');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = genre;
        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(' ' + genre));
        genreContainer.appendChild(label);
    });
}

function applyFiltersAndStart() {
    const minInput = parseInt(document.getElementById('year-min').value);
    const maxInput = parseInt(document.getElementById('year-max').value);
    const selectedMinYear = Math.min(minInput, maxInput);
    const selectedMaxYear = Math.max(minInput, maxInput);

    const decadeCheckboxes = document.querySelectorAll('#decade-filters input:checked');
    const selectedDecades = Array.from(decadeCheckboxes).map(cb => parseInt(cb.value));

    const genreCheckboxes = document.querySelectorAll('#genre-filters input:checked');
    const selectedGenres = Array.from(genreCheckboxes).map(cb => cb.value);

    filteredSongs = songs.filter(song => {
        if (!song.year || song.year < selectedMinYear || song.year > selectedMaxYear) return false;
        if (selectedDecades.length > 0) {
            const songDecade = Math.floor(song.year / 10) * 10;
            if (!selectedDecades.includes(songDecade)) return false;
        }
        if (selectedGenres.length > 0) {
            if (!song.genre || !selectedGenres.includes(song.genre)) return false;
        }
        return true;
    });

    if (filteredSongs.length === 0) {
        alert("Keine Songs mit diesen Filtern gefunden! Bitte wähle andere Kriterien.");
        return;
    }

    // Hide Start Screen, Show Player
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('player-container').classList.remove('hidden');
    document.getElementById('game-controls').classList.remove('hidden');

    startGame();
}

// 3. Spiel-Logik (JETZT MIT YOUTUBE)
function startGame() {
    if (filteredSongs.length === 0) {
        alert("Fehler: Keine gefilterten Songs vorhanden.");
        return;
    }

    // Vorheriges YouTube Video stoppen
    if (player && typeof player.stopVideo === 'function') {
        player.stopVideo();
    }

    // Zufälligen Song wählen
    currentSong = filteredSongs[Math.floor(Math.random() * filteredSongs.length)];

    // Vorhang ZIEHEN (Verstecken)
    document.getElementById('curtain').classList.remove('hidden');
    document.getElementById('curtain').innerText = "🔊 Hör gut zu...";
    document.getElementById('cover-art').classList.add('hidden');
    document.getElementById('cover-art').src = currentSong.coverUrl; // Preload cover

    // UI anpassen
    document.getElementById('start-btn').classList.add('hidden');
    document.getElementById('guess-area').classList.remove('hidden');
    document.getElementById('status').innerText = "Song läuft...";
    
    // Tipps zurücksetzen
    const tippContainer = document.getElementById('tipp-container');
    if(tippContainer) {
        tippContainer.innerHTML = ""; 
        tippContainer.style.display = "none"; 
    }
    const tippBtnAllg = document.getElementById('tipp-btn-allgemein');
    const tippBtnInt = document.getElementById('tipp-btn-interpret');
    const tippBtnTit = document.getElementById('tipp-btn-titel');
    if(tippBtnAllg) tippBtnAllg.textContent = "Allg. Tipp 🤖";
    if(tippBtnInt) tippBtnInt.textContent = "Tipp zum Interpret 👤";
    if(tippBtnTit) tippBtnTit.textContent = "Tipp zum Titel 🎵";

    // Felder zurücksetzen
    const guessTitle = document.getElementById('guess-title');
    const guessArtist = document.getElementById('guess-artist');

    guessTitle.value = "";
    guessTitle.readOnly = false;
    guessTitle.style.backgroundColor = ""; 
    guessTitle.style.color = "";

    guessArtist.value = "";
    guessArtist.readOnly = false;
    guessArtist.style.backgroundColor = "";
    guessArtist.style.color = "";

    // YOUTUBE AUDIO ABSPIELEN
    if (!isPlayerReady) {
        console.error("YouTube Player ist noch nicht bereit!");
        document.getElementById('status').innerText = "⚠️ Lade noch... Bitte gleich nochmal klicken.";
        return;
    }

    const startPunkt = Math.floor(Math.random() * 60) + 20; // Startet zwischen Sek. 20 und 80
    console.log(`Spiele: ${currentSong.artist} - ${currentSong.title} (ID: ${currentSong.youtubeId}) ab Sekunde ${startPunkt}`);

    player.loadVideoById({
        videoId: currentSong.youtubeId,
        startSeconds: startPunkt
    });
    
    player.setVolume(70); 
}

function checkAnswer() {
    const guessTitle = document.getElementById('guess-title');
    const guessArtist = document.getElementById('guess-artist');
    
    const titleVal = guessTitle.value.trim().toLowerCase();
    const artistVal = guessArtist.value.trim().toLowerCase();

    const titleCorrect = levenshtein(titleVal, currentSong.title.toLowerCase()) <= 2;
    const artistCorrect = levenshtein(artistVal, currentSong.artist.toLowerCase()) <= 2;

    if (titleCorrect) {
        guessTitle.style.backgroundColor = "#28a745"; 
        guessTitle.style.color = "white";
        guessTitle.readOnly = true; 
    }

    if (artistCorrect) {
        guessArtist.style.backgroundColor = "#28a745"; 
        guessArtist.style.color = "white";
        guessArtist.readOnly = true; 
    }

    if (titleCorrect && artistCorrect) {
        document.getElementById('status').innerText = "Richtig! Es ist " + currentSong.artist + " - " + currentSong.title;
        reveal(false); 
    } else {
        if (titleCorrect && !artistCorrect) {
            document.getElementById('status').innerText = "Titel ist richtig! Wer ist der Interpret?";
            guessArtist.focus(); 
        } else if (!titleCorrect && artistCorrect) {
            document.getElementById('status').innerText = "Interpret ist richtig! Wie heißt der Song?";
            guessTitle.focus(); 
        } else {
            document.getElementById('status').innerText = "Leider falsch, versuch es weiter!";
        }
    }
}

function checkSimilarity(s1, s2) {
    s1 = s1.toLowerCase().trim();
    s2 = s2.toLowerCase().trim();

    s1 = s1.replace(/\([^)]*\)/g, '').trim();
    s2 = s2.replace(/\([^)]*\)/g, '').trim();

    s1 = s1.replace(/[^\w\s\u00C0-\u017F]/g, '').replace(/\s+/g, ' ');
    s2 = s2.replace(/[^\w\s\u00C0-\u017F]/g, '').replace(/\s+/g, ' ');

    if (s1 === s2) return true; 

    const len = Math.max(s1.length, s2.length);
    if (len === 0) return false;

    const dist = levenshtein(s1, s2);
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
                    matrix[i - 1][j - 1] + 1, 
                    Math.min(
                        matrix[i][j - 1] + 1, 
                        matrix[i - 1][j] + 1  
                    )
                );
            }
        }
    }
    return matrix[b.length][a.length];
}

// --- REVEAL FUNKTION (JETZT MIT YOUTUBE STOP) ---
function reveal(updateStatus = true) {
    // Musik stoppen!
    if (player && typeof player.stopVideo === 'function') {
        player.stopVideo();
    }

    // Vorhang ÖFFNEN
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
    document.getElementById('admin-debug').innerText = "Lösung: " + currentSong.artist + " - " + currentSong.title + " (" + currentSong.year + ", " + currentSong.album + ", " + currentSong.genre + ")";
}

// Initialize
loadSongs();