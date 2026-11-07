import urllib.request
import urllib.parse
import urllib.error
import json
import time
import re
import os
import sys

# Configure standard streams for UTF-8 to prevent UnicodeEncodeError in Windows terminal
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)

# Add PROJECT_ROOT and SCRIPT_DIR to sys.path to easily import configs and helper modules
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

import config_secrets
import config_yt

# --- CONFIGURATION & PATHS ---
DATASET_JSON_FILE = os.path.join(SCRIPT_DIR, 'songs_datensatz.json')
MAIN_JSON_FILE = os.path.join(PROJECT_ROOT, 'song_list.json')
ERROR_JSON_FILE = os.path.join(SCRIPT_DIR, 'songs_fehlend.json')


def clean_song_title(title: str) -> str:
    """Bereinigt Titel von Versionszusätzen (Remaster, Live, etc.) für Suchanfragen."""
    if not title:
        return ""
    clean = re.sub(r'(?i)\s*-\s*(remaster|live|radio edit|mono|stereo|bonus|from|soundtrack|theme|series).*', '', title)
    clean = re.sub(r'\(.*?\)', '', clean)
    clean = re.sub(r'\[.*?\]', '', clean)
    clean = re.sub(r'[^\w\s]', ' ', clean).strip()
    return clean


# --- ITUNES: GENRE, ALBUM COVER & ECHTES RELEASE-JAHR ---
def get_itunes_data(artist: str, title: str):
    """
    Holt in einem einzigen API-Aufruf:
    - Genre (z. B. 'Pop', 'Rock', 'R&B/Soul')
    - Hochauflösendes 600x600 Album-Cover
    - Das offizielle Release-/Entstehungsjahr des Songs
    """
    clean_t = clean_song_title(title)
    clean_a = clean_song_title(artist)

    queries = [
        f"{artist} {title}",
        f"{clean_a} {clean_t}"
    ]

    for q in queries:
        if not q.strip():
            continue
        try:
            url = f"https://itunes.apple.com/search?term={urllib.parse.quote(q)}&entity=song&limit=1"
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=8) as response:
                data = json.loads(response.read())
                if data.get('resultCount', 0) > 0:
                    item = data['results'][0]

                    # 1. Genre
                    genre = item.get('primaryGenreName', 'Pop')

                    # 2. Cover (in hochauflösend 600x600 umwandeln)
                    artwork = item.get('artworkUrl100', '')
                    if artwork:
                        artwork = artwork.replace('100x100bb', '600x600bb')

                    # 3. Echtes Release-Jahr
                    rel_date = item.get('releaseDate', '')
                    year = int(rel_date[:4]) if len(rel_date) >= 4 and rel_date[:4].isdigit() else 0

                    return genre, artwork, year
        except urllib.error.HTTPError as e:
            if e.code in (403, 429):
                time.sleep(3)
        except Exception:
            pass

    return "Pop", "", 0


# --- YOUTUBE VIEWS ---
def get_youtube_views(artist: str, title: str) -> int:
    query = urllib.parse.quote(f"{title} {artist} official music video")
    search_url = "https://www.youtube.com/results?search_query=" + query
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Cookie': 'CONSENT=YES+cb.20230101-00-p0.de+FX+123'
    }

    video_ids = []
    try:
        req_web = urllib.request.Request(search_url, headers=headers)
        with urllib.request.urlopen(req_web, timeout=8) as response:
            html = response.read().decode('utf-8')
            all_ids = re.findall(r'"videoId":"([a-zA-Z0-9_-]{11})"', html)
            video_ids = list(dict.fromkeys(all_ids))[:5]
    except Exception as e:
        print(f"      [YT Search Error] Konnte Ergebnisseite nicht laden: {e}")

    if not video_ids:
        return 0

    stats_url = f"https://www.googleapis.com/youtube/v3/videos?part=statistics&id={','.join(video_ids)}&key={config_yt.API_KEY}"
    try:
        req_stats = urllib.request.Request(stats_url)
        with urllib.request.urlopen(req_stats, timeout=8) as response:
            stats_data = json.loads(response.read())
            items = stats_data.get('items', [])
            if items:
                max_views = 0
                for item in items:
                    views = int(item['statistics'].get('viewCount', 0))
                    if views > max_views:
                        max_views = views
                return max_views
    except urllib.error.HTTPError as e:
        if e.code == 403:
            print("      [YT API-Fehler] 🛑 Tageslimit (Quota) von 10.000 erreicht!")
            raise Exception("QUOTA_EXCEEDED")
        else:
            print(f"      [YT API-Fehler] HTTP {e.code}")
    except Exception as e:
        print(f"      [YT API-Fehler] {e}")

    return 0


