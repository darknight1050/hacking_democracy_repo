"""Materialize all suggestion totals before a zero-based response sequence.

Usage: python3 reconstruct_state.py OUTPUT_DIRECTORY SEQUENCE
SEQUENCE may equal total responses to obtain the final state.
"""

import json
import sys
from pathlib import Path
import numpy as np


def state_before(root, sequence):
    with np.load(root / "state-checkpoints.npz") as checkpoints, np.load(
        root / "ballots.npz"
    ) as ballots:
        flat = ballots["shown"].ravel()
        if not 0 <= sequence <= len(flat):
            raise ValueError("Sequence outside recorded election")
        index = int(np.searchsorted(checkpoints["votes"], sequence, side="right") - 1)
        start = int(checkpoints["votes"][index])
        counts = checkpoints["counts"][index].copy()
        np.add.at(counts, flat[start:sequence], 1)
        return counts


if __name__ == "__main__":
    print(json.dumps(state_before(Path(sys.argv[1]), int(sys.argv[2])).tolist()))
