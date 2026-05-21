import json
import os
import secrets
import time
import urllib.parse
import urllib.request
import uuid
from datetime import date as _date, timedelta
from pathlib import Path

import pandas as pd
import psycopg2
import searoute as sr
from flask import (Flask, Response, g, jsonify, redirect, render_template,
                   request, session, url_for)
from flask_cors import CORS
from werkzeug.security import check_password_hash
from werkzeug.utils import secure_filename


DB_CONFIG = {
	'host': 'localhost',
	'user': 'postgres',
	'password': os.environ.get('keysql'),
	'dbname': 'cruise_control',
}
MAPBOX_TOKEN = os.environ.get('MAPBOX_TOKEN', '')


app = Flask(__name__)
CORS(app)
app.config['MAX_CONTENT_LENGTH'] = 200 * 1024 * 1024  # 200MB per request

# Persistent secret key so sessions survive restarts. Prefer env var; otherwise
# read/create a local file (gitignored) so the user doesn't have to set anything.
_SECRET_KEY_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.flask_secret')
_secret = os.environ.get('CRUISE_SECRET_KEY')
if not _secret:
	if os.path.exists(_SECRET_KEY_FILE):
		with open(_SECRET_KEY_FILE, 'r') as _f:
			_secret = _f.read().strip()
	if not _secret:
		_secret = secrets.token_hex(32)
		with open(_SECRET_KEY_FILE, 'w') as _f:
			_f.write(_secret)
app.secret_key = _secret
app.permanent_session_lifetime = timedelta(minutes=30)


PUBLIC_ENDPOINTS = {'login', 'logout', 'static'}


@app.before_request
def _require_login():
	if request.endpoint in PUBLIC_ENDPOINTS:
		return None
	if session.get('passenger_id'):
		return None
	# JSON endpoints get a 401 instead of a redirect so the JS can react cleanly
	if request.path.startswith('/data/'):
		return jsonify({'error': 'unauthorized'}), 401
	return redirect(url_for('login'))


@app.route("/login", methods=['GET', 'POST'])
def login():
	error = None
	if request.method == 'POST':
		login_id = (request.form.get('username') or '').strip()
		password = request.form.get('password') or ''
		conn = get_db()
		with conn.cursor() as cur:
			cur.execute(
				"SELECT passenger_id, passenger_name, login_password "
				"  FROM passenger WHERE LOWER(login_id) = LOWER(%s)",
				(login_id,),
			)
			row = cur.fetchone()
		if row and row[2] and check_password_hash(row[2], password):
			session.permanent = True
			session['passenger_id'] = row[0]
			session['passenger_name'] = row[1]
			name_lower = (row[1] or '').lower()
			if name_lower.startswith('deb'):
				session['welcome_message'] = "Hey beautiful! Let's get our cruise on..."
			elif name_lower.startswith('michael') or name_lower.startswith('mike'):
				session['welcome_message'] = "Arrr, ahoy there matey!"
			return redirect(url_for('home'))
		error = "Invalid username or password"
	return render_template('login.html', error=error)


@app.route("/logout")
def logout():
	session.clear()
	return redirect(url_for('login'))

ALLOWED_PHOTO_EXTS = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic'}
MAX_PHOTO_BYTES = 10 * 1024 * 1024  # 10MB per file
UPLOAD_DIR = Path(app.static_folder) / 'uploads'
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def get_db():
	if 'db' not in g:
		conn = psycopg2.connect(**DB_CONFIG)
		conn.autocommit = True
		g.db = conn
	return g.db


@app.teardown_appcontext
def close_db(error):
	db = g.pop('db', None)
	if db is not None:
		db.close()


def format_col_datetime2(x):
	try:
		yr = str(x)[:-6][-2:]
		mo = str(int(str(x)[5:-3]))
		dy = str(int(str(x)[8:]))
		return f'{mo}/{dy}/{yr}'
	except Exception:
		return pd.NaT


def format_chart_datetime(x):
	try:
		yr = str(x)[:-6]
		mo = str(int(str(x)[5:-3]))
		dy = str(int(str(x)[8:]))
		return f'{yr}-{mo}-{dy}'
	except Exception:
		return pd.NaT


def _parse_id_list(raw):
	if not raw:
		return ()
	return tuple(int(x) for x in raw.split(',') if x.strip())


def _coerce(value, kind):
	if value == '' or value is None:
		return None
	if kind is int:
		try:
			return int(value)
		except (TypeError, ValueError):
			return None
	if kind is str:
		return str(value)
	if kind == 'date':
		return value
	if kind == 'bit':
		if value in (True, 1, '1', 'on', 'true', 'yes', 'y'):
			return '1'
		if value in (False, 0, '0', 'off', 'false', 'no', 'n'):
			return '0'
		return None
	if kind == 'money':
		if isinstance(value, (int, float)):
			return float(value)
		s = str(value).replace('$', '').replace(',', '').strip()
		if not s:
			return None
		try:
			return float(s)
		except ValueError:
			return None
	return value


TRIP_FIELDS = [
	('cruise_ship_id', int, True),
	('departure_port_id', int, False),
	('arrival_port_id', int, False),
	('departure_date', 'date', True),
	('arrival_date', 'date', False),
	('book_date', 'date', False),
	('amount_due_date', 'date', False),
	('deck_number', int, False),
	('room_number', int, False),
	('suite_yn', 'bit', False),
	('agent_yn', 'bit', False),
	('need_airfare_yn', 'bit', False),
	('airfare_purchased_yn', 'bit', False),
	('need_hotel_yn', 'bit', False),
	('hotel_booked_yn', 'bit', False),
	('trip_cost', 'money', False),
	('amount_paid', 'money', False),
	('airfare_cost', 'money', False),
	('hotel_cost', 'money', False),
	('club_points', int, False),
	('cruise_name', str, False),
	('agent_name', str, False),
	('cruise_length_days', int, False),
	('trip_notes', str, False),
	('trip_haiku', str, False),
	('cat_sitter', str, False),
	('cat_sitter_cost', 'money', False),
	('apple_music_url', str, False),
]


def get_cruise_list(conn):
	sql = """
	WITH current_points
	  AS
	   (
		  SELECT SUM(club_points) AS current_club_point_total
			FROM cruise_trip
		   WHERE arrival_date < CURRENT_DATE
	   ),
		 cruise_stop_group
	  AS
	   (
		  SELECT ctp.cruise_trip_id,
				 MIN(ctp.cruise_trip_day) AS cruise_trip_day,
				 cp.city || ' (' || cp.state || ')' || CASE WHEN COUNT(*) > 1 THEN ' x' || CAST(COUNT(*) AS VARCHAR) ELSE '' END AS cruise_port
			FROM cruise_trip_ports ctp INNER JOIN cruise_port cp
			  ON ctp.cruise_port_id = cp.cruise_port_id INNER JOIN cruise_trip ct
			  ON ctp.cruise_trip_id = ct.cruise_trip_id
		   WHERE ct.departure_port_id <> ctp.cruise_port_id
			 AND ct.arrival_port_id <> ctp.cruise_port_id
		GROUP BY ctp.cruise_trip_id,
				 cp.city || ' (' || cp.state || ')'
	   ),
		 cruise_stops
	  AS
	   (
		  SELECT csg.cruise_trip_id,
				 STRING_AGG(csg.cruise_port, ', ' ORDER BY csg.cruise_trip_day) AS cruise_port_list
			FROM cruise_stop_group csg
		GROUP BY csg.cruise_trip_id
	   )
	SELECT ct.cruise_trip_id,
		   ROW_NUMBER() OVER (ORDER BY departure_date) AS cruise_trip_order,
		   cs.cruise_line_id,
		   cl.cruise_line,
		   cl.cruise_line_abbr,
		   cl.cruise_line_url,
		   cl.company_id,
		   cmp.company_name,
		   cmp.company_abbr,
		   cmp.company_url,
		   ct.cruise_ship_id,
		   cs.ship_name,
		   cs.year_built,
		   cs.occupancy,
		   cs.ship_class,
		   ct.departure_date,
		   ct.arrival_date,
		   css.cruise_port_list,
		   ct.book_date,
		   ct.deck_number,
		   ct.room_number,
		   ct.suite_yn,
		   ct.trip_cost,
		   ct.amount_paid,
		   ct.club_points,
		   ct.cruise_name,
		   ct.agent_yn,
		   ct.agent_name,
		   ct.cruise_length_days,
		   cp.current_club_point_total,
		   CASE
				WHEN ct.departure_port_id = ct.arrival_port_id THEN p1.cruise_port || ' (' || p1.state || ')'
				ELSE p1.cruise_port || ' (' || p1.state || ') to ' || p2.cruise_port || ' (' || p2.state || ')'
		   END AS cruise_trip_port_description,
		   ct.departure_port_id,
		   p1.cruise_port AS departure_port,
		   p1.city AS departure_port_city,
		   p1.state AS departure_port_state,
		   p1.latitude AS departure_port_latitude,
		   p1.longitude AS departure_port_longitude,
		   ct.arrival_port_id,
		   p2.cruise_port AS arrival_port,
		   p2.city AS arrival_port_city,
		   p2.state AS arrival_port_state,
		   p2.latitude AS arrival_port_latitude,
		   p2.longitude AS arrival_port_longitude,
		   CASE WHEN ct.departure_date < CURRENT_DATE THEN 1 ELSE 0 END AS visited_yn
	  FROM cruise_trip ct INNER JOIN cruise_ship cs
		ON ct.cruise_ship_id = cs.cruise_ship_id INNER JOIN cruise_line cl
		ON cs.cruise_line_id = cl.cruise_line_id INNER JOIN company cmp
		ON cl.company_id = cmp.company_id CROSS JOIN current_points cp INNER JOIN cruise_port p1
		ON ct.departure_port_id = p1.cruise_port_id INNER JOIN cruise_port p2
		ON ct.arrival_port_id = p2.cruise_port_id INNER JOIN cruise_stops css
		ON ct.cruise_trip_id = css.cruise_trip_id;
	"""
	return pd.read_sql_query(sql, con=conn)


