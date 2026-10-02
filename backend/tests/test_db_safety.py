"""Guards against losing or breaking the production database.

Prod data lives in the `postgres_data` docker volume, and the schema is created
by `Base.metadata.create_all` on startup — which only creates missing tables and
never alters existing ones. These tests fail when a change would:

- detach or drop the data volume (compose files, deploy scripts, workflows),
- add destructive SQL to the app (drop_all, DROP TABLE, TRUNCATE, ...),
- lose data on an app restart,
- change the schema of an existing table without anyone noticing, or
- let one request delete more than it should.
"""
import json
import os
import re
from pathlib import Path

import pytest
import yaml

from app.database import Base
from conftest import auth, start_app, stop_app

BACKEND = Path(__file__).resolve().parents[1]
REPO = BACKEND.parent
SNAPSHOT = Path(__file__).with_name("schema_snapshot.json")

# --- Docker volume ----------------------------------------------------------

COMPOSE_FILES = ["docker-compose.yml", "docker-compose.prod.yml"]
PG_DATA = "/var/lib/postgresql/data"


@pytest.mark.parametrize("name", COMPOSE_FILES)
def test_db_data_lives_in_named_volume(name):
    compose = yaml.safe_load((REPO / name).read_text())
    db = compose["services"]["db"]
    mounts = set()
    for v in db.get("volumes", []):
        if isinstance(v, dict):
            mounts.add((v.get("source"), v.get("target")))
        else:
            mounts.add(tuple(v.split(":")[:2]))
    assert ("postgres_data", PG_DATA) in mounts, (
        f"{name}: the db service must keep its data in the postgres_data volume "
        f"mounted at {PG_DATA}; without it every recreate starts an empty database."
    )
    assert "postgres_data" in (compose.get("volumes") or {}), (
        f"{name}: the top-level postgres_data volume must stay declared "
        "(renaming it points prod at a new, empty volume)."
    )


# --- Destructive shell commands ---------------------------------------------

DESTRUCTIVE_SHELL = [
    (re.compile(r"compose\b[^\n]*\bdown\b[^\n]*(\s-v\b|--volumes)"), "compose down with volumes"),
    (re.compile(r"docker\s+volume\s+(rm|prune)\b"), "docker volume rm/prune"),
    (re.compile(r"docker\s+system\s+prune\b[^\n]*--volumes"), "docker system prune --volumes"),
    (re.compile(r"\brm\s+-\w*r\w*\s[^\n]*postgres"), "rm -r of postgres data"),
    (re.compile(r"\bdropdb\b|DROP\s+DATABASE", re.IGNORECASE), "dropping the database"),
]


def _logical_lines(text: str) -> list[str]:
    # Join backslash continuations so a flag on the next line is still seen.
    # (Line numbers in failures then count logical lines.)
    return re.sub(r"\\\n\s*", " ", text).splitlines()


def _shell_files() -> list[Path]:
    files = [REPO / "deploy.sh", *(REPO / "scripts").glob("*.sh")]
    files += (REPO / ".github" / "workflows").glob("*.y*ml")
    files += [REPO / "Makefile"]
    return [f for f in files if f.is_file()]


@pytest.mark.parametrize(
    "sample",
    [
        "docker compose -f x.yml down -v",
        "docker compose -f x.yml down \\\n    --volumes",
        "compose down --volumes",
        "docker-compose down --remove-orphans -v",
        "docker volume rm tma_postgres_data",
        "docker volume prune -f",
        "docker system prune -af --volumes",
        "sudo rm -rf /var/lib/docker/volumes/tma_postgres_data",
        "psql -c 'DROP DATABASE portfolio'",
    ],
)
def test_destructive_patterns_are_detected(sample):
    # Keeps the scan below honest: each pattern must actually match.
    assert any(p.search(line) for line in _logical_lines(sample) for p, _ in DESTRUCTIVE_SHELL)


def test_deploy_scripts_never_destroy_db_volume():
    assert _shell_files(), "no deploy scripts found — did they move?"
    hits = []
    for path in _shell_files():
        for lineno, line in enumerate(_logical_lines(path.read_text()), 1):
            if line.lstrip().startswith("#"):
                continue
            for pattern, what in DESTRUCTIVE_SHELL:
                if pattern.search(line):
                    hits.append(f"{path.relative_to(REPO)}:{lineno}: {what}: {line.strip()}")
    assert not hits, "Deploy tooling must never delete the database:\n" + "\n".join(hits)


# --- Destructive SQL in the app ---------------------------------------------

DESTRUCTIVE_SQL = re.compile(
    r"\bdrop_all\b|\bDROP\s+(TABLE|DATABASE|SCHEMA)\b|\bTRUNCATE\b"
    r"|\bop\.drop_(table|column)\b",  # Alembic migrations
    re.IGNORECASE,
)


def test_app_code_has_no_destructive_sql():
    hits = []
    for path in [*(BACKEND / "app").rglob("*.py"), *(BACKEND / "alembic").rglob("*.py")]:
        for lineno, line in enumerate(path.read_text().splitlines(), 1):
            if DESTRUCTIVE_SQL.search(line):
                hits.append(f"{path.relative_to(REPO)}:{lineno}: {line.strip()}")
    assert not hits, "The app must never drop or truncate tables:\n" + "\n".join(hits)


