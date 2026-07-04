import json

# --- DATEINAMEN ---
INPUT_FILE = 'songs_new_score.json'
OUTPUT_FILE = 'songs_export.txt'

def export_to_text():
    # 1. JSON-Datenbank laden
    try:
        with open(INPUT_FILE, 'r', encoding='utf-8') as f:
            songs_db = json.load(f)
        print(f"📂 Lade {len(songs_db)} Songs aus '{INPUT_FILE}'...")
    except FileNotFoundError:
        print(f"❌ Datei '{INPUT_FILE}' nicht gefunden!")
        return

    exported_count = 0

    # 2. Textdatei erstellen und befüllen
    # WICHTIG: encoding='utf-8' sorgt dafür, dass Umlaute oder Sonderzeichen (z.B. bei französischen Titeln) nicht kaputt gehen
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f_out:
        for song in songs_db:
            title = song.get('title', 'Unbekannt')
            artist = song.get('artist', 'Unbekannt')
            yt_views = song.get('stats_youtube', 0)
            
            # Die exakt gewünschte Formatierung: "Titel - Interpret, Aufrufe"
            line = f"{title} - {artist}, {yt_views}\n"
            f_out.write(line)
            
            exported_count += 1

    print(f"🎉 Fertig! {exported_count} Songs wurden erfolgreich in '{OUTPUT_FILE}' exportiert.")

if __name__ == "__main__":
    export_to_text()