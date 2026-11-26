# Model card: skill score (1D-CNN + GRU)

Educational simulator only. These models score synthetic scripted agents inside NeuroClip and are not validated on real surgeons or patients. They must not be used for any clinical, credentialing or hiring decision.

## Intended use
Shows learners an estimate of how closely their recent handling resembles an expert scripted agent, in the debrief
screen. It runs in the browser (onnxruntime-web, Web Worker, 10 Hz). It is a teaching aid, not an assessment.

## Data
20,000 headless simulator runs by 40 scripted virtual users of different skill and speed
(latent skill in [0, 1]; "expert" means skill >= 0.65). 58,578 windows of 48 s
of 31 features (vitals, bleeding, tool/target/fine usage, errors, step timing).

## Model
1D-CNN (2 conv layers, kernel 5) then GRU, 33,217 parameters. Trained with soft BCE against the latent skill.
Output is a logit; sigmoid gives expert-likeness.

## Evaluation
Baseline: gradient boosting on window summary statistics with true leave-one-user-out CV (40 folds).
Network: leave-users-out CV with 8 folds of whole users, then a final model on all data.

| Model | AUC (expert) | F1 | MAE | Spearman |
|---|---|---|---|---|
| GBM baseline | 0.963 | 0.847 | 0.107 | 0.877 |
| 1D-CNN + GRU | 0.966 | 0.854 | 0.103 | 0.886 |

## Export
int8 dynamic quantisation (MatMul+Gemm+LSTM+Conv), 0.08 MB, median 0.98 ms per window on one CPU thread.
Max |logit| difference to the float model on held-out windows: 0.102.

## Limitations
The "experts" and "novices" are scripted agents, so the model learns the scripts' style, not real surgical skill.
Real users may behave out of distribution. Treat the number as a rough, fun indicator only.