def get_cruise_detail(conn, cruise_trip_id):
	sql = """
	WITH current_points
	  AS
	   (
		  SELECT SUM(club_points) AS current_club_point_total
			FROM cruise_trip
		   WHERE arrival_date < CURRENT_DATE
	   ),
		 cruise_stop_group
	  AS
	   (
		  SELECT ctp.cruise_trip_id,
				 MIN(ctp.cruise_trip_day) AS cruise_trip_day,
				 cp.city || ' (' || cp.state || ')' || CASE WHEN COUNT(*) > 1 THEN ' x' || CAST(COUNT(*) AS VARCHAR) ELSE '' END AS cruise_port
			FROM cruise_trip_ports ctp INNER JOIN cruise_port cp
			  ON ctp.cruise_port_id = cp.cruise_port_id INNER JOIN cruise_trip ct
			  ON ctp.cruise_trip_id = ct.cruise_trip_id
		   WHERE ct.departure_port_id <> ctp.cruise_port_id
			 AND ct.arrival_port_id <> ctp.cruise_port_id
		GROUP BY ctp.cruise_trip_id,
				 cp.city || ' (' || cp.state || ')'
	   ),
		 cruise_stops
	  AS
	   (
		  SELECT csg.cruise_trip_id,
				 STRING_AGG(csg.cruise_port, ', ' ORDER BY csg.cruise_trip_day) AS cruise_port_list
			FROM cruise_stop_group csg
		GROUP BY csg.cruise_trip_id
	   )
	SELECT ct.cruise_trip_id,
		   cs.cruise_line_id,
		   cl.cruise_line,
		   cl.cruise_line_abbr,
		   cl.cruise_line_url,
		   cl.company_id,
		   cmp.company_name,
		   cmp.company_abbr,
		   cmp.company_url,
		   ct.cruise_ship_id,
		   cs.ship_name,
		   cs.year_built,
		   cs.occupancy,
		   cs.ship_class,
		   ct.departure_date,
		   ct.arrival_date,
		   css.cruise_port_list,
		   ct.book_date,
		   ct.deck_number,
		   ct.room_number,
		   ct.suite_yn,
		   ct.trip_cost,
		   ct.amount_paid,
		   ct.club_points,
		   ct.cruise_name,
		   ct.agent_yn,
		   ct.agent_name,
		   ct.cruise_length_days,
		   cp.current_club_point_total,
		   ct.departure_port_id,
		   p1.cruise_port AS departure_port,
		   p1.city AS departure_port_city,
		   p1.state AS departure_port_state,
		   p1.latitude AS departure_port_latitude,
		   p1.longitude AS departure_port_longitude,
		   ct.arrival_port_id,
		   p2.cruise_port AS arrival_port,
		   p2.city AS arrival_port_city,
		   p2.state AS arrival_port_state,
		   p2.latitude AS arrival_port_latitude,
		   p2.longitude AS arrival_port_longitude
	  FROM cruise_trip ct INNER JOIN cruise_ship cs
		ON ct.cruise_ship_id = cs.cruise_ship_id INNER JOIN cruise_line cl
		ON cs.cruise_line_id = cl.cruise_line_id INNER JOIN company cmp
		ON cl.company_id = cmp.company_id CROSS JOIN current_points cp INNER JOIN cruise_port p1
		ON ct.departure_port_id = p1.cruise_port_id INNER JOIN cruise_port p2
		ON ct.arrival_port_id = p2.cruise_port_id INNER JOIN cruise_stops css
		ON ct.cruise_trip_id = css.cruise_trip_id
	 WHERE ct.cruise_trip_id = %(id)s
	"""
	return pd.read_sql_query(sql, con=conn, params={'id': cruise_trip_id})


def get_port_list(conn):
	sql = """
	SELECT cruise_port,
		   city,
		   state,
		   latitude,
		   longitude,
		   cruise_port_id,
		   nearest_airport
	  FROM cruise_port
	"""
	return pd.read_sql_query(sql, con=conn)


def get_ports(conn, cruise_port_ids):
	if not cruise_port_ids:
		return pd.DataFrame(columns=[
			'cruise_port', 'city', 'state', 'latitude', 'longitude',
			'cruise_port_id', 'trip_count', 'port_category',
		])
	sql = """
	SELECT cp.cruise_port,
		   cp.city,
		   cp.state,
		   cp.latitude,
		   cp.longitude,
		   cp.cruise_port_id,
		   COUNT(DISTINCT ctp.cruise_trip_id) AS trip_count,
		   CASE
				WHEN MIN(ctp.cruise_trip_id) IS NULL THEN 'want to go'
				WHEN MIN(ctp.cruise_trip_date) < CURRENT_DATE THEN 'been there'
				ELSE 'booked'
		   END port_category
	  FROM cruise_port cp LEFT OUTER JOIN cruise_trip_ports ctp
		ON cp.cruise_port_id = ctp.cruise_port_id
	 WHERE cp.cruise_port_id IN %(ids)s
  GROUP BY cp.cruise_port,
		   cp.city,
		   cp.state,
		   cp.latitude,
		   cp.longitude,
		   cp.cruise_port_id
	"""
	return pd.read_sql_query(sql, con=conn, params={'ids': cruise_port_ids})


def get_cruise_ports(conn, cruise_trip_ids):
	if not cruise_trip_ids:
		return pd.DataFrame(columns=[
			'cruise_trip_id', 'cruise_number', 'cruise_line', 'cruise_line_abbr',
			'cruise_name', 'ship_name', 'year_built', 'occupancy',
			'cruise_trip_day', 'cruise_trip_date', 'cruise_port_id',
			'cruise_trip_comment', 'cruise_port', 'city', 'state',
			'latitude', 'longitude', 'visited_yn', 'visited_message',
		])
	sql = """
	WITH cruise_num
	  AS
	   (
		  SELECT cruise_trip_id,
				 ROW_NUMBER() OVER (ORDER BY departure_date) AS cruise_number
			FROM cruise_trip
	   )
	SELECT ctp.cruise_trip_id,
		   cn.cruise_number,
		   cl.cruise_line,
		   cl.cruise_line_abbr,
		   ct.cruise_name,
		   cs.ship_name,
		   cs.year_built,
		   cs.occupancy,
		   ctp.cruise_trip_day,
		   ctp.cruise_trip_date,
		   ctp.cruise_port_id,
		   ctp.cruise_trip_comment,
		   cp.cruise_port,
		   cp.city,
		   cp.state,
		   cp.latitude,
		   cp.longitude,
		   CASE WHEN ctp.cruise_trip_date < CURRENT_DATE THEN 1 ELSE 0 END AS visited_yn,
		   CASE WHEN ctp.cruise_trip_date < CURRENT_DATE THEN 'Been there!' ELSE 'Will be there soon' END AS visited_message
	  FROM cruise_trip_ports ctp INNER JOIN cruise_port cp
		ON ctp.cruise_port_id = cp.cruise_port_id INNER JOIN cruise_trip ct
		ON ctp.cruise_trip_id = ct.cruise_trip_id INNER JOIN cruise_ship cs
		ON ct.cruise_ship_id = cs.cruise_ship_id INNER JOIN cruise_line cl
		ON cs.cruise_line_id = cl.Cruise_line_id INNER JOIN cruise_num cn
		ON ctp.cruise_trip_id = cn.cruise_trip_id
	 WHERE ct.cruise_trip_id IN %(ids)s
  ORDER BY ctp.cruise_trip_date
	"""
	return pd.read_sql_query(sql, con=conn, params={'ids': cruise_trip_ids})


@app.route("/")
def home():
	welcome_message = session.pop('welcome_message', None)
	return render_template("index.html", mapbox_token=MAPBOX_TOKEN, welcome_message=welcome_message)


@app.route("/data/cruise_trip_table")
def get_cruise_trip_table():
	cruise_trip_df = get_cruise_list(get_db())
	cruise_trip_df['departure_date'] = cruise_trip_df['departure_date'].apply(format_chart_datetime)
	cruise_trip_df['arrival_date'] = cruise_trip_df['arrival_date'].apply(format_chart_datetime)
	cruise_trip_df['book_date'] = cruise_trip_df['book_date'].apply(format_chart_datetime)

	table_df = cruise_trip_df[[
		'cruise_trip_order',
		'cruise_name',
		'cruise_line_abbr',
		'departure_date',
		'arrival_date',
		'cruise_trip_port_description',
		'cruise_port_list',
		'cruise_trip_id',
		'book_date',
		'company_abbr',
		'ship_name',
		'suite_yn',
		'deck_number',
		'room_number',
		'occupancy',
		'visited_yn',
	]]
	return table_df.to_json(orient="split", index=False)


