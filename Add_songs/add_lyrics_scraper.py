import urllib.request
import urllib.parse
import urllib.error
import json
import time
import re
import sys
import os
import html
import argparse

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

JSON_FILE = os.path.join(PROJECT_ROOT, 'song_list.json')
GENIUS_TOKEN = config_secrets.GENIUS_ACCESS_TOKEN

def clean_artist_name(name):
    # Convert to lowercase and strip special characters except space
    clean = re.sub(r'[^\w\s]', '', name.lower())
    # Collapse whitespace
    clean = re.sub(r'\s+', ' ', clean).strip()
    return clean

def clean_song_title(title):
    # Removes square and round bracket contents
    clean = re.sub(r'\[.*?\]', '', title)
    clean = re.sub(r'\(.*?\)', '', clean)
    # Removes Spotify suffixes like " - 2013 Remaster", " - Remastered 2011", " - Live", " - Single Version", " - Remix", etc.
    clean = re.sub(r'(?i)\s*-\s*(\d{1,4}\s+(years\s+)?)?(remaster|live|radio edit|single version|single remix|version|album version|mono|stereo|bonus|from|soundtrack|theme|series|recorded|mix|edit).*', '', clean)
    # Remove quotes, collapse whitespace
    clean = re.sub(r'["\']', '', clean)
    clean = re.sub(r'\s+', ' ', clean).strip()
    return clean