# --- LAST.FM LISTENERS ---
def get_lastfm_listeners_api(artist: str, title: str) -> int:
    queries = [
        (artist, title),
        (clean_song_title(artist), clean_song_title(title))
    ]
    api_key = config_secrets.LASTFM_API_KEY
    best_listeners = 0
    seen = set()

    for a, t in queries:
        if not a or not t or (a, t) in seen:
            continue
        seen.add((a, t))

        a_quoted = urllib.parse.quote(a)
        t_quoted = urllib.parse.quote(t)

        # 1. Zuerst track.search (findet den kanonischen Haupteintrag unabhängig von Groß-/Kleinschreibung)
        url_search = f"http://ws.audioscrobbler.com/2.0/?method=track.search&api_key={api_key}&artist={a_quoted}&track={t_quoted}&limit=10&format=json"
        try:
            req = urllib.request.Request(url_search, headers={'User-Agent': 'MusicQuiz/1.0'})
            with urllib.request.urlopen(req, timeout=6) as response:
                data = json.loads(response.read())
                matches = data.get('results', {}).get('trackmatches', {}).get('track', [])
                if isinstance(matches, dict):
                    matches = [matches]
                norm_a = re.sub(r'[^\w]', '', a.lower())
                for m in matches:
                    m_artist = re.sub(r'[^\w]', '', m.get('artist', '').lower())
                    if norm_a in m_artist or m_artist in norm_a:
                        try:
                            l = int(m.get('listeners', 0))
                            if l > best_listeners:
                                best_listeners = l
                        except ValueError:
                            pass
        except Exception:
            pass

        # 2. Parallel track.getInfo prüfen und das Maximum behalten
        url_info = f"http://ws.audioscrobbler.com/2.0/?method=track.getInfo&api_key={api_key}&artist={a_quoted}&track={t_quoted}&format=json"
        try:
            req = urllib.request.Request(url_info, headers={'User-Agent': 'MusicQuiz/1.0'})
            with urllib.request.urlopen(req, timeout=6) as response:
                data = json.loads(response.read())
                if 'track' in data and 'listeners' in data['track']:
                    listeners = int(data['track']['listeners'])
                    if listeners > best_listeners:
                        best_listeners = listeners
        except Exception:
            pass

    return best_listeners


def parse_lastfm_html(html: str) -> int:
    blocks = re.findall(r'<li class="header-metadata-tnew-item">.*?</li>', html, re.DOTALL)
    listeners = 0
    for block in blocks:
        lbl_match = re.search(r'<h4 class="header-metadata-tnew-title">\s*(.*?)\s*</h4>', block, re.DOTALL)
        val_match = re.search(r'title="([\d.,]+)"', block)
        if lbl_match and val_match:
            lbl = lbl_match.group(1).lower().strip()
            val_str = val_match.group(1).replace('.', '').replace(',', '')
            val = int(val_str)
            if 'listener' in lbl or 'hörer' in lbl or 'h\u00f6rer' in lbl or 'h&ouml;rer' in lbl:
                listeners = val
    return listeners


def scrape_lastfm_listeners(artist: str, title: str) -> int:
    artist_quoted = urllib.parse.quote(artist).replace('%20', '+')
    title_quoted = urllib.parse.quote(title).replace('%20', '+')
    urls = [
        f"https://www.last.fm/music/{artist_quoted}/_/{title_quoted}",
        f"https://www.last.fm/de/music/{artist_quoted}/_/{title_quoted}"
    ]
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9,de;q=0.8'
    }
    for url in urls:
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=6) as response:
                html = response.read().decode('utf-8')
                listeners = parse_lastfm_html(html)
                if listeners > 0:
                    return listeners
        except Exception:
            pass
    return 0


def get_lastfm_listeners(artist: str, title: str) -> int:
    listeners = get_lastfm_listeners_api(artist, title)
    if listeners > 0:
        return listeners
    return scrape_lastfm_listeners(artist, title)