@app.route("/data/cruise_trip_calendar")
def get_cruise_trip_calendar():
	conn = get_db()
	trips_df = pd.read_sql_query(
		"SELECT cruise_trip_id, cruise_name, departure_date, arrival_date, "
		"       cruise_length_days "
		"  FROM cruise_trip "
		" WHERE departure_date IS NOT NULL "
		" ORDER BY departure_date",
		con=conn,
	)
	stops_df = pd.read_sql_query(
		"SELECT ctp.cruise_trip_id, ctp.cruise_trip_date, "
		"       CASE "
		"         WHEN cp.state IS NOT NULL AND cp.state <> '' "
		"           THEN COALESCE(cp.city, cp.cruise_port) || ', ' || cp.state "
		"         ELSE COALESCE(cp.city, cp.cruise_port) "
		"       END AS port_label "
		"  FROM cruise_trip_ports ctp "
		"  JOIN cruise_port cp ON cp.cruise_port_id = ctp.cruise_port_id "
		" WHERE ctp.cruise_trip_date IS NOT NULL "
		" ORDER BY ctp.cruise_trip_date",
		con=conn,
	)
	events_df = pd.read_sql_query(
		"SELECT cruise_trip_id, event_date, event_time, event_name, "
		"       event_location, event_notes "
		"  FROM cruise_trip_event "
		" WHERE event_date IS NOT NULL "
		" ORDER BY event_date, event_time NULLS LAST",
		con=conn,
	)
	events = []
	for _, r in trips_df.iterrows():
		dep = r['departure_date']
		if pd.isna(dep):
			continue
		start = dep.date().isoformat() if hasattr(dep, 'date') else str(dep)
		end = None
		arr = r['arrival_date']
		if pd.notna(arr):
			# FullCalendar all-day end is exclusive — push by one day
			arr_dt = arr.date() if hasattr(arr, 'date') else arr
			end = (arr_dt + pd.Timedelta(days=1)).isoformat()
		title = r['cruise_name'] or 'Cruise'
		days = r['cruise_length_days']
		if pd.notna(days) and days:
			title = f"{title} ({int(days)} days)"
		events.append({
			'id': int(r['cruise_trip_id']),
			'title': title,
			'start': start,
			'end': end,
			'allDay': True,
			'extendedProps': {'tripId': int(r['cruise_trip_id']), 'kind': 'cruise'},
		})
	for _, r in stops_df.iterrows():
		date = r['cruise_trip_date']
		if pd.isna(date):
			continue
		date_str = date.date().isoformat() if hasattr(date, 'date') else str(date)
		events.append({
			'title': r['port_label'] or 'Port',
			'start': date_str,
			'allDay': True,
			'color': '#BD9B60',
			'extendedProps': {
				'tripId': int(r['cruise_trip_id']),
				'kind': 'port',
			},
		})
	for _, r in events_df.iterrows():
		event_date = r['event_date']
		if pd.isna(event_date):
			continue
		date_str = event_date.isoformat() if hasattr(event_date, 'isoformat') else str(event_date)
		event_time = r.get('event_time')
		event_name = r['event_name'] or 'Event'
		event_location = r.get('event_location') or None
		event_notes = r.get('event_notes') or None
		if isinstance(event_notes, float) and pd.isna(event_notes):
			event_notes = None
		title = event_name
		if event_location:
			title = f"{title} @ {event_location}"
		time_str = None
		if event_time is not None and not pd.isna(event_time):
			time_str = event_time.strftime('%H:%M') if hasattr(event_time, 'strftime') else str(event_time)
		entry = {
			'title': title,
			'color': '#E2C586',
			'textColor': '#0D2240',
			'extendedProps': {
				'tripId': int(r['cruise_trip_id']),
				'kind': 'event',
				'eventName': event_name,
				'eventDate': date_str,
				'eventTime': time_str,
				'eventLocation': event_location,
				'eventNotes': event_notes,
			},
		}
		if time_str is not None:
			entry['start'] = f'{date_str}T{time_str}:00'
			entry['allDay'] = False
		else:
			entry['start'] = date_str
			entry['allDay'] = True
		events.append(entry)
	return Response(json.dumps(events), mimetype='application/json')


# Per-port weather forecasts via Open-Meteo (no key, free tier).
# Cached in-process for 3 hours so we don't hammer the API while a user
# clicks around the trip dialog.
WEATHER_CACHE = {}            # { port_id: (fetched_at_epoch, payload_dict) }
WEATHER_TTL_SECONDS = 3 * 60 * 60
WEATHER_HORIZON_DAYS = 14

# WMO weather code -> (description, emoji). Trimmed to the codes that
# actually show up day-to-day.
WMO_CODES = {
	0:  ('Clear sky',                '☀️'),
	1:  ('Mainly clear',             '🌤'),
	2:  ('Partly cloudy',            '⛅'),
	3:  ('Overcast',                 '☁️'),
	45: ('Fog',                      '🌫'),
	48: ('Depositing rime fog',      '🌫'),
	51: ('Light drizzle',            '🌦'),
	53: ('Moderate drizzle',         '🌦'),
	55: ('Dense drizzle',            '🌦'),
	61: ('Light rain',               '🌧'),
	63: ('Moderate rain',            '🌧'),
	65: ('Heavy rain',               '🌧'),
	71: ('Light snow',               '🌨'),
	73: ('Moderate snow',            '🌨'),
	75: ('Heavy snow',               '❄️'),
	77: ('Snow grains',              '❄️'),
	80: ('Light rain showers',       '🌦'),
	81: ('Rain showers',             '🌧'),
	82: ('Heavy rain showers',       '⛈'),
	85: ('Snow showers',             '🌨'),
	86: ('Heavy snow showers',       '❄️'),
	95: ('Thunderstorm',             '⛈'),
	96: ('Thunderstorm with hail',   '⛈'),
	99: ('Severe thunderstorm',      '⛈'),
}


@app.route("/data/port_weather/<int:cruise_port_id>")
def get_port_weather(cruise_port_id):
	cached = WEATHER_CACHE.get(cruise_port_id)
	now = time.time()
	if cached and (now - cached[0]) < WEATHER_TTL_SECONDS:
		return Response(json.dumps(cached[1]), mimetype='application/json')

	conn = get_db()
	with conn.cursor() as cur:
		cur.execute(
			"SELECT cruise_port, city, state, latitude, longitude "
			"  FROM cruise_port WHERE cruise_port_id = %s",
			(cruise_port_id,),
		)
		row = cur.fetchone()
	if row is None:
		return Response(json.dumps({'error': 'port not found'}), status=404,
		                mimetype='application/json')
	port_name, city, state, lat, lon = row
	if lat is None or lon is None:
		payload = {'cruise_port_id': cruise_port_id, 'days': []}
		WEATHER_CACHE[cruise_port_id] = (now, payload)
		return Response(json.dumps(payload), mimetype='application/json')

	today = _date.today()
	end = today + timedelta(days=WEATHER_HORIZON_DAYS)
	params = {
		'latitude': float(lat),
		'longitude': float(lon),
		'daily': 'temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max',
		'temperature_unit': 'fahrenheit',
		'timezone': 'auto',
		'start_date': today.isoformat(),
		'end_date': end.isoformat(),
	}
	url = 'https://api.open-meteo.com/v1/forecast?' + urllib.parse.urlencode(params)
	try:
		with urllib.request.urlopen(url, timeout=10) as resp:
			data = json.loads(resp.read().decode('utf-8'))
	except Exception as e:
		# Don't crash the trip dialog if Open-Meteo is down — return an
		# empty days list and let the JS treat it as "no forecast".
		payload = {'cruise_port_id': cruise_port_id, 'days': [], 'error': str(e)}
		WEATHER_CACHE[cruise_port_id] = (now, payload)
		return Response(json.dumps(payload), mimetype='application/json')

	daily = data.get('daily') or {}
	dates    = daily.get('time') or []
	highs    = daily.get('temperature_2m_max') or []
	lows     = daily.get('temperature_2m_min') or []
	codes    = daily.get('weather_code') or []
	precips  = daily.get('precipitation_probability_max') or []

	days = []
	for i, d in enumerate(dates):
		code = codes[i] if i < len(codes) else None
		desc, emoji = WMO_CODES.get(code, ('—', '·'))
		days.append({
			'date': d,
			'high_f': round(highs[i]) if i < len(highs) and highs[i] is not None else None,
			'low_f':  round(lows[i])  if i < len(lows) and lows[i] is not None else None,
			'precip_pct': precips[i] if i < len(precips) else None,
			'weather_code': code,
			'description': desc,
			'emoji': emoji,
		})
	payload = {
		'cruise_port_id': cruise_port_id,
		'port_name': port_name,
		'city': city,
		'state': state,
		'days': days,
	}
	WEATHER_CACHE[cruise_port_id] = (now, payload)
	return Response(json.dumps(payload), mimetype='application/json')


