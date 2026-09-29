"""Start the backend from the project folder:

    python main.py             http://127.0.0.1:8000
    python main.py --reload    the same, restarting whenever the backend's code changes

The API itself is server/main.py; this file only runs it with uvicorn, at the address the website calls.
"""

import sys
from pathlib import Path

import uvicorn

SERVER = Path(__file__).resolve().parent / "server"

if __name__ == "__main__":
    reload = "--reload" in sys.argv[1:]
    uvicorn.run(
        # server/ goes first on the import path, so "main" is the API, not this file
        "main:app",
        app_dir=str(SERVER),
        host="127.0.0.1",
        port=8000,
        reload=reload,
        # Only the backend's code restarts it, never the website's files or node_modules
        reload_dirs=[str(SERVER)] if reload else None,
    )