# --- GENIUS VIEWS ---
def get_genius_path_and_views_api(artist: str, title: str):
    queries = [
        f"{title} {artist}",
        f"{clean_song_title(title)} {clean_song_title(artist)}"
    ]
    token = config_secrets.GENIUS_ACCESS_TOKEN
    for query in queries:
        url = f"https://api.genius.com/search?q={urllib.parse.quote(query)}"
        try:
            req = urllib.request.Request(url, headers={'Authorization': f'Bearer {token}'})
            with urllib.request.urlopen(req, timeout=6) as response:
                data = json.loads(response.read())
                hits = data.get('response', {}).get('hits', [])
                if hits:
                    result = hits[0].get('result', {})
                    path = result.get('path')
                    stats = result.get('stats', {})
                    api_views = stats.get('pageviews', 0)
                    if path:
                        return path, api_views
        except urllib.error.HTTPError as e:
            if e.code == 429:
                reset_sec = e.headers.get('x-ratelimit-reset')
                msg = "Genius API Rate-Limit (HTTP 429) erreicht."
                if reset_sec and reset_sec.isdigit():
                    hrs = int(reset_sec) // 3600
                    mins = (int(reset_sec) % 3600) // 60
                    msg += f" Reset in ca. {hrs} Std. {mins} Min."
                print(f"      [Genius API-Fehler] 🛑 {msg}")
                raise Exception(f"GENIUS_LIMIT_REACHED: {msg}")
            elif e.code == 403:
                print("      [Genius API-Fehler] 🛑 Zugriff verweigert / Token gesperrt (HTTP 403)!")
                raise Exception("GENIUS_LIMIT_REACHED: HTTP 403")
            else:
                print(f"      [Genius API-Fehler] HTTP {e.code}")
        except Exception as e:
            if "GENIUS_LIMIT_REACHED" in str(e):
                raise
    return None, 0


def scrape_genius_pageviews(path: str) -> int:
    url = f"https://genius.com{path}"
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=6) as response:
            html = response.read().decode('utf-8')
            match = re.search(r"const\s+rawData\s*=\s*JSON\.parse\('(.*?)'\);", html)
            if match:
                json_str = match.group(1).replace('\\"', '"')
                try:
                    data = json.loads(json_str)
                    views = data.get('pageviews')
                    if views is not None:
                        return int(views)
                except Exception:
                    pass
            match_pv = re.search(r'\\?"pageviews\\?":\s*(\d+)', html)
            if match_pv:
                return int(match_pv.group(1))
    except urllib.error.HTTPError as e:
        if e.code == 429:
            print("      [Genius Scrape-Fehler] 🛑 Rate-Limit (429) beim HTML-Scraping!")
            raise Exception("GENIUS_LIMIT_REACHED: 429 Scrape")
    except Exception as e:
        if "GENIUS_LIMIT_REACHED" in str(e):
            raise
    return 0


def get_genius_views(artist: str, title: str) -> int:
    path, api_views = get_genius_path_and_views_api(artist, title)
    if path:
        views = scrape_genius_pageviews(path)
        if views > 0:
            return views
        if api_views > 0:
            return api_views
    return 0


