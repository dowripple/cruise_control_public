"""
Fill in latitude / longitude / nearest_airport for cruise_port rows that
are missing them.

- Geocodes via Mapbox Places (uses MAPBOX_TOKEN env var).
- Nearest airport is picked from the offline `airportsdata` IATA dataset by
  great-circle distance, preferring airports whose name contains
  "International" so we don't pin a port to a tiny airstrip when a major
  hub is comparably close.

Only NULL fields are written — existing curated values are preserved.

Usage:
    python scripts/fill_port_geo.py            # apply
    python scripts/fill_port_geo.py --dry-run  # preview
"""

import argparse
import math
import os
import re
import sys
import time

import airportsdata
import psycopg2
import requests


DB_CONFIG = {
    "host": "localhost",
    "user": "postgres",
    "password": os.environ.get("keysql"),
    "dbname": "cruise_control",
}

MAPBOX_TOKEN = os.environ.get("MAPBOX_TOKEN", "")
GEOCODE_URL = "https://api.mapbox.com/geocoding/v5/mapbox.places/{q}.json"

# Prefer "International" airports when within this distance (km). Cruisers
# often drive an hour or two to a hub, so this is generous.
MAJOR_AIRPORT_MAX_KM = 150


def haversine_km(lat1, lon1, lat2, lon2):
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def clean_query(city, state):
    # strip parenthetical alternates ("Sapporo (Muroran)" -> "Sapporo"),
    # take first half of slash-joined names ("Bangkok/Laemchabang" -> "Bangkok")
    c = re.sub(r"\s*\([^)]*\)", "", city or "").split("/")[0].strip()
    if state:
        return f"{c}, {state}"
    return c


def geocode(query):
    if not MAPBOX_TOKEN:
        raise RuntimeError("MAPBOX_TOKEN env var is not set")
    url = GEOCODE_URL.format(q=requests.utils.quote(query))
    params = {
        "access_token": MAPBOX_TOKEN,
        "limit": 1,
        "types": "place,locality,district,region,country",
    }
    resp = requests.get(url, params=params, timeout=15)
    resp.raise_for_status()
    feats = resp.json().get("features") or []
    if not feats:
        return None
    lon, lat = feats[0]["center"]
    return float(lat), float(lon)


def nearest_airport(lat, lon, airports):
    nearest = None
    nearest_dist = float("inf")
    nearest_major = None
    nearest_major_dist = float("inf")
    for code, ap in airports:
        d = haversine_km(lat, lon, ap["lat"], ap["lon"])
        if d < nearest_dist:
            nearest_dist = d
            nearest = code
        if "international" in ap["name"].lower() and d < nearest_major_dist:
            nearest_major_dist = d
            nearest_major = code
    if nearest_major and nearest_major_dist <= MAJOR_AIRPORT_MAX_KM:
        return nearest_major, nearest_major_dist
    return nearest, nearest_dist


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, default=None,
                        help="cap number of rows processed (for testing)")
    args = parser.parse_args()

    if not DB_CONFIG["password"]:
        print("ERROR: keysql env var is not set", file=sys.stderr)
        sys.exit(1)
    if not MAPBOX_TOKEN:
        print("ERROR: MAPBOX_TOKEN env var is not set", file=sys.stderr)
        sys.exit(1)

    print("Loading airport data...")
    iata_data = airportsdata.load("IATA")
    # Pre-build a list of (code, record) for fast iteration
    airports = [(code, ap) for code, ap in iata_data.items()
                if ap.get("iata") and ap.get("name")]
    print(f"  {len(airports)} IATA airports loaded.")

    conn = psycopg2.connect(**DB_CONFIG)
    conn.autocommit = False
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT cruise_port_id, cruise_port, city, state, "
                "       latitude, longitude, nearest_airport "
                "FROM cruise_port "
                "WHERE latitude IS NULL OR nearest_airport IS NULL "
                "ORDER BY cruise_port_id"
            )
            rows = cur.fetchall()
        if args.limit:
            rows = rows[:args.limit]
        print(f"Rows needing fill: {len(rows)}\n")

        updated = 0
        geocode_fail = 0
        with conn.cursor() as cur:
            for row in rows:
                pid, name, city, state, lat, lon, iata = row
                new_lat, new_lon, new_iata = lat, lon, iata
                note = []

                if lat is None or lon is None:
                    q = clean_query(city or name, state)
                    try:
                        result = geocode(q)
                    except Exception as e:
                        result = None
                        note.append(f"geocode error: {e}")
                    if result:
                        new_lat, new_lon = result
                        note.append(f"geocoded '{q}'")
                    else:
                        geocode_fail += 1
                        note.append(f"NO GEOCODE for '{q}'")
                    time.sleep(0.05)

                if iata is None and new_lat is not None and new_lon is not None:
                    code, dist = nearest_airport(new_lat, new_lon, airports)
                    new_iata = code
                    note.append(f"airport={code} ({dist:.0f} km)")

                if (new_lat, new_lon, new_iata) != (lat, lon, iata):
                    print(f"  [{pid:>3}] {name:<35} {' | '.join(note)}")
                    if not args.dry_run:
                        cur.execute(
                            "UPDATE cruise_port "
                            "SET latitude = COALESCE(%s, latitude), "
                            "    longitude = COALESCE(%s, longitude), "
                            "    nearest_airport = COALESCE(%s, nearest_airport) "
                            "WHERE cruise_port_id = %s",
                            (new_lat, new_lon, new_iata, pid),
                        )
                    updated += 1

        if args.dry_run:
            conn.rollback()
            print(f"\n[dry-run] Would update {updated} rows. "
                  f"{geocode_fail} geocode failures.")
        else:
            conn.commit()
            print(f"\nUpdated {updated} rows. {geocode_fail} geocode failures.")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
