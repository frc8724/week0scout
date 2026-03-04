import csv
import glob
import sys
import requests
from collections import defaultdict

# -----------------------------
# Utility: merge scouting CSVs
# -----------------------------
def merge_csvs(input_glob: str, merged_out: str) -> list[dict]:
    files = sorted(glob.glob(input_glob))
    if not files:
        raise SystemExit(f"No files matched: {input_glob}")

    header = None
    merged_rows: list[dict] = []

    for f in files:
        with open(f, "r", newline="", encoding="utf-8-sig") as fh:
            reader = csv.DictReader(fh)
            if reader.fieldnames is None:
                continue

            if header is None:
                header = reader.fieldnames
            else:
                if reader.fieldnames != header:
                    raise SystemExit(
                        f"Header mismatch in {f}.\n"
                        f"This usually means different app versions exported different columns."
                    )

            for row in reader:
                merged_rows.append(row)

    with open(merged_out, "w", newline="", encoding="utf-8") as out:
        w = csv.DictWriter(out, fieldnames=header)
        w.writeheader()
        w.writerows(merged_rows)

    return merged_rows


# -----------------------------
# Statbotics EPA fetch
# -----------------------------
def fetch_event_epa(event_key: str) -> dict[int, float]:
    url = f"https://api.statbotics.io/v2/team_events/event/{event_key}"
    r = requests.get(url, timeout=30)
    r.raise_for_status()
    data = r.json()

    mapping: dict[int, float] = {}
    for row in data:
        team = row.get("team")
        epa = row.get("epa")
        if team is None or epa is None:
            continue
        mapping[int(team)] = float(epa)

    return mapping


# -----------------------------
# Build pick list (team-aggregate)
# -----------------------------
def safe_float(x, default=0.0):
    try:
        return float(x)
    except:
        return default

def safe_int(x, default=None):
    try:
        return int(str(x).strip())
    except:
        return default

def climb_to_score(climb: str) -> float:
    # Average "climbScore" helps tie-breakers. You can tweak later.
    m = {"No": 0.0, "Low": 1.0, "Mid": 2.0, "High": 3.0}
    return m.get(climb, 0.0)

def percentile_bucket(rank_index: int, total: int) -> str:
    """
    rank_index: 0-based rank among teams sorted by avgFuelScored DESC.
    """
    if total <= 0:
        return ""
    pct = (rank_index + 1) / total  # 0..1
    if pct <= 0.10:
        return "Top 10%"
    if pct <= 0.25:
        return "Top 25%"
    if pct <= 0.50:
        return "Top 50%"
    return "Bottom 50%"

def build_picklist(merged_rows: list[dict], epa_map: dict[int, float], out_csv: str) -> None:
    # Group match rows by team
    teams: defaultdict[int, list[dict]] = defaultdict(list)

    for row in merged_rows:
        team = safe_int(row.get("teamNumber"))
        if team is None:
            continue

        teams[team].append({
            "fuel_scored": safe_float(row.get("estimatedFuelScored")),
            "fuel_attempted": safe_float(row.get("estimatedFuelAttempted")),
            "cycles": safe_float(row.get("teleopActiveCycles")),
            "accuracy": safe_float(row.get("accuracyRating")),
            "climb": (row.get("endgameClimb") or "").strip(),
        })

    # Aggregate per team
    pick = []
    for team, entries in teams.items():
        n = len(entries)
        if n == 0:
            continue

        avg_fuel_scored = sum(e["fuel_scored"] for e in entries) / n
        avg_fuel_attempted = sum(e["fuel_attempted"] for e in entries) / n
        avg_cycles = sum(e["cycles"] for e in entries) / n
        avg_accuracy = sum(e["accuracy"] for e in entries) / n
        avg_climb_score = sum(climb_to_score(e["climb"]) for e in entries) / n

        stat_epa = epa_map.get(team, "")
        fuel_vs_epa = ""
        if stat_epa != "":
            fuel_vs_epa = avg_fuel_scored - float(stat_epa)

        pick.append({
            "team": team,
            "matches": n,
            "avgFuelScored": round(avg_fuel_scored, 1),
            "avgFuelAttempted": round(avg_fuel_attempted, 1),
            "avgCycles": round(avg_cycles, 1),
            "avgAccuracy": round(avg_accuracy, 2),
            "climbScore": round(avg_climb_score, 2),
            "statboticsEPA": stat_epa,
            "fuelVsEPA": (round(fuel_vs_epa, 1) if fuel_vs_epa != "" else ""),
            # percentile bucket filled after sorting
            "fuelPercentileBucket": "",
        })

    # Sort by primary metric: avgFuelScored DESC
    pick.sort(key=lambda x: x["avgFuelScored"], reverse=True)

    # Assign percentile buckets
    total = len(pick)
    for i, row in enumerate(pick):
        row["fuelPercentileBucket"] = percentile_bucket(i, total)

    # Output
    cols = [
        "team",
        "matches",
        "avgFuelScored",
        "fuelPercentileBucket",
        "avgFuelAttempted",
        "avgCycles",
        "avgAccuracy",
        "climbScore",
        "statboticsEPA",
        "fuelVsEPA",
    ]

    with open(out_csv, "w", newline="", encoding="utf-8") as out:
        w = csv.DictWriter(out, fieldnames=cols)
        w.writeheader()
        w.writerows(pick)


# -----------------------------
# Main
# -----------------------------
def main():
    if len(sys.argv) < 2:
        print("Usage: python merge_and_add_epa.py <event_key> [input_glob]")
        print("Example: python merge_and_add_epa.py 2026tuis 'rebuildt_*.csv'")
        raise SystemExit(2)

    event_key = sys.argv[1]
    pattern = sys.argv[2] if len(sys.argv) >= 3 else "rebuildt_*.csv"

    merged_out = "scouting_merged.csv"
    picklist_out = "picklist.csv"

    print(f"Merging scouting files: {pattern} -> {merged_out}")
    merged_rows = merge_csvs(pattern, merged_out)

    print(f"Fetching Statbotics EPA for event: {event_key}")
    epa_map = fetch_event_epa(event_key)

    print(f"Building pick list -> {picklist_out}")
    build_picklist(merged_rows, epa_map, picklist_out)

    print("Done.")
    print(f"- {merged_out}")
    print(f"- {picklist_out}")

if __name__ == "__main__":
    main()
