# Model card: rupture-risk warning (LSTM)

Educational simulator only. These models score synthetic scripted agents inside NeuroClip and are not validated on real surgeons or patients. They must not be used for any clinical, credentialing or hiring decision.

## Intended use
Raises a mentor warning when the chance of an aneurysm rupture in the next 10 s looks high.
Runs in the browser at 10 Hz. Calibrated with Platt scaling fitted on unbiased windows only.

## Data
Same 20,000 runs as the skill model, 58,377 windows (windows ending in step 1, positioning, are excluded: nothing can rupture there and the app mutes warnings in that step). One window per rupturing run is sampled
from the lead-up to the rupture, so training positives (0.352) are over-represented compared with
natural play (0.181). Calibration and headline metrics use only the unbiased windows.

## Model
Single-layer LSTM (64 units), 24,897 parameters, logit output, then Platt scaling (a=0.874, b=-0.823).
Alert threshold 0.259 (calibrated probability) maximises F1 on out-of-fold predictions.

## Evaluation (unbiased windows, out-of-fold)
| Model | AUC | F1 | Brier | ECE (calibrated) | ECE (raw) |
|---|---|---|---|---|---|
| GBM baseline | 0.876 | 0.583 | 0.104 | 0.015 | 0.088 |
| LSTM | 0.877 | 0.583 | 0.103 | 0.014 | 0.088 |

Reliability (LSTM, calibrated): 0.02->0.02 (n=22886), 0.15->0.14 (n=7260), 0.25->0.27 (n=4971), 0.35->0.35 (n=3475), 0.45->0.50 (n=2788), 0.55->0.57 (n=1894), 0.65->0.53 (n=1102), 0.75->0.62 (n=923), 0.85->0.89 (n=852), 0.91->1.00 (n=10)

## Export
int8 dynamic quantisation (MatMul+Gemm+LSTM+Conv), 0.03 MB, median 0.21 ms per window on one CPU thread.

## Limitations
Ruptures in the simulator are produced by scripted mistakes, so precursors are cleaner than in real play. False alarms
are expected; the warning is a prompt to slow down and use fine mode, nothing more.
