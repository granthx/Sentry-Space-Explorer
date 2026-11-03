"""Generate sample anomaly CSV data for bundled SMAP and MSL channels."""
import csv
import pathlib
import numpy as np

ROOT = pathlib.Path(__file__).resolve().parent.parent / "app" / "ml" / "anomaly_data"

channels = {
    "smap": ["T-1", "T-2", "T-3", "D-14", "F-4"],
    "msl":  ["M-1", "M-2", "M-6", "S-2",  "P-15"],
}


def gen_signal(seed: int, n: int = 500, anomaly_at: list[int] | None = None):
    rng = np.random.default_rng(seed)
    t = np.linspace(0, 4 * np.pi, n)
    base = np.sin(t) + 0.5 * np.sin(3 * t) + rng.normal(0, 0.05, n)
    if anomaly_at:
        for a in anomaly_at:
            s = max(0, a - 8)
            e = min(n, a + 8)
            base[s:e] += rng.uniform(1.5, 3.0)
    return base


for ds, chans in channels.items():
    (ROOT / ds).mkdir(parents=True, exist_ok=True)
    for i, ch in enumerate(chans):
        anom = [150 + i * 30, 320 + i * 20] if i % 2 == 0 else [200 + i * 25]
        sig = gen_signal(i * 100 + (0 if ds == "smap" else 500), anomaly_at=anom)
        path = ROOT / ds / f"{ch}.csv"
        with open(path, "w", newline="") as f:
            w = csv.writer(f)
            w.writerow(["timestamp", "value"])
            for j, v in enumerate(sig):
                w.writerow([f"t{j:04d}", round(float(v), 5)])
        print(f"  {path.name}  ({len(sig)} rows)")

print("Done.")

