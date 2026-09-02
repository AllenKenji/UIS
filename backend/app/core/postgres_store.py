"""Synchronous PostgreSQL JSONB document-store compatibility API."""
from __future__ import annotations

import json
import os
import shutil
from datetime import date, datetime
from pathlib import Path
from typing import Any, Callable
from urllib.parse import quote
from uuid import uuid4

import psycopg
from psycopg.types.json import Jsonb

SCHEMA_PATH = Path(__file__).with_name("schema.sql")
SERVER_TIMESTAMP = datetime.now


def _json(value: Any) -> Jsonb:
    return Jsonb(value, dumps=lambda item: json.dumps(item, default=_json_default))


def _json_default(value: Any) -> str:
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return str(value)


def _nested(data: dict, field: str) -> Any:
    current: Any = data
    for part in field.split("."):
        if not isinstance(current, dict):
            return None
        current = current.get(part)
    return current


class DocumentSnapshot:
    def __init__(self, reference: "DocumentReference", data: dict | None):
        self.reference, self.id, self._data = reference, reference.id, data

    @property
    def exists(self) -> bool:
        return self._data is not None

    def to_dict(self) -> dict | None:
        return self._data.copy() if self._data is not None else None

    def get(self, field: str, default: Any = None) -> Any:
        return _nested(self._data or {}, field) if self.exists else default


class Query:
    def __init__(self, db: "PostgresDocumentStore", collection: str):
        self.db, self.collection = db, collection
        self.filters: list[tuple[str, str, Any]] = []
        self.order: tuple[str, str] | None = None
        self.row_limit, self.row_offset = None, 0

    def where(self, field: str, op: str, value: Any) -> "Query":
        self.filters.append((field, op, value))
        return self

    def order_by(self, field: str, direction: str = "ASCENDING") -> "Query":
        descending = str(direction).upper() in {"DESC", "DESCENDING"}
        self.order = (field, "DESC" if descending else "ASC")
        return self

    def limit(self, count: int) -> "Query":
        self.row_limit = count
        return self

    def offset(self, count: int) -> "Query":
        self.row_offset = count
        return self

    def get(self) -> list[DocumentSnapshot]:
        clauses, params = ["collection_name = %s"], [self.collection]
        for field, op, value in self.filters:
            if op not in {"==", "!=", "<", "<=", ">", ">=", "array_contains"}:
                raise ValueError(f"Unsupported where operator: {op}")
            sql_op = "=" if op == "==" else op
            path = field.split(".")
            expression = "data #> %s" if len(path) > 1 else "data -> %s"
            if op == "array_contains":
                clauses.append(f"{expression} @> %s")
                params.extend([path if len(path) > 1 else field, _json([value])])
            else:
                clauses.append(f"{expression} {sql_op} %s")
                params.extend([path if len(path) > 1 else field, _json(value)])
        sql = "SELECT document_id, data FROM bis_documents WHERE " + " AND ".join(clauses)
        if self.order:
            field, direction = self.order
            path = field.split(".")
            expression = "data #>> %s" if len(path) > 1 else "data ->> %s"
            sql += f" ORDER BY {expression} {direction}, document_id ASC"
            params.append(path if len(path) > 1 else field)
        else:
            sql += " ORDER BY document_id ASC"
        sql += " OFFSET %s"
        params.append(self.row_offset)
        if self.row_limit is not None:
            sql += " LIMIT %s"
            params.append(self.row_limit)
        with self.db.connection() as connection:
            rows = connection.execute(sql, params).fetchall()
        return [DocumentSnapshot(DocumentReference(self.db, self.collection, row[0]), row[1]) for row in rows]

    def stream(self):
        return iter(self.get())


