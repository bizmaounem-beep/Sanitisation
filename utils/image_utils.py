"""
image_utils.py
--------------
Secure base64 image saving with:
  - MIME type validation via magic bytes (JPEG, PNG, WebP only)
  - Maximum file size enforcement (5 MB)
  - Sanitized filenames (no path traversal)
  - Organized dated storage: static/uploads/YYYY/MM/
"""
import os
import base64
import secrets
import datetime
import logging

logger = logging.getLogger(__name__)

# Maximum allowed upload size: 5 MB
MAX_IMAGE_BYTES = 5 * 1024 * 1024  # 5 242 880 bytes

# Allowed MIME types with their magic byte signatures
ALLOWED_SIGNATURES = {
    b'\xff\xd8\xff': 'jpg',       # JPEG
    b'\x89PNG\r\n\x1a\n': 'png',  # PNG
    b'RIFF': 'webp',              # WebP (needs secondary check)
    b'GIF87a': 'gif',             # GIF87
    b'GIF89a': 'gif',             # GIF89
}

BASE_UPLOAD_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    'static', 'uploads'
)


def _detect_image_type(data: bytes) -> str | None:
    """
    Inspect the first bytes of the decoded image data to determine its type.
    Returns the file extension string (e.g. 'jpg') or None if not a recognized image.
    """
    for magic, ext in ALLOWED_SIGNATURES.items():
        if data[:len(magic)] == magic:
            # Extra check for WebP: bytes 8-12 must be b'WEBP'
            if ext == 'webp':
                if len(data) >= 12 and data[8:12] == b'WEBP':
                    return 'webp'
                return None  # RIFF but not WebP
            return ext
    return None


def get_dated_upload_path() -> str:
    """
    Return and create the dated upload directory for today.
    Structure: static/uploads/YYYY/MM/
    """
    now = datetime.datetime.now()
    dated_dir = os.path.join(BASE_UPLOAD_DIR, str(now.year), f'{now.month:02d}')
    os.makedirs(dated_dir, exist_ok=True)
    return dated_dir


def save_base64_image(base64_str: str, prefix: str) -> str | None:
    """
    Securely decode and save a base64-encoded image.

    Validations performed:
      1. Strip data URI header if present.
      2. Enforce max size (5 MB) BEFORE writing to disk.
      3. Validate image magic bytes — reject anything that is not
         JPEG, PNG, WebP, or GIF.
      4. Generate a random filename using secrets to prevent enumeration.
      5. Save to dated subdirectory (static/uploads/YYYY/MM/).

    Returns the relative filename (e.g. '2026/06/before_<token>.jpg')
    or None on failure.
    """
    if not base64_str:
        return None

    try:
        # Strip data URI header (e.g. "data:image/png;base64,")
        if ',' in base64_str:
            _, base64_str = base64_str.split(',', 1)

        # Decode
        try:
            img_data = base64.b64decode(base64_str)
        except Exception:
            logger.warning('Image upload rejected: invalid base64 encoding')
            return None

        # Size check
        if len(img_data) > MAX_IMAGE_BYTES:
            logger.warning(
                'Image upload rejected: size %d bytes exceeds 5 MB limit', len(img_data)
            )
            return None

        # Magic byte validation
        ext = _detect_image_type(img_data)
        if ext is None:
            logger.warning('Image upload rejected: unrecognized or disallowed file type')
            return None

        # Sanitize prefix (no slashes, no dots)
        safe_prefix = ''.join(c for c in prefix if c.isalnum() or c == '_')[:20]

        # Generate secure random filename
        token = secrets.token_hex(16)  # 32-character hex
        filename = f'{safe_prefix}_{token}.{ext}'

        # Save to dated directory
        upload_dir = get_dated_upload_path()
        filepath = os.path.join(upload_dir, filename)

        with open(filepath, 'wb') as f:
            f.write(img_data)

        # Return relative path from static/uploads/ root
        now = datetime.datetime.now()
        relative_path = f'{now.year}/{now.month:02d}/{filename}'
        logger.info('Image saved: %s (%d bytes)', relative_path, len(img_data))
        return relative_path

    except Exception as e:
        logger.error('Unexpected error saving image: %s', str(e))
        return None
