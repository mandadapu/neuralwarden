"""Shared database connection layer.

Supports both SQLite (local dev) and PostgreSQL (Cloud Run / Cloud SQL).
Set DATABASE_URL env var to use PostgreSQL; otherwise falls back to SQLite.

Usage:
    from api.db import get_conn, is_postgres, placeholder

    conn = get_conn()
    try:
        conn.execute(f"SELECT * FROM t WHERE id = {placeholder}", (id,))
        conn.commit()
    finally:
        conn.close()
"""

import os
import sqlite3

DATABASE_URL = os.getenv("DATABASE_URL")

# ── Public helpers ────────────────────────────────────────

def is_postgres() -> bool:
    """True when using PostgreSQL (DATABASE_URL is set)."""
    return DATABASE_URL is not None


# Placeholder character for parameterized queries
placeholder = "%s" if is_postgres() else "?"


def get_conn():
    """Return a database connection (PostgreSQL or SQLite)."""
    if is_postgres():
        return _pg_conn()
    return _sqlite_conn()


def adapt_sql(sql: str) -> str:
    """Convert SQLite SQL to PostgreSQL-compatible SQL when needed."""
    if not is_postgres():
        return sql
    # Replace ? placeholders with %s
    return sql.replace("?", "%s")


def insert_or_ignore(table: str, columns: list[str], placeholders_str: str) -> str:
    """Generate INSERT OR IGNORE / ON CONFLICT DO NOTHING statement."""
    cols = ", ".join(columns)
    if is_postgres():
        return f"INSERT INTO {table} ({cols}) VALUES ({placeholders_str}) ON CONFLICT DO NOTHING"
    return f"INSERT OR IGNORE INTO {table} ({cols}) VALUES ({placeholders_str})"


# ── SQLite connection ────────────────────────────────────

_SQLITE_PATH = os.getenv("NEURALWARDEN_DB_PATH", "data/neuralwarden.db")


def _sqlite_conn() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(_SQLITE_PATH) or ".", exist_ok=True)
    conn = sqlite3.connect(_SQLITE_PATH)
    conn.row_factory = sqlite3.Row
    return conn


# ── PostgreSQL connection ────────────────────────────────

_pg_pool = None


def _pg_conn():
    """Get a connection from the psycopg2 pool."""
    global _pg_pool
    if _pg_pool is None:
        import psycopg2
        from psycopg2 import pool
        from psycopg2.extras import RealDictCursor
        _pg_pool = pool.ThreadedConnectionPool(
            minconn=1,
            maxconn=10,
            dsn=DATABASE_URL,
        )
    conn = _pg_pool.getconn()
    # Wrap so that conn.close() returns it to the pool
    return _PgConnWrapper(conn, _pg_pool)


class _PgConnWrapper:
    """Wraps a psycopg2 connection to match the SQLite usage pattern.

    - close() returns the connection to the pool instead of destroying it
    - execute() uses RealDictCursor so rows behave like dicts
    - commit() delegates to the underlying connection
    """

    def __init__(self, conn, pool):
        self._conn = conn
        self._pool = pool

    def execute(self, sql, params=None):
        from psycopg2.extras import RealDictCursor
        cur = self._conn.cursor(cursor_factory=RealDictCursor)
        cur.execute(sql, params)
        return cur

    def executemany(self, sql, params_list):
        from psycopg2.extras import RealDictCursor
        cur = self._conn.cursor(cursor_factory=RealDictCursor)
        cur.executemany(sql, params_list)
        return cur

    def commit(self):
        self._conn.commit()

    def rollback(self):
        self._conn.rollback()

    def close(self):
        # Return to pool instead of closing
        try:
            self._conn.rollback()  # rollback any uncommitted changes
        except Exception:
            pass
        self._pool.putconn(self._conn)

    def cursor(self, *args, **kwargs):
        from psycopg2.extras import RealDictCursor
        kwargs.setdefault("cursor_factory", RealDictCursor)
        return self._conn.cursor(*args, **kwargs)
