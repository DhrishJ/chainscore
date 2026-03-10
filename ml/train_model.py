"""
ChainScore — Model Trainer
Trains an XGBoost classifier on features.csv and exports:
  - model.json       (XGBoost model for inference)
  - scaler.json      (feature normalization params)
  - feature_importance.png (optional, if matplotlib available)

Usage:
    pip install xgboost scikit-learn pandas numpy
    python train_model.py

Output:
    ml/model.json
    ml/scaler.json
    ml/report.txt
"""

import json
import os
import sys
import warnings
warnings.filterwarnings('ignore')

import numpy as np
import pandas as pd
from xgboost import XGBClassifier
from sklearn.model_selection import train_test_split, StratifiedKFold, cross_val_score
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score,
    f1_score, roc_auc_score, confusion_matrix, classification_report
)
from sklearn.preprocessing import StandardScaler
from sklearn.calibration import CalibratedClassifierCV

DIR = os.path.dirname(os.path.abspath(__file__))
FEATURES_CSV = os.path.join(DIR, 'features.csv')
MODEL_OUT     = os.path.join(DIR, 'model.json')
SCALER_OUT    = os.path.join(DIR, 'scaler.json')
REPORT_OUT    = os.path.join(DIR, 'report.txt')

# Features used for training (must match RawWalletData fields collected)
FEATURE_COLS = [
    # Wallet history
    'wallet_age_days',
    'wallet_age_months',
    'tx_count',
    'active_months_12',
    # Lending activity — raw counts only, NOT repay_rate/liquidations (label leakage)
    'aave_borrows',
    'compound_borrows',
    'total_borrows',
    # DeFi breadth
    'protocols_used_count',
    'has_uniswap_lp',
    'has_staked_eth',
    # Portfolio signals
    'has_eth',
    'has_ens',
    'is_gnosis_safe',
    'total_portfolio_usd',
    'stablecoin_pct',
]


def load_data() -> tuple[pd.DataFrame, pd.Series]:
    print(f'Loading {FEATURES_CSV}...')
    df = pd.read_csv(FEATURES_CSV)
    print(f'  Total rows: {len(df)}')

    # Drop ambiguous labels
    df = df[df['label'].isin([0, 1])].copy()
    print(f'  Labeled rows (0 or 1): {len(df)}')
    print(f'  Label=1 (good): {(df["label"] == 1).sum()}')
    print(f'  Label=0 (bad):  {(df["label"] == 0).sum()}')

    # Drop rows with missing feature columns
    available = [c for c in FEATURE_COLS if c in df.columns]
    missing_cols = [c for c in FEATURE_COLS if c not in df.columns]
    if missing_cols:
        print(f'  WARNING: missing columns (will skip): {missing_cols}')

    df = df.dropna(subset=available)
    print(f'  Rows after dropping NaN: {len(df)}')

    X = df[available].astype(float)
    y = df['label'].astype(int)
    return X, y


def train(X: pd.DataFrame, y: pd.Series):
    print('\nSplitting data (80/20 stratified)...')
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    print(f'  Train: {len(X_train)} | Test: {len(X_test)}')

    # Class imbalance weight
    neg = (y_train == 0).sum()
    pos = (y_train == 1).sum()
    scale_pos_weight = neg / pos if pos > 0 else 1.0
    print(f'  scale_pos_weight: {scale_pos_weight:.3f}')

    print('\nTraining XGBoost...')
    model = XGBClassifier(
        n_estimators=300,
        max_depth=6,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        scale_pos_weight=scale_pos_weight,
        use_label_encoder=False,
        eval_metric='auc',
        random_state=42,
        early_stopping_rounds=20,
        verbosity=0,
    )

    model.fit(
        X_train, y_train,
        eval_set=[(X_test, y_test)],
        verbose=False,
    )

    # ── Evaluation ──────────────────────────────────────────
    y_pred  = model.predict(X_test)
    y_proba = model.predict_proba(X_test)[:, 1]

    acc  = accuracy_score(y_test, y_pred)
    prec = precision_score(y_test, y_pred)
    rec  = recall_score(y_test, y_pred)
    f1   = f1_score(y_test, y_pred)
    auc  = roc_auc_score(y_test, y_proba)
    cm   = confusion_matrix(y_test, y_pred)

    print('\n-- Test Set Results ---------------------------')
    print(f'  Accuracy:  {acc:.4f}')
    print(f'  Precision: {prec:.4f}')
    print(f'  Recall:    {rec:.4f}')
    print(f'  F1 Score:  {f1:.4f}')
    print(f'  AUC-ROC:   {auc:.4f}')
    print(f'\n  Confusion Matrix:')
    print(f'    TN={cm[0][0]}  FP={cm[0][1]}')
    print(f'    FN={cm[1][0]}  TP={cm[1][1]}')
    print(f'\n{classification_report(y_test, y_pred, target_names=["Bad (0)", "Good (1)"])}')

    # ── Cross-validation ────────────────────────────────────
    print('Running 5-fold cross-validation (AUC)...')
    cv_model = XGBClassifier(
        n_estimators=model.best_iteration or 300,
        max_depth=6,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        scale_pos_weight=scale_pos_weight,
        use_label_encoder=False,
        eval_metric='auc',
        random_state=42,
        verbosity=0,
    )
    cv_scores = cross_val_score(cv_model, X, y, cv=StratifiedKFold(5, shuffle=True, random_state=42), scoring='roc_auc')
    print(f'  CV AUC: {cv_scores.mean():.4f} ± {cv_scores.std():.4f}')

    # ── Feature importance ──────────────────────────────────
    print('\nFeature importances (gain):')
    importances = model.feature_importances_
    feat_imp = sorted(zip(X.columns, importances), key=lambda x: x[1], reverse=True)
    for feat, imp in feat_imp:
        bar = '#' * int(imp * 40)
        print(f'  {feat:<30} {imp:.4f} {bar}')

    # ── Score calibration ───────────────────────────────────
    # Map probability -> 300–850 score range
    # We want P(good)=0.5 -> ~580 (median), P(good)=0.95 -> ~800+
    # Using linear interpolation anchored at known percentiles
    proba_train = model.predict_proba(X_train)[:, 1]
    p10 = float(np.percentile(proba_train, 10))
    p50 = float(np.percentile(proba_train, 50))
    p90 = float(np.percentile(proba_train, 90))

    calibration = {
        'p10': p10, 'score_at_p10': 400,
        'p50': p50, 'score_at_p50': 580,
        'p90': p90, 'score_at_p90': 750,
        'score_min': 300,
        'score_max': 850,
    }
    print(f'\nScore calibration anchors:')
    print(f'  P10 prob={p10:.3f} -> score 400')
    print(f'  P50 prob={p50:.3f} -> score 580')
    print(f'  P90 prob={p90:.3f} -> score 750')

    return model, X.columns.tolist(), feat_imp, cv_scores, calibration, {
        'accuracy': acc, 'precision': prec, 'recall': rec,
        'f1': f1, 'auc': auc,
        'cv_auc_mean': float(cv_scores.mean()),
        'cv_auc_std': float(cv_scores.std()),
        'confusion_matrix': cm.tolist(),
    }


