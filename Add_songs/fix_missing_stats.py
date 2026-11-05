import urllib.request
import urllib.parse
import urllib.error
import json
import time
import re
import sys
import os

# Configure standard streams for UTF-8 to prevent UnicodeEncodeError in Windows terminal
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)

if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

import config_secrets
import config_yt

# --- CONFIGURATION & PATHS ---
MAIN_JSON_FILE = os.path.join(SCRIPT_DIR, 'songs_datensatz.json')
ERROR_JSON_FILE = os.path.join(SCRIPT_DIR, 'songs_fehlend.json')


def normalize_typography(text: str) -> str:
    """Ersetzt typografische Sonderzeichen wie geschwungene Apostrophe und Gedankenstriche."""
    if not text:
        return ""
    text = text.replace('’', "'").replace('‘', "'")
    text = text.replace('“', '"').replace('”', '"')
    text = text.replace('–', '-').replace('—', '-')
    return text.strip()


def strip_features_and_suffixes(title: str) -> str:
    """
    Entfernt Zusätze wie (feat. ...), (with ...), - Remix, - Live, etc.,
    die bei Last.fm und Genius oft Treffer verhindern.
    """
    if not title:
        return ""
    title = normalize_typography(title)
    # Entferne (feat. ...), (with ...) und [feat. ...]
    title = re.sub(r'[\(\[\{]\s*(?:featuring|feat\.?|ft\.?|with|remix|version|live|deluxe).*?[\)\]\}]', '', title, flags=re.IGNORECASE)
    # Entferne Suffixe nach Bindestrich wie ' - Remix', ' - Live', ' - Remastered 2011'
    title = re.sub(r'(?i)\s*-\s*(remaster|live|radio edit|mono|stereo|bonus|from|soundtrack|theme|series|remix|version|original).*', '', title)
    return title.strip()


def clean_song_title(title: str) -> str:
    """Vollständige Säuberung auf reine alphanumerische Zeichen für Härtefälle."""
    clean = strip_features_and_suffixes(title)
    clean = re.sub(r'\(.*?\)', '', clean)
    clean = re.sub(r'\[.*?\]', '', clean)
    clean = re.sub(r'[^\w\s]', ' ', clean).strip()
    return ' '.join(clean.split())


