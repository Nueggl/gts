import json
import os
import glob

# Ordner, in dem die von der KI bearbeiteten Dateien liegen
AI_FOLDER = 'ki_chunks' 

def import_from_ai():
    try:
        with open('songs.json', 'r', encoding='utf-8') as f:
            master_db = json.load(f)
    except FileNotFoundError:
        print("❌ songs.json nicht gefunden.")
        return

    # Wir suchen alle JSON Dateien im AI-Ordner
    ai_files = glob.glob(f"{AI_FOLDER}/*.json")
    
    if not ai_files:
        print(f"❌ Keine Dateien im Ordner '{AI_FOLDER}' gefunden.")
        return

    aktualisiert = 0
    fehler = []

    for file in ai_files:
        with open(file, 'r', encoding='utf-8') as f:
            try:
                ai_daten = json.load(f)
            except json.JSONDecodeError:
                print(f"⚠️ Die Datei {file} ist kein gültiges JSON! Übersprungen.")
                continue

        for ai_song in ai_daten:
            titel = ai_song.get("t", "")
            interpret = ai_song.get("a", "")
            pop = ai_song.get("p", 0)

            # Suche den Song in der Master-Datenbank
            gefunden = False
            for db_song in master_db:
                # Exakter Abgleich (Groß-/Kleinschreibung ignorieren zur Sicherheit)
                if db_song["title"].lower() == titel.lower() and db_song["artist"].lower() == interpret.lower():
                    db_song["popularity"] = pop
                    aktualisiert += 1
                    gefunden = True
                    break
            
            if not gefunden:
                fehler.append(f"{interpret} - {titel}")

    # Aktualisierte Datenbank speichern
    with open('songs.json', 'w', encoding='utf-8') as f:
        json.dump(master_db, f, indent=4, ensure_ascii=False)

    print(f"\n🎉 {aktualisiert} Songs erfolgreich aktualisiert!")
    
    if fehler:
        print("\n⚠️ Folgende Songs wurden nicht in der songs.json gefunden (vielleicht hat die KI den Namen geändert):")
        for f in fehler:
            print(f"  - {f}")

if __name__ == "__main__":
    import_from_ai()