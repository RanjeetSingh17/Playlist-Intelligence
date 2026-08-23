"""
Supabase client singleton. `create_client` doesn't make a network call on
its own — connections happen lazily on the first query — so constructing
this is cheap and safe to memoize for the lifetime of the process.
"""
from functools import lru_cache

from supabase import Client, create_client

from app.core.config import settings


@lru_cache
def get_supabase() -> Client:
    return create_client(
        settings.require("SUPABASE_URL"), settings.require("SUPABASE_KEY")
    )
