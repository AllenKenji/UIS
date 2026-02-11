# backend/app/utils/date_utils.py

from datetime import datetime
from typing import Optional

def parse_date(date_str: Optional[str], fallback: Optional[datetime] = None, fmt: str = "%Y-%m-%d") -> datetime:
    """
    Parse a string into a datetime object. Falls back to provided datetime or today if parsing fails.

    Args:
        date_str (str): The date string to parse.
        fallback (datetime): A fallback datetime if parsing fails. Defaults to today.
        fmt (str): The expected format of the date string. Defaults to "%Y-%m-%d".

    Returns:
        datetime: A valid datetime object (parsed or fallback).
    """
    try:
        if date_str:
            return datetime.strptime(date_str, fmt)
    except (ValueError, TypeError):
        pass
    return fallback or datetime.today()

def format_date(date_obj: datetime, fmt: str = "%Y-%m-%d") -> str:
    return date_obj.strftime(fmt)

def today(fmt: str = "%Y-%m-%d") -> str:
    return datetime.today().strftime(fmt)