class DocumentReference:
    def __init__(self, db: "PostgresDocumentStore", collection: str, document_id: str | None = None):
        self.db, self.collection, self.id = db, collection, document_id or str(uuid4())

    def get(self, transaction: "Transaction" | None = None) -> DocumentSnapshot:
        connection = transaction.connection if transaction else self.db.connection()
        row = connection.execute(
            "SELECT data FROM bis_documents WHERE collection_name = %s AND document_id = %s",
            (self.collection, self.id),
        ).fetchone()
        if not transaction:
            connection.commit()
            connection.close()
        return DocumentSnapshot(self, row[0] if row else None)

    def set(self, data: dict, merge: bool = False, transaction: "Transaction" | None = None) -> None:
        update = "bis_documents.data || EXCLUDED.data" if merge else "EXCLUDED.data"
        connection_context = transaction.connection if transaction else self.db.connection()
        if transaction:
            connection_context.execute(
                "INSERT INTO bis_documents (collection_name, document_id, data) VALUES (%s, %s, %s) "
                f"ON CONFLICT (collection_name, document_id) DO UPDATE SET data = {update}, updated_at = now()",
                (self.collection, self.id, _json(data)),
            )
            return
        with connection_context as connection:
            connection.execute(
                "INSERT INTO bis_documents (collection_name, document_id, data) VALUES (%s, %s, %s) "
                f"ON CONFLICT (collection_name, document_id) DO UPDATE SET data = {update}, updated_at = now()",
                (self.collection, self.id, _json(data)),
            )

    def update(self, data: dict) -> None:
        with self.db.connection() as connection:
            result = connection.execute(
                "UPDATE bis_documents SET data = data || %s, updated_at = now() WHERE collection_name = %s AND document_id = %s",
                (_json(data), self.collection, self.id),
            )
            if result.rowcount == 0:
                raise KeyError(f"{self.collection}/{self.id} not found")

    def delete(self) -> None:
        with self.db.connection() as connection:
            connection.execute("DELETE FROM bis_documents WHERE collection_name = %s AND document_id = %s", (self.collection, self.id))


class CollectionReference(Query):
    def document(self, document_id: str | None = None) -> DocumentReference:
        return DocumentReference(self.db, self.collection, document_id)

    def add(self, data: dict) -> DocumentReference:
        reference = self.document()
        reference.set(data)
        return reference


class WriteBatch:
    def __init__(self, db: "PostgresDocumentStore"):
        self.operations: list[Callable[[], None]] = []
        self.db = db

    def set(self, reference, data, merge: bool = False):
        self.operations.append(lambda: reference.set(data, merge=merge, transaction=self))
        return self

    def update(self, reference, data):
        self.operations.append(lambda: reference.update(data))
        return self

    def delete(self, reference):
        self.operations.append(reference.delete)
        return self

    def commit(self):
        for operation in self.operations:
            operation()


class Transaction:
    def __init__(self, db: "PostgresDocumentStore"):
        self.db, self.connection = db, None
        self.operations: list[Callable[[], None]] = []

    def set(self, reference, data, merge: bool = False):
        self.operations.append(lambda: reference.set(data, merge=merge))

    def run(self, callback):
        with self.db.connection() as connection:
            self.connection = connection
            result = callback(self)
            for operation in self.operations:
                operation()
            connection.commit()
            return result


class PostgresDocumentStore:
    def __init__(self, database_url: str | None = None):
        self.database_url = database_url or os.environ.get("DATABASE_URL")
        if not self.database_url:
            raise RuntimeError("DATABASE_URL environment variable is not set")

    def connection(self):
        return psycopg.connect(self.database_url)

    def collection(self, name):
        return CollectionReference(self, name)

    def batch(self):
        return WriteBatch(self)

    def transaction(self):
        return Transaction(self)


class LocalBlob:
    def __init__(self, root: Path, name: str):
        self.root, self.name = root, name.replace("\\", "/")
        self.path = root / self.name

    def upload_from_file(self, source, content_type=None):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.path.open("wb") as target:
            shutil.copyfileobj(source, target)

    def upload_from_string(self, content, content_type=None):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_bytes(content)

    def generate_signed_url(self, expiration=None):
        return f"/storage/{quote(self.name, safe='/')}"

    def delete(self):
        self.path.unlink(missing_ok=True)


class LocalStorage:
    def __init__(self):
        configured_path = Path(os.environ.get("LOCAL_STORAGE_DIR", "backend/uploads"))
        project_root = Path(__file__).resolve().parents[3]
        self.root = (configured_path if configured_path.is_absolute() else project_root / configured_path).resolve()

    def blob(self, path):
        return LocalBlob(self.root, path)


_database: PostgresDocumentStore | None = None


def get_database() -> PostgresDocumentStore:
    global _database
    if _database is None:
        _database = PostgresDocumentStore()
    return _database


def initialize_database() -> None:
    database = get_database()
    with database.connection() as connection:
        connection.execute(SCHEMA_PATH.read_text(encoding="utf-8"))