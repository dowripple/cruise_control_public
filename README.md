# cruise_control

A Flask + PostgreSQL + jQuery web app for everything about cruising (except swinging).
Tracks cruise trips, ships, ports, itineraries, costs, captain's-club / airline
rewards, onboard staff, events, music playlists and trip photos — with an
insights tab that visualizes spending trends, club-race standings and a
clickable cruise-route world map.

This is the **public** version of the app. Personal data has been removed
and the seed data has been replaced with two demo passengers ("Traveller 1"
and "Traveller 2") and a small handful of sample trips.

## Stack

- **Backend:** Python 3 + Flask + waitress (production WSGI), psycopg2.
- **Database:** PostgreSQL 12+.
- **Frontend:** jQuery UI + DataTables + Plotly + FullCalendar.
- **Maps:** Mapbox (token required) for the cruise-route world map and the
  port-geocoding helper script.

## Setup

### 1. Install PostgreSQL and create the database

```sh
createdb cruise_control
psql -d cruise_control -f sql/schema.sql
psql -d cruise_control -f sql/seed.sql
```

### 2. Install Python dependencies

```sh
pip install flask flask-cors psycopg2 pandas waitress werkzeug requests beautifulsoup4 airportsdata openpyxl
```

### 3. Environment variables

| Variable             | Required | Purpose                                                   |
|----------------------|----------|-----------------------------------------------------------|
| `keysql`             | yes      | PostgreSQL password for the `postgres` user.              |
| `MAPBOX_TOKEN`       | no       | Mapbox public token; needed for the cruise-route map.     |
| `CRUISE_SECRET_KEY`  | no       | Flask session secret. Auto-generated to `.flask_secret` if unset. |
| `CRUISE_HOST`        | no       | Bind address (default `0.0.0.0`).                         |
| `CRUISE_PORT`        | no       | Bind port (default `8000`).                               |

### 4. Set a password for the demo users

The seed file leaves `login_password` NULL. Set one with:

```sh
python set_password.py traveller1
python set_password.py traveller2
```

### 5. Run the server

```sh
python serve.py
```

Then browse to `http://localhost:8000/`.

## Repo layout

```
app.py                    # Flask app — all routes + queries live here
serve.py                  # waitress launcher
set_password.py           # helper to hash + store a passenger login password
sql/
  schema.sql              # full DDL (tables, sequences, constraints)
  seed.sql                # reference data + 2 demo passengers + sample trips
  cruise_trip_*.sql       # per-table schema fragments (subset of schema.sql,
                          # kept for documentation)
scripts/
  import_celebrity_ports.py   # scrape Celebrity's ports page, insert any new
  fill_port_geo.py            # geocode ports via Mapbox, pick nearest airport
  backup_cruise_control.ps1   # nightly pg_dump backup, Windows Task Scheduler
data/
  Cruise_Control_Port_lat_long.xlsx
  GUID-Sorted-By-Latitude-Longitude-Type-Name.csv   # geo reference data
static/                   # css, js, images
templates/                # Jinja2 templates (index.html, login.html, ...)
```

## Notes

- Trip photos are uploaded to `static/uploads/trip_<id>/` at runtime; this
  directory is `.gitignore`d.
- Backup dumps written by `scripts/backup_cruise_control.ps1` are written
  to a directory **outside** the repo and are not committed.
