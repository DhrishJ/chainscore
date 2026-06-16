"""
ChainScore ML — Model Trainer

Trains an XGBoost classifier on the collected wallet data and exports
it to ONNX format so Next.js can run inference via onnxruntime-node.

Requirements:
    pip install xgboost scikit-learn onnx onnxmltools pandas matplotlib

Usage:
    python ml/scripts/train.py
"""

import pandas as pd
import numpy as np
from pathlib import Path
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, roc_auc_score
from sklearn.preprocessing import StandardScaler
import xgboost as xgb
import json

DATA_PATH = Path(__file__).parent.parent / "data" / "training_data.csv"
MODEL_PATH = Path(__file__).parent.parent / "model.json"         # XGBoost native
ONNX_PATH  = Path(__file__).parent.parent / "model.onnx"         # for Node.js inference
SCALER_PATH = Path(__file__).parent.parent / "scaler.json"       # feature normalization params

FEATURES = [
    "wallet_age_days",
    "tx_count",
    "active_months_last_12",
    "contract_interaction_ratio",
    "unique_counterparties",
    "aave_borrows",
    "aave_repays",
    "aave_liquidations",
    "repay_ratio",
]
LABEL = "was_liquidated"


def load_data():
    df = pd.read_csv(DATA_PATH)
    print(f"Loaded {len(df)} rows")
    print(f"Class balance:\n{df[LABEL].value_counts()}\n")

    # Drop rows with missing features
    df = df.dropna(subset=FEATURES + [LABEL])

    # Cap extreme outliers (99th percentile) to reduce noise
    for col in ["tx_count", "unique_counterparties", "aave_borrows", "aave_repays"]:
        cap = df[col].quantile(0.99)
        df[col] = df[col].clip(upper=cap)

    return df


def train(df):
    X = df[FEATURES].values
    y = df[LABEL].values.astype(int)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    # Scale features — save params for inference
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)

    # Save scaler params as JSON for Node.js to use
    scaler_params = {
        "mean": scaler.mean_.tolist(),
        "scale": scaler.scale_.tolist(),
        "features": FEATURES,
    }
    with open(SCALER_PATH, "w") as f:
        json.dump(scaler_params, f, indent=2)
    print(f"Saved scaler params → {SCALER_PATH}")

    # Train XGBoost
    scale_pos_weight = (y_train == 0).sum() / (y_train == 1).sum()
    model = xgb.XGBClassifier(
        n_estimators=200,
        max_depth=5,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        scale_pos_weight=scale_pos_weight,  # handle class imbalance
        use_label_encoder=False,
        eval_metric="logloss",
        random_state=42,
    )

    model.fit(
        X_train_scaled, y_train,
        eval_set=[(X_test_scaled, y_test)],
        verbose=50,
    )

    # Evaluate
    y_pred = model.predict(X_test_scaled)
    y_prob = model.predict_proba(X_test_scaled)[:, 1]

    print("\n=== Evaluation ===")
    print(classification_report(y_test, y_pred, target_names=["Good", "Liquidated"]))
    print(f"ROC-AUC: {roc_auc_score(y_test, y_prob):.4f}")

    # Feature importance
    importance = dict(zip(FEATURES, model.feature_importances_))
    print("\n=== Feature Importance ===")
    for feat, imp in sorted(importance.items(), key=lambda x: -x[1]):
        bar = "█" * int(imp * 40)
        print(f"  {feat:<35} {bar} {imp:.4f}")

    # Save XGBoost native model
    model.save_model(str(MODEL_PATH))
    print(f"\nSaved XGBoost model → {MODEL_PATH}")

    # Export to ONNX
    try:
        from onnxmltools import convert_xgboost
        from onnxmltools.convert.common.data_types import FloatTensorType

        initial_type = [("float_input", FloatTensorType([None, len(FEATURES)]))]
        onnx_model = convert_xgboost(model, initial_types=initial_type)

        with open(ONNX_PATH, "wb") as f:
            f.write(onnx_model.SerializeToString())
        print(f"Saved ONNX model → {ONNX_PATH}")
    except ImportError:
        print("onnxmltools not installed — skipping ONNX export")
        print("Install with: pip install onnxmltools")

    return model, scaler


if __name__ == "__main__":
    if not DATA_PATH.exists():
        print(f"Training data not found at {DATA_PATH}")
        print("Run node ml/scripts/collect_data.mjs first")
        exit(1)

    df = load_data()
    model, scaler = train(df)

    print("\n=== Next Steps ===")
    print("1. Copy ml/model.onnx and ml/scaler.json into the Next.js project")
    print("2. Install: npm install onnxruntime-node")
    print("3. Create lib/ml/predict.ts to load and run inference")
    print("4. Replace computeScore() calls with the ML prediction")