@app.route("/cruise_trip/<int:cruise_trip_id>/print")
def print_cruise_trip(cruise_trip_id):
	conn = get_db()
	with conn.cursor() as cur:
		cur.execute(
			"SELECT ct.cruise_trip_id, ct.cruise_name, ct.departure_date, "
			"       ct.arrival_date, ct.cruise_length_days, ct.book_date, "
			"       ct.deck_number, ct.room_number, ct.suite_yn, "
			"       ct.agent_yn, ct.agent_name, ct.cat_sitter, "
			"       ct.trip_notes, ct.apple_music_url, "
			"       ct.trip_cost::text     AS trip_cost, "
			"       ct.amount_paid::text   AS amount_paid, "
			"       ct.airfare_cost::text  AS airfare_cost, "
			"       ct.hotel_cost::text    AS hotel_cost, "
			"       ct.cat_sitter_cost::text AS cat_sitter_cost, "
			"       cs.ship_name, cs.year_built, cs.occupancy, cs.ship_class, "
			"       cl.cruise_line, cmp.company_name, "
			"       p1.cruise_port AS departure_port, "
			"       p1.city || ', ' || p1.state AS departure_city, "
			"       p2.cruise_port AS arrival_port, "
			"       p2.city || ', ' || p2.state AS arrival_city "
			"  FROM cruise_trip ct "
			"  JOIN cruise_ship cs ON cs.cruise_ship_id = ct.cruise_ship_id "
			"  JOIN cruise_line cl ON cl.cruise_line_id = cs.cruise_line_id "
			"  JOIN company cmp   ON cmp.company_id = cl.company_id "
			"  LEFT JOIN cruise_port p1 ON p1.cruise_port_id = ct.departure_port_id "
			"  LEFT JOIN cruise_port p2 ON p2.cruise_port_id = ct.arrival_port_id "
			" WHERE ct.cruise_trip_id = %s",
			(cruise_trip_id,),
		)
		row = cur.fetchone()
		if row is None:
			return Response('not found', status=404)
		cols = [d.name for d in cur.description]
		trip = dict(zip(cols, row))

		def money_to_float(s):
			if not s:
				return None
			try:
				return float(str(s).replace('$', '').replace(',', '').strip())
			except (TypeError, ValueError):
				return None

		for k in ('trip_cost', 'amount_paid', 'airfare_cost', 'hotel_cost', 'cat_sitter_cost'):
			trip[k] = money_to_float(trip.get(k))

		def fmt_long_date(d):
			# Cross-platform: strip leading zero from day manually because
			# %-d (POSIX) / %#d (Windows) aren't portable.
			if d is None:
				return None
			try:
				return d.strftime('%A, %B ') + str(d.day) + d.strftime(', %Y')
			except Exception:
				return str(d)

		def fmt_short_time(t):
			if t is None:
				return None
			try:
				h = t.hour % 12 or 12
				return f"{h}:{t.minute:02d} {'AM' if t.hour < 12 else 'PM'}"
			except Exception:
				return str(t)

		trip['departure_date_long'] = fmt_long_date(trip.get('departure_date'))
		trip['arrival_date_long']   = fmt_long_date(trip.get('arrival_date'))

		cur.execute(
			"SELECT ctp.cruise_trip_day, ctp.cruise_trip_date, ctp.cruise_trip_comment, "
			"       cp.cruise_port, cp.city, cp.state, cp.port_notes "
			"  FROM cruise_trip_ports ctp "
			"  LEFT JOIN cruise_port cp ON cp.cruise_port_id = ctp.cruise_port_id "
			" WHERE ctp.cruise_trip_id = %s "
			" ORDER BY ctp.cruise_trip_day, ctp.cruise_trip_date",
			(cruise_trip_id,),
		)
		port_cols = [d.name for d in cur.description]
		ports = [dict(zip(port_cols, r)) for r in cur.fetchall()]

		cur.execute(
			"SELECT event_date, event_time, event_name, event_location, event_notes "
			"  FROM cruise_trip_event "
			" WHERE cruise_trip_id = %s "
			" ORDER BY event_date NULLS LAST, event_time NULLS LAST, cruise_trip_event_id",
			(cruise_trip_id,),
		)
		event_cols = [d.name for d in cur.description]
		events = []
		for r in cur.fetchall():
			ev = dict(zip(event_cols, r))
			ev['event_time_str'] = fmt_short_time(ev.get('event_time'))
			events.append(ev)

	# Derived totals
	costs = {
		'cruise':     trip.get('trip_cost') or 0,
		'airfare':    trip.get('airfare_cost') or 0,
		'hotel':      trip.get('hotel_cost') or 0,
		'cat_sitter': trip.get('cat_sitter_cost') or 0,
	}
	costs['total'] = sum(costs.values())
	paid = trip.get('amount_paid') or 0
	costs['paid']    = paid
	costs['balance'] = max(costs['total'] - paid, 0)
	costs['paid_pct'] = (paid / costs['total'] * 100.0) if costs['total'] else 0.0

	return render_template(
		'print_itinerary.html',
		trip=trip, ports=ports, events=events, costs=costs,
	)


@app.route("/data/insights")
def get_insights():
	conn = get_db()
	# Lifetime stats: only completed trips count toward lifetime totals.
	stats_sql = """
	WITH past AS (
		SELECT ct.*, cs.cruise_line_id, cl.cruise_line
		  FROM cruise_trip ct
		  JOIN cruise_ship cs ON cs.cruise_ship_id = ct.cruise_ship_id
		  JOIN cruise_line cl ON cl.cruise_line_id = cs.cruise_line_id
		 WHERE ct.departure_date < CURRENT_DATE
	),
	upcoming AS (
		SELECT cruise_trip_id FROM cruise_trip WHERE departure_date >= CURRENT_DATE
	)
	SELECT
		(SELECT COUNT(*) FROM past)                                AS cruises_taken,
		(SELECT COUNT(*) FROM upcoming)                            AS upcoming_cruises,
		(SELECT COALESCE(SUM(cruise_length_days), 0) FROM past)    AS days_at_sea,
		(SELECT COUNT(DISTINCT ctp.cruise_port_id)
		   FROM cruise_trip_ports ctp
		  WHERE ctp.cruise_trip_date IS NOT NULL
		    AND ctp.cruise_trip_date < CURRENT_DATE)               AS distinct_ports,
		(SELECT COUNT(DISTINCT cruise_ship_id) FROM past)          AS distinct_ships,
		(SELECT COUNT(*)
		   FROM cruise_trip_staff cts
		   JOIN past p ON p.cruise_trip_id = cts.cruise_trip_id)   AS exceptional_staff,
		(SELECT COUNT(*) FROM cruise_trip_photos)                  AS photos_collected,
		(SELECT COALESCE(SUM(COALESCE(trip_cost::numeric,0)), 0)
		   FROM past)                                              AS lifetime_spent,
		(SELECT CASE WHEN COALESCE(SUM(cruise_length_days), 0) > 0
		             THEN COALESCE(SUM(trip_cost::numeric), 0) / SUM(cruise_length_days)
		             ELSE NULL END FROM past)                      AS cruise_cost_per_day,
		(SELECT COALESCE(SUM(current_points), 0)
		   FROM cruise_line_reward_member
		  WHERE passenger_id = %s)                                 AS lifetime_club_points,
		(SELECT cruise_line FROM past
		  GROUP BY cruise_line
		  ORDER BY COUNT(*) DESC, cruise_line LIMIT 1)             AS most_cruised_line,
		(SELECT COUNT(*) FROM past
		  WHERE cruise_line = (SELECT cruise_line FROM past
		     GROUP BY cruise_line ORDER BY COUNT(*) DESC, cruise_line LIMIT 1))
		                                                           AS most_cruised_line_count
	"""
	with conn.cursor() as cur:
		cur.execute(stats_sql, (session.get('passenger_id'),))
		cols = [d.name for d in cur.description]
		row = cur.fetchone()
		stats = dict(zip(cols, row))
		for k in ('lifetime_spent', 'cruise_cost_per_day'):
			if stats[k] is not None:
				stats[k] = float(stats[k])

	# All trips (past + upcoming) for the spending charts so the user can see
	# both history and committed future spend.
	by_year_df = pd.read_sql_query(
		"SELECT EXTRACT(YEAR FROM departure_date)::int AS year, "
		"       SUM(COALESCE(trip_cost::numeric,0))        AS cruise_cost, "
		"       SUM(COALESCE(airfare_cost::numeric,0))    AS airfare_cost, "
		"       SUM(COALESCE(hotel_cost::numeric,0))      AS hotel_cost, "
		"       SUM(COALESCE(cat_sitter_cost::numeric,0)) AS cat_sitter_cost "
		"  FROM cruise_trip "
		" WHERE departure_date IS NOT NULL "
		" GROUP BY EXTRACT(YEAR FROM departure_date) "
		" ORDER BY year",
		con=conn,
	)
	by_line_df = pd.read_sql_query(
		"SELECT cl.cruise_line, "
		"       SUM(COALESCE(ct.trip_cost::numeric,0)) AS total_cost, "
		"       COUNT(*) AS trip_count "
		"  FROM cruise_trip ct "
		"  JOIN cruise_ship cs ON cs.cruise_ship_id = ct.cruise_ship_id "
		"  JOIN cruise_line cl ON cl.cruise_line_id = cs.cruise_line_id "
		" GROUP BY cl.cruise_line "
		" ORDER BY total_cost DESC",
		con=conn,
	)
	per_cruise_df = pd.read_sql_query(
		"SELECT ct.cruise_trip_id, "
		"       COALESCE(NULLIF(ct.cruise_name,''), cs.ship_name) AS label, "
		"       ct.departure_date, ct.cruise_length_days, "
		"       COALESCE(ct.trip_cost::numeric,0)::float        AS cruise_cost, "
		"       COALESCE(ct.airfare_cost::numeric,0)::float    AS airfare_cost, "
		"       COALESCE(ct.hotel_cost::numeric,0)::float      AS hotel_cost, "
		"       COALESCE(ct.cat_sitter_cost::numeric,0)::float AS cat_sitter_cost "
		"  FROM cruise_trip ct "
		"  JOIN cruise_ship cs ON cs.cruise_ship_id = ct.cruise_ship_id "
		" WHERE ct.departure_date IS NOT NULL "
		" ORDER BY ct.departure_date",
		con=conn,
	)
	per_cruise_df['departure_date'] = per_cruise_df['departure_date'].apply(
		lambda d: d.isoformat() if hasattr(d, 'isoformat') else str(d) if d is not None else None
	)
	per_cruise_df['total'] = (
		per_cruise_df['cruise_cost'] + per_cruise_df['airfare_cost']
		+ per_cruise_df['hotel_cost'] + per_cruise_df['cat_sitter_cost']
	)
	per_cruise_df['cost_per_day'] = per_cruise_df.apply(
		lambda r: (r['cruise_cost'] / r['cruise_length_days']) if (r['cruise_length_days'] and r['cruise_length_days'] > 0) else None,
		axis=1,
	)

	# Captain's Club race — pick the cruise line that actually has reward
	# members tracked (in practice: Celebrity for now). One chart per line
	# would be cool but for two passengers in one program it's overkill.
	club_race_df = pd.read_sql_query(
		"""
		WITH active_line AS (
			SELECT cruise_line_id
			  FROM cruise_line_reward_member
		  GROUP BY cruise_line_id
		  ORDER BY COUNT(*) DESC
			 LIMIT 1
		)
		SELECT p.passenger_name, p.passenger_abbr,
		       clrm.current_points,
		       clrm.current_program_level,
		       clrl.program_level_name,
		       cl.cruise_line
		  FROM cruise_line_reward_member clrm
		  JOIN active_line al ON al.cruise_line_id = clrm.cruise_line_id
		  JOIN passenger p   ON p.passenger_id = clrm.passenger_id
		  JOIN cruise_line cl ON cl.cruise_line_id = clrm.cruise_line_id
	 LEFT JOIN cruise_line_reward_program_level clrl
	        ON clrl.cruise_line_id = clrm.cruise_line_id
	       AND clrl.program_level = clrm.current_program_level
	  ORDER BY clrm.current_points DESC NULLS LAST, p.passenger_name
		""",
		con=conn,
	)
	club_race_milestones_df = pd.read_sql_query(
		"""
		SELECT clrl.program_level, clrl.program_level_name, clrl.min_points
		  FROM cruise_line_reward_program_level clrl
		  JOIN (SELECT cruise_line_id FROM cruise_line_reward_member
		     GROUP BY cruise_line_id ORDER BY COUNT(*) DESC LIMIT 1) al
		    ON al.cruise_line_id = clrl.cruise_line_id
	  ORDER BY clrl.program_level
		""",
		con=conn,
	)
	if not club_race_df.empty:
		club_race_df['current_points'] = club_race_df['current_points'].fillna(0).astype(int)
	club_race = {
		'cruise_line': (
			club_race_df['cruise_line'].iloc[0] if not club_race_df.empty else None
		),
		'passengers': json.loads(club_race_df.to_json(orient='records')),
		'milestones': json.loads(club_race_milestones_df.to_json(orient='records')),
	}

	payload = {
		'stats': stats,
		'by_year': json.loads(by_year_df.to_json(orient='records')),
		'by_line': json.loads(by_line_df.to_json(orient='records')),
		'per_cruise': json.loads(per_cruise_df.to_json(orient='records')),
		'club_race': club_race,
	}
	return Response(json.dumps(payload, default=str), mimetype='application/json')


