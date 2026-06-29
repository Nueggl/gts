import json

file = "songs_new_score.json"
output = "stats.csv"

def get_popularity():
    with open(file, "r", encoding="utf8") as f:
        songs = json.load(f)

    with open(output, "w", encoding="utf8") as z:
        z.write("title; artist; yt views; genius views; lastfm views; genius/yt; lastfm/yt\n")
        for s in songs:
            z.write(f"{s['title']}; {s['artist']}; {s['stats_youtube']}; {s['stats_genius']}; {s['stats_lastfm']}; {(s['stats_genius']/s['stats_youtube']):.8f}; {(s['stats_lastfm']/s['stats_youtube']):.8f}\n")  

if __name__ == "__main__":
    get_popularity()