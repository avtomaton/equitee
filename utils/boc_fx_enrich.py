"""
Bank of Canada FX Rate Enricher
================================
Reads a CSV with columns: date, from_currency, to_currency, amount
and appends the exchange rate from the Bank of Canada Valet API.

Input CSV format  (no header assumed by default, edit HEADER below):
    YYYY-MM-DD, USD, CAD, 1234.56

Output CSV adds a column:
    YYYY-MM-DD, USD, CAD, 1234.56, 1.3542

Usage:
    python boc_fx_enrich.py input.csv output.csv

Requirements:
    pip install requests
"""

import csv
import sys
import requests
from datetime import date, timedelta

# ── Config ──────────────────────────────────────────────────────────────────

# Set to True if your CSV has a header row
HAS_HEADER = False

# Column indices (0-based) in your CSV
COL_DATE   = 0
COL_FROM   = 2
# COL_TO     = 2
COL_AMOUNT = 1

# Bank of Canada Valet API base URL
VALET_BASE = "https://www.bankofcanada.ca/valet/observations"

# ── Helpers ──────────────────────────────────────────────────────────────────

def series_name(from_ccy: str, to_ccy: str) -> str:
    """
    Build the BoC series name for a currency pair.
    The BoC always quotes as 1 unit of foreign currency = X CAD.
    Supported pairs all have CAD on one side.
    e.g. USD→CAD  →  FXUSDCAD
         EUR→CAD  →  FXEURCAD
    """
    from_ccy = from_ccy.strip().upper()
    to_ccy   = to_ccy.strip().upper()

    if to_ccy == "CAD":
        return f"FX{from_ccy}CAD"
    elif from_ccy == "CAD":
        return f"FX{to_ccy}CAD"          # rate will be inverted later
    else:
        raise ValueError(
            f"Unsupported pair {from_ccy}/{to_ccy}. "
            "One side must be CAD for the BoC Valet API."
        )


def fetch_rates(series: str, start: str, end: str) -> dict[str, float]:
    """
    Fetch all daily observations for `series` between start and end (inclusive).
    Returns {date_str: rate} where rate is always expressed as
    'to_ccy per 1 from_ccy' (i.e. for FXUSDCAD: CAD per USD).
    """
    url = f"{VALET_BASE}/{series}/json"
    params = {"start_date": start, "end_date": end}
    resp = requests.get(url, params=params, timeout=15)
    resp.raise_for_status()
    data = resp.json()

    rates = {}
    for obs in data.get("observations", []):
        d = obs["d"]
        v = obs.get(series, {}).get("v")
        if v is not None:
            rates[d] = float(v)
    return rates


def nearest_rate(rates: dict[str, float], target: str) -> float | None:
    """
    Return the rate for `target` date, or the closest *prior* business day
    if the exact date is missing (weekend / holiday).
    Looks back up to 7 calendar days.
    """
    d = date.fromisoformat(target)
    for delta in range(8):
        key = (d - timedelta(days=delta)).isoformat()
        if key in rates:
            return rates[key]
    return None

# ── Main ─────────────────────────────────────────────────────────────────────

def main(input_path: str, output_path: str) -> None:
    # 1. Read all rows
    with open(input_path, newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        header = next(reader) if HAS_HEADER else None
        rows = list(reader)

    # 2. Discover unique (series, date_range) combinations to minimise API calls
    from collections import defaultdict
    series_dates: dict[str, list[str]] = defaultdict(list)
    row_series: list[str] = []        # series key per row
    row_invert: list[bool] = []       # whether to invert (CAD→XXX)

    for row in rows:
        from_ccy = row[COL_FROM].strip().upper()
        to_ccy = 'CAD'
        # to_ccy   = row[COL_TO].strip().upper()
        d        = row[COL_DATE].strip()

        if from_ccy == to_ccy:
            # Same currency — rate is 1.0, nothing to fetch
            row_series.append(None)
            row_invert.append(False)
            continue

        invert = (from_ccy == "CAD")           # we'll fetch FXYYY CAD then invert
        series = series_name(from_ccy, to_ccy)
        series_dates[series].append(d)
        row_series.append(series)
        row_invert.append(invert)

    # 3. Fetch rates in one request per series (full date range)
    rate_cache: dict[str, dict[str, float]] = {}
    for series, dates in series_dates.items():
        start = min(dates)
        end   = max(dates)
        print(f"  Fetching {series}  {start} → {end} …", end=" ", flush=True)
        rate_cache[series] = fetch_rates(series, start, end)
        print(f"{len(rate_cache[series])} observations")

    # 4. Enrich rows
    enriched = []
    warnings = []
    for i, row in enumerate(rows):
        d      = row[COL_DATE].strip()
        series = row_series[i]
        invert = row_invert[i]

        if series is None:
            print(f"Series is NONE: '{row}'")
            rate_str = "1.0"
        else:
            rate = nearest_rate(rate_cache[series], d)
            if rate is None:
                warnings.append(f"Row {i+2}: no rate found for {series} near {d}")
                rate_str = ""
            else:
                rate = 1.0 / rate if invert else rate
                rate_str = f"{rate:.6f}"

        enriched.append(row + [rate_str])

    # 5. Write output
    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        if header:
            writer.writerow(header + ["rate"])
        writer.writerows(enriched)

    print(f"\n✓ Written {len(enriched)} rows → {output_path}")
    if warnings:
        print("\nWarnings:")
        for w in warnings:
            print(" ", w)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python boc_fx_enrich.py <input.csv> <output.csv>")
        sys.exit(1)
    main(sys.argv[1], sys.argv[2])