@app.route("/data/traveler_table")
def get_traveler_table():
	df = pd.read_sql_query(
		"SELECT passenger_name, passenger_abbr, home_city, home_airport, "
		"       known_traveler_number, passport_number, passport_expiration_date, passenger_id "
		"  FROM passenger ORDER BY passenger_name",
		con=get_db(),
	)
	df['passport_expiration_date'] = df['passport_expiration_date'].apply(format_chart_datetime)
	return df.to_json(orient="split", index=False)


@app.route("/data/lookups/passengers")
def lookup_passengers():
	df = pd.read_sql_query(
		"SELECT passenger_id, passenger_name, passenger_abbr, home_city, home_airport "
		"FROM passenger ORDER BY passenger_name",
		con=get_db(),
	)
	return df.to_json(orient='records')


@app.route("/data/traveler/<int:passenger_id>")
def get_traveler(passenger_id):
	conn = get_db()
	with conn.cursor() as cur:
		cur.execute(
			"SELECT passenger_id, passenger_name, passenger_abbr, home_city, home_airport, "
			"       known_traveler_number, passport_number, passport_expiration_date "
			"  FROM passenger WHERE passenger_id = %s",
			(passenger_id,),
		)
		row = cur.fetchone()
		if row is None:
			return Response('not found', status=404)
		cols = [d.name for d in cur.description]
		traveler = dict(zip(cols, row))
		if traveler.get('passport_expiration_date') is not None:
			traveler['passport_expiration_date'] = traveler['passport_expiration_date'].isoformat()
	return Response(json.dumps(traveler, default=str), mimetype='application/json')


def _save_traveler(passenger_id):
	data = request.get_json(silent=True) or {}
	cleaned = {}
	for name, kind, required in TRAVELER_FIELDS:
		if name in data:
			cleaned[name] = _coerce(data[name], kind)
		elif required and passenger_id is None:
			return Response(f'missing required field: {name}', status=400)
	if not cleaned and passenger_id is not None:
		return Response('no fields to update', status=400)
	cols = list(cleaned.keys())
	vals = [cleaned[c] for c in cols]
	conn = get_db()
	with conn.cursor() as cur:
		if passenger_id is None:
			placeholders = ', '.join(['%s'] * len(cols))
			cur.execute(
				f"INSERT INTO passenger ({', '.join(cols)}) "
				f"VALUES ({placeholders}) RETURNING passenger_id",
				vals,
			)
			passenger_id = cur.fetchone()[0]
		else:
			assignments = ', '.join(f"{c} = %s" for c in cols)
			cur.execute(
				f"UPDATE passenger SET {assignments} WHERE passenger_id = %s",
				vals + [passenger_id],
			)
			if cur.rowcount == 0:
				return Response('passenger not found', status=404)
	return Response(json.dumps({'passenger_id': passenger_id}), mimetype='application/json')


@app.route("/data/traveler", methods=["POST"])
def create_traveler():
	return _save_traveler(None)


@app.route("/data/traveler/<int:passenger_id>", methods=["PUT"])
def update_traveler(passenger_id):
	return _save_traveler(passenger_id)


@app.route("/data/lookups/cruise_line_reward_levels")
def lookup_cruise_line_reward_levels():
	df = pd.read_sql_query(
		"SELECT cruise_line_id, program_level, program_level_name, "
		"       min_points, max_points "
		"FROM cruise_line_reward_program_level "
		"ORDER BY cruise_line_id, program_level",
		con=get_db(),
	)
	return df.to_json(orient='records')


@app.route("/data/lookups/airlines")
def lookup_airlines():
	df = pd.read_sql_query(
		"SELECT airline_id, airline_name, airline_abbr, airline_reward_program "
		"FROM airline ORDER BY airline_name",
		con=get_db(),
	)
	return df.to_json(orient='records')


@app.route("/data/airline", methods=["POST"])
def create_airline():
	return _insert_lookup('airline', 'airline_id', AIRLINE_FIELDS)


@app.route("/data/traveler/<int:passenger_id>/airline_rewards", methods=["GET"])
def list_airline_rewards(passenger_id):
	conn = get_db()
	with conn.cursor() as cur:
		cur.execute(
			"SELECT airline_id, member_number FROM airline_reward_member "
			"WHERE passenger_id = %s ORDER BY airline_id",
			(passenger_id,),
		)
		cols = [d.name for d in cur.description]
		rows = [dict(zip(cols, r)) for r in cur.fetchall()]
	return Response(json.dumps(rows), mimetype='application/json')


@app.route("/data/traveler/<int:passenger_id>/airline_rewards", methods=["PUT"])
def replace_airline_rewards(passenger_id):
	data = request.get_json(silent=True) or {}
	members = data.get('members') or []
	rows = []
	seen = set()
	for i, m in enumerate(members):
		try:
			airline_id = int(m.get('airline_id'))
		except (TypeError, ValueError):
			return Response(f'row {i}: invalid airline_id', status=400)
		if airline_id in seen:
			return Response(f'row {i}: duplicate airline', status=400)
		seen.add(airline_id)
		member_number = (m.get('member_number') or '').strip() or None
		rows.append((airline_id, passenger_id, member_number))

	conn = get_db()
	conn.autocommit = False
	try:
		with conn.cursor() as cur:
			cur.execute(
				"DELETE FROM airline_reward_member WHERE passenger_id = %s",
				(passenger_id,),
			)
			if rows:
				cur.executemany(
					"INSERT INTO airline_reward_member "
					"(airline_id, passenger_id, member_number) VALUES (%s, %s, %s)",
					rows,
				)
		conn.commit()
	except Exception as e:
		conn.rollback()
		return Response(f'save failed: {e}', status=500)
	finally:
		conn.autocommit = True
	return Response(
		json.dumps({'passenger_id': passenger_id, 'count': len(rows)}),
		mimetype='application/json',
	)


