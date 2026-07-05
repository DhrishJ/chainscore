"""Export the temporal holdout slice for the TypeScript backtest runner.

Reads the training pipeline's processed dataset (model/data, local only) and
writes data/backtest/holdout.json with the newest-borrower holdout window,
exactly the slice model/FINAL_STATUS.md evaluated once. The output is
gitignored; this script plus the pipeline data reproduce it.

Usage: python scripts/export-backtest-holdout.py
"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
PROCESSED = ROOT / "model" / "data" / "processed"
OUT_DIR = ROOT / "data" / "backtest"

# Holdout window from the retrain (FINAL_STATUS.md): newest borrowers by
# _split_ts. Features were built strictly from data before observation_cutoff;
# outcomes come from [observation_cutoff, outcome_end].
HOLDOUT_START = int(datetime(2024, 4, 17, tzinfo=timezone.utc).timestamp())
OBS_CUTOFF = int(datetime(2024, 6, 1, tzinfo=timezone.utc).timestamp())

FEATURE_SCHEMA = json.loads((ROOT / "ml" / "feature_schema.json").read_text())
FEATURE_NAMES = FEATURE_SCHEMA["features"]


def main() -> int:
    df = pd.read_parquet(PROCESSED / "dataset.parquet")
    chains = pd.read_parquet(PROCESSED / "balanced_targets.parquet")[["address", "chain"]]

    # Per (wallet, chain) is the unit of analysis; addresses that appear on
    # more than one chain are ambiguous after the join and are dropped.
    dup_addresses = chains[chains.duplicated("address", keep=False)]["address"].unique()
    chains = chains[~chains["address"].isin(dup_addresses)]

    df = df[(df["_split_ts"] >= HOLDOUT_START) & (df["_split_ts"] < OBS_CUTOFF)]
    df = df.merge(chains, on="address", how="inner")

    missing = [f for f in FEATURE_NAMES if f not in df.columns]
    if missing:
        print(f"feature columns missing from dataset: {missing}", file=sys.stderr)
        return 1

    rows = []
    for rec in df.to_dict("records"):
        rows.append(
            {
                "address": rec["address"],
                "chain": rec["chain"],
                "asOfTs": OBS_CUTOFF,
                "featuresValidAtTs": OBS_CUTOFF,
                "outcomeWindowStartTs": OBS_CUTOFF,
                "features": [float(rec[f]) for f in FEATURE_NAMES],
                "label": int(rec["label"]),
                "walletAgeDays": float(rec["wallet_age_days"]),
                "totalBorrows": float(rec["total_borrows"]),
            }
        )

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = {
        "exportedAt": datetime.now(timezone.utc).isoformat(),
        "featureNames": FEATURE_NAMES,
        "holdoutStart": HOLDOUT_START,
        "observationCutoff": OBS_CUTOFF,
        "droppedAmbiguousAddresses": int(len(dup_addresses)),
        "rows": rows,
    }
    out_path = OUT_DIR / "holdout.json"
    out_path.write_text(json.dumps(out))
    positives = sum(r["label"] for r in rows)
    print(f"wrote {out_path} rows={len(rows)} positives={positives} dropped_ambiguous={len(dup_addresses)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
