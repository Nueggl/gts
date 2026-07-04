import json
import os
import sys

# Configure standard streams for UTF-8 to prevent UnicodeEncodeError in Windows terminal
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

JSON_FILE = 'songs_new_score_updated_popularity.json'

def main():
    if not os.path.exists(JSON_FILE):
        print(f"❌ Datei {JSON_FILE} nicht gefunden!")
        return

    # Load songs
    with open(JSON_FILE, 'r', encoding='utf-8') as f:
        songs = json.load(f)

    # Filter for songs with errors or missing lyrics
    missing_songs = []
    for idx, song in enumerate(songs):
        has_lyrics = "lyrics" in song and song["lyrics"] is not None and song["lyrics"] != ""
        has_error = song.get("lyrics_error", False)
        
        if has_error or not has_lyrics:
            missing_songs.append((idx, song))

    if not missing_songs:
        print("🎉 Alle Songs haben bereits Lyrics! Keine fehlenden Songs gefunden.")
        return

    print(f"📂 {len(missing_songs)} Songs ohne Lyrics gefunden.")
    print("-----------------------------------------------------------------")
    print("Anleitung:")
    print("1. Kopiere die Lyrics des Songs aus dem Browser.")
    print("2. Füge sie hier im Terminal ein.")
    print("3. Drücke ENTER und danach STRG+Z (Windows) und nochmals ENTER, um zu speichern.")
    print("Alternativ: Tippe 'skip' auf einer neuen Zeile, um den Song zu überspringen.")
    print("            Tippe 'exit' auf einer neuen Zeile, um das Programm zu beenden.")
    print("-----------------------------------------------------------------")

    for i, (original_idx, song) in enumerate(missing_songs, 1):
        artist = song.get("artist", "")
        title = song.get("title", "")
        print(f"\n[{i}/{len(missing_songs)}] Song: '{title}' von '{artist}'")
        print("Füge die Lyrics ein (Strg+Z + Enter zum Speichern):")
        
        lines = []
        is_skipped = False
        is_exited = False
        
        while True:
            try:
                line = input()
                # Check for commands if it is the first line or on its own
                if len(lines) == 0 and line.strip().lower() == 'skip':
                    is_skipped = True
                    break
                if len(lines) == 0 and line.strip().lower() == 'exit':
                    is_exited = True
                    break
                lines.append(line)
            except EOFError:
                break
                
        if is_exited:
            print("\n🛑 Programm beendet. Alle Änderungen wurden gespeichert.")
            break
            
        if is_skipped:
            print("⏭️ Song übersprungen.")
            continue

        # Format and clean the lyrics
        raw_lyrics = "\n".join(lines).strip()
        if not raw_lyrics:
            print("⚠️ Keine Lyrics eingegeben. Song wird übersprungen.")
            continue
            
        # Clean consecutive blank lines and strip each line
        lines_cleaned = [l.strip() for l in raw_lyrics.split('\n')]
        final_lines = []
        for l in lines_cleaned:
            if l:
                final_lines.append(l)
            else:
                if final_lines and final_lines[-1] != "":
                    final_lines.append("")
                    
        cleaned_lyrics = "\n".join(final_lines).strip()

        # Update song
        song["lyrics"] = cleaned_lyrics
        if "lyrics_error" in song:
            del song["lyrics_error"]

        # Save immediately
        with open(JSON_FILE, 'w', encoding='utf-8') as f:
            json.dump(songs, f, indent=4, ensure_ascii=False)
            
        print(f"✅ Lyrics für '{title}' erfolgreich gespeichert! ({len(cleaned_lyrics)} Zeichen)")

    print("\nFertig! Alle bearbeiteten Songs wurden gespeichert.")

if __name__ == "__main__":
    main()
