import os
import sys
import csv
import json
import re
import ast
import time

# Ensure UTF-8 output in Windows PowerShell/cmd
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)

# File paths
AUDIO_FEATURES_CSV = os.path.join(SCRIPT_DIR, 'audio_features.csv')
OUTPUT_JSON_FILE = os.path.join(SCRIPT_DIR, 'songs_datensatz.json')


def clean_artist(artist: str) -> str:
    """
    Entfernt Gast-/Featuring-Zusätze (z. B. 'feat.', 'featuring', 'ft.', 'with', etc.),
    sodass möglichst nur der Hauptinterpret übrig bleibt.
    """
    if not artist:
        return ""
    # Entferne Zusätze in Klammern wie (feat. ...) oder (Featuring ...)
    artist = re.sub(r'\s*[\(\[]\s*(?:featuring|feat\.?|ft\.?)\b.*?[\)\]]', '', artist, flags=re.IGNORECASE)
    # Splitte bei typischen Kollaborations-Schlüsselwörtern
    pattern = r'\s+(?:featuring|feat\.?|ft\.?|with|duet with|co-starring|introducing|presents|pres\.)\s+'
    artist = re.split(pattern, artist, flags=re.IGNORECASE)[0]
    return artist.strip()


def clean_album(raw_album: str) -> str:
    """
    Bereinigt den Albumnamen. In manchen Zeilen von audio_features.csv
    wurde das gesamte Spotify-Dictionary als String gespeichert.
    Hier wird der eigentliche Albumname extrahiert.
    """
    if not raw_album or raw_album == "NA":
        return ""
    raw_album = raw_album.strip()
    if raw_album.startswith("{"):
        try:
            parsed = ast.literal_eval(raw_album)
            if isinstance(parsed, dict) and "name" in parsed:
                return str(parsed["name"]).strip()
        except Exception:
            pass
        match = re.search(r"['\"]name['\"]\s*:\s*['\"](.*?)['\"]", raw_album)
        if match:
            return match.group(1).strip()
    return raw_album


def normalize_text(text: str) -> str:
    """
    Normalisiert Text für den Duplikatsabgleich:
    - Kleinschreibung
    - Entfernen von Klammern und typischen Zusätzen (- Remaster, etc.)
    - Entfernen von Sonderzeichen und überflüssigen Leerzeichen
    """
    if not text:
        return ""
    text = text.lower()
    text = re.sub(r"[\(\[\{].*?[\)\]\}]", "", text)
    text = re.sub(r"-\s*(remaster.*|live.*|radio edit.*|mono.*|stereo.*|bonus.*|deluxe.*|anniversary.*)", "", text)
    text = re.sub(r"[^\w\s]", "", text)
    return " ".join(text.split())


def extract_songs_from_audio_features():
    if not os.path.exists(AUDIO_FEATURES_CSV):
        print(f"❌ Fehler: Datensatz nicht gefunden unter '{AUDIO_FEATURES_CSV}'.")
        return

    print(f"🚀 Lese und verarbeite '{os.path.basename(AUDIO_FEATURES_CSV)}'...")
    start_time = time.time()

    seen_combinations = set()
    seen_uris = set()
    extracted_songs = []

    total_rows = 0
    skipped_no_spotify_id = 0
    skipped_duplicates = 0
    dict_albums_cleaned = 0

    with open(AUDIO_FEATURES_CSV, mode='r', encoding='utf-8', errors='replace') as f:
        reader = csv.DictReader(f)
        for row in reader:
            total_rows += 1
            raw_song = row.get('song', '').strip()
            raw_performer = row.get('performer', '').strip()
            track_id = row.get('spotify_track_id', '').strip()

            # Prüfe, ob eine gültige Spotify Track ID existiert
            if not track_id or track_id == 'NA':
                skipped_no_spotify_id += 1
                continue

            # Hauptinterpret bereinigen (feat. entfernen)
            cleaned_artist_name = clean_artist(raw_performer)
            song_title = raw_song
            spotify_uri = f"spotify:track:{track_id}"

            # Duplikatsprüfung: (Titel, Interpret) und URI
            norm_key = (normalize_text(song_title), normalize_text(cleaned_artist_name))
            if norm_key in seen_combinations or spotify_uri in seen_uris:
                skipped_duplicates += 1
                continue

            seen_combinations.add(norm_key)
            seen_uris.add(spotify_uri)

            # Album extrahieren und bereinigen
            raw_album = row.get('spotify_track_album', '').strip()
            if raw_album.startswith('{'):
                dict_albums_cleaned += 1
            album = clean_album(raw_album)

            # Songdauer (in Millisekunden)
            raw_duration = row.get('spotify_track_duration_ms', '').strip()
            duration_ms = int(raw_duration) if raw_duration.isdigit() else 0

            # Song-Objekt passend zur Struktur von song_list.json
            song_entry = {
                "title": song_title,
                "artist": cleaned_artist_name,
                "spotifyUri": spotify_uri,
                "coverUrl": "",
                "year": 0,
                "album": album,
                "genre": "",
                "duration_ms": duration_ms,
                "popularity": 0,
                "stats_youtube": 0,
                "stats_lastfm": 0,
                "stats_genius": 0,
                "raw_data_collected": False
            }

            extracted_songs.append(song_entry)

    elapsed = time.time() - start_time

    print("\n" + "=" * 55)
    print("📊 ERGEBNIS-STATISTIK:")
    print(f"  • Zeilen in audio_features.csv:      {total_rows:,}")
    print(f"  • Ohne Spotify Track-ID (NA):       {skipped_no_spotify_id:,}")
    print(f"  • Duplikate herausgefiltert:         {skipped_duplicates:,}")
    print(f"  • Roh-JSON Albumnamen bereinigt:    {dict_albums_cleaned:,}")
    print(f"  • Erfolgreich extrahierte Songs:    {len(extracted_songs):,}")
    print(f"  • Verarbeitungsdauer:               {elapsed:.2f} Sekunden")
    print("=" * 55)

    # In songs_datensatz.json speichern
    print(f"\n💾 Schreibe {len(extracted_songs):,} Songs nach '{os.path.basename(OUTPUT_JSON_FILE)}'...")
    with open(OUTPUT_JSON_FILE, 'w', encoding='utf-8') as f:
        json.dump(extracted_songs, f, indent=4, ensure_ascii=False)

    print(f" Fertig! Die Daten wurden erfolgreich gespeichert:\n   -> {OUTPUT_JSON_FILE}")


if __name__ == '__main__':
    extract_songs_from_audio_features()