@app.route("/data/traveler/<int:passenger_id>/cruise_rewards", methods=["GET"])
def list_cruise_rewards(passenger_id):
	conn = get_db()
	with conn.cursor() as cur:
		cur.execute(
			"SELECT cruise_line_id, member_number, current_program_level, current_points "
			"FROM cruise_line_reward_member WHERE passenger_id = %s ORDER BY cruise_line_id",
			(passenger_id,),
		)
		cols = [d.name for d in cur.description]
		rows = [dict(zip(cols, r)) for r in cur.fetchall()]
	return Response(json.dumps(rows), mimetype='application/json')


@app.route("/data/traveler/<int:passenger_id>/cruise_rewards", methods=["PUT"])
def replace_cruise_rewards(passenger_id):
	data = request.get_json(silent=True) or {}
	members = data.get('members') or []
	rows = []
	seen = set()
	for i, m in enumerate(members):
		try:
			line_id = int(m.get('cruise_line_id'))
		except (TypeError, ValueError):
			return Response(f'row {i}: invalid cruise_line_id', status=400)
		if line_id in seen:
			return Response(f'row {i}: duplicate cruise line', status=400)
		seen.add(line_id)
		member_number = (m.get('member_number') or '').strip() or None
		raw_level = m.get('current_program_level')
		level = None
		if raw_level not in (None, ''):
			try:
				level = int(raw_level)
			except (TypeError, ValueError):
				return Response(f'row {i}: invalid current_program_level', status=400)
		raw_points = m.get('current_points')
		points = None
		if raw_points not in (None, ''):
			try:
				points = float(raw_points)
			except (TypeError, ValueError):
				return Response(f'row {i}: invalid current_points', status=400)
		rows.append((line_id, passenger_id, member_number, level, points))

	conn = get_db()
	conn.autocommit = False
	try:
		with conn.cursor() as cur:
			cur.execute(
				"DELETE FROM cruise_line_reward_member WHERE passenger_id = %s",
				(passenger_id,),
			)
			if rows:
				cur.executemany(
					"INSERT INTO cruise_line_reward_member "
					"(cruise_line_id, passenger_id, member_number, "
					" current_program_level, current_points) "
					"VALUES (%s, %s, %s, %s, %s)",
					rows,
				)
		conn.commit()
	except Exception as e:
		conn.rollback()
		return Response(f'save failed: {e}', status=500)
	finally:
		conn.autocommit = True
	return Response(
		json.dumps({'passenger_id': passenger_id, 'count': len(rows)}),
		mimetype='application/json',
	)


@app.route("/data/port_list_table")
def get_port_list_table():
	cruise_ports_df = get_port_list(get_db())
	return cruise_ports_df.to_json(orient="split", index=False)


@app.route("/data/chart_ports")
def get_chart_ports():
	try:
		cruise_port_ids = _parse_id_list(request.args.get('cruise_port_ids'))
	except ValueError:
		return Response('invalid cruise_port_ids', status=400)
	ports_df = get_ports(get_db(), cruise_port_ids)
	return ports_df.to_json(orient="records")


@app.route("/data/port", methods=["POST"])
def create_port():
	data = request.get_json(silent=True) or {}
	for key in ('cruise_port', 'city', 'state', 'latitude', 'longitude'):
		if data.get(key) in (None, ''):
			return Response(f'missing field: {key}', status=400)
	try:
		lat = float(data['latitude'])
		lon = float(data['longitude'])
	except (TypeError, ValueError):
		return Response('invalid latitude/longitude', status=400)
	nearest_airport = (data.get('nearest_airport') or '').strip().upper() or None
	port_notes = (data.get('port_notes') or '').strip() or None
	conn = get_db()
	with conn.cursor() as cur:
		cur.execute(
			"INSERT INTO cruise_port (cruise_port, city, state, latitude, longitude, nearest_airport, port_notes) "
			"VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING cruise_port_id",
			(data['cruise_port'], data['city'], data['state'], lat, lon, nearest_airport, port_notes),
		)
		new_id = cur.fetchone()[0]
	return Response(json.dumps({'cruise_port_id': new_id}), mimetype='application/json')


@app.route("/data/port/<int:cruise_port_id>", methods=["PUT"])
def update_port(cruise_port_id):
	data = request.get_json(silent=True) or {}
	for key in ('cruise_port', 'city', 'state', 'latitude', 'longitude'):
		if data.get(key) in (None, ''):
			return Response(f'missing field: {key}', status=400)
	try:
		lat = float(data['latitude'])
		lon = float(data['longitude'])
	except (TypeError, ValueError):
		return Response('invalid latitude/longitude', status=400)
	nearest_airport = (data.get('nearest_airport') or '').strip().upper() or None
	port_notes = (data.get('port_notes') or '').strip() or None
	conn = get_db()
	with conn.cursor() as cur:
		cur.execute(
			"UPDATE cruise_port "
			"   SET cruise_port = %s, city = %s, state = %s, "
			"       latitude = %s, longitude = %s, nearest_airport = %s, "
			"       port_notes = %s "
			" WHERE cruise_port_id = %s",
			(data['cruise_port'], data['city'], data['state'], lat, lon,
			 nearest_airport, port_notes, cruise_port_id),
		)
		if cur.rowcount == 0:
			return Response('port not found', status=404)
	return Response(json.dumps({'cruise_port_id': cruise_port_id}), mimetype='application/json')


@app.route("/data/lookups/cruise_lines")
def lookup_cruise_lines():
	df = pd.read_sql_query(
		"SELECT cruise_line_id, cruise_line, cruise_line_abbr "
		"FROM cruise_line ORDER BY cruise_line",
		con=get_db(),
	)
	return df.to_json(orient='records')


@app.route("/data/lookups/companies")
def lookup_companies():
	df = pd.read_sql_query(
		"SELECT company_id, company_name, company_abbr "
		"FROM company ORDER BY company_name",
		con=get_db(),
	)
	return df.to_json(orient='records')


COMPANY_FIELDS = [
	('company_name', str, True),
	('company_abbr', str, False),
	('company_url', str, False),
]

LINE_FIELDS = [
	('cruise_line', str, True),
	('cruise_line_abbr', str, False),
	('cruise_line_url', str, False),
	('cruise_line_reward_program', str, False),
	('company_id', int, False),
]

STAFF_POSITION_FIELDS = [
	('staff_position', str, True),
]

AIRLINE_FIELDS = [
	('airline_name', str, True),
	('airline_abbr', str, False),
	('airline_url', str, False),
	('airline_reward_program', str, False),
]

TRAVELER_FIELDS = [
	('passenger_name', str, True),
	('passenger_abbr', str, False),
	('known_traveler_number', str, False),
	('passport_number', str, False),
	('passport_expiration_date', 'date', False),
	('home_city', str, False),
	('home_airport', str, False),
]

SHIP_FIELDS = [
	('ship_name', str, True),
	('cruise_line_id', int, True),
	('year_built', int, False),
	('occupancy', int, False),
	('ship_class', str, False),
	('casino_deck_number', int, False),
	('lounge_deck_number', int, False),
	('restaurant_deck_number', int, False),
	('retreat_deck_number', int, False),
]


def _insert_lookup(table, id_col, fields):
	data = request.get_json(silent=True) or {}
	cleaned = {}
	for name, kind, required in fields:
		val = _coerce(data.get(name), kind)
		if required and val in (None, ''):
			return Response(f'missing required field: {name}', status=400)
		cleaned[name] = val
	cols = list(cleaned.keys())
	vals = [cleaned[c] for c in cols]
	placeholders = ', '.join(['%s'] * len(cols))
	conn = get_db()
	with conn.cursor() as cur:
		cur.execute(
			f"INSERT INTO {table} ({', '.join(cols)}) "
			f"VALUES ({placeholders}) RETURNING {id_col}",
			vals,
		)
		new_id = cur.fetchone()[0]
	return Response(json.dumps({id_col: new_id}), mimetype='application/json')


@app.route("/data/company", methods=["POST"])
def create_company():
	return _insert_lookup('company', 'company_id', COMPANY_FIELDS)


@app.route("/data/cruise_line", methods=["POST"])
def create_cruise_line():
	return _insert_lookup('cruise_line', 'cruise_line_id', LINE_FIELDS)


@app.route("/data/cruise_ship", methods=["POST"])
def create_cruise_ship():
	return _insert_lookup('cruise_ship', 'cruise_ship_id', SHIP_FIELDS)


@app.route("/data/lookups/staff_positions")
def lookup_staff_positions():
	df = pd.read_sql_query(
		"SELECT staff_position_id, staff_position "
		"FROM staff_position ORDER BY staff_position",
		con=get_db(),
	)
	return df.to_json(orient='records')


@app.route("/data/staff_position", methods=["POST"])
def create_staff_position():
	return _insert_lookup('staff_position', 'staff_position_id', STAFF_POSITION_FIELDS)


