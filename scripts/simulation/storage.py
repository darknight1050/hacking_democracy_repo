"""Auditable exports and a simulation-only PostgreSQL destination."""

import csv
import gzip
import json
import os
from contextlib import closing
from urllib.parse import urlparse
import numpy as np
import psycopg2


def assert_isolated():
    url = urlparse(os.getenv("DATABASE_URL", ""))
    if not (
        os.getenv("SIMULATION_ONLY") == "true"
        and url.hostname == "simulation-db"
        and url.path == "/simulation"
        and url.username == "simulation"
        and not url.query
    ):
        raise RuntimeError(
            "Only the private simulation-db/simulation database is allowed"
        )


def json_file(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")


def save_elicitation(root, data, checkpoint_reference=None):
    root.mkdir(parents=True, exist_ok=True)
    data.events().to_csv(root / "votes.csv.gz", index=False, compression="gzip")
    np.savez_compressed(
        root / "ballots.npz",
        voter_ids=data.voter_ids,
        shown=data.shown,
        answers=data.answers,
        total_before=data.before,
        draw_probability=data.draw_probability,
        topic_probability=data.topic_probability,
    )
    if checkpoint_reference:
        json_file(
            root / "state-reference.json",
            {
                "base": checkpoint_reference,
                "note": "Fixed LSO retains base issuance states, not a new sampling history. Original sequence is voter_id*10+slot.",
            },
        )
    else:
        np.savez_compressed(
            root / "state-checkpoints.npz",
            votes=data.checkpoint_sequences,
            counts=data.checkpoints,
        )


def export_pb(root, population, observed, utility, budget):
    """Pabulib approval and scoring exports; ternary/missingness kept separately.

    Scoring points are decimal nonnegative estimated utilities, not raw ternary
    inputs. Unknowns in the observed approval projection are NOT explicit No.
    """

    def header(writer, kind):
        writer.writerow(["META"])
        writer.writerow(["key", "value"])
        for key, value in [
            ("description", "Synthetic Zug partial-elicitation experiment"),
            ("country", "Switzerland"),
            ("unit", "Canton Zug"),
            ("instance", root.name),
            ("num_projects", len(population.projects)),
            ("num_votes", len(observed.voter_ids)),
            ("budget", budget),
            ("vote_type", kind),
            ("min_length", 0),
            ("max_length", 1000 if kind == "scoring" else 10),
        ]:
            writer.writerow([key, value])
        writer.writerow(["PROJECTS"])
        writer.writerow(["project_id", "cost", "name", "category"])
        for row in population.projects.itertuples():
            writer.writerow([row.id, row.cost_chf, row.title, row.topic])
        writer.writerow(["VOTES"])

    with (root / "observed-approvals.pb").open("w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f, delimiter=";")
        header(writer, "approval")
        writer.writerow(["voter_id", "vote"])
        for row, voter in enumerate(observed.voter_ids):
            writer.writerow(
                [
                    voter,
                    ",".join(map(str, observed.shown[row][observed.answers[row] == 1])),
                ]
            )
    with gzip.open(
        root / "estimated-utilities.pb.gz",
        "wt",
        encoding="utf-8",
        newline="",
        compresslevel=1,
    ) as f:
        writer = csv.writer(f, delimiter=";")
        header(writer, "scoring")
        writer.writerow(["voter_id", "vote", "points"])
        for row, voter in enumerate(observed.voter_ids):
            ids = np.flatnonzero(utility[row] > 0)
            ids = ids[np.argsort(-utility[row, ids], kind="stable")]
            writer.writerow(
                [
                    voter,
                    ",".join(map(str, ids)),
                    ",".join(format(x, ".12g") for x in utility[row, ids]),
                ]
            )


def persist(root):
    assert_isolated()
    with closing(
        psycopg2.connect(os.environ["DATABASE_URL"])
    ) as connection, connection:
        with connection.cursor() as cur:
            cur.execute("CREATE SCHEMA research_experiment")
            cur.execute("SET search_path TO research_experiment")
            cur.execute(
                """CREATE TABLE voter(id int PRIMARY KEY,home int,speed_runner boolean,selected text);
              CREATE TABLE project(id int PRIMARY KEY,district int,topic int,cost_chf int,title text,description text);
              CREATE TABLE response(sequence int PRIMARY KEY,voter_id int REFERENCES voter,
                slot int,project_id int REFERENCES project,answer smallint,impressions_before int,
                conditional_project_probability double precision,conditional_topic_probability double precision)"""
            )
            for table, path in [
                ("voter", root / "voters.csv"),
                ("project", root / "projects.csv"),
                ("response", root / "votes.csv.gz"),
            ]:
                opener = gzip.open if path.suffix == ".gz" else open
                with opener(path, "rt", encoding="utf-8", newline="") as f:
                    cur.copy_expert(
                        f"COPY {table} FROM STDIN WITH (FORMAT CSV,HEADER)", f
                    )
            cur.execute("SELECT count(*) FROM response")
            count = cur.fetchone()[0]
            cur.execute(
                """SELECT count(*) FROM (SELECT voter_id FROM response GROUP BY voter_id
              HAVING count(*)<>10 OR count(DISTINCT project_id)<>10) bad"""
            )
            assert cur.fetchone()[0] == 0
            cur.execute(
                """SELECT count(*) FROM response r JOIN project p ON p.id=r.project_id
              JOIN voter v ON v.id=r.voter_id
              WHERE NOT p.district=ANY(string_to_array(v.selected,',')::int[]) OR answer NOT IN(-1,0,1)"""
            )
            assert cur.fetchone()[0] == 0
            return count
