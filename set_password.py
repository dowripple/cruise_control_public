"""Set or reset a passenger's login_password.

Usage:
    python set_password.py                # interactive, prompts for username + password
    python set_password.py traveller1     # prompts for password only
    python set_password.py "Traveller 1"

Matches by login_id, passenger_abbr, or passenger_name (case-insensitive).
"""
import os
import sys
from getpass import getpass

import psycopg2
from werkzeug.security import generate_password_hash


def main():
    db_pw = os.environ.get('keysql')
    if not db_pw:
        sys.exit("env var 'keysql' is not set; can't connect to Postgres")

    conn = psycopg2.connect(host='localhost', user='postgres', password=db_pw, dbname='cruise_control')
    conn.autocommit = True
    cur = conn.cursor()

    username = sys.argv[1] if len(sys.argv) > 1 else input("username (login_id, abbr, or full name): ").strip()

    cur.execute(
        "SELECT passenger_id, passenger_name, passenger_abbr, login_id FROM passenger "
        "WHERE LOWER(login_id) = LOWER(%s) "
        "   OR LOWER(passenger_abbr) = LOWER(%s) "
        "   OR LOWER(passenger_name) = LOWER(%s)",
        (username, username, username),
    )
    row = cur.fetchone()
    if not row:
        sys.exit(f"no passenger found matching '{username}'")
    passenger_id, passenger_name, passenger_abbr, login_id = row
    print(f"setting password for passenger {passenger_id}: {passenger_name} ({passenger_abbr}) login_id={login_id}")

    pw1 = getpass("new password: ")
    pw2 = getpass("confirm:      ")
    if pw1 != pw2:
        sys.exit("passwords don't match")
    if not pw1:
        sys.exit("password cannot be empty")

    cur.execute(
        "UPDATE passenger SET login_password = %s WHERE passenger_id = %s",
        (generate_password_hash(pw1), passenger_id),
    )
    print("done.")


if __name__ == '__main__':
    main()
