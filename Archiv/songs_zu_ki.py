import json
import os

# Wie viele Songs pro KI-Anfrage? (100 ist ein guter Wert für den Chat)
CHUNK_SIZE = 100 

def export_for_ai():
    try:
        with open('songs.json', 'r', encoding='utf-8') as f:
            songs = json.load(f)
    except FileNotFoundError:
        print("❌ songs.json nicht gefunden.")
        return

    # Ordner für die KI-Dateien erstellen
    os.makedirs('ki_chunks', exist_ok=True)

    chunk = []
    chunk_index = 1

    for i, song in enumerate(songs):
        # Wir übergeben nur das absolute Minimum, um Token zu sparen
        mini_song = {
            "t": song["title"],
            "a": song["artist"],
            "p": 0  # Hier soll die KI den Wert eintragen
        }
        chunk.append(mini_song)

        # Wenn der Chunk voll ist oder wir am Ende der Liste sind
        if len(chunk) == CHUNK_SIZE or i == len(songs) - 1:
            filename = f"ki_chunks/chunk_{chunk_index}.json"
            with open(filename, 'w', encoding='utf-8') as f:
                json.dump(chunk, f, indent=4, ensure_ascii=False)
            
            print(f"✅ {filename} erstellt ({len(chunk)} Songs).")
            chunk = []
            chunk_index += 1

    print(f"\n🎉 Fertig! Du hast jetzt {chunk_index - 1} Dateien im Ordner 'ki_chunks'.")

if __name__ == "__main__":
    export_for_ai()