def title_matches(input_title, genius_title):
    c_in = re.sub(r'[^\w\s]', '', clean_song_title(input_title).lower()).strip()
    c_gen = re.sub(r'[^\w\s]', '', genius_title.lower()).strip()
    
    if not c_in or not c_gen:
        return False
        
    # If the input title doesn't mention 'live', don't match a genius title that explicitly says '(live' or 'live at'
    if 'live' not in input_title.lower() and ('(live' in genius_title.lower() or 'live in' in genius_title.lower() or 'live at' in genius_title.lower()):
        return False
        
    # Check if significant words overlap
    words_in = [w for w in c_in.split() if len(w) > 2]
    words_gen = [w for w in c_gen.split() if len(w) > 2]
    
    if not words_in:
        return c_in in c_gen or c_gen in c_in
        
    overlap = sum(1 for w in words_in if w in words_gen)
    return overlap >= max(1, len(words_in) // 2)

def artist_matches(input_artist, genius_artist):
    c_input = clean_artist_name(input_artist)
    c_genius = clean_artist_name(genius_artist)
    
    # Direct substring checks
    if c_input in c_genius or c_genius in c_input:
        return True
        
    # Split into words and check if there's any significant word overlap (word length > 2)
    words_input = [w for w in c_input.split() if len(w) > 2]
    words_genius = [w for w in c_genius.split() if len(w) > 2]
    
    for w in words_input:
        if w in words_genius:
            return True
            
    return False

# Blacklist for Genius search translation / metadata pages
BLACKLIST = [
    'translation', 'traducción', 'traduction', 'übersetzung', 'uebersetzung', 
    'traduzione', 'çeviri', 'ceviri', 'tradução', 'traducao', 'tłumaczenie', 'tlumaczenie',
    'tracklist', 'discography', 'booklet', 'credits', 'setlist', 'liner-notes', 'q&a', 'review', 'cover-art',
    'screenplay', 'transcript', 'keynote', 'essay', 'speech', 'playlist'
]

def is_blacklisted(title, url, primary_artist, input_artist):
    title_lower = title.lower()
    url_lower = url.lower()
    
    # Check blacklisted terms in title/URL
    for word in BLACKLIST:
        if word in title_lower or word in url_lower:
            return True
            
    # Check translation artist teams (primary artist contains 'Genius' but the input artist does not)
    if "genius" in primary_artist.lower() and "genius" not in input_artist.lower():
        return True
        
    return False

def extract_genius_year(song_info):
    rdc = song_info.get('release_date_components')
    if isinstance(rdc, dict) and rdc.get('year'):
        try:
            y = int(rdc.get('year'))
            if 1900 <= y <= 2030:
                return y
        except (ValueError, TypeError):
            pass
            
    rel_date = song_info.get('release_date')
    if rel_date and isinstance(rel_date, str):
        m = re.search(r'\b(19\d\d|20\d\d)\b', rel_date)
        if m:
            return int(m.group(1))
            
    return None

def search_genius(artist, title):
    clean_title = clean_song_title(title)
    # We query Genius with a clean title + artist name
    query = f"{artist} {clean_title}"
    url = f"https://api.genius.com/search?q={urllib.parse.quote(query)}"
    
    req = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {GENIUS_TOKEN}",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    })
    
    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            data = json.loads(response.read().decode('utf-8'))
            hits = data.get('response', {}).get('hits', [])
            if hits:
                # 1. Best match: artist matches, title matches, not blacklisted
                for hit in hits:
                    if hit.get('type') == 'song':
                        song_info = hit.get('result', {})
                        genius_artist = song_info.get('primary_artist', {}).get('name', '')
                        genius_title = song_info.get('title', '')
                        genius_url = song_info.get('url', '')
                        if artist_matches(artist, genius_artist) and title_matches(title, genius_title) and not is_blacklisted(genius_title, genius_url, genius_artist, artist):
                            return genius_url, song_info.get('full_title'), extract_genius_year(song_info)

                # 2. Relaxed match: artist matches and not blacklisted
                for hit in hits:
                    if hit.get('type') == 'song':
                        song_info = hit.get('result', {})
                        genius_artist = song_info.get('primary_artist', {}).get('name', '')
                        genius_title = song_info.get('title', '')
                        genius_url = song_info.get('url', '')
                        if artist_matches(artist, genius_artist) and not is_blacklisted(genius_title, genius_url, genius_artist, artist):
                            return genius_url, song_info.get('full_title'), extract_genius_year(song_info)
    except Exception as e:
        print(f"      [Search Error] {e}")
    return None, None, None

def scrape_lyrics_from_url(url):
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    })
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            html_content = response.read().decode('utf-8', errors='ignore')
    except Exception as e:
        print(f"      [HTTP Error] Konnte HTML nicht laden: {e}")
        return None

    # Step 1: Extract all data-lyrics-container="true" blocks directly from raw HTML
    pattern = re.compile(r'<div[^>]*data-lyrics-container="true"[^>]*>')
    matches = list(pattern.finditer(html_content))
    
    if not matches:
        return None
        
    lyrics_parts = []
    
    for match in matches:
        start_pos = match.end()
        open_divs = 1
        pos = start_pos
        while open_divs > 0 and pos < len(html_content):
            next_open = html_content.find('<div', pos)
            next_close = html_content.find('</div', pos)
            if next_close == -1:
                break
            if next_open != -1 and next_open < next_close:
                open_divs += 1
                pos = next_open + 4
            else:
                open_divs -= 1
                pos = next_close + 6
                if open_divs == 0:
                    container_content = html_content[start_pos:next_close].strip()
                    if container_content:
                        lyrics_parts.append(container_content)
                    break
                    
    if not lyrics_parts:
        return None

    full_lyrics_html = "\n".join(lyrics_parts)

    # Step 2: Strip internal data-exclude-from-selection elements cleanly
    while True:
        m = re.search(r'<div[^>]*data-exclude-from-selection="true"[^>]*>', full_lyrics_html)
        if not m:
            break
        s_pos = m.start()
        open_d = 1
        curr = m.end()
        while open_d > 0 and curr < len(full_lyrics_html):
            no = full_lyrics_html.find('<div', curr)
            nc = full_lyrics_html.find('</div', curr)
            if nc == -1:
                break
            if no != -1 and no < nc:
                open_d += 1
                curr = no + 4
            else:
                open_d -= 1
                curr = nc + 6
                if open_d == 0:
                    full_lyrics_html = full_lyrics_html[:s_pos] + full_lyrics_html[curr:]
                    break

    # Step 3: Format extracted content
    # Replace <br> tags with actual newlines
    cleaned = re.sub(r'<br\s*/?>', '\n', full_lyrics_html)
    # Remove all remaining HTML tags
    cleaned = re.sub(r'<[^>]+>', '', cleaned)
    # Unescape HTML entities
    cleaned = html.unescape(cleaned)
    
    # Normalize newlines: remove trailing/leading spaces from each line, collapse multiple blank lines
    lines = [line.strip() for line in cleaned.split('\n')]
    cleaned_lines = []
    for line in lines:
        if line:
            cleaned_lines.append(line)
        else:
            if cleaned_lines and cleaned_lines[-1] != "":
                cleaned_lines.append("")
    
    return "\n".join(cleaned_lines).strip()

