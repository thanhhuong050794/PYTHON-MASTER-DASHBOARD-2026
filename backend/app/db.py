from functools import lru_cache

from pymongo import MongoClient
from pymongo.database import Database

from .config import settings


@lru_cache(maxsize=1)
def get_client() -> MongoClient:
    return MongoClient(settings.mongo_uri, serverSelectionTimeoutMS=15000, tz_aware=False)


def get_db() -> Database:
    return get_client()[settings.mongo_db_name]