# --- HAUPTPROZESS ---
def run_dataset_scraper():
    if not os.path.exists(DATASET_JSON_FILE):
        print(f"❌ '{DATASET_JSON_FILE}' nicht gefunden! Bitte vorher extract_songs_from_dataset.py ausführen.")
        return

    # 1. Lade Datensatz-Songs
    with open(DATASET_JSON_FILE, 'r', encoding='utf-8') as f:
        try:
            dataset_songs = json.load(f)
        except Exception as e:
            print(f"❌ Fehler beim Laden von '{DATASET_JSON_FILE}': {e}")
            return

    # 2. Lade Fehler-Datenbank
    try:
        with open(ERROR_JSON_FILE, 'r', encoding='utf-8') as f:
            error_db = json.load(f)
            if not isinstance(error_db, list):
                error_db = []
    except (FileNotFoundError, json.JSONDecodeError):
        error_db = []

    # Prüfe wie viele Songs noch bearbeitet werden müssen
    unprocessed = [s for s in dataset_songs if not s.get('raw_data_collected', False)]
    already_done = len(dataset_songs) - len(unprocessed)

    print(f"📂 Datensatz geladen: {len(dataset_songs):,} Songs insgesamt.")
    print(f"   • Bereits fertig: {already_done:,}")
    print(f"   • Noch zu verarbeiten: {len(unprocessed):,}\n")

    if not unprocessed:
        print("🎉 Alle Songs im Datensatz wurden bereits vollständig gescrapt!")
        return

    processed_in_session = 0
    quota_reached = False
    stop_reason = ""

    try:
        for idx, song in enumerate(unprocessed):
            title = song.get('title', '')
            artist = song.get('artist', '')
            spotify_uri = song.get('spotifyUri', '')

            print(f"\n[{idx + 1}/{len(unprocessed)}] Bearbeite: {artist} - {title}")

            # 1. iTunes: Genre, Album-Cover (600x600) & Entstehungsjahr in EINEM Aufruf
            genre, cover_url, year = get_itunes_data(artist, title)
            if genre:
                song['genre'] = genre
            if cover_url:
                song['coverUrl'] = cover_url
            if year > 0:
                song['year'] = year

            print(f"   🏷️ iTunes Genre:   {song.get('genre', 'Pop')}")
            print(f"   📅 Release-Jahr:   {song.get('year', 0)}")
            print(f"   🖼️ Cover:          {'✓ Vorhanden' if song.get('coverUrl') else '❌ Nicht gefunden'}")

            # 2. Statistiken holen
            clean_t = clean_song_title(title)
            clean_a = clean_song_title(artist)

            yt_views = get_youtube_views(clean_a, clean_t)
            lastfm_listeners = get_lastfm_listeners(clean_a, clean_t)
            genius_views = get_genius_views(clean_a, clean_t)

            print(f"   📺 YouTube Views:  {yt_views:,}")
            print(f"   📻 Last.fm Hörer:  {lastfm_listeners:,}")
            print(f"   📖 Genius Aufrufe: {genius_views:,}")

            # Quarantine Check: Falls ein Wert 0 ist, zur Fehlersammlung hinzufügen
            has_missing_stats = (yt_views == 0 or lastfm_listeners == 0 or genius_views == 0)
            if has_missing_stats:
                print("   ⚠️ Ein Wert ist 0. Song wird zur Fehlerliste hinzugefügt.")
                # Vermeide doppelte Einträge in error_db
                if not any(e.get('spotifyUri') == spotify_uri for e in error_db):
                    error_db.append({
                        "title": title,
                        "artist": artist,
                        "spotifyUri": spotify_uri,
                        "stats_youtube": yt_views,
                        "stats_lastfm": lastfm_listeners,
                        "stats_genius": genius_views
                    })

            # Stats im Song-Objekt hinterlegen
            song['stats_youtube'] = max(1, yt_views)
            song['stats_lastfm'] = max(1, lastfm_listeners)
            song['stats_genius'] = max(1, genius_views)
            song['raw_data_collected'] = True

            processed_in_session += 1

            # Autosave alle 5 Songs
            if processed_in_session % 5 == 0:
                with open(DATASET_JSON_FILE, 'w', encoding='utf-8') as f:
                    json.dump(dataset_songs, f, indent=4, ensure_ascii=False)
                with open(ERROR_JSON_FILE, 'w', encoding='utf-8') as f:
                    json.dump(error_db, f, indent=4, ensure_ascii=False)
                print("   💾 [Autosave erfolgreich]")

            # Höfliche Pause zur Vermeidung von Rate-Limits (iTunes, Last.fm, Genius)
            time.sleep(1.1)

    except KeyboardInterrupt:
        print("\n\n🛑 Manuell abgebrochen. Speichere Zwischenstand...")
    except Exception as e:
        err_msg = str(e)
        if err_msg == "QUOTA_EXCEEDED":
            quota_reached = True
            stop_reason = "YouTube-API Quota (10.000 Einheiten) erreicht"
            print(f"\n\n🛑 {stop_reason}!")
        elif "GENIUS_LIMIT_REACHED" in err_msg:
            quota_reached = True
            stop_reason = err_msg.replace("GENIUS_LIMIT_REACHED: ", "")
            print(f"\n\n🛑 Genius Limit: {stop_reason}!")
        else:
            print(f"\n\n❌ Unerwarteter Fehler: {e}")

    # Finaler Save
    print(f"\n💾 Speichere finalen Fortschritt in '{os.path.basename(DATASET_JSON_FILE)}'...")
    with open(DATASET_JSON_FILE, 'w', encoding='utf-8') as f:
        json.dump(dataset_songs, f, indent=4, ensure_ascii=False)
    with open(ERROR_JSON_FILE, 'w', encoding='utf-8') as f:
        json.dump(error_db, f, indent=4, ensure_ascii=False)

    print(f"🎉 Sitzung beendet! {processed_in_session:,} Songs in diesem Durchlauf erfolgreich aktualisiert.")

    if quota_reached:
        print(f"ℹ️ Grund: {stop_reason}.")
        print("ℹ️ Du kannst das Skript später einfach erneut starten – es macht automatisch genau da weiter, wo es aufgehört hat!")


if __name__ == '__main__':
    run_dataset_scraper()
