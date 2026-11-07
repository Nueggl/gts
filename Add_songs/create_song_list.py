import os
import sys
import csv
import json
import re

# Ensure standard output uses UTF-8 (important for Windows terminal and international characters)
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)

CHARTS_CSV_PATH = os.path.join(SCRIPT_DIR, 'charts.csv')
SONG_LIST_JSON_PATH = os.path.join(PROJECT_ROOT, 'song_list.json')
OUTPUT_TXT_PATH = os.path.join(SCRIPT_DIR, 'list.txt')


def clean_artist(artist: str) -> str:
    """
    Entfernt Gast-/Featuring-Zusätze (z. B. 'feat.', 'featuring', 'ft.', 'with', etc.),
    sodass möglichst nur der Hauptinterpret übrig bleibt.
    """
    if not artist:
        return ""
    
    # Entferne Zusätze in Klammern wie (feat. ...) oder (Featuring ...)
    artist = re.sub(r'\s*[\(\[]\s*(?:featuring|feat\.?|ft\.?)\b.*?[\)\]]', '', artist, flags=re.IGNORECASE)
    
    # Splitte bei typischen Gastkollaborations-Schlüsselwörtern
    pattern = r'\s+(?:featuring|feat\.?|ft\.?|with|duet with|co-starring|introducing|presents|pres\.)\s+'
    artist = re.split(pattern, artist, flags=re.IGNORECASE)[0]
    
    return artist.strip()


def normalize_text(text: str) -> str:
    """
    Normalisiert Text für den verlässlichen Duplikatsabgleich:
    - Kleinschreibung
    - Entfernen von Klammern und Remaster/Live-Zusätzen
    - Entfernen von Sonderzeichen und überflüssigen Leerzeichen
    """
    if not text:
        return ""
    text = text.lower()
    # Entferne Klammerinhalte (z. B. [Remastered], (Remaster 2011))
    text = re.sub(r'[\(\[\{].*?[\)\]\}]', '', text)
    # Entferne Suffixe nach Bindestrichen wie ' - Remastered 2011', ' - Live'
    text = re.sub(r'-\s*(remaster.*|live.*|radio edit.*|bonus.*|album version.*)', '', text)
    # Entferne Satzzeichen / Sonderzeichen
    text = re.sub(r'[^\w\s]', '', text)
    return ' '.join(text.split())


def load_existing_songs(json_path: str) -> set:
    """
    Lädt bereits vorhandene Songs aus song_list.json und erzeugt ein Set
    aus normalisierten (Artist, Title)-Tupeln zur Duplikaterkennung.
    """
    existing_keys = set()
    if not os.path.exists(json_path):
        print(f"Hinweis: '{json_path}' wurde nicht gefunden. Es wird keine bestehende Liste gefiltert.")
        return existing_keys

    try:
        with open(json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)

        for item in data:
            raw_artist = item.get('artist', '')
            raw_title = item.get('title', '')
            
            norm_artist = normalize_text(clean_artist(raw_artist))
            norm_title = normalize_text(raw_title)
            
            if norm_artist and norm_title:
                existing_keys.add((norm_artist, norm_title))

        print(f"✓ {len(existing_keys)} bestehende Songs aus '{os.path.basename(json_path)}' geladen.")
    except Exception as e:
        print(f"Fehler beim Laden von '{json_path}': {e}")

    return existing_keys


def process_charts():
    if not os.path.exists(CHARTS_CSV_PATH):
        print(f"Fehler: charts.csv wurde nicht gefunden unter: {CHARTS_CSV_PATH}")
        return

    existing_songs = load_existing_songs(SONG_LIST_JSON_PATH)

    seen_in_charts = set()
    unique_songs_to_export = []
    skipped_internal_duplicates = 0
    skipped_existing = 0

    print(f"Lese '{os.path.basename(CHARTS_CSV_PATH)}' ein...")
    with open(CHARTS_CSV_PATH, 'r', encoding='utf-8', errors='replace') as f:
        reader = csv.DictReader(f)
        for row in reader:
            raw_song = row.get('song', '').strip()
            raw_artist = row.get('artist', '').strip()

            if not raw_song or not raw_artist:
                continue

            cleaned_artist_name = clean_artist(raw_artist)
            song_name = raw_song

            # Normalisierte Repräsentation für Duplikatsprüfung
            norm_artist = normalize_text(cleaned_artist_name)
            norm_song = normalize_text(song_name)
            song_key = (norm_artist, norm_song)

            # 1. Duplikatsfilterung innerhalb der CSV-Liste
            if song_key in seen_in_charts:
                skipped_internal_duplicates += 1
                continue
            seen_in_charts.add(song_key)

            # 2. Filterung gegen bereits existierende Songs
            if song_key in existing_songs:
                skipped_existing += 1
                continue

            # Format: Interpret - Titel
            unique_songs_to_export.append(f"{cleaned_artist_name} - {song_name}")

    print(f"✓ Interne Duplikate entfernt: {skipped_internal_duplicates}")
    print(f"✓ Bereits in song_list.json vorhandene Songs übersprungen: {skipped_existing}")
    print(f"✓ Verbleibende neue Songs: {len(unique_songs_to_export)}")

    # Schreibe in list.txt
    print(f"Schreibe Ergebnisse nach '{os.path.basename(OUTPUT_TXT_PATH)}'...")
    with open(OUTPUT_TXT_PATH, 'w', encoding='utf-8') as f:
        for line in unique_songs_to_export:
            f.write(line + '\n')

    print(f" Fertig! Die Datei wurde erfolgreich erstellt: {OUTPUT_TXT_PATH}")


if __name__ == '__main__':
    process_charts()