@app.route("/data/cruise_trip/<int:cruise_trip_id>/staff", methods=["PUT"])
def replace_cruise_trip_staff(cruise_trip_id):
	data = request.get_json(silent=True) or {}
	staff = data.get('staff') or []
	rows = []
	for i, s in enumerate(staff):
		name = (s.get('name') or '').strip() or None
		location = (s.get('location') or '').strip() or None
		notes = s.get('notes') or None
		raw_pos = s.get('staff_position_id')
		position_id = None
		if raw_pos not in (None, ''):
			try:
				position_id = int(raw_pos)
			except (TypeError, ValueError):
				return Response(f'row {i}: invalid staff_position_id', status=400)
		# skip rows that have no real content
		if not name and not position_id and not location and not notes:
			continue
		rows.append((cruise_trip_id, name, position_id, location, notes))

	conn = get_db()
	conn.autocommit = False
	try:
		with conn.cursor() as cur:
			cur.execute(
				"DELETE FROM cruise_trip_staff WHERE cruise_trip_id = %s",
				(cruise_trip_id,),
			)
			if rows:
				cur.executemany(
					"INSERT INTO cruise_trip_staff "
					"(cruise_trip_id, name, staff_position_id, location, notes) "
					"VALUES (%s, %s, %s, %s, %s)",
					rows,
				)
		conn.commit()
	except Exception as e:
		conn.rollback()
		return Response(f'save failed: {e}', status=500)
	finally:
		conn.autocommit = True
	return Response(
		json.dumps({'cruise_trip_id': cruise_trip_id, 'count': len(rows)}),
		mimetype='application/json',
	)


@app.route("/data/cruise_trip/<int:cruise_trip_id>/events", methods=["PUT"])
def replace_cruise_trip_events(cruise_trip_id):
	data = request.get_json(silent=True) or {}
	entries = data.get('events') or []
	rows = []
	for e in entries:
		name = (e.get('event_name') or '').strip() or None
		notes = e.get('event_notes') or None
		if notes is not None and not notes.strip():
			notes = None
		event_date = e.get('event_date') or None
		event_time = e.get('event_time') or None
		location = (e.get('event_location') or '').strip() or None
		if not name and not notes and not event_date and not location:
			continue
		rows.append((cruise_trip_id, event_date, event_time, name, location, notes))

	conn = get_db()
	conn.autocommit = False
	try:
		with conn.cursor() as cur:
			cur.execute(
				"DELETE FROM cruise_trip_event WHERE cruise_trip_id = %s",
				(cruise_trip_id,),
			)
			if rows:
				cur.executemany(
					"INSERT INTO cruise_trip_event "
					"(cruise_trip_id, event_date, event_time, event_name, "
					" event_location, event_notes) "
					"VALUES (%s, %s, %s, %s, %s, %s)",
					rows,
				)
		conn.commit()
	except Exception as e:
		conn.rollback()
		return Response(f'save failed: {e}', status=500)
	finally:
		conn.autocommit = True
	return Response(
		json.dumps({'cruise_trip_id': cruise_trip_id, 'count': len(rows)}),
		mimetype='application/json',
	)


@app.route("/data/lookups/cruise_ships")
def lookup_cruise_ships():
	df = pd.read_sql_query(
		"SELECT cruise_ship_id, ship_name, cruise_line_id "
		"FROM cruise_ship ORDER BY ship_name",
		con=get_db(),
	)
	return df.to_json(orient='records')


@app.route("/data/lookups/ports")
def lookup_ports():
	df = pd.read_sql_query(
		"SELECT cruise_port_id, cruise_port, city, state, nearest_airport, port_notes "
		"FROM cruise_port ORDER BY cruise_port",
		con=get_db(),
	)
	return df.to_json(orient='records')


@app.route("/data/cruise_trip/<int:cruise_trip_id>/full")
def get_cruise_trip_full(cruise_trip_id):
	conn = get_db()
	with conn.cursor() as cur:
		cur.execute(
			"SELECT ct.cruise_trip_id, ct.cruise_ship_id, cs.cruise_line_id, "
			"       ct.departure_port_id, ct.arrival_port_id, "
			"       ct.departure_date, ct.arrival_date, ct.book_date, ct.amount_due_date, "
			"       ct.deck_number, ct.room_number, "
			"       ct.suite_yn::text AS suite_yn, ct.agent_yn::text AS agent_yn, "
			"       ct.need_airfare_yn::text AS need_airfare_yn, "
			"       ct.airfare_purchased_yn::text AS airfare_purchased_yn, "
			"       ct.need_hotel_yn::text AS need_hotel_yn, "
			"       ct.hotel_booked_yn::text AS hotel_booked_yn, "
			"       ct.trip_cost::text AS trip_cost, ct.amount_paid::text AS amount_paid, "
			"       ct.airfare_cost::text AS airfare_cost, ct.hotel_cost::text AS hotel_cost, "
			"       ct.cat_sitter_cost::text AS cat_sitter_cost, "
			"       ct.club_points, ct.cruise_name, ct.agent_name, ct.cat_sitter, "
			"       ct.cruise_length_days, ct.trip_notes, ct.trip_haiku, ct.apple_music_url "
			"  FROM cruise_trip ct LEFT JOIN cruise_ship cs "
			"    ON ct.cruise_ship_id = cs.cruise_ship_id "
			" WHERE ct.cruise_trip_id = %s",
			(cruise_trip_id,),
		)
		row = cur.fetchone()
		if row is None:
			return Response('not found', status=404)
		cols = [d.name for d in cur.description]
		trip = dict(zip(cols, row))
		for key in ('departure_date', 'arrival_date', 'book_date', 'amount_due_date'):
			if trip.get(key) is not None:
				trip[key] = trip[key].isoformat()
		for key in ('trip_cost', 'amount_paid', 'airfare_cost', 'hotel_cost', 'cat_sitter_cost'):
			val = trip.get(key)
			if val:
				trip[key] = val.replace('$', '').replace(',', '').strip()

		cur.execute(
			"SELECT cruise_trip_day, cruise_trip_date, cruise_port_id, cruise_trip_comment "
			"  FROM cruise_trip_ports WHERE cruise_trip_id = %s ORDER BY cruise_trip_day",
			(cruise_trip_id,),
		)
		port_cols = [d.name for d in cur.description]
		ports = []
		for r in cur.fetchall():
			p = dict(zip(port_cols, r))
			if p.get('cruise_trip_date') is not None:
				p['cruise_trip_date'] = p['cruise_trip_date'].isoformat()
			ports.append(p)
		trip['ports'] = ports

		cur.execute(
			"SELECT cruise_trip_staff_id, name, staff_position_id, location, notes "
			"  FROM cruise_trip_staff WHERE cruise_trip_id = %s "
			" ORDER BY cruise_trip_staff_id",
			(cruise_trip_id,),
		)
		staff_cols = [d.name for d in cur.description]
		trip['staff'] = [dict(zip(staff_cols, r)) for r in cur.fetchall()]

		cur.execute(
			"SELECT cruise_trip_event_id, event_date, event_time, "
			"       event_name, event_location, event_notes "
			"  FROM cruise_trip_event WHERE cruise_trip_id = %s "
			" ORDER BY event_date NULLS LAST, event_time NULLS LAST, "
			"          cruise_trip_event_id",
			(cruise_trip_id,),
		)
		event_cols = [d.name for d in cur.description]
		events = []
		for r in cur.fetchall():
			ev = dict(zip(event_cols, r))
			if ev.get('event_date') is not None:
				ev['event_date'] = ev['event_date'].isoformat()
			if ev.get('event_time') is not None:
				ev['event_time'] = ev['event_time'].strftime('%H:%M')
			events.append(ev)
		trip['events'] = events
	return Response(json.dumps(trip, default=str), mimetype='application/json')


def _save_cruise_trip(cruise_trip_id):
	data = request.get_json(silent=True) or {}
	cleaned = {}
	for name, kind, required in TRIP_FIELDS:
		if name in data:
			cleaned[name] = _coerce(data[name], kind)
		elif required and cruise_trip_id is None:
			return Response(f'missing required field: {name}', status=400)
	if not cleaned and cruise_trip_id is not None:
		return Response('no fields to update', status=400)
	cols = list(cleaned.keys())
	vals = [cleaned[c] for c in cols]
	conn = get_db()
	with conn.cursor() as cur:
		if cruise_trip_id is None:
			placeholders = ', '.join(['%s'] * len(cols))
			cur.execute(
				f"INSERT INTO cruise_trip ({', '.join(cols)}) "
				f"VALUES ({placeholders}) RETURNING cruise_trip_id",
				vals,
			)
			cruise_trip_id = cur.fetchone()[0]
		else:
			assignments = ', '.join(f"{c} = %s" for c in cols)
			cur.execute(
				f"UPDATE cruise_trip SET {assignments} WHERE cruise_trip_id = %s",
				vals + [cruise_trip_id],
			)
			if cur.rowcount == 0:
				return Response('trip not found', status=404)
	return Response(json.dumps({'cruise_trip_id': cruise_trip_id}), mimetype='application/json')


@app.route("/data/cruise_trip", methods=["POST"])
def create_cruise_trip():
	return _save_cruise_trip(None)


@app.route("/data/cruise_trip/<int:cruise_trip_id>", methods=["PUT"])
def update_cruise_trip(cruise_trip_id):
	return _save_cruise_trip(cruise_trip_id)


