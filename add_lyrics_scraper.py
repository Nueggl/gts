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

# Add path to import config_secrets from the current directory
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import config_secrets

JSON_FILE = 'songs_new_score_updated_popularity.json'
GENIUS_TOKEN = config_secrets.GENIUS_ACCESS_TOKEN

def clean_artist_name(name):
    # Convert to lowercase and strip special characters except space
    clean = re.sub(r'[^\w\s]', '', name.lower())
    # Collapse whitespace
    clean = re.sub(r'\s+', ' ', clean).strip()
    return clean

def clean_song_title(title):
    # Removes Spotify suffixes like " - 2013 Remaster", " - Remastered 2011", " - Live", " - Radio Edit", etc.
    clean = re.sub(r'(?i)\s*-\s*(\d{4}\s+)?(remaster|live|radio edit|mono|stereo|bonus|from|soundtrack|theme|series|recorded).*', '', title)
    # Removes trailing parenthesis content
    clean = re.sub(r'\(.*?\)', '', clean)
    # Removes other symbols
    clean = re.sub(r'[^\w\s]', ' ', clean)
    # Collapse whitespace
    clean = re.sub(r'\s+', ' ', clean).strip()
    return clean

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
    'tracklist', 'discography', 'booklet', 'credits', 'setlist', 'liner-notes', 'q&a', 'review', 'cover-art'
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
                # 1. Find the first hit that matches the artist AND is not blacklisted
                for hit in hits:
                    if hit.get('type') == 'song':
                        song_info = hit.get('result', {})
                        genius_artist = song_info.get('primary_artist', {}).get('name', '')
                        genius_title = song_info.get('title', '')
                        genius_url = song_info.get('url', '')
                        if artist_matches(artist, genius_artist) and not is_blacklisted(genius_title, genius_url, genius_artist, artist):
                            return genius_url, song_info.get('full_title')
                
                # 2. Fallback: return the first song hit that is not blacklisted
                for hit in hits:
                    if hit.get('type') == 'song':
                        song_info = hit.get('result', {})
                        genius_artist = song_info.get('primary_artist', {}).get('name', '')
                        genius_title = song_info.get('title', '')
                        genius_url = song_info.get('url', '')
                        if not is_blacklisted(genius_title, genius_url, genius_artist, artist):
                            return genius_url, song_info.get('full_title')
    except Exception as e:
        print(f"      [Search Error] {e}")
    return None, None

def scrape_lyrics_from_url(url):
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    })
    try:
        with urllib.request.urlopen(req) as response:
            html_content = response.read().decode('utf-8', errors='ignore')
    except Exception as e:
        print(f"      [HTTP Error] Konnte HTML nicht laden: {e}")
        return None

    # Step 1: Strip elements with data-exclude-from-selection="true" (like the header/contributor credit info)
    while True:
        match = re.search(r'<div[^>]*data-exclude-from-selection="true"[^>]*>', html_content)
        if not match:
            break
        start_pos = match.start()
        open_divs = 1
        pos = match.end()
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
                    html_content = html_content[:start_pos] + html_content[pos:]
                    break

    # Step 2: Extract data-lyrics-container="true" blocks
    pattern = re.compile(r'<div[^>]*data-lyrics-container="true"[^>]*>')
    matches = list(pattern.finditer(html_content))
    
    if not matches:
        return None
        
    lyrics_parts = []
    parsed_ranges = []
    
    for match in matches:
        start_pos = match.end()
        # Avoid duplicate overlapping parts (if any)
        already_parsed = False
        for p_start, p_end in parsed_ranges:
            if p_start <= match.start() <= p_end:
                already_parsed = True
                break
        if already_parsed:
            continue
            
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
                    container_content = html_content[start_pos:next_close]
                    lyrics_parts.append(container_content)
                    parsed_ranges.append((match.start(), next_close + 6))
                    
    # Step 3: Format extracted content
    full_lyrics_html = "\n".join(lyrics_parts)
    # Replace <br> tags with actual newlines
    cleaned = re.sub(r'<br\s*/?>', '\n', full_lyrics_html)
    # Remove all HTML tags
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

    print(f"⏳ Starte Scraping für {total_to_process} Songs...")
    
    success_count = 0
    fail_count = 0
    
    start_time = time.time()
    
    try:
        for i, (original_idx, song) in enumerate(to_process, 1):
            artist = song.get("artist", "")
            title = song.get("title", "")
            
            print(f"[{i}/{total_to_process}] Suche nach '{title}' von '{artist}'...")
            
            url, genius_title = search_genius(artist, title)
            if not url:
                print(f"   ⚠️ Nicht auf Genius gefunden.")
                song["lyrics"] = ""
                song["lyrics_error"] = True
                fail_count += 1
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
        print("\n🛑 Scraping abgebrochen durch Benutzer. Fortschritt gespeichert.")
        
    end_time = time.time()
    elapsed = end_time - start_time
    
    print("\n================ STATISTIK ================")
    print(f"Dauer: {elapsed:.2f} Sekunden")
    print(f"Erfolgreich hinzugefügt: {success_count}")
    print(f"Fehlgeschlagen: {fail_count}")
    print(f"Gesamtfortschritt im File: {sum(1 for s in songs if 'lyrics' in s and s['lyrics'])} / {len(songs)} Songs mit Lyrics.")
    print("===========================================")

if __name__ == "__main__":
    main()
