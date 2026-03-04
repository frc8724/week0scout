import csv
import glob
import sys
import requests

def merge_csvs(input_glob: str, merged_out: str) -> None:
    files = sorted(glob.glob(input_glob))
    if not files:
        raise SystemExit(f"No files matched {input_glob}")

    header = None
    rows = []
    for f in files:
        with open(f, "r", newline="", encoding="utf-8-sig") as fh:
            reader = csv.reader(fh)
            h = next(reader, None)
            if not h:
                continue
            if header is None:
                header = h
            elif h != header:
                raise SystemExit(f"Header mismatch in {f}. (Different app versions?)")
            rows.extend(list(reader))

    with open(merged_out, "w", newline="", encoding="utf-8") as out:
        w = csv.writer(out)
        w.writerow(header)
        w.writerows(rows)

def fetch_event_epa(event_key: str) -> dict[int, float]:
    # Prefer v3 if you want later; but v2 endpoint is commonly used and simple.
    # https://api.statbotics.io/v2/team_events/event/{event_key}
    url = f"https://api.statbotics.io/v2/team_events/event/{event_key}"
    r = requests.get(url, timeout=30)
    r.raise_for_status()
    data = r.json()

    # Build {team: epa}
    # Statbotics returns many fields; we grab 'team' and 'epa'
    mapping = {}
    for row in data:
        team = row.get("team")
        epa = row.get("epa")
        if team is None or epa is None:
            continue
        mapping[int(team)] = float(epa)
    return mapping

def add_epa_to_scouting(scouting_csv: str, epa_map: dict[int, float], out_csv: str) -> None:
    with open(scouting_csv, "r", newline="", encoding="utf-8-sig") as fh:
        reader = csv.DictReader(fh)
        fieldnames = list(reader.fieldnames or [])

        # Add new column if missing
        if "statbotics_epa" not in fieldnames:
            fieldnames.append("statbotics_epa")

        rows = []
        for row in reader:
            team_str = (row.get("teamNumber") or "").strip()
            try:
                team = int(team_str)
            except:
                team = None

            row["statbotics_epa"] = "" if team is None else epa_map.get(team, "")
            rows.append(row)

    with open(out_csv, "w", newline="", encoding="utf-8") as out:
        w = csv.DictWriter(out, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(rows)

def main():
    if len(sys.argv) < 2:
        print("Usage: python merge_and_add_epa.py <event_key> [input_glob]")
        print("Example: python merge_and_add_epa.py 2026tuis 'rebuildt_*.csv'")
        raise SystemExit(2)

    event_key = sys.argv[1]
    pattern = sys.argv[2] if len(sys.argv) >= 3 else "rebuildt_*.csv"

    merged = "scouting_merged.csv"
    out = "scouting_with_epa.csv"

    print(f"Merging {pattern} -> {merged}")
    merge_csvs(pattern, merged)

    print(f"Fetching EPA for {event_key} from Statbotics...")
    epa_map = fetch_event_epa(event_key)

    print(f"Joining EPA -> {out}")
    add_epa_to_scouting(merged, epa_map, out)

    print("Done.")
    print(f"- {merged}")
    print(f"- {out}")

if __name__ == "__main__":
    main()
