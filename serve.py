"""Production launcher for cruise_control.

Runs the Flask app behind waitress (a real WSGI server) instead of the
Flask development server, so the site stays reachable across reboots and
isn't subject to the "do not use in a production deployment" warning.

To start manually:   python serve.py
To start at login:   the start_cruise_control.bat shortcut in the user's
                     Startup folder calls this.
"""
import os

from waitress import serve

from app import app


HOST = os.environ.get("CRUISE_HOST", "0.0.0.0")
PORT = int(os.environ.get("CRUISE_PORT", "8000"))


if __name__ == "__main__":
    # 0.0.0.0 listens on every adapter (Tailscale + LAN) so this script
    # doesn't fail to bind if Tailscale hasn't come up yet at boot. To
    # restrict to Tailscale-only, set CRUISE_HOST=100.94.202.31 and ensure
    # Tailscale is connected before launch.
    print(f"cruise_control: serving on http://{HOST}:{PORT}")
    serve(app, host=HOST, port=PORT, threads=8)
