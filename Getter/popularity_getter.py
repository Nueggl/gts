import json
from pathlib import Path

this_file = Path(__file__).resolve().parent
file = "songs_datensatz.json"
output = "popularity.csv"


path = this_file.parent / "Add_songs" / file
output_path = this_file / output


def get_popularity():
    with open(path, "r", encoding="utf8") as f:
        songs = json.load(f)

    with open(output_path, "w", encoding="utf8") as z:
        z.write("title; artist; popularity\n")
        for s in songs:
            z.write(f"{s['title']}; {s['artist']}; {s['popularity']}\n")
  

if __name__ == "__main__":
    get_popularity()