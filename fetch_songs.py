import json
import urllib.request
import urllib.parse
import time
import re

# Load the list of songs
with open("list.txt", "r") as f:
    lines = f.readlines()

songs_to_fetch = []
for line in lines:
    parts = line.strip().split(" - ")
    if len(parts) == 2:
        title = parts[0].strip()
        artist = parts[1].strip()
        songs_to_fetch.append({"title": title, "artist": artist})

# Load existing songs to avoid fetching them again
try:
    with open("songs.json", "r") as f:
        existing_songs = json.load(f)
except FileNotFoundError:
    existing_songs = []

new_songs = []
seen = set()

# Add existing songs to the new list and mark them as seen
for song in existing_songs:
    if "title" in song and "artist" in song:
        key = f"{song['title'].lower()} - {song['artist'].lower()}"
        if key not in seen:
            new_songs.append(song)
            seen.add(key)

for song in songs_to_fetch:
    title = song["title"]
    artist = song["artist"]
    query = f"{title} {artist}"
    key = f"{title.lower()} - {artist.lower()}"

    if key in seen:
        continue
    seen.add(key)

    encoded_query = urllib.parse.quote_plus(query)
    url = f"https://itunes.apple.com/search?term={encoded_query}&entity=song&limit=1"

    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode('utf-8'))

            if data['resultCount'] > 0:
                result = data['results'][0]

                # Upscale cover art
                cover_url = result.get('artworkUrl100', '')
                if cover_url:
                    cover_url = cover_url.replace('100x100bb', '600x600bb')

                year = ""
                release_date = result.get('releaseDate', '')
                if release_date:
                    year_match = re.search(r'^(\d{4})', release_date)
                    if year_match:
                        year = year_match.group(1)

                new_song = {
                    "title": result.get('trackName', title),
                    "artist": result.get('artistName', artist),
                    "audioUrl": result.get('previewUrl', song.get("audioUrl", "")),
                    "coverUrl": cover_url or song.get("coverUrl", ""),
                    "year": int(year) if year else None,
                    "album": result.get('collectionName', ''),
                    "genre": result.get('primaryGenreName', '')
                }

                if new_song["audioUrl"] and new_song["coverUrl"]:
                     new_songs.append(new_song)
                     print(f"Added: {new_song['title']} by {new_song['artist']} ({new_song['year']})")
                else:
                    print(f"Skipping {title} by {artist} - missing audio or cover")
            else:
                print(f"No results found for: {title} by {artist}")

    except Exception as e:
        print(f"Error fetching {title} by {artist}: {e}")

    time.sleep(0.5) # rate limiting

with open("songs.json", "w") as f:
    json.dump(new_songs, f, indent=4)

print(f"Successfully wrote {len(new_songs)} songs to songs.json")
