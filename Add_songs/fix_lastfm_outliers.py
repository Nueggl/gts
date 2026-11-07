import urllib.request
import urllib.parse
import json
import time
import re
import sys
import os

# Konfiguriere Standardausgabe auf UTF-8 und Line-Buffering
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', line_buffering=True)

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)

if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

import config_secrets

# --- DATEIPFADE ---
DATABASE_FILE = os.path.join(SCRIPT_DIR, 'songs_datensatz.json')


def normalize_typography(text: str) -> str:
    """Ersetzt typografische Sonderzeichen wie geschwungene Apostrophe und Gedankenstriche."""
    if not text:
        return ""
    text = text.replace('’', "'").replace('‘', "'")
    text = text.replace('“', '"').replace('”', '"')
    text = text.replace('–', '-').replace('—', '-')
    return text.strip()


def clean_artist_name(artist: str) -> str:
    """Bereinigt den Künstlernamen um Duett-Zusätze, Slashes und Features für die Suche."""
    if not artist:
        return ""
    artist = normalize_typography(artist)
    artist = re.sub(r'[\(\[\{]\s*(?:duet|feat\.?|ft\.?|with).*', '', artist, flags=re.IGNORECASE)
    # Primärkünstler vor Kollaborations-Symbolen
    artist = artist.split('&')[0].split('feat')[0].split('with')[0].split('/')[0].split('+')[0]
    artist = artist.replace("Atrractions", "Attractions")
    artist = re.sub(r'(?i)\s+and\s+his\s+(?:orchestra|band|chorus|versatility).*', '', artist)
    artist = re.sub(r'(?i)\s+his\s+(?:orchestra|band|chorus).*', '', artist)
    artist = re.sub(r'(?i)\s*&\s*cast.*', '', artist)
    return artist.strip()


def strip_features_and_suffixes(title: str) -> str:
    """Entfernt Zusätze wie (feat. ...), - Remix, - Live etc."""
    if not title:
        return ""
    title = normalize_typography(title)
    title = re.sub(r'[\(\[\{]\s*(?:featuring|feat\.?|ft\.?|with|remix|version|live|deluxe).*?[\)\]\}]', '', title, flags=re.IGNORECASE)
    title = re.sub(r'(?i)\s*-\s*(remaster|live|radio edit|mono|stereo|bonus|from|soundtrack|theme|series|remix|version|original).*', '', title)
    return title.strip()


def normalize_text_for_match(text: str) -> str:
    """Normalisiert Strings für verlässliche Titelabgleiche."""
    if not text:
        return ""
    text = text.lower()
    text = text.replace('’', "'").replace('‘', "'")
    text = text.replace('&', 'and')
    text = re.sub(r'[\(\[\{].*?[\)\]\}]', ' ', text)
    text = re.sub(r'[^\w\s]', ' ', text)
    return ' '.join(text.split())


def is_title_match(song_title: str, candidate_title: str) -> bool:
    """
    Prüft streng, ob der gesuchte Songtitel mit dem gefundenen Last.fm-Track übereinstimmt.
    Verhindert zuverlässig, dass ein anderer Titel des gleichen Künstlers gewählt wird.
    """
    norm_song = normalize_text_for_match(strip_features_and_suffixes(song_title))
    norm_cand = normalize_text_for_match(candidate_title)
    if not norm_song or not norm_cand:
        return False

    # 1. Direkte Enthaltenseins-Prüfung
    if norm_song in norm_cand or norm_cand in norm_song:
        return True

    # 2. Wortweiser Match bei Mehrwort-Titeln
    words = [w for w in norm_song.split() if len(w) > 2]
    if words:
        matched = sum(1 for w in words if re.search(r'\b' + re.escape(w) + r'\b', norm_cand))
        if matched / len(words) >= 0.70:
            return True

    return False


