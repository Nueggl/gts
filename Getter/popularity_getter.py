import json

file = "songs_new_score.json"
output = "popularity.csv"

def get_popularity():
    with open(file, "r", encoding="utf8") as f:
        songs = json.load(f)

    with open(output, "w", encoding="utf8") as z:
        z.write("title; artist; popularity\n")
        for s in songs:
            z.write(f"{s['title']}; {s['artist']}; {s['popularity']}\n")  

if __name__ == "__main__":
    get_popularity()