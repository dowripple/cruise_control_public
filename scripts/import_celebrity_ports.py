"""
Scrape https://www.celebritycruises.com/ports and insert any missing ports
into the cruise_port table. Idempotent — re-runs only add new rows.

Dedup is done case-insensitively, ignoring spaces and punctuation, against
both `city` and `cruise_port` columns. The Celebrity URL slug is also matched
against existing values so e.g. slug "cococay" deduplicates against existing
"Coco Cay".

Usage:
    python scripts/import_celebrity_ports.py            # insert
    python scripts/import_celebrity_ports.py --dry-run  # preview only

Requires the `keysql` env var to hold the postgres password.
"""

import argparse
import os
import re
import sys

import psycopg2
import requests
from bs4 import BeautifulSoup


URL = "https://www.celebritycruises.com/ports"
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
)

DB_CONFIG = {
    "host": "localhost",
    "user": "postgres",
    "password": os.environ.get("keysql"),
    "dbname": "cruise_control",
}


def normalize(s):
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def fetch_ports():
    resp = requests.get(URL, headers={"User-Agent": UA}, timeout=30)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")

    seen_slugs = set()
    ports = []
    for a in soup.select('a[href^="/ports/"]'):
        href = a.get("href", "")
        slug = href.split("/ports/", 1)[-1].strip("/")
        # ignore nested links and the index page itself
        if not slug or "/" in slug or "?" in slug:
            continue
        if slug in seen_slugs:
            continue
        text = " ".join(a.get_text(" ", strip=True).split())
        if not text:
            continue
        lower = text.lower()
        # scenic spots — not actual ports
        if "(cruising)" in lower:
            continue
        scenic_terms = (" strait", " sound", " sund", " fjord", " dateline",
                        " volcano", " glacier")
        if any(term in " " + lower for term in scenic_terms):
            continue
        # Royal Caribbean's private-island branding sneaks into the shared CMS
        if "perfect day" in lower:
            continue
        seen_slugs.add(slug)

        if "," in text:
            city, region = [s.strip() for s in text.split(",", 1)]
        else:
            # Some Celebrity entries label by country/region with the actual
            # city only in the slug (e.g. "Montenegro" → /ports/kotor). If the
            # label can't be derived from the slug, treat slug as the city and
            # the label as the region.
            label_norm = re.sub(r"[^a-z]", "", text.lower())
            slug_norm = re.sub(r"[^a-z]", "", slug.lower())
            if label_norm and label_norm not in slug_norm:
                city = " ".join(w.capitalize() for w in slug.split("-"))
                region = text
            else:
                city, region = text, None
        ports.append({"slug": slug, "label": text, "city": city, "region": region})
    return ports


def load_existing(cur):
    cur.execute("SELECT cruise_port, city, state FROM cruise_port")
    keys = set()
    for cp, city, state in cur.fetchall():
        if city:
            keys.add(normalize(city))
        if cp:
            keys.add(normalize(cp))
    return keys


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true",
                        help="show what would be inserted without writing")
    args = parser.parse_args()

    if not DB_CONFIG["password"]:
        print("ERROR: keysql env var is not set", file=sys.stderr)
        sys.exit(1)

    ports = fetch_ports()
    print(f"Scraped {len(ports)} unique ports from {URL}")

    conn = psycopg2.connect(**DB_CONFIG)
    conn.autocommit = False
    try:
        with conn.cursor() as cur:
            existing = load_existing(cur)
            print(f"Existing rows in cruise_port: {len(existing) // 2 or len(existing)} "
                  f"(unique normalized keys: {len(existing)})")

            to_insert = []
            skipped = 0
            for p in ports:
                if normalize(p["city"]) in existing or normalize(p["slug"]) in existing:
                    skipped += 1
                    continue
                to_insert.append(p)
                # so duplicate scrapes within this run don't re-insert
                existing.add(normalize(p["city"]))

            print(f"\nWill insert {len(to_insert)} new ports. "
                  f"Skipping {skipped} that already exist.\n")
            for p in to_insert:
                print(f"  + {p['city']}"
                      + (f", {p['region']}" if p["region"] else "")
                      + f"  ({p['slug']})")

            if args.dry_run:
                print("\n[dry-run] no rows written.")
                conn.rollback()
                return

            for p in to_insert:
                cur.execute(
                    "INSERT INTO cruise_port (cruise_port, city, state) "
                    "VALUES (%s, %s, %s)",
                    (p["city"], p["city"], p["region"]),
                )
        conn.commit()
        print(f"\nCommitted {len(to_insert)} inserts.")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