def save_model(model, feature_names: list[str], calibration: dict):
    # Save XGBoost model as JSON
    model.save_model(MODEL_OUT)
    print(f'\nModel saved to {MODEL_OUT}')

    # Save metadata (feature names + calibration) alongside model
    meta = {
        'feature_names': feature_names,
        'calibration': calibration,
        'model_path': 'model.json',
    }
    meta_path = os.path.join(DIR, 'model_meta.json')
    with open(meta_path, 'w') as f:
        json.dump(meta, f, indent=2)
    print(f'Metadata saved to {meta_path}')


def save_report(metrics: dict, feat_imp: list, cv_scores):
    lines = [
        'ChainScore — Model Training Report',
        '=' * 40,
        f'Accuracy:       {metrics["accuracy"]:.4f}',
        f'Precision:      {metrics["precision"]:.4f}',
        f'Recall:         {metrics["recall"]:.4f}',
        f'F1 Score:       {metrics["f1"]:.4f}',
        f'AUC-ROC:        {metrics["auc"]:.4f}',
        f'CV AUC (5-fold): {metrics["cv_auc_mean"]:.4f} +/- {metrics["cv_auc_std"]:.4f}',
        '',
        'Confusion Matrix (TN FP / FN TP):',
        f'  {metrics["confusion_matrix"][0]}',
        f'  {metrics["confusion_matrix"][1]}',
        '',
        'Feature Importances (gain):',
    ]
    for feat, imp in feat_imp:
        lines.append(f'  {feat:<30} {imp:.4f}')

    report = '\n'.join(lines)
    with open(REPORT_OUT, 'w') as f:
        f.write(report)
    print(f'Report saved to {REPORT_OUT}')


def try_plot(model, feature_names: list[str]):
    try:
        import matplotlib.pyplot as plt
        fig, ax = plt.subplots(figsize=(10, 6))
        importances = model.feature_importances_
        feat_imp = sorted(zip(feature_names, importances), key=lambda x: x[1])
        feats, imps = zip(*feat_imp)
        ax.barh(feats, imps, color='#00FF94')
        ax.set_xlabel('Importance (gain)')
        ax.set_title('XGBoost Feature Importances — ChainScore')
        ax.set_facecolor('#0D1117')
        fig.patch.set_facecolor('#0A0A0F')
        ax.tick_params(colors='#E8EDF5')
        ax.xaxis.label.set_color('#E8EDF5')
        ax.title.set_color('#E8EDF5')
        plt.tight_layout()
        plot_path = os.path.join(DIR, 'feature_importance.png')
        plt.savefig(plot_path, dpi=150, facecolor=fig.get_facecolor())
        print(f'Feature importance plot saved to {plot_path}')
    except ImportError:
        print('(matplotlib not installed — skipping plot)')


def main():
    print('ChainScore - Model Trainer\n')

    if not os.path.exists(FEATURES_CSV):
        print(f'ERROR: {FEATURES_CSV} not found. Run collect_data.py first.')
        sys.exit(1)

    X, y = load_data()

    if len(y) < 50:
        print(f'ERROR: Only {len(y)} labeled samples — need at least 50 to train.')
        sys.exit(1)

    model, feature_names, feat_imp, cv_scores, calibration, metrics = train(X, y)
    save_model(model, feature_names, calibration)
    save_report(metrics, feat_imp, cv_scores)
    try_plot(model, feature_names)

    print('\nDone. Next step: run integrate_model.py to replace scorer.ts inference.')


if __name__ == '__main__':
    main()
