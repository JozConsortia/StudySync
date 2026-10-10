"""Start the StudySync API: `python run.py` (add --reload while developing)."""

import sys

import uvicorn

from app import config

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=config.PORT, reload="--reload" in sys.argv)
