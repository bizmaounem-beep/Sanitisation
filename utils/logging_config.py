"""
logging_config.py
-----------------
Configures the application-wide rotating file logger.
All log files are written to the `logs/` directory.
"""
import os
import logging
from logging.handlers import RotatingFileHandler

LOG_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'logs')
LOG_FILE = os.path.join(LOG_DIR, 'app.log')

# Maximum log size: 10 MB, keep 5 backups
MAX_BYTES = 10 * 1024 * 1024
BACKUP_COUNT = 5

LOG_FORMAT = '[%(asctime)s] %(levelname)s in %(module)s: %(message)s'
DATE_FORMAT = '%Y-%m-%d %H:%M:%S'


def configure_logging():
    """
    Set up the root logger with a rotating file handler and a stream handler.
    Call this once at application startup before the first request.
    """
    os.makedirs(LOG_DIR, exist_ok=True)

    formatter = logging.Formatter(LOG_FORMAT, datefmt=DATE_FORMAT)

    # Rotating file handler
    file_handler = RotatingFileHandler(
        LOG_FILE,
        maxBytes=MAX_BYTES,
        backupCount=BACKUP_COUNT,
        encoding='utf-8'
    )
    file_handler.setLevel(logging.INFO)
    file_handler.setFormatter(formatter)

    # Console handler (keeps development output)
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.WARNING)
    console_handler.setFormatter(formatter)

    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)

    # Avoid duplicate handlers if called multiple times
    if not root_logger.handlers:
        root_logger.addHandler(file_handler)
        root_logger.addHandler(console_handler)
    else:
        root_logger.handlers.clear()
        root_logger.addHandler(file_handler)
        root_logger.addHandler(console_handler)

    return root_logger


def get_logger(name: str) -> logging.Logger:
    """Return a named logger — call this in each module."""
    return logging.getLogger(name)