def get_title_search_variants(title: str):
    """
    Erstellt Suchvarianten des Titels, insbesondere zur Auflösung von Klammer-Präfixen wie:
    '(I Know) I'm Losing You' -> 'I'm Losing You' und '(Sweet Sweet Baby) Since You've Been Gone' -> 'Since You've Been Gone'.
    """
    variants = []
    clean_t = strip_features_and_suffixes(title)
    if clean_t:
        variants.append(clean_t)

    # 1. Variante: Alles in Klammern entfernen (hilft bei "(I Know) I'm Losing You")
    no_parens = re.sub(r'[\(\[\{].*?[\)\]\}]', '', title).strip()
    if no_parens and no_parens not in variants:
        variants.append(no_parens)

    # 2. Variante: Nur den Inhalt der Klammern nehmen, falls der Haupttitel in Klammern stand
    parens_content = re.findall(r'[\(\[\{](.*?)[\)\]\}]', title)
    for pc in parens_content:
        pc_clean = pc.strip()
        if len(pc_clean) > 3 and pc_clean not in variants:
            variants.append(pc_clean)

    # 3. Reiner alphanumerischer Titel
    clean_alnum = re.sub(r'[^\w\s]', ' ', clean_t).strip()
    if clean_alnum and clean_alnum not in variants:
        variants.append(clean_alnum)

    return variants


def is_lastfm_suspicious(song: dict) -> bool:
    """
    Erkennt Songs, deren Last.fm-Hörerzahl im Vergleich zu YouTube oder Genius drastisch zu niedrig ist.
    """
    lfm = song.get('stats_lastfm', 0)
    yt = song.get('stats_youtube', 0)
    gen = song.get('stats_genius', 0)

    # Fallback-Eintrag aus vorheriger Runde
    if lfm <= 1:
        return True

    # Extrem niedrige Hörer trotz solider Präsenz auf YT/Genius
    if lfm < 50 and (yt > 50000 or gen > 1000):
        return True

    # Starke Diskrepanz: < 500 Hörer bei > 500k YouTube oder > 5k Genius
    if lfm < 500 and (yt > 500000 or gen > 5000):
        return True

    # Klare Ausreißer: < 2.000 Hörer bei > 3 Mio. YouTube oder > 20k Genius
    if lfm < 2000 and (yt > 3000000 or gen > 20000):
        return True

    return False


def query_lastfm_best_listeners(artist: str, title: str, current_lfm: int) -> tuple:
    """
    Sucht auf Last.fm mit mehreren Titel- und Interpretenvarianten nach dem kanonischen Haupteintrag
    mit den meisten Hörern, verifiziert über den Titelabgleich.
    Gibt (best_listeners, match_name) zurück.
    """
    api_key = config_secrets.LASTFM_API_KEY
    clean_a = clean_artist_name(artist)
    title_variants = get_title_search_variants(title)

    best_listeners = current_lfm
    best_track_name = ""

    seen_queries = set()

    for t_var in title_variants:
        q_tuple = (clean_a, t_var)
        if q_tuple in seen_queries:
            continue
        seen_queries.add(q_tuple)

        a_quoted = urllib.parse.quote(clean_a)
        t_quoted = urllib.parse.quote(t_var)

        # 1. track.search
        url_search = f"http://ws.audioscrobbler.com/2.0/?method=track.search&api_key={api_key}&artist={a_quoted}&track={t_quoted}&limit=10&format=json"
        try:
            req = urllib.request.Request(url_search, headers={'User-Agent': 'MusicQuiz/1.0'})
            with urllib.request.urlopen(req, timeout=5) as resp:
                data = json.loads(resp.read())
                tracks = data.get('results', {}).get('trackmatches', {}).get('track', [])
                if isinstance(tracks, dict):
                    tracks = [tracks]

                norm_clean_a = re.sub(r'[^\w]', '', clean_a.lower())

                for tr in tracks:
                    tr_name = tr.get('name', '')
                    tr_artist = tr.get('artist', '')
                    norm_tr_artist = re.sub(r'[^\w]', '', tr_artist.lower())

                    # Künstler-Check: Muss zueinander passen
                    artist_match = (
                        not norm_clean_a or
                        norm_clean_a in norm_tr_artist or
                        norm_tr_artist in norm_clean_a or
                        len(norm_clean_a) < 3
                    )

                    if artist_match and is_title_match(title, tr_name):
                        try:
                            listeners = int(tr.get('listeners', 0))
                            if listeners > best_listeners:
                                best_listeners = listeners
                                best_track_name = f"{tr_name} von {tr_artist}"
                        except ValueError:
                            pass
        except Exception:
            pass

        # Falls wir bereits eine signifikante Vervielfachung erreicht haben, sparen wir uns weitere Varianten
        if best_listeners >= max(1000, current_lfm * 5):
            break

    return best_listeners, best_track_name


