class MainModel:
    import pandas as pd
    import numpy as np
    import joblib
    from sklearn.metrics import r2_score, mean_squared_error, mean_absolute_error
    from lightgbm import LGBMRegressor
    """
    Dataset has a accuracy of 72.4% as of now with the Four existing values
    """

    DATA_PATH = "water_quality_ph_temp_tds_turbidity_wqi.csv"
    MODEL_OUT_PATH = "best_wqi_model_lightgbm.pkl"

    df = pd.read_csv(DATA_PATH)

    FEATURES = ["pH", "Temperature_C", "TDS_mgL", "Turbidity_NTU"]
    TARGET = "WQI"


    train_df = df[df["split"] == "train"]
    test_df = df[df["split"] == "test"]

    X_train, y_train = train_df[FEATURES], train_df[TARGET]
    X_test, y_test = test_df[FEATURES], test_df[TARGET]


    model = LGBMRegressor(
        n_estimators=300,
        max_depth=-1,
        learning_rate=0.05,
        num_leaves=63,
        min_child_samples=10,
        subsample=0.7,
        colsample_bytree=0.9,
        random_state=42,
        verbosity=-1,
    )

    model.fit(X_train, y_train)

    preds = model.predict(X_test)

    r2 = r2_score(y_test, preds)
    rmse = np.sqrt(mean_squared_error(y_test, preds))
    mae = mean_absolute_error(y_test, preds)

    print(f"Test R^2:  {r2:.4f}")
    print(f"Test RMSE: {rmse:.5f}")
    print(f"Test MAE:  {mae:.5f}")

    print("\nFeature importance:")
    importance = pd.Series(model.feature_importances_, index=FEATURES).sort_values(ascending=False)
    print(importance)

    joblib.dump(model, MODEL_OUT_PATH)
    print(f"\nModel saved to {MODEL_OUT_PATH}")

    # loaded_model = joblib.load(MODEL_OUT_PATH)
    # predicted_wqi = loaded_model.predict(new_sample)
    # print("Predicted WQI:", predicted_wqi[0])