def main():
    parser = argparse.ArgumentParser(description="Genius.com Song Lyrics Scraper")
    parser.add_argument("--test", action="store_true", help="Scrape only 3 songs to verify execution")
    parser.add_argument("--limit", type=int, default=0, help="Limit total songs processed in this run")
    parser.add_argument("--force", action="store_true", help="Re-scrape songs that already have lyrics")
    parser.add_argument("--update-years-only", action="store_true", help="Only query Genius search to correct release years (fast, no HTML lyrics scraping)")
    args = parser.parse_args()

    if not os.path.exists(JSON_FILE):
        print(f"❌ Datei {JSON_FILE} nicht gefunden!")
        return

    # Load songs
    with open(JSON_FILE, 'r', encoding='utf-8') as f:
        songs = json.load(f)

    print(f"📂 {len(songs)} Songs geladen.")
    
    # Filter songs to process
    to_process = []
    for idx, song in enumerate(songs):
        if args.update_years_only:
            to_process.append((idx, song))
        else:
            # We skip if it already has lyrics and we aren't forcing
            has_lyrics = "lyrics" in song and song["lyrics"] is not None and song["lyrics"] != ""
            has_error = song.get("lyrics_error", False)
            
            if args.force or (not has_lyrics and not has_error):
                to_process.append((idx, song))

    total_to_process = len(to_process)
    if args.test:
        to_process = to_process[:3]
        total_to_process = len(to_process)
        print(f"🧪 Testmodus aktiv: Verarbeite maximal 3 Songs.")
    elif args.limit > 0:
        to_process = to_process[:args.limit]
        total_to_process = len(to_process)
        print(f"🔢 Limit aktiv: Verarbeite maximal {args.limit} Songs.")

    mode_desc = "Jahreszahlen-Aktualisierung (ohne HTML-Download)" if args.update_years_only else "Scraping (inkl. Jahreszahlen-Prüfung)"
    print(f"⏳ Starte {mode_desc} für {total_to_process} Songs...")
    
    success_count = 0
    fail_count = 0
    year_update_count = 0
    
    start_time = time.time()
    
    try:
        for i, (original_idx, song) in enumerate(to_process, 1):
            artist = song.get("artist", "")
            title = song.get("title", "")
            
            print(f"[{i}/{total_to_process}] Suche nach '{title}' von '{artist}'...")
            
            url, genius_title, genius_year = search_genius(artist, title)
            if not url:
                print(f"   ⚠️ Nicht auf Genius gefunden.")
                if not args.update_years_only:
                    song["lyrics"] = ""
                    song["lyrics_error"] = True
                    fail_count += 1
            else:
                # Update release year if Genius provides one
                if genius_year:
                    old_year = song.get("year")
                    try:
                        old_year_val = int(old_year) if old_year is not None else None
                    except (ValueError, TypeError):
                        old_year_val = None
                        
                    if old_year_val != genius_year:
                        print(f"   📅 [Jahr korrigiert] {old_year} -> {genius_year}")
                        song["year"] = genius_year
                        year_update_count += 1
                
                if args.update_years_only:
                    success_count += 1
                else:
                    print(f"   🔗 Gefunden: '{genius_title}' -> Scrape HTML...")
                    lyrics = scrape_lyrics_from_url(url)
                    if lyrics:
                        song["lyrics"] = lyrics
                        # Clean the error flag if present
                        if "lyrics_error" in song:
                            del song["lyrics_error"]
                        success_count += 1
                        print(f"   ✅ Erfolg! ({len(lyrics)} Zeichen)")
                    else:
                        print(f"   ❌ Fehler beim Parsen der Lyrics von Genius HTML.")
                        song["lyrics"] = ""
                        song["lyrics_error"] = True
                        fail_count += 1
            
            # Save progress after every song to prevent data loss
            with open(JSON_FILE, 'w', encoding='utf-8') as f:
                json.dump(songs, f, indent=4, ensure_ascii=False)
                
            # Rate limiting
            time.sleep(0.3)
            
    except KeyboardInterrupt:
        print("\n🛑 Vorgang abgebrochen durch Benutzer. Fortschritt gespeichert.")
        
    end_time = time.time()
    elapsed = end_time - start_time
    
    print("\n================ STATISTIK ================")
    print(f"Dauer: {elapsed:.2f} Sekunden")
    print(f"Verarbeitet/Erfolgreich: {success_count}")
    print(f"Jahreszahlen aktualisiert: {year_update_count}")
    if not args.update_years_only:
        print(f"Fehlgeschlagen: {fail_count}")
        print(f"Gesamtfortschritt im File: {sum(1 for s in songs if 'lyrics' in s and s['lyrics'])} / {len(songs)} Songs mit Lyrics.")
    print("===========================================")

if __name__ == "__main__":
    main()