def main():
    if not os.path.exists(DATABASE_FILE):
        print(f"❌ Datenbank '{DATABASE_FILE}' nicht gefunden!")
        return

    try:
        with open(DATABASE_FILE, 'r', encoding='utf-8') as f:
            songs = json.load(f)
        print(f"📂 Datenbank geladen: {len(songs):,} Songs.")
    except Exception as e:
        print(f"❌ Fehler beim Laden der Datenbank: {e}")
        return

    # Finde verdächtige Ausreißer
    candidates = [s for s in songs if is_lastfm_suspicious(s)]
    total_candidates = len(candidates)
    print(f"🔍 Verdächtige Last.fm-Ausreißer identifiziert: {total_candidates:,} von {len(songs):,} Songs ({total_candidates / len(songs) * 100:.1f} %)\n")

    if total_candidates == 0:
        print("🎉 Keine auffälligen Last.fm-Werte gefunden. Alles im grünen Bereich!")
        return

    print("🚀 Starte Überprüfung und automatische Optimierung über Last.fm...")
    print("   (Autosave alle 25 Songs | Abbruch mit Strg+C speichert den aktuellen Stand)\n")

    improved_count = 0
    total_listeners_gained = 0

    try:
        for idx, song in enumerate(candidates):
            artist = song.get('artist', '')
            title = song.get('title', '')
            old_lfm = song.get('stats_lastfm', 0)

            # Suche besseren Eintrag auf Last.fm
            new_lfm, track_info = query_lastfm_best_listeners(artist, title, old_lfm)

            if new_lfm > old_lfm:
                gain = new_lfm - old_lfm
                song['stats_lastfm'] = new_lfm
                improved_count += 1
                total_listeners_gained += gain
                print(f"[{idx+1}/{total_candidates}] 🔥 VERBESSERT: {artist} - '{title}'")
                print(f"        {old_lfm:,} ➔ {new_lfm:,} Hörer (+{gain:,}) [{track_info}]")
            else:
                # Kein besserer kanonischer Eintrag vorhanden
                if (idx + 1) % 50 == 0 or (idx + 1) == total_candidates:
                    print(f"[{idx+1}/{total_candidates}] ... geprüfte Songs: {idx+1}/{total_candidates} (Bisher {improved_count:,} verbessert)")

            # Autosave alle 25 Songs
            if (idx + 1) % 25 == 0:
                with open(DATABASE_FILE, 'w', encoding='utf-8') as f:
                    json.dump(songs, f, indent=4, ensure_ascii=False)

            # Sanfte Pause (Last.fm erlaubt bis zu 5 Requests/Sekunde)
            time.sleep(0.2)

    except KeyboardInterrupt:
        print("\n\n🛑 Manuell abgebrochen. Speichere aktuellen Stand...")

    # Finaler Save
    with open(DATABASE_FILE, 'w', encoding='utf-8') as f:
        json.dump(songs, f, indent=4, ensure_ascii=False)

    print("\n" + "=" * 60)
    print("📊 LAST.FM OPTIMIERUNGS-ERGEBNIS:")
    print(f"  • Geprüfte Kandidaten:         {idx + 1:,} von {total_candidates:,}")
    print(f"  • Erfolgreich verbessert:      {improved_count:,} Songs")
    print(f"  • Gewonnene Hörer (Gesamt):    +{total_listeners_gained:,}")
    print("=" * 60)
    print("💾 Alle Änderungen wurden direkt in 'songs_datensatz.json' gespeichert.\n")


if __name__ == '__main__':
    main()