# --- YOUTUBE VIEWS ---
def get_youtube_views(artist: str, title: str) -> int:
    clean_t = strip_features_and_suffixes(title)
    clean_a = clean_song_title(artist)

    query = urllib.parse.quote(f"{clean_t} {clean_a} official music video")
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
            print("      [YT API-Fehler] 🛑 Tageslimit (Quota) erreicht!")
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
        (artist, strip_features_and_suffixes(title)),
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

        if best_listeners > 0:
            break

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
    queries = [
        (artist, title),
        (artist, strip_features_and_suffixes(title))
    ]
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9,de;q=0.8'
    }

    for a, t in queries:
        artist_quoted = urllib.parse.quote(a).replace('%20', '+')
        title_quoted = urllib.parse.quote(t).replace('%20', '+')
        urls = [
            f"https://www.last.fm/music/{artist_quoted}/_/{title_quoted}",
            f"https://www.last.fm/de/music/{artist_quoted}/_/{title_quoted}"
        ]
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
        f"{strip_features_and_suffixes(title)} {artist}",
        f"{clean_song_title(title)} {clean_song_title(artist)}"
    ]
    token = config_secrets.GENIUS_ACCESS_TOKEN
    seen = set()

    for query in queries:
        if not query.strip() or query in seen:
            continue
        seen.add(query)

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
def main():
    # 1. Lade Fehlerdatei
    if not os.path.exists(ERROR_JSON_FILE):
        print(f"❌ '{ERROR_JSON_FILE}' nicht gefunden. Keine Songs zu fixen.")
        return

    try:
        with open(ERROR_JSON_FILE, 'r', encoding='utf-8') as f:
            songs_fehlend = json.load(f)
    except Exception as e:
        print(f"❌ Fehler beim Laden von '{ERROR_JSON_FILE}': {e}")
        return

    if not songs_fehlend:
        print(f"ℹ️ '{ERROR_JSON_FILE}' ist leer. Alle Songs sind vollständig!")
        return

    # 2. Lade Hauptdatenbank
    if not os.path.exists(MAIN_JSON_FILE):
        print(f"❌ Hauptdatenbank '{MAIN_JSON_FILE}' nicht gefunden!")
        return

    try:
        with open(MAIN_JSON_FILE, 'r', encoding='utf-8') as f:
            main_db = json.load(f)
        print(f"📂 Haupt-Datenbank '{os.path.basename(MAIN_JSON_FILE)}' geladen ({len(main_db):,} Songs).")
    except Exception as e:
        print(f"❌ Fehler beim Laden der Haupt-Datenbank: {e}")
        return

    # Blitzschneller O(1) Lookup-Index für die Hauptdatenbank
    db_by_uri = {s['spotifyUri']: s for s in main_db if s.get('spotifyUri')}
    db_by_title_artist = {
        (s.get('title', '').strip().lower(), s.get('artist', '').strip().lower()): s
        for s in main_db
    }

    total_songs = len(songs_fehlend)
    print(f"🚀 Starte Korrektur von {total_songs:,} unvollständigen Songs...\n")

    repaired_fully_count = 0
    updated_stats_count = 0
    new_songs_fehlend = []
    quota_reached = False
    stop_reason = ""

    try:
        for idx, song in enumerate(songs_fehlend):
            title = song.get('title', '')
            artist = song.get('artist', '')
            spotify_uri = song.get('spotifyUri', '')

            print(f"[{idx+1}/{total_songs}] Prüfe: '{artist}' - '{title}'")

            # Aktuelle Stats ermitteln
            yt_views = song.get('stats_youtube', 0)
            lastfm_listeners = song.get('stats_lastfm', 0)
            genius_views = song.get('stats_genius', 0)

            has_updates = False

            # 1. YouTube nachholen (nur wenn 0)
            if yt_views == 0:
                print("   📺 YouTube Views fehlen. Suche...")
                try:
                    new_yt = get_youtube_views(artist, title)
                    if new_yt > 0:
                        yt_views = new_yt
                        print(f"      ✅ Gefunden: {yt_views:,} Views")
                        has_updates = True
                    else:
                        print("      ❌ Keine Views gefunden.")
                except Exception as e:
                    if "QUOTA_EXCEEDED" in str(e):
                        raise
                    print(f"      ❌ Fehler bei YouTube Suche: {e}")

            # 2. Last.fm nachholen (nur wenn 0)
            if lastfm_listeners == 0:
                print("   📻 Last.fm Hörer fehlen. Suche...")
                try:
                    new_fm = get_lastfm_listeners(artist, title)
                    if new_fm > 0:
                        lastfm_listeners = new_fm
                        print(f"      ✅ Gefunden: {lastfm_listeners:,} Hörer")
                        has_updates = True
                    else:
                        print("      ❌ Keine Hörer gefunden.")
                except Exception as e:
                    print(f"      ❌ Fehler bei Last.fm Suche: {e}")

            # 3. Genius nachholen (nur wenn 0)
            if genius_views == 0:
                print("   📖 Genius Aufrufe fehlen. Suche...")
                try:
                    new_ge = get_genius_views(artist, title)
                    if new_ge > 0:
                        genius_views = new_ge
                        print(f"      ✅ Gefunden: {genius_views:,} Aufrufe")
                        has_updates = True
                    else:
                        print("      ❌ Keine Aufrufe gefunden.")
                except Exception as e:
                    if "GENIUS_LIMIT_REACHED" in str(e):
                        raise
                    print(f"      ❌ Fehler bei Genius Suche: {e}")

            # Werte im Fehler-Objekt aktualisieren
            song['stats_youtube'] = yt_views
            song['stats_lastfm'] = lastfm_listeners
            song['stats_genius'] = genius_views

            # Bei Verbesserungen: Direkt in Hauptdatenbank (songs_datensatz.json) schreiben!
            if has_updates:
                updated_stats_count += 1
                main_match = db_by_uri.get(spotify_uri)
                if not main_match:
                    main_match = db_by_title_artist.get((title.strip().lower(), artist.strip().lower()))

                if main_match:
                    main_match['stats_youtube'] = max(1, yt_views)
                    main_match['stats_lastfm'] = max(1, lastfm_listeners)
                    main_match['stats_genius'] = max(1, genius_views)
                    print("   🔄 Hauptdatenbank (songs_datensatz.json) direkt aktualisiert.")

            # Prüfe, ob der Song jetzt vollständig repariert ist (keine 0 mehr)
            still_has_zeros = (yt_views == 0 or lastfm_listeners == 0 or genius_views == 0)

            if still_has_zeros:
                print("   ⚠️ Weiterhin mindestens ein Wert 0. Bleibt in songs_fehlend.json.")
                new_songs_fehlend.append(song)
            else:
                repaired_fully_count += 1
                print("   ✨ Vollständig repariert! Aus songs_fehlend.json entfernt.")

            # Autosave alle 5 bearbeiteten Songs
            if (idx + 1) % 5 == 0:
                with open(MAIN_JSON_FILE, 'w', encoding='utf-8') as f:
                    json.dump(main_db, f, indent=4, ensure_ascii=False)
                # Schreibe bereits bearbeitete verbleibende + noch unberührte Songs
                current_remaining = new_songs_fehlend + songs_fehlend[idx+1:]
                with open(ERROR_JSON_FILE, 'w', encoding='utf-8') as f:
                    json.dump(current_remaining, f, indent=4, ensure_ascii=False)
                print("   💾 [Autosave erfolgreich]")

            # Höfliche Pause
            time.sleep(1.0)

    except KeyboardInterrupt:
        print("\n\n🛑 Manuell abgebrochen. Speichere Zwischenstand...")
        new_songs_fehlend.extend(songs_fehlend[idx:])
    except Exception as e:
        err_msg = str(e)
        if "QUOTA_EXCEEDED" in err_msg:
            quota_reached = True
            stop_reason = "YouTube Quota erreicht"
            print(f"\n\n🛑 {stop_reason}!")
        elif "GENIUS_LIMIT_REACHED" in err_msg:
            quota_reached = True
            stop_reason = err_msg.replace("GENIUS_LIMIT_REACHED: ", "")
            print(f"\n\n🛑 Genius Limit: {stop_reason}!")
        else:
            print(f"\n\n❌ Unerwarteter Fehler: {e}")
        new_songs_fehlend.extend(songs_fehlend[idx:])

    # 3. Finaler Save
    print(f"\n💾 Speichere finalen Stand...")
    with open(MAIN_JSON_FILE, 'w', encoding='utf-8') as f:
        json.dump(main_db, f, indent=4, ensure_ascii=False)
    with open(ERROR_JSON_FILE, 'w', encoding='utf-8') as f:
        json.dump(new_songs_fehlend, f, indent=4, ensure_ascii=False)

    print("\n" + "=" * 55)
    print("📊 ERGEBNIS-STATISTIK:")
    print(f"  • Geprüfte Songs aus Fehlerdatei:   {idx + 1:,} von {total_songs:,}")
    print(f"  • Stats erfolgreich nachgeholt:     {updated_stats_count:,}")
    print(f"  • Vollständig repariert (aus Liste): {repaired_fully_count:,}")
    print(f"  • Verbleibend in songs_fehlend:     {len(new_songs_fehlend):,}")
    print("=" * 55)

    if quota_reached:
        print(f"ℹ️ Pausiert wegen: {stop_reason}.")
        print("ℹ️ Starte das Skript einfach später erneut – es macht genau mit den verbleibenden Songs weiter.")


if __name__ == '__main__':
    main()
