let kiChatVerlauf = [];
let letzterGespielterSong = null;

// Die Funktion empfängt jetzt den Parameter 'allgemein', 'interpret' oder 'titel'
async function holeTippVonKI(tippArt) {
    if (!currentSong) return;

    const btnAllgemein = document.getElementById("tipp-btn-allgemein");
    const btnInterpret = document.getElementById("tipp-btn-interpret");
    const btnTitel = document.getElementById("tipp-btn-titel");
    const tippContainer = document.getElementById("tipp-container"); // NEU: Container holen
    
    // Alle drei Buttons während der Ladezeit deaktivieren
    btnAllgemein.disabled = true;
    btnInterpret.disabled = true;
    btnTitel.disabled = true;
    tippContainer.style.display = "block"; 
    const ladeText = document.createElement("p");
    ladeText.id = "lade-indikator";
    ladeText.style.color = "#aaa";
    ladeText.style.fontStyle = "italic";
    ladeText.textContent = "Die KI durchsucht ihre Plattenkiste...";
    tippContainer.appendChild(ladeText);

    const apiKey = "AIzaSyBJNjxKbAlGyIu7AJgntmKjOx-LRJVpkJg"; 
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${apiKey}`;

    if (currentSong !== letzterGespielterSong) {
        kiChatVerlauf = [];
        letzterGespielterSong = currentSong;
    }

    // --- NEUE LOGIK: Prüfen, was der Spieler schon weiß ---
    const eingabeTitel = document.getElementById('guess-title').value.trim().toLowerCase();
    const eingabeInterpret = document.getElementById('guess-artist').value.trim().toLowerCase();

    // Wir nutzen deine bestehende Levenshtein-Funktion aus script.js! (Toleranz: max. 2 Fehler)
    const titelIstRichtig = eingabeTitel !== "" && levenshtein(eingabeTitel, currentSong.title.toLowerCase()) <= 2;
    const interpretIstRichtig = eingabeInterpret !== "" && levenshtein(eingabeInterpret, currentSong.artist.toLowerCase()) <= 2;

    let anweisung = "";

    // Prompt zusammenbauen
    if (kiChatVerlauf.length === 0) {
        // Die erste Anfrage für diesen Song
        anweisung = `Wir spielen ein Musik-Quiz. Der gesuchte Song ist "${currentSong.title}" von "${currentSong.artist}" aus dem Jahr ${currentSong.year}.\n`;

        if (tippArt === 'interpret') {
            anweisung += `Gib mir einen witzigen Tipp, um den INTERPRETEN zu erraten. `;
            if (titelIstRichtig) {
                anweisung += `Der Spieler kennt den Titel ("${currentSong.title}") bereits. Du darfst den Titel im Text ruhig erwähnen, aber nenne auf GAR KEINEN FALL den Namen des Interpreten! `;
            } else {
                anweisung += `Nenne auf GAR KEINEN FALL den Namen des Interpreten ODER den Titel! `;
            }
        } else if (tippArt === 'titel') {
            anweisung += `Gib mir einen witzigen Tipp, um den TITEL des Songs zu erraten. `;
            if (interpretIstRichtig) {
                anweisung += `Der Spieler kennt den Interpreten ("${currentSong.artist}") bereits. Du darfst den Interpreten im Text ruhig erwähnen, aber nenne auf GAR KEINEN FALL den Titel des Songs! `;
            } else {
                anweisung += `Nenne auf GAR KEINEN FALL den Namen des Interpreten ODER den Titel! `;
            }
        } else {
            anweisung += `Gib mir einen allgemeinen, witzigen Tipp zum Song. Nenne auf GAR KEINEN FALL den Namen des Interpreten oder den Titel! `;
        }
        anweisung += `Maximal 2 Sätze.`;

    } else {
        // Folgefrage (wenn man mehrmals klickt)
        anweisung = `Der letzte Tipp war gut, aber wir brauchen noch einen NEUEN Tipp.\n`;

        if (tippArt === 'interpret') {
            anweisung += `Fokus jetzt: Ein Tipp zum INTERPRETEN. `;
            if (titelIstRichtig) {
                 anweisung += `(Erinnerung: Der Titel "${currentSong.title}" darf genannt werden, aber NICHT der Interpret!). `;
            } else {
                 anweisung += `(Weder Titel noch Interpret dürfen genannt werden!). `;
            }
        } else if (tippArt === 'titel') {
            anweisung += `Fokus jetzt: Ein Tipp zum TITEL. `;
            if (interpretIstRichtig) {
                 anweisung += `(Erinnerung: Der Interpret "${currentSong.artist}" darf genannt werden, aber NICHT der Titel!). `;
            } else {
                 anweisung += `(Weder Titel noch Interpret dürfen genannt werden!). `;
            }
        } else {
            anweisung += `Fokus jetzt: Ein allgemeiner Tipp. (Weder Titel noch Interpret dürfen genannt werden!). `;
        }
        anweisung += `Maximal 2 Sätze, keine alten Tipps wiederholen!`;
    }

    kiChatVerlauf.push({ role: "user", parts: [{ text: anweisung }] });

    try {
        const daten = { contents: kiChatVerlauf };
        const antwort = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(daten)
        });

        const ergebnis = await antwort.json();
        const finalerTipp = ergebnis.candidates[0].content.parts[0].text;
        
        kiChatVerlauf.push({ role: "model", parts: [{ text: finalerTipp }] });
        
        // NEU: Lade-Text wieder entfernen
        document.getElementById("lade-indikator").remove();

        // NEU: Den neuen Tipp als frischen Absatz erstellen
        const neuerTipp = document.createElement("p");
        neuerTipp.style.color = "#0088ff";
        neuerTipp.style.margin = "5px 0";
        neuerTipp.style.paddingBottom = "5px";
        neuerTipp.style.borderBottom = "1px solid #444"; // Hübsche Trennlinie

        // Passendes Icon davor setzen
        let prefix = "🤖 <strong>Allgemein:</strong> ";
        if (tippArt === 'interpret') prefix = "👤 <strong>Interpret:</strong> ";
        if (tippArt === 'titel') prefix = "🎵 <strong>Titel:</strong> ";

        neuerTipp.innerHTML = `${prefix} ${finalerTipp}`;
        
        // Den fertigen Absatz in unsere Box kleben
        tippContainer.appendChild(neuerTipp);

        btnAllgemein.textContent = "Noch ein allg. Tipp 🤖";
        btnInterpret.textContent = "Noch ein Interpret-Tipp 👤";
        btnTitel.textContent = "Noch ein Titel-Tipp 🎵";

    } catch (fehler) {
        console.error(fehler);
        document.getElementById("lade-indikator").textContent = "Die KI hat gerade Ladehemmungen.";
    } finally {
        btnAllgemein.disabled = false;
        btnInterpret.disabled = false;
        btnTitel.disabled = false;
    }
}