# --- Restarts keep data -----------------------------------------------------

def test_data_survives_app_restart():
    client = start_app().__enter__()
    try:
        r = client.post("/api/assets/", json={
            "type": "cash", "name": "Wallet", "currency": "EUR", "amount": 100,
        }, headers=auth(1))
        assert r.status_code == 201
        r = client.put("/api/settings/", json={"key": "currencies", "value": ["EUR"]}, headers=auth(1))
        assert r.status_code == 200
    finally:
        stop_app(client)
        client.__exit__(None, None, None)

    # A second startup runs create_all against the existing schema again.
    with start_app() as client:
        try:
            assets = client.get("/api/assets/", headers=auth(1)).json()
            assert [(a["name"], a["amount"]) for a in assets] == [("Wallet", 100)]
            settings = {s["key"]: s["value"] for s in client.get("/api/settings/", headers=auth(1)).json()}
            assert settings["currencies"] == ["EUR"]
        finally:
            stop_app(client)


# --- Schema drift -----------------------------------------------------------

def _schema() -> dict:
    tables = {}
    for table in Base.metadata.sorted_tables:
        tables[table.name] = {
            "columns": {
                c.name: {
                    "type": str(c.type),
                    "nullable": c.nullable,
                    "primary_key": c.primary_key,
                    "foreign_key": [
                        f"{fk.target_fullname} ON DELETE {fk.ondelete}" for fk in c.foreign_keys
                    ],
                }
                for c in table.columns
            },
            "unique": sorted(
                f"{uc.name}({', '.join(col.name for col in uc.columns)})"
                for uc in table.constraints
                if uc.__class__.__name__ == "UniqueConstraint"
            ),
        }
    return tables


def test_schema_matches_snapshot():
    current = _schema()
    if os.environ.get("UPDATE_SCHEMA_SNAPSHOT") == "1":
        SNAPSHOT.write_text(json.dumps(current, indent=2, sort_keys=True) + "\n")
        pytest.skip("schema snapshot rewritten")

    expected = json.loads(SNAPSHOT.read_text())
    if current == expected:
        return

    new_tables = sorted(set(current) - set(expected))
    changed = sorted(t for t in expected if current.get(t) != expected[t])
    lines = ["The database schema in app/models.py changed."]
    if new_tables:
        lines.append(f"  New tables (safe, create_all adds them on startup): {new_tables}")
    if changed:
        lines.append(
            f"  Changed or removed EXISTING tables: {changed}\n"
            "  create_all does NOT alter tables that already exist in prod, so this change\n"
            "  will not reach the prod database on deploy and requests touching these\n"
            "  columns will fail. Ship a migration that is applied on deploy and that\n"
            "  keeps existing rows, and never drop a column or table holding user data."
        )
    lines.append(
        "  Once that is handled, regenerate the snapshot:\n"
        "    UPDATE_SCHEMA_SNAPSHOT=1 pytest tests/test_db_safety.py"
    )
    pytest.fail("\n".join(lines))


# --- Deletes stay scoped ----------------------------------------------------

def _add(client, user, name, amount, type_="cash", currency="EUR"):
    r = client.post("/api/transactions/", json={
        "type": type_, "action": "add", "name": name, "amount": amount,
        "currency": currency, "date": "2026-01-01",
    }, headers=auth(user))
    assert r.status_code == 201, r.text
    return r.json()


def test_deleting_asset_keeps_transaction_history(client):
    _add(client, 1, "Wallet", 50)
    asset_id = client.get("/api/assets/", headers=auth(1)).json()[0]["id"]

    assert client.delete(f"/api/assets/{asset_id}", headers=auth(1)).status_code == 200

    history = client.get("/api/transactions/", headers=auth(1)).json()
    assert len(history) == 1 and history[0]["amount"] == 50


def test_user_cannot_touch_another_users_assets(client):
    _add(client, 1, "Wallet", 50)
    asset_id = client.get("/api/assets/", headers=auth(1)).json()[0]["id"]

    assert client.delete(f"/api/assets/{asset_id}", headers=auth(2)).status_code == 404
    assert client.put(f"/api/assets/{asset_id}", json={"amount": 0}, headers=auth(2)).status_code == 404
    r = client.post("/api/transactions/", json={
        "asset_id": asset_id, "type": "cash", "action": "remove", "amount": 50,
        "currency": "EUR", "date": "2026-01-01",
    }, headers=auth(2))
    assert r.status_code == 404

    assets = client.get("/api/assets/", headers=auth(1)).json()
    assert [(a["id"], a["amount"]) for a in assets] == [(asset_id, 50)]


def test_reset_data_only_affects_caller(client):
    _add(client, 1, "Mine", 10)
    _add(client, 2, "Theirs", 20)

    assert client.delete("/api/settings/reset-data", headers=auth(1)).status_code == 200

    assert client.get("/api/assets/", headers=auth(1)).json() == []
    assert client.get("/api/transactions/", headers=auth(1)).json() == []
    assert [a["name"] for a in client.get("/api/assets/", headers=auth(2)).json()] == ["Theirs"]
    assert len(client.get("/api/transactions/", headers=auth(2)).json()) == 1