@app.route("/data/cruise_trip/<int:cruise_trip_id>/ports", methods=["PUT"])
def replace_cruise_trip_ports(cruise_trip_id):
	data = request.get_json(silent=True) or {}
	ports = data.get('ports') or []
	rows = []
	for i, p in enumerate(ports):
		try:
			day = int(p.get('cruise_trip_day'))
		except (TypeError, ValueError):
			return Response(f'row {i}: invalid cruise_trip_day', status=400)
		try:
			port_id = int(p.get('cruise_port_id'))
		except (TypeError, ValueError):
			return Response(f'row {i}: invalid cruise_port_id', status=400)
		date = p.get('cruise_trip_date') or None
		comment = p.get('cruise_trip_comment') or None
		rows.append((cruise_trip_id, day, date, port_id, comment))

	conn = get_db()
	conn.autocommit = False
	try:
		with conn.cursor() as cur:
			cur.execute(
				"DELETE FROM cruise_trip_ports WHERE cruise_trip_id = %s",
				(cruise_trip_id,),
			)
			if rows:
				cur.executemany(
					"INSERT INTO cruise_trip_ports "
					"(cruise_trip_id, cruise_trip_day, cruise_trip_date, "
					" cruise_port_id, cruise_trip_comment) "
					"VALUES (%s, %s, %s, %s, %s)",
					rows,
				)
		conn.commit()
	except Exception as e:
		conn.rollback()
		return Response(f'save failed: {e}', status=500)
	finally:
		conn.autocommit = True
	return Response(
		json.dumps({'cruise_trip_id': cruise_trip_id, 'count': len(rows)}),
		mimetype='application/json',
	)


@app.route("/data/cruise_trip/<int:cruise_trip_id>/photos", methods=["GET"])
def list_cruise_trip_photos(cruise_trip_id):
	conn = get_db()
	with conn.cursor() as cur:
		cur.execute(
			"SELECT cruise_trip_photo_id, file_path, original_filename, caption, uploaded_at "
			"  FROM cruise_trip_photos WHERE cruise_trip_id = %s "
			" ORDER BY uploaded_at DESC, cruise_trip_photo_id DESC",
			(cruise_trip_id,),
		)
		cols = [d.name for d in cur.description]
		rows = []
		for r in cur.fetchall():
			row = dict(zip(cols, r))
			if row.get('uploaded_at') is not None:
				row['uploaded_at'] = row['uploaded_at'].isoformat()
			rows.append(row)
	return Response(json.dumps(rows), mimetype='application/json')


@app.route("/data/cruise_trip/<int:cruise_trip_id>/photos", methods=["POST"])
def upload_cruise_trip_photos(cruise_trip_id):
	files = request.files.getlist('photos')
	if not files:
		return Response('no files', status=400)
	trip_dir = UPLOAD_DIR / f'trip_{cruise_trip_id}'
	trip_dir.mkdir(parents=True, exist_ok=True)

	inserted = []
	skipped = []
	conn = get_db()
	with conn.cursor() as cur:
		for f in files:
			if not f.filename:
				continue
			original = secure_filename(f.filename) or f.filename
			ext = Path(original).suffix.lower()
			if ext not in ALLOWED_PHOTO_EXTS:
				skipped.append({'filename': original, 'reason': 'unsupported type'})
				continue
			f.seek(0, os.SEEK_END)
			size = f.tell()
			f.seek(0)
			if size > MAX_PHOTO_BYTES:
				skipped.append({'filename': original, 'reason': 'over 10MB'})
				continue
			new_name = uuid.uuid4().hex + ext
			full_path = trip_dir / new_name
			f.save(str(full_path))
			rel_path = f'uploads/trip_{cruise_trip_id}/{new_name}'
			cur.execute(
				"INSERT INTO cruise_trip_photos "
				"(cruise_trip_id, file_path, original_filename, caption) "
				"VALUES (%s, %s, %s, NULL) "
				"RETURNING cruise_trip_photo_id, uploaded_at",
				(cruise_trip_id, rel_path, original),
			)
			new_id, uploaded_at = cur.fetchone()
			inserted.append({
				'cruise_trip_photo_id': new_id,
				'file_path': rel_path,
				'original_filename': original,
				'caption': None,
				'uploaded_at': uploaded_at.isoformat(),
			})
	return Response(
		json.dumps({'inserted': inserted, 'skipped': skipped}),
		mimetype='application/json',
	)


@app.route("/data/cruise_trip/photo/<int:photo_id>", methods=["PUT"])
def update_cruise_trip_photo(photo_id):
	data = request.get_json(silent=True) or {}
	caption = data.get('caption')
	if caption == '':
		caption = None
	conn = get_db()
	with conn.cursor() as cur:
		cur.execute(
			"UPDATE cruise_trip_photos SET caption = %s "
			"WHERE cruise_trip_photo_id = %s",
			(caption, photo_id),
		)
		if cur.rowcount == 0:
			return Response('not found', status=404)
	return Response(
		json.dumps({'cruise_trip_photo_id': photo_id}),
		mimetype='application/json',
	)


@app.route("/data/cruise_trip/photo/<int:photo_id>", methods=["DELETE"])
def delete_cruise_trip_photo(photo_id):
	conn = get_db()
	with conn.cursor() as cur:
		cur.execute(
			"SELECT file_path FROM cruise_trip_photos "
			"WHERE cruise_trip_photo_id = %s",
			(photo_id,),
		)
		row = cur.fetchone()
		if row is None:
			return Response('not found', status=404)
		rel_path = row[0]
		cur.execute(
			"DELETE FROM cruise_trip_photos "
			"WHERE cruise_trip_photo_id = %s",
			(photo_id,),
		)
	if rel_path:
		full_path = Path(app.static_folder) / rel_path
		try:
			full_path.unlink()
		except (FileNotFoundError, OSError):
			pass
	return Response(
		json.dumps({'cruise_trip_photo_id': photo_id}),
		mimetype='application/json',
	)


@app.route("/data/all_photos")
def get_all_photos():
	"""All cruise photos grouped by trip, most-recent departure first.
	Trips with zero photos are omitted (inner join below)."""
	conn = get_db()
	with conn.cursor() as cur:
		cur.execute(
			"SELECT ctp.cruise_trip_photo_id, ctp.cruise_trip_id, ctp.file_path, "
			"       ctp.original_filename, ctp.caption, "
			"       ct.departure_date, ct.arrival_date, "
			"       COALESCE(NULLIF(ct.cruise_name,''), cs.ship_name) AS label "
			"  FROM cruise_trip_photos ctp "
			"  JOIN cruise_trip ct ON ct.cruise_trip_id = ctp.cruise_trip_id "
			"  JOIN cruise_ship cs ON cs.cruise_ship_id = ct.cruise_ship_id "
			" ORDER BY ct.departure_date DESC NULLS LAST, ct.cruise_trip_id DESC, "
			"          ctp.uploaded_at ASC, ctp.cruise_trip_photo_id ASC"
		)
		cols = [d.name for d in cur.description]
		rows = [dict(zip(cols, r)) for r in cur.fetchall()]
	trips = []
	by_id = {}
	for r in rows:
		tid = r['cruise_trip_id']
		group = by_id.get(tid)
		if group is None:
			group = {
				'cruise_trip_id': tid,
				'label': r['label'],
				'departure_date': r['departure_date'].isoformat() if r['departure_date'] else None,
				'arrival_date': r['arrival_date'].isoformat() if r['arrival_date'] else None,
				'photos': [],
			}
			by_id[tid] = group
			trips.append(group)
		group['photos'].append({
			'cruise_trip_photo_id': r['cruise_trip_photo_id'],
			'file_path': r['file_path'],
			'original_filename': r['original_filename'],
			'caption': r['caption'],
		})
	return Response(json.dumps(trips), mimetype='application/json')


@app.route("/data/chart_cruise_ports")
def get_chart_cruise_ports():
	try:
		cruise_trip_ids = _parse_id_list(request.args.get('cruise_trip_ids'))
	except ValueError:
		return Response('invalid cruise_trip_ids', status=400)
	df = get_cruise_ports(get_db(), cruise_trip_ids)
	df['cruise_trip_date'] = df['cruise_trip_date'].apply(format_col_datetime2)

	ports = df.to_dict(orient='records')

	for i in range(len(ports) - 1):
		start_node = ports[i]
		end_node = ports[i + 1]

		origin = [float(start_node['longitude']), float(start_node['latitude'])]
		destination = [float(end_node['longitude']), float(end_node['latitude'])]

		if start_node['cruise_trip_id'] == end_node['cruise_trip_id']:
			try:
				route = sr.searoute(origin, destination)
				coords = route.get('geometry', {}).get('coordinates') if route else None
				if coords:
					# searoute snaps inputs to a coarse sea-node graph, so two
					# nearby ports (e.g. Hilo + Kona) can collapse to the same
					# node. Anchor the path at the real port coordinates so the
					# polyline ends and markers sit at the actual ports.
					start_node['sea_path'] = [origin] + list(coords) + [destination]
				else:
					start_node['sea_path'] = [origin, destination]
			except Exception as e:
				print(f"Routing failed for segment {i}: {e}")
				start_node['sea_path'] = [origin, destination]
		else:
			start_node['sea_path'] = [origin]

	if ports:
		last_port = ports[-1]
		if 'sea_path' not in last_port:
			last_port['sea_path'] = [[float(last_port['longitude']), float(last_port['latitude'])]]

	return Response(json.dumps(ports), mimetype='application/json')


if __name__ == '__main__':
	# Bind to the Tailscale tailnet IP so DESKTOP-42DV7RT is reachable from
	# our other Tailscale devices (phones, etc.) but not from the local LAN
	# or the public internet.
	app.run(host='100.94.202.31', port=8000)
