let songs = [];
let filteredSongs = [];
let audioPlayer;
let currentSong;

// Load songs from JSON
async function loadSongs() {
    try {
        const response = await fetch('songs.json');
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
            // Swap values if min crosses max
            let tmp = min;
            min = max;
            max = tmp;

            // Note: we don't swap the inputs' values here to avoid jitter,
            // we just render correctly and use the min/max of the two correctly.
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
        // 1. Filter by Year Range
        if (!song.year || song.year < selectedMinYear || song.year > selectedMaxYear) {
            return false;
        }

        // 2. Filter by Decade (if any selected)
        if (selectedDecades.length > 0) {
            const songDecade = Math.floor(song.year / 10) * 10;
            if (!selectedDecades.includes(songDecade)) {
                return false;
            }
        }

        // 3. Filter by Genre (if any selected)
        if (selectedGenres.length > 0) {
            if (!song.genre || !selectedGenres.includes(song.genre)) {
                return false;
            }
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

// 3. Spiel-Logik
function startGame() {
    if (filteredSongs.length === 0) {
        alert("Fehler: Keine gefilterten Songs vorhanden.");
        return;
    }

    // Stop previous audio if playing
    if (audioPlayer) {
        audioPlayer.pause();